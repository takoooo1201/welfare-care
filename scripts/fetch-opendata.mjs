// 下載本服務使用的開放資料原始檔到 data/raw/。
// 資料來源：臺北市資料大平臺（data.taipei），政府資料開放授權條款－第 1 版。
// 用法：node scripts/fetch-opendata.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCES = [
  {
    file: 'data/raw/care_points.csv',
    title: '臺北市銀髮族服務_社區照顧關懷據點',
    page: 'https://data.gov.tw/dataset/121285',
    url: 'https://data.taipei/api/dataset/d082dc87-d3fd-479d-89c6-745ff1be955a/resource/11930dc6-4092-4bde-a42c-7722e0416462/download',
  },
];

mkdirSync('data/raw', { recursive: true });
for (const s of SOURCES) {
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`${s.title} 下載失敗：HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(s.file, text);
  console.log(`✓ ${s.title} → ${s.file}（${text.length} 字元）`);
}
