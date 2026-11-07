// 服務管理介面 API（區公所、社工、志工）
import { Router } from 'express';
import type { CaseStatus, Outcome, RouteStop } from '../../shared/types.ts';
import { createSession, HttpError, staffFrom } from '../auth.ts';
import { createCase, parseCaseInput } from '../cases.ts';
import { casesByDistrict, db, getCase, getRoute, getStaff, listStaff, saveCase, saveRoute } from '../db.ts';
import { allowedStatuses, canClaim, canSee, viewForStaff } from '../privacy.ts';

export const staffRouter = Router();

/** 示範用：列出可登入的示範帳號（正式環境應改接市府帳號系統） */
staffRouter.get('/staff/directory', (_req, res) => {
  res.json(listStaff());
});

staffRouter.post('/staff/login', (req, res) => {
  const { staffId, pin } = req.body ?? {};
  const row = db.prepare('SELECT pin FROM staff WHERE id = ?').get(String(staffId ?? '')) as { pin: string } | undefined;
  if (!row || row.pin !== String(pin ?? '')) throw new HttpError(401, '帳號或 PIN 碼不正確');
  res.json({ token: createSession(String(staffId)), staff: getStaff(String(staffId)) });
});

staffRouter.post('/staff/logout', (req, res) => {
  const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.status(204).end();
});

staffRouter.get('/staff/me', (req, res) => {
  const staff = staffFrom(req);
  res.json({ staff, allowedStatuses: allowedStatuses(staff) });
});

staffRouter.get('/staff/team', (req, res) => {
  const staff = staffFrom(req);
  res.json(listStaff(staff.district));
});

staffRouter.get('/staff/cases', (req, res) => {
  const staff = staffFrom(req);
  res.json(casesByDistrict(staff.district).filter((c) => canSee(c, staff)).map((c) => viewForStaff(c, staff)));
});

staffRouter.get('/staff/cases/:id', (req, res) => {
  const staff = staffFrom(req);
  const c = getCase(req.params.id);
  if (!c || !canSee(c, staff)) throw new HttpError(404, '找不到這筆個案');
  res.json(viewForStaff(c, staff));
});

/** 接案或指派：區公所可以指派給同區任何人，其他角色只能自己接案 */
staffRouter.post('/staff/cases/:id/assign', (req, res) => {
  const staff = staffFrom(req);
  const c = getCase(req.params.id);
  if (!c || !canSee(c, staff)) throw new HttpError(404, '找不到這筆個案');
  const targetId = typeof req.body?.assigneeId === 'string' ? req.body.assigneeId : staff.id;
  if (targetId !== staff.id && staff.role !== 'district_office') throw new HttpError(403, '只有區公所可以指派給其他人');
  const target = getStaff(targetId);
  if (!target || target.district !== c.district) throw new HttpError(400, '請指派給同一行政區的服務人員');
  if (targetId === staff.id && !canClaim(c, staff)) throw new HttpError(403, '這筆個案目前無法由你接案');
  const now = new Date().toISOString();
  c.assigneeId = target.id;
  c.assigneeName = `${target.name}（${target.org}）`;
  if (c.status === 'received') c.status = 'assigned';
  c.timeline.push({
    at: now,
    status: c.status,
    by: staff.name,
    note: targetId === staff.id ? `${staff.name} 接下這件協助` : `指派給 ${target.name}`,
  });
  c.updatedAt = now;
  saveCase(c);
  res.json(viewForStaff(c, staff));
});

const OUTCOMES: Outcome[] = ['approved', 'rejected', 'completed', 'withdrawn'];

/**
 * 更新狀態或新增處理紀錄（狀態不變、只寫紀錄也可以）。
 * 結案時必須選擇結果（核定通過、未通過…），民眾與家屬會收到通知。
 */
staffRouter.post('/staff/cases/:id/status', (req, res) => {
  const staff = staffFrom(req);
  const c = getCase(req.params.id);
  if (!c || !canSee(c, staff)) throw new HttpError(404, '找不到這筆個案');
  const status = req.body?.status as CaseStatus;
  if (!allowedStatuses(staff).includes(status)) throw new HttpError(403, '你的角色不能設定這個狀態');
  if (staff.role === 'volunteer' && c.assigneeId !== staff.id) throw new HttpError(403, '請先接案');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : '';
  let outcome: Outcome | undefined;
  if (status === 'closed') {
    outcome = req.body?.outcome as Outcome;
    if (!OUTCOMES.includes(outcome)) throw new HttpError(400, '請選擇結案結果');
    if (c.status === 'closed' && c.outcome === outcome && !note) throw new HttpError(400, '請填寫處理紀錄');
  } else if (status === c.status && !note) {
    throw new HttpError(400, '請填寫處理紀錄');
  }
  const now = new Date().toISOString();
  c.status = status;
  c.outcome = outcome ?? null;
  c.timeline.push({ at: now, status, ...(outcome ? { outcome } : {}), by: staff.name, ...(note ? { note } : {}) });
  c.updatedAt = now;
  saveCase(c);
  res.json(viewForStaff(c, staff));
});

/** 據點代為建檔：沒有智慧型手機的民眾，由工作人員取得同意後代為登錄 */
staffRouter.post('/staff/intake', (req, res) => {
  const staff = staffFrom(req);
  if (staff.role === 'volunteer') throw new HttpError(403, '代為建檔需由區公所或社工辦理');
  const consentMethod = typeof req.body?.consentMethod === 'string' ? req.body.consentMethod.slice(0, 20) : '';
  if (!consentMethod) throw new HttpError(400, '請確認並記錄民眾同意的方式');
  const input = parseCaseInput(req.body);
  if (!input.citizenName) throw new HttpError(400, '請填寫民眾姓名');
  const c = createCase(input, {
    citizenId: `intake-${Date.now().toString(36)}`,
    channel: 'intake',
    by: staff.name,
    note: `${staff.org} ${staff.name} 代為建檔（同意方式：${consentMethod}）`,
    consentMethod,
  });
  res.status(201).json(c);
});

staffRouter.get('/staff/route', (req, res) => {
  const staff = staffFrom(req);
  res.json(getRoute(staff.id));
});

staffRouter.put('/staff/route', (req, res) => {
  const staff = staffFrom(req);
  const stops: RouteStop[] = Array.isArray(req.body?.stops)
    ? req.body.stops
        .filter((s: RouteStop) => typeof s?.lat === 'number' && typeof s?.lng === 'number')
        .map((s: RouteStop) => ({ name: String(s.name ?? '').slice(0, 30) || '停靠點', time: s.time ? String(s.time).slice(0, 5) : undefined, lat: s.lat, lng: s.lng }))
        .slice(0, 12)
    : [];
  saveRoute(staff.id, stops);
  res.json(stops);
});
