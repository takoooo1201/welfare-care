import type { GeoPoint } from './types.ts';

const R = 6371000; // 地球半徑（公尺）
const rad = (d: number) => (d * Math.PI) / 180;

/** 兩點直線距離（公尺） */
export function distance(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 點到線段的最短距離（公尺），臺北市範圍內以等距投影近似即可 */
export function distanceToSegment(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const kx = Math.cos(rad(p.lat)) * R * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  const [px, py] = [p.lng * kx, p.lat * ky];
  const [ax, ay] = [a.lng * kx, a.lat * ky];
  const [bx, by] = [b.lng * kx, b.lat * ky];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 點到整條路線（依序連接的站點）的最短距離，以及最近的是第幾段 */
export function distanceToRoute(p: GeoPoint, route: GeoPoint[]): { meters: number; segment: number } {
  if (route.length === 0) return { meters: Infinity, segment: -1 };
  if (route.length === 1) return { meters: distance(p, route[0]), segment: 0 };
  let best = { meters: Infinity, segment: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegment(p, route[i], route[i + 1]);
    if (d < best.meters) best = { meters: d, segment: i };
  }
  return best;
}

/**
 * 座標模糊化：對齊到約 cell 公尺的格點，再依 seed 做固定偏移，
 * 讓未接案的志工只看到大略位置，也無法用多次查詢平均回推。
 */
export function fuzz(p: GeoPoint, seed: string, cell = 300): GeoPoint {
  const latStep = cell / 111320;
  const lngStep = cell / (111320 * Math.cos(rad(p.lat)));
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const jx = ((h % 1000) / 1000 - 0.5) * 0.6;
  const jy = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.6;
  return {
    lat: (Math.floor(p.lat / latStep) + 0.5 + jy) * latStep,
    lng: (Math.floor(p.lng / lngStep) + 0.5 + jx) * lngStep,
  };
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m / 10) * 10} 公尺` : `${(m / 1000).toFixed(1)} 公里`;
}
