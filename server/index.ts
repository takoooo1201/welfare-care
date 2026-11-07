// 福利找上門 API 伺服器。
// 開發：npm run dev（Vite 5173 代理 /api 到這裡）
// 正式：npm run build && npm start（同時提供 dist/ 的前端檔案）
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import { errorHandler } from './auth.ts';
import { citizenRouter } from './routes/citizen.ts';
import { placesRouter } from './routes/places.ts';
import { staffRouter } from './routes/staff.ts';
import { seedIfEmpty } from './seed.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve('dist');

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  // OpenStreetMap 圖磚要求帶 Referer，因此只送出網域，不送完整網址
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', citizenRouter, staffRouter, placesRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '找不到這個 API' });
});

if (existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(DIST, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`福利找上門 API：http://localhost:${PORT}`);
});
