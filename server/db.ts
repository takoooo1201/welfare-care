// SQLite（Node 內建 node:sqlite），零外部相依。
// 個案以 JSON 存放在 data 欄位；MVP 規模在記憶體中篩選即可。
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CaseRecord, RouteStop, Staff } from '../shared/types.ts';

const DB_PATH = process.env.DB_PATH ?? 'data/app.db';
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
    org TEXT NOT NULL, district TEXT NOT NULL, pin TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, staff_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL, district TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cases_citizen ON cases(citizen_id);
  CREATE INDEX IF NOT EXISTS cases_district ON cases(district);
  CREATE TABLE IF NOT EXISTS routes (staff_id TEXT PRIMARY KEY, stops TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY, citizen_id TEXT NOT NULL, citizen_name TEXT NOT NULL, expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS family_links (
    id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL, citizen_name TEXT NOT NULL,
    family_id TEXT NOT NULL, family_name TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (citizen_id, family_id)
  );
  CREATE TABLE IF NOT EXISTS shared_recs (citizen_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
`);

// ── 個案 ──
export function getCase(id: string): CaseRecord | null {
  const row = db.prepare('SELECT data FROM cases WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as CaseRecord) : null;
}

export function saveCase(c: CaseRecord): void {
  db.prepare(
    `INSERT INTO cases (id, citizen_id, district, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, district = excluded.district, updated_at = excluded.updated_at`,
  ).run(c.id, c.citizenId, c.district, JSON.stringify(c), c.updatedAt);
}

export function casesByCitizen(citizenId: string): CaseRecord[] {
  const rows = db.prepare('SELECT data FROM cases WHERE citizen_id = ? ORDER BY updated_at DESC').all(citizenId) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as CaseRecord);
}

export function casesByDistrict(district: string): CaseRecord[] {
  const rows = db.prepare('SELECT data FROM cases WHERE district = ? ORDER BY updated_at DESC').all(district) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as CaseRecord);
}

// ── 服務人員 ──
export function getStaff(id: string): Staff | null {
  const row = db.prepare('SELECT id, name, role, org, district FROM staff WHERE id = ?').get(id) as Staff | undefined;
  return row ?? null;
}

export function listStaff(district?: string): Staff[] {
  const sql = 'SELECT id, name, role, org, district FROM staff' + (district ? ' WHERE district = ?' : '') + ' ORDER BY district, role';
  return (district ? db.prepare(sql).all(district) : db.prepare(sql).all()) as unknown as Staff[];
}

export function getRoute(staffId: string): RouteStop[] {
  const row = db.prepare('SELECT stops FROM routes WHERE staff_id = ?').get(staffId) as { stops: string } | undefined;
  return row ? (JSON.parse(row.stops) as RouteStop[]) : [];
}

export function saveRoute(staffId: string, stops: RouteStop[]): void {
  db.prepare('INSERT INTO routes (staff_id, stops) VALUES (?, ?) ON CONFLICT(staff_id) DO UPDATE SET stops = excluded.stops')
    .run(staffId, JSON.stringify(stops));
}

// ── 家屬 ──
export interface FamilyLink {
  id: string;
  citizenId: string;
  citizenName: string;
  familyId: string;
  familyName: string;
  createdAt: string;
}

const LINK_COLS = 'id, citizen_id AS citizenId, citizen_name AS citizenName, family_id AS familyId, family_name AS familyName, created_at AS createdAt';

export function linksAsElder(citizenId: string): FamilyLink[] {
  return db.prepare(`SELECT ${LINK_COLS} FROM family_links WHERE citizen_id = ?`).all(citizenId) as unknown as FamilyLink[];
}

export function linksAsFamily(familyId: string): FamilyLink[] {
  return db.prepare(`SELECT ${LINK_COLS} FROM family_links WHERE family_id = ?`).all(familyId) as unknown as FamilyLink[];
}

export function isFamilyOf(familyId: string, citizenId: string): boolean {
  return !!db.prepare('SELECT 1 FROM family_links WHERE family_id = ? AND citizen_id = ?').get(familyId, citizenId);
}
