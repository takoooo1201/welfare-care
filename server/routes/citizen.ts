// 民眾端與家屬端 API
import { randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { citizenFrom, HttpError } from '../auth.ts';
import { createCase, parseCaseInput } from '../cases.ts';
import { casesByCitizen, db, getCase, isFamilyOf, linksAsElder, linksAsFamily, saveCase } from '../db.ts';

export const citizenRouter = Router();

// ── 我的個案 ──
citizenRouter.get('/cases/mine', (req, res) => {
  const me = citizenFrom(req);
  res.json(casesByCitizen(me.id));
});

citizenRouter.post('/cases', (req, res) => {
  const me = citizenFrom(req);
  const input = parseCaseInput(req.body);
  const onBehalfOf = typeof req.body?.onBehalfOf === 'string' ? req.body.onBehalfOf : null;
  if (onBehalfOf) {
    if (!isFamilyOf(me.id, onBehalfOf)) throw new HttpError(403, '尚未取得這位家人的授權');
    const elder = linksAsFamily(me.id).find((l) => l.citizenId === onBehalfOf)!;
    const c = createCase(
      { ...input, citizenName: elder.citizenName },
      { citizenId: onBehalfOf, channel: 'family', by: `${me.name}（家屬）`, note: `家屬 ${me.name} 代為送出需求` },
    );
    res.status(201).json(c);
    return;
  }
  const c = createCase({ ...input, citizenName: input.citizenName || me.name }, { citizenId: me.id, channel: 'app', by: me.name, note: '民眾於城市通送出需求' });
  res.status(201).json(c);
});

/** 本人或已授權家屬，可以勾選「文件已備妥」 */
citizenRouter.post('/cases/:id/documents/:index', (req, res) => {
  const me = citizenFrom(req);
  const c = getCase(req.params.id);
  if (!c || (c.citizenId !== me.id && !isFamilyOf(me.id, c.citizenId))) throw new HttpError(404, '找不到這筆申請');
  const doc = c.documents[Number(req.params.index)];
  if (!doc) throw new HttpError(404, '找不到這份文件');
  doc.ready = req.body?.ready === true;
  doc.by = doc.ready ? (c.citizenId === me.id ? me.name : `${me.name}（家屬）`) : undefined;
  c.updatedAt = new Date().toISOString();
  saveCase(c);
  res.json(c);
});

// ── 家屬協助 ──
const INVITE_MINUTES = 30;

citizenRouter.post('/family/invites', (req, res) => {
  const me = citizenFrom(req);
  db.prepare('DELETE FROM invites WHERE citizen_id = ? OR expires_at < ?').run(me.id, new Date().toISOString());
  let code = '';
  do code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  while (db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code));
  const expiresAt = new Date(Date.now() + INVITE_MINUTES * 60_000).toISOString();
  db.prepare('INSERT INTO invites (code, citizen_id, citizen_name, expires_at) VALUES (?, ?, ?, ?)').run(code, me.id, me.name, expiresAt);
  res.status(201).json({ code, expiresAt });
});

citizenRouter.post('/family/links', (req, res) => {
  const me = citizenFrom(req);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  const invite = db.prepare('SELECT citizen_id, citizen_name, expires_at FROM invites WHERE code = ?').get(code) as
    | { citizen_id: string; citizen_name: string; expires_at: string }
    | undefined;
  if (!invite || invite.expires_at < new Date().toISOString()) throw new HttpError(400, '邀請碼不正確或已過期');
  if (invite.citizen_id === me.id) throw new HttpError(400, '不能綁定自己喔');
  db.prepare('DELETE FROM invites WHERE code = ?').run(code);
  db.prepare(
    `INSERT INTO family_links (id, citizen_id, citizen_name, family_id, family_name, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(citizen_id, family_id) DO UPDATE SET family_name = excluded.family_name`,
  ).run(randomUUID(), invite.citizen_id, invite.citizen_name, me.id, me.name, new Date().toISOString());
  res.status(201).json({ citizenId: invite.citizen_id, citizenName: invite.citizen_name });
});

citizenRouter.get('/family/links', (req, res) => {
  const me = citizenFrom(req);
  res.json({ asElder: linksAsElder(me.id), asFamily: linksAsFamily(me.id) });
});

/** 長輩或家屬任一方都可以解除綁定 */
citizenRouter.delete('/family/links/:id', (req, res) => {
  const me = citizenFrom(req);
  const r = db.prepare('DELETE FROM family_links WHERE id = ? AND (citizen_id = ? OR family_id = ?)').run(req.params.id, me.id, me.id);
  if (r.changes === 0) throw new HttpError(404, '找不到這筆綁定');
  res.status(204).end();
});

citizenRouter.get('/family/elders/:citizenId', (req, res) => {
  const me = citizenFrom(req);
  const link = linksAsFamily(me.id).find((l) => l.citizenId === req.params.citizenId);
  if (!link) throw new HttpError(403, '尚未取得這位家人的授權');
  const recs = db.prepare('SELECT data, updated_at FROM shared_recs WHERE citizen_id = ?').get(link.citizenId) as
    | { data: string; updated_at: string }
    | undefined;
  res.json({
    elder: { id: link.citizenId, name: link.citizenName },
    cases: casesByCitizen(link.citizenId).filter((c) => c.consent.shareWithFamily),
    recommendations: recs ? { items: JSON.parse(recs.data), updatedAt: recs.updated_at } : null,
  });
});

/** 長輩把推薦結果（只有資源 id 與比對結論，不含個人資料）分享給已綁定的家屬 */
citizenRouter.put('/recommendations', (req, res) => {
  const me = citizenFrom(req);
  type Item = { resourceId: string; verdict: string; delegated?: unknown };
  const items = Array.isArray(req.body?.items)
    ? req.body.items
        .filter((i: unknown): i is Item => typeof (i as Item | null)?.resourceId === 'string')
        .map((i: Item) => ({
          resourceId: i.resourceId.slice(0, 40),
          verdict: i.verdict === 'likely' ? 'likely' : 'possible',
          delegated: i.delegated === true,
        }))
        .slice(0, 30)
    : [];
  db.prepare(
    'INSERT INTO shared_recs (citizen_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(citizen_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ).run(me.id, JSON.stringify(items), new Date().toISOString());
  res.status(204).end();
});
