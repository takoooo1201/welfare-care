import { randomBytes } from 'node:crypto';
import { RESOURCE_BY_ID } from '../shared/data/resources.ts';
import { TAIPEI_DISTRICTS } from '../shared/labels.ts';
import type { CaseLocation, CaseRecord, Channel, HelpType } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { saveCase } from './db.ts';

const HELP_TYPES: HelpType[] = ['fill_form', 'collect_docs', 'accompany', 'home_visit', 'phone_explain'];

export function newCaseId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `WC${ymd}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: unknown, max: number): string | null => str(v, max) || null;

export interface CaseInput {
  citizenName: string;
  phone: string | null;
  district: string;
  village: string | null;
  address: string | null;
  location: CaseLocation | null;
  resourceIds: string[];
  helpTypes: HelpType[];
  note: string;
  tags: string[];
  shareLocation: boolean;
  shareWithFamily: boolean;
}

/** 驗證並整理前端送來的個案資料 */
export function parseCaseInput(body: unknown): CaseInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const district = str(b.district, 10);
  if (!(TAIPEI_DISTRICTS as readonly string[]).includes(district)) throw new HttpError(400, '請選擇臺北市的行政區');
  const resourceIds = Array.isArray(b.resourceIds) ? b.resourceIds.filter((id): id is string => typeof id === 'string' && RESOURCE_BY_ID.has(id)) : [];
  if (resourceIds.length === 0) throw new HttpError(400, '請至少選擇一項要申請的資源');
  const helpTypes = Array.isArray(b.helpTypes) ? b.helpTypes.filter((h): h is HelpType => HELP_TYPES.includes(h as HelpType)) : [];
  if (helpTypes.length === 0) throw new HttpError(400, '請選擇需要的協助方式');
  const shareLocation = b.shareLocation === true;
  let location: CaseLocation | null = null;
  const loc = b.location as Record<string, unknown> | null | undefined;
  if (shareLocation && loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    // 只接受臺北市附近的座標
    if (loc.lat > 24.9 && loc.lat < 25.25 && loc.lng > 121.4 && loc.lng < 121.7) {
      location = { lat: loc.lat, lng: loc.lng, source: loc.source === 'gps' ? 'gps' : 'address' };
    }
  }
  return {
    citizenName: str(b.citizenName, 40),
    phone: strOrNull(b.phone, 20),
    district,
    village: strOrNull(b.village, 10),
    address: strOrNull(b.address, 80),
    location,
    resourceIds: [...new Set(resourceIds)],
    helpTypes: [...new Set(helpTypes)],
    note: str(b.note, 300),
    tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 12)).slice(0, 8) : [],
    shareLocation,
    shareWithFamily: b.shareWithFamily !== false,
  };
}

export function createCase(
  input: CaseInput,
  meta: { citizenId: string; channel: Channel; by: string; note: string; consentMethod?: string; extra?: Partial<CaseRecord> },
): CaseRecord {
  const now = new Date().toISOString();
  const docs = new Set<string>();
  for (const id of input.resourceIds) for (const d of RESOURCE_BY_ID.get(id)?.documents ?? []) docs.add(d);
  if (docs.size === 0) docs.add('身分證');
  const c: CaseRecord = {
    id: newCaseId(),
    citizenId: meta.citizenId,
    citizenName: input.citizenName || '民眾',
    phone: input.phone,
    district: input.district,
    village: input.village,
    address: input.address,
    location: input.location,
    resourceIds: input.resourceIds,
    helpTypes: input.helpTypes,
    note: input.note,
    channel: meta.channel,
    status: 'received',
    assigneeId: null,
    assigneeName: null,
    createdAt: now,
    updatedAt: now,
    timeline: [{ at: now, status: 'received', by: meta.by, note: meta.note }],
    documents: [...docs].map((name) => ({ name, ready: false })),
    tags: input.tags,
    consent: { shareLocation: input.shareLocation, shareWithFamily: input.shareWithFamily, method: meta.consentMethod },
    ...meta.extra,
  };
  saveCase(c);
  return c;
}
