/// <reference lib="webworker" />
// 在 Web Worker 裡執行 Laya（onnxruntime-web，WASM），推論時畫面不會卡住。
// 模型、分詞器、WASM 都由自己的網站提供（不經 CDN），下載後存進 Cache Storage，之後可離線使用。
// 使用者的描述只在這個 Worker 裡處理，不會送到任何伺服器。
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { buildNoulSequence, collate, noulProbs } from '@shared/layaSeq.ts';
import { SIGNAL_QUESTIONS, SIGNALS } from '@shared/nl.ts';
import { LAYA_BASE as BASE, LAYA_CACHE as CACHE, LAYA_FILES as FILES } from './layaFiles';

export type LayaRequest = { type: 'load' } | { type: 'run'; id: number; text: string };
export type LayaResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; fromCache: boolean; loadMs: number }
  | { type: 'result'; id: number; probs: number[]; ms: number }
  | { type: 'error'; id?: number; message: string };

const post = (m: LayaResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href };
// 多執行緒需要 COOP/COEP 標頭，會擋掉 OpenStreetMap 圖磚，所以用單執行緒
ort.env.wasm.numThreads = 1;

async function openCache(): Promise<Cache | null> {
  try {
    if (!('caches' in self)) return null; // http（非 localhost）時沒有 Cache Storage
    // 刪掉舊版模型的快取，釋放手機空間
    for (const k of await caches.keys()) if (k.startsWith('wc-laya-') && k !== CACHE) await caches.delete(k);
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

/** 讀完整個回應。知道大小時直接寫進一塊預先配置的記憶體，避免「分段＋合併」佔用兩倍記憶體 */
async function readBody(r: Response, onChunk: (n: number) => void): Promise<ArrayBuffer> {
  const size = Number(r.headers.get('content-length') ?? 0);
  const reader = r.body!.getReader();
  if (size > 0 && !r.headers.get('content-encoding')) {
    const buf = new Uint8Array(size);
    let o = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (o + value.length > size) throw new Error('下載的檔案大小不符');
      buf.set(value, o);
      o += value.length;
      onChunk(value.length);
    }
    if (o !== size) throw new Error('下載不完整，請再試一次');
    return buf.buffer;
  }
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onChunk(value.length);
  }
  const buf = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return buf.buffer;
}

/** 下載三個檔案並回報合計進度；已經快取過就直接讀 */
async function fetchAll(): Promise<{ bufs: ArrayBuffer[]; fromCache: boolean }> {
  const cache = await openCache();
  const cached = cache ? await Promise.all(FILES.map((f) => cache.match(BASE + f))) : FILES.map(() => undefined);
  if (cached.every(Boolean)) return { bufs: await Promise.all(cached.map((r) => r!.arrayBuffer())), fromCache: true };

  const res = await Promise.all(
    FILES.map(async (f) => {
      const r = await fetch(BASE + f);
      if (!r.ok) throw new Error(`下載 ${f} 失敗（${r.status}）`);
      return r;
    }),
  );
  const total = res.reduce((a, r) => a + Number(r.headers.get('content-length') ?? 0), 0);
  let loaded = 0;
  let lastPost = 0;
  const bufs = await Promise.all(
    res.map((r) =>
      readBody(r, (n) => {
        loaded += n;
        const now = performance.now();
        if (now - lastPost > 100) {
          lastPost = now;
          post({ type: 'progress', loaded, total });
        }
      }),
    ),
  );
  post({ type: 'progress', loaded: total, total });
  if (cache) {
    // 存快取失敗（空間不足等）不影響這次使用
    await Promise.all(FILES.map((f, i) => cache.put(BASE + f, new Response(bufs[i])))).catch(() => undefined);
  }
  return { bufs, fromCache: false };
}

let ready: Promise<{ sess: ort.InferenceSession; tok: Tokenizer }> | null = null;

function load() {
  ready ??= (async () => {
    const t = performance.now();
    const { bufs, fromCache } = await fetchAll();
    const dec = new TextDecoder();
    const tok = new Tokenizer(JSON.parse(dec.decode(bufs[1])), JSON.parse(dec.decode(bufs[2])));
    const sess = await ort.InferenceSession.create(new Uint8Array(bufs[0]), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    post({ type: 'ready', fromCache, loadMs: Math.round(performance.now() - t) });
    return { sess, tok };
  })();
  ready.catch((e) => {
    ready = null; // 讓使用者可以重試
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  });
  return ready;
}

async function run(id: number, text: string) {
  const { sess, tok } = await load();
  const stateIds = tok.encode(text, { add_special_tokens: false }).ids; // 14 題共用同一段描述
  const b = collate(SIGNALS.map((s) => buildNoulSequence(tok, text, SIGNAL_QUESTIONS[s], stateIds)));
  const t = performance.now();
  const out = await sess.run({
    input_ids: new ort.Tensor('int64', b.inputIds, [b.n, b.L]),
    attention_mask: new ort.Tensor('int64', b.attention, [b.n, b.L]),
    marker_pos: new ort.Tensor('int64', b.markerPos, [b.n, b.k]),
    marker_mask: new ort.Tensor('bool', b.markerMask, [b.n, b.k]),
    qtype: new ort.Tensor('int64', b.qtype, [b.n]),
  });
  const logits = out.logits;
  post({ type: 'result', id, probs: noulProbs(logits.data as Float32Array, b.n, logits.dims[1]), ms: Math.round(performance.now() - t) });
}

self.onmessage = (e: MessageEvent<LayaRequest>) => {
  const m = e.data;
  if (m.type === 'load') load().catch(() => undefined);
  else if (m.type === 'run') run(m.id, m.text).catch((err) => post({ type: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) }));
};
