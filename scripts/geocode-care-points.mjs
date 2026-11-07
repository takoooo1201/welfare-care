// 把「社區照顧關懷據點」CSV 的地址轉成經緯度，輸出 shared/data/care-points.json。
// 地理編碼使用 OpenStreetMap Nominatim（每秒最多 1 次請求，並快取結果，避免重複查詢）。
// 查不到門牌時退回路段，再退回行政區中心，並在 precision 欄位標示精確度。
// 用法：node scripts/geocode-care-points.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const INPUT = 'data/raw/care_points.csv';
const OUTPUT = 'shared/data/care-points.json';
const CACHE = 'data/raw/geocode-cache.json';
const UA = 'welfare-care/0.1 (TownPass hackathon prototype)';
const DELAY_MS = 1100;

/** 解析 CSV（支援引號內換行與逗號）。 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 「臺北市士林區三玉里忠誠路2段53巷7號5樓」→ { district, road, street, num } */
export function parseAddress(address) {
  const a = address.replace(/\s/g, '').replace(/^台北市/, '臺北市');
  const m = a.match(/^(?:臺北市)?([^市]{1,3}區)(.*)$/);
  if (!m) return null;
  const district = m[1];
  let rest = m[2]
    .replace(/^[^路街道]{1,4}里(?=\D)/, '') // 去掉「三玉里」
    .replace(/^\d+鄰/, '');
  const hm = rest.match(/^(.*?)(\d+(?:之\d+)?)號/);
  if (!hm) return { district, road: rest, street: rest, num: null };
  // OSM 臺灣的路名慣用中文數字「二段」
  const road = hm[1].replace(/(\d)段/, (_, d) => `${CN[Number(d)] ?? d}段`);
  const street = road.replace(/\d+巷.*$/, '').replace(/\d+弄.*$/, '');
  return { district, road, street, num: hm[2].replace(/之\d+/, '') };
}

async function main() {
  const rows = parseCsv(readFileSync(INPUT, 'utf8'));
  const header = rows.shift().map(clean);
  const idx = (name) => header.indexOf(name);
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  let lastCall = 0;

  async function geocode(q) {
    if (q in cache) return cache[q];
    const wait = lastCall + DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'tw' }).toString();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' } });
      const json = res.ok ? await res.json() : [];
      cache[q] = json[0] ? [Number(json[0].lat), Number(json[0].lon)] : null;
    } catch {
      return null; // 網路錯誤不寫入快取，下次重跑會再試
    }
    writeFileSync(CACHE, JSON.stringify(cache));
    return cache[q];
  }

  const out = [];
  const stats = { address: 0, street: 0, district: 0, failed: 0 };
  for (const [i, r] of rows.entries()) {
    const point = {
      id: `cp${String(i + 1).padStart(4, '0')}`,
      name: clean(r[idx('據點名稱')] ?? ''),
      type: clean(r[idx('據點類型')] ?? ''),
      address: clean(r[idx('地址')] ?? '').replace(/\s/g, ''),
      phone: clean(r[idx('電話')] ?? ''),
    };
    const p = parseAddress(point.address);
    let coord = null;
    let precision = 'failed';
    if (p?.num) {
      coord = await geocode(`${p.num}, ${p.road}, ${p.district}, 臺北市`);
      if (coord) precision = 'address';
    }
    if (!coord && p?.street) {
      coord = await geocode(`${p.street}, ${p.district}, 臺北市`);
      if (coord) precision = 'street';
    }
    if (!coord && p?.district) {
      coord = await geocode(`${p.district}, 臺北市`);
      if (coord) precision = 'district';
    }
    stats[precision]++;
    out.push({ ...point, district: p?.district ?? '', lat: coord?.[0] ?? null, lng: coord?.[1] ?? null, precision });
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${rows.length}`, JSON.stringify(stats));
  }
  mkdirSync('shared/data', { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(out, null, 1));
  console.log(`✓ ${out.length} 個據點 → ${OUTPUT}`, JSON.stringify(stats));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
