// 身分識別。
// 民眾：MVP 以城市通 userinfo 的 id 透過 X-Citizen-Id 標頭傳入。
//   正式上線時應改由城市通簽發、後端可驗證的權杖（見 README「已知限制」）。
// 服務人員：帳號 + PIN 登入，取得隨機權杖（Bearer token）。
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Staff } from '../shared/types.ts';
import { db, getStaff } from './db.ts';

export interface Citizen {
  id: string;
  name: string;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ID_RE = /^[\w-]{3,64}$/;

export function citizenFrom(req: Request): Citizen {
  const id = req.get('x-citizen-id') ?? '';
  if (!ID_RE.test(id)) throw new HttpError(401, '缺少使用者身分');
  let name = '';
  try {
    name = decodeURIComponent(req.get('x-citizen-name') ?? '');
  } catch {
    name = '';
  }
  return { id, name: name.slice(0, 40) || '民眾' };
}

export function createSession(staffId: string): string {
  const token = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO sessions (token, staff_id, created_at) VALUES (?, ?, ?)').run(token, staffId, new Date().toISOString());
  return token;
}

export function staffFrom(req: Request): Staff {
  const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const row = token ? (db.prepare('SELECT staff_id FROM sessions WHERE token = ?').get(token) as { staff_id: string } | undefined) : undefined;
  const staff = row ? getStaff(row.staff_id) : null;
  if (!staff) throw new HttpError(401, '請先登入');
  return staff;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: '伺服器發生錯誤' });
}
