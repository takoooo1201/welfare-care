// 民眾端與家屬端 API
import { randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { CaseRecord } from '../../shared/types.ts';
import { TAIPEI_DISTRICTS } from '../../shared/labels.ts';
import { type AgeGuess, isUrgent, type MyReport, parseSigns, reportStage, signTags, SIGNS, suggestForReport } from '../../shared/report.ts';
import { citizenFrom, HttpError } from '../auth.ts';
import { createCase, parseCaseInput } from '../cases.ts';
import { casesByCitizen, casesByReporter, db, getCase, isFamilyOf, linksAsElder, linksAsFamily, saveCase } from '../db.ts';

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

type SharedRec = { resourceId: string; verdict: 'likely' | 'possible'; delegated: boolean };

function sharedRecs(citizenId: string): SharedRec[] {
  const row = db.prepare('SELECT data FROM shared_recs WHERE citizen_id = ?').get(citizenId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as SharedRec[]) : [];
}

/** 自己已分享給家屬的推薦結果（用來顯示哪些項目已轉交家屬） */
citizenRouter.get('/recommendations', (req, res) => {
  const me = citizenFrom(req);
  res.json({ items: sharedRecs(me.id) });
});

/**
 * 長輩把推薦結果（只有資源 id 與比對結論，不含個人資料）分享給已綁定的家屬。
 * 「轉交家屬協助」是累加的：先前轉交過的項目，再次分享時仍保留轉交標記。
 */
citizenRouter.put('/recommendations', (req, res) => {
  const me = citizenFrom(req);
  type Item = { resourceId: string; verdict: string; delegated?: unknown };
  const incoming: SharedRec[] = Array.isArray(req.body?.items)
    ? req.body.items
        .filter((i: unknown): i is Item => typeof (i as Item | null)?.resourceId === 'string')
        .map((i: Item) => ({
          resourceId: i.resourceId.slice(0, 40),
          verdict: i.verdict === 'likely' ? 'likely' : 'possible',
          delegated: i.delegated === true,
        }))
        .slice(0, 30)
    : [];
  const prevDelegated = sharedRecs(me.id).filter((r) => r.delegated);
  const items = incoming.map((r) => ({ ...r, delegated: r.delegated || prevDelegated.some((p) => p.resourceId === r.resourceId) }));
  for (const p of prevDelegated) if (!items.some((r) => r.resourceId === p.resourceId)) items.push(p);
  db.prepare(
    'INSERT INTO shared_recs (citizen_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(citizen_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ).run(me.id, JSON.stringify(items), new Date().toISOString());
  res.json({ items });
});

// ── 鄰里關懷通報 ──
const REPORTS_PER_DAY = 5;
const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * 鄰居、里長或店員通報一位可能需要幫忙的長輩。不需要知道對方姓名；
 * 位置由通報人在地圖上標出大略位置。社工訪視時再向本人說明、確認意願。
 */
citizenRouter.post('/reports', (req, res) => {
  const me = citizenFrom(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const district = clip(b.district, 10);
  if (!(TAIPEI_DISTRICTS as readonly string[]).includes(district)) throw new HttpError(400, '請選擇臺北市的行政區');
  const signs = parseSigns(b.signs);
  if (!signs.length) throw new HttpError(400, '請至少勾選一項你看到的狀況');
  const loc = b.location as { lat?: unknown; lng?: unknown } | null | undefined;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!(lat > 24.9 && lat < 25.25 && lng > 121.4 && lng < 121.7)) throw new HttpError(400, '請在地圖上標出他大概住在哪裡');
  const since = Date.now() - 86_400_000;
  if (casesByReporter(me.id).filter((c) => Date.parse(c.createdAt) > since).length >= REPORTS_PER_DAY) {
    throw new HttpError(429, '今天已經通報很多次了，緊急狀況請直接撥打 119 或 110');
  }
  const age: AgeGuess = b.age === 'elder' || b.age === 'adult' ? b.age : 'unknown';
  const nickname = clip(b.nickname, 10);
  const place = clip(b.place, 60);
  const contactOk = b.contactOk === true;
  const labels = signs.map((s) => SIGNS.find((x) => x.value === s)!.label).join('、');
  const c = createCase(
    {
      citizenName: `${nickname || '未具名的長輩'}（鄰居通報）`,
      phone: null,
      district,
      village: clip(b.village, 10) || null,
      address: place || null,
      location: { lat, lng, source: 'address' },
      resourceIds: suggestForReport(signs, age),
      helpTypes: ['home_visit'],
      note: clip(b.note, 200),
      tags: [...(age === 'elder' ? ['65 歲以上'] : []), ...signTags(signs)],
      shareLocation: true,
      shareWithFamily: false,
    },
    {
      citizenId: `neighbor-${randomUUID()}`,
      channel: 'neighbor',
      by: '鄰居（城市通通報）',
      note: `鄰里關懷通報：${labels}${isUrgent(signs) ? '（多日未見，請優先處理）' : ''}`,
      consentMethod: '尚未取得本人同意，訪視時說明並確認意願',
      extra: {
        reporterId: me.id,
        reporter: contactOk ? { name: me.name, phone: clip(b.reporterPhone, 20) || null } : null,
        signs,
      },
    },
  );
  res.status(201).json(toMyReport(c));
});

function toMyReport(c: CaseRecord): MyReport {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    district: c.district,
    place: c.address ?? '',
    nickname: c.citizenName.replace(/（鄰居通報）$/, '').replace(/^未具名的長輩$/, ''),
    stage: reportStage(c.status),
  };
}

/** 通報人只看得到自己通報的進度（收到、已安排、已關心），看不到長輩的任何資料 */
citizenRouter.get('/reports/mine', (req, res) => {
  const me = citizenFrom(req);
  res.json(casesByReporter(me.id).map(toMyReport));
});
