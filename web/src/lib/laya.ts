// 「用說的找福利」的模型入口：在 Web Worker 裡載入 Laya，畫面用 reactive 狀態顯示下載進度。
// 推論完全在這支手機上執行，描述內容不會送到伺服器（只有第一次從自己的網站下載模型檔）。
import { reactive } from 'vue';
import { SIGNALS, type SignalProbs } from '@shared/nl.ts';
import type { LayaRequest, LayaResponse } from './laya.worker';
import { LAYA_BASE, LAYA_CACHE, LAYA_FILES } from './layaFiles';

/** 模型（174 MB）＋分詞器＋WASM（14 MB）的大約下載量，給畫面提示用 */
export const LAYA_DOWNLOAD_MB = 200;

export const laya = reactive({
  state: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  loaded: 0,
  total: 0,
  fromCache: false,
  loadMs: 0,
  error: '',
});

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: { probs: SignalProbs; ms: number }) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./laya.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<LayaResponse>) => {
    const m = e.data;
    if (m.type === 'progress') {
      laya.loaded = m.loaded;
      laya.total = m.total;
    } else if (m.type === 'ready') {
      Object.assign(laya, { state: 'ready', fromCache: m.fromCache, loadMs: m.loadMs, error: '' });
    } else if (m.type === 'result') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.resolve({ probs: Object.fromEntries(SIGNALS.map((s, i) => [s, m.probs[i]])) as SignalProbs, ms: m.ms });
    } else if (m.type === 'error') {
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(new Error(m.message));
        pending.delete(m.id);
      } else fail(m.message);
    }
  };
  // Worker 本身壞掉（例如記憶體不足被系統關掉）：讓等待中的推論結束，下次重新建立 Worker
  worker.onerror = (e) => {
    worker?.terminate();
    worker = null;
    fail(e.message || '模型載入失敗，可能是手機記憶體不足');
  };
  return worker;
}

function fail(message: string) {
  Object.assign(laya, { state: 'error', error: message });
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}

const send = (m: LayaRequest) => getWorker().postMessage(m);

/** 開始下載與載入模型（重複呼叫沒關係） */
export function loadLaya() {
  if (laya.state === 'loading' || laya.state === 'ready') return;
  Object.assign(laya, { state: 'loading', loaded: 0, total: 0, error: '' });
  send({ type: 'load' });
}

/** 讓 Laya 聽一段描述，回傳 14 個狀況的 P(是) */
export function listen(text: string): Promise<{ probs: SignalProbs; ms: number }> {
  loadLaya();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'run', id, text });
  });
}

/** 模型是否已經下載過（存在這支手機的快取裡） */
export async function layaDownloaded(): Promise<boolean> {
  try {
    if (!('caches' in globalThis)) return false;
    if (!(await caches.has(LAYA_CACHE))) return false;
    const c = await caches.open(LAYA_CACHE);
    return !!(await c.match(LAYA_BASE + LAYA_FILES[0]));
  } catch {
    return false;
  }
}
