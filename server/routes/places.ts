// 社區照顧關懷據點（開放資料）查詢
import { existsSync, readFileSync, statSync } from 'node:fs';
import { Router } from 'express';
import { distance } from '../../shared/geo.ts';

export interface CarePoint {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  district: string;
  lat: number | null;
  lng: number | null;
  precision: 'address' | 'street' | 'district' | 'failed';
}

const FILE = 'shared/data/care-points.json';
let cache: { mtime: number; points: CarePoint[] } | null = null;

export function carePoints(): CarePoint[] {
  if (!existsSync(FILE)) return [];
  const mtime = statSync(FILE).mtimeMs;
  if (!cache || cache.mtime !== mtime) cache = { mtime, points: JSON.parse(readFileSync(FILE, 'utf8')) as CarePoint[] };
  return cache.points;
}

/** 各行政區中心點：以該區據點座標平均估算（地址不完整時的備援定位） */
export function districtCenters(): Record<string, { lat: number; lng: number }> {
  const acc: Record<string, { lat: number; lng: number; n: number }> = {};
  for (const p of carePoints()) {
    if (p.lat === null || p.lng === null || !p.district) continue;
    const a = (acc[p.district] ??= { lat: 0, lng: 0, n: 0 });
    a.lat += p.lat;
    a.lng += p.lng;
    a.n++;
  }
  return Object.fromEntries(Object.entries(acc).map(([d, a]) => [d, { lat: a.lat / a.n, lng: a.lng / a.n }]));
}

export const placesRouter = Router();

placesRouter.get('/care-points', (req, res) => {
  const district = typeof req.query.district === 'string' ? req.query.district : '';
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const limit = Math.min(Number(req.query.limit) || 500, 500);
  let points = carePoints().filter((p) => p.lat !== null && (!district || p.district === district));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    points = points
      .map((p) => ({ ...p, distance: Math.round(distance({ lat, lng }, { lat: p.lat!, lng: p.lng! })) }))
      .sort((a, b) => a.distance - b.distance);
  }
  res.json(points.slice(0, limit));
});

placesRouter.get('/districts/centers', (_req, res) => {
  res.json(districtCenters());
});
