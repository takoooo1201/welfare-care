import type { AgeGuess, MyReport, Sign } from '@shared/report.ts';
import type { CaseRecord, CaseStatus, GeoPoint, Outcome, RouteStop, Staff, Verdict } from '@shared/types.ts';
import { identity } from './identity';
import { clearStaffSession, staffSession } from './staffSession';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function req<T>(path: string, opts: { method?: string; body?: unknown; staff?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.staff) {
    if (staffSession.token) headers.Authorization = `Bearer ${staffSession.token}`;
  } else if (identity.id) {
    headers['X-Citizen-Id'] = identity.id;
    headers['X-Citizen-Name'] = encodeURIComponent(identity.name);
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, '網路連線不穩定，請稍後再試');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (opts.staff && res.status === 401) clearStaffSession();
    throw new ApiError(res.status, (data as { error?: string }).error ?? `發生錯誤（${res.status}）`);
  }
  return data as T;
}

export interface FamilyLink {
  id: string;
  citizenId: string;
  citizenName: string;
  familyId: string;
  familyName: string;
  createdAt: string;
}

export interface SharedRec {
  resourceId: string;
  verdict: Verdict;
  delegated?: boolean;
}

export interface ElderData {
  elder: { id: string; name: string };
  cases: CaseRecord[];
  recommendations: { items: SharedRec[]; updatedAt: string } | null;
}

export interface CarePoint {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  district: string;
  lat: number;
  lng: number;
  precision: 'address' | 'street' | 'district';
  distance?: number;
}

export type CaseInputBody = {
  citizenName?: string;
  phone: string | null;
  district: string;
  village: string | null;
  address: string | null;
  location: (GeoPoint & { source: 'gps' | 'address' }) | null;
  resourceIds: string[];
  helpTypes: string[];
  note: string;
  tags: string[];
  shareLocation: boolean;
  shareWithFamily: boolean;
  onBehalfOf?: string;
  consentMethod?: string;
};

export interface ReportBody {
  district: string;
  village?: string;
  place: string;
  location: GeoPoint;
  signs: Sign[];
  age: AgeGuess;
  nickname: string;
  note: string;
  contactOk: boolean;
  reporterPhone?: string;
}

export const api = {
  myCases: () => req<CaseRecord[]>('/api/cases/mine'),
  createCase: (body: CaseInputBody) => req<CaseRecord>('/api/cases', { method: 'POST', body }),
  setDocument: (caseId: string, index: number, ready: boolean) =>
    req<CaseRecord>(`/api/cases/${encodeURIComponent(caseId)}/documents/${index}`, { method: 'POST', body: { ready } }),

  createInvite: () => req<{ code: string; expiresAt: string }>('/api/family/invites', { method: 'POST' }),
  acceptInvite: (code: string) => req<{ citizenId: string; citizenName: string }>('/api/family/links', { method: 'POST', body: { code } }),
  familyLinks: () => req<{ asElder: FamilyLink[]; asFamily: FamilyLink[] }>('/api/family/links'),
  removeLink: (id: string) => req<void>(`/api/family/links/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  elder: (citizenId: string) => req<ElderData>(`/api/family/elders/${encodeURIComponent(citizenId)}`),
  myRecommendations: () => req<{ items: SharedRec[] }>('/api/recommendations'),
  shareRecommendations: (items: SharedRec[]) => req<{ items: SharedRec[] }>('/api/recommendations', { method: 'PUT', body: { items } }),

  createReport: (body: ReportBody) => req<MyReport>('/api/reports', { method: 'POST', body }),
  myReports: () => req<MyReport[]>('/api/reports/mine'),

  carePoints: (q: { district?: string; lat?: number; lng?: number; limit?: number }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
    return req<CarePoint[]>(`/api/care-points?${params}`);
  },
  districtCenters: () => req<Record<string, GeoPoint>>('/api/districts/centers'),

  staff: {
    directory: () => req<Staff[]>('/api/staff/directory'),
    login: (staffId: string, pin: string) => req<{ token: string; staff: Staff }>('/api/staff/login', { method: 'POST', body: { staffId, pin } }),
    logout: () => req<void>('/api/staff/logout', { method: 'POST', staff: true }),
    me: () => req<{ staff: Staff; allowedStatuses: CaseStatus[] }>('/api/staff/me', { staff: true }),
    team: () => req<Staff[]>('/api/staff/team', { staff: true }),
    cases: () => req<CaseRecord[]>('/api/staff/cases', { staff: true }),
    case: (id: string) => req<CaseRecord>(`/api/staff/cases/${encodeURIComponent(id)}`, { staff: true }),
    assign: (id: string, assigneeId?: string) =>
      req<CaseRecord>(`/api/staff/cases/${encodeURIComponent(id)}/assign`, { method: 'POST', body: { assigneeId }, staff: true }),
    setStatus: (id: string, status: CaseStatus, note: string, outcome?: Outcome) =>
      req<CaseRecord>(`/api/staff/cases/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status, note, outcome }, staff: true }),
    intake: (body: CaseInputBody) => req<CaseRecord>('/api/staff/intake', { method: 'POST', body, staff: true }),
    route: () => req<RouteStop[]>('/api/staff/route', { staff: true }),
    saveRoute: (stops: RouteStop[]) => req<RouteStop[]>('/api/staff/route', { method: 'PUT', body: { stops }, staff: true }),
  },
};
