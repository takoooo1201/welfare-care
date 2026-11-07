// 量測載入 Laya 網頁版模型時的記憶體（手機 WebView 有記憶體上限）。
//   /usr/bin/time -l node laya/mem-probe.mjs <variant>
// variant：default | noarena | basic（預設用網頁版的 laya-zh.onnx＋tokenizer-zh.json；加上 full 改用完整詞彙版）
// 看輸出的 maximum resident set size（峰值）與每個階段的 rss。
import { readFileSync } from 'node:fs';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';
const W = new URL('..', import.meta.url).pathname;
const { buildNoulSequence, collate } = await import(W + 'shared/layaSeq.ts');
const { SIGNAL_QUESTIONS, SIGNALS } = await import(W + 'shared/nl.ts');
const D = W + 'web/public/models/laya/';
const A = W + 'laya/artifacts/'; // 完整詞彙版
const v = process.argv[2] ?? 'default';
const mb = () => `${Math.round(process.memoryUsage().rss / 2 ** 20)} MB`;
ort.env.wasm.numThreads = 1;
console.log(v, 'start', mb());
const tok = new Tokenizer(JSON.parse(readFileSync(process.argv.includes('full') ? A + 'tokenizer.json' : D + 'tokenizer-zh.json', 'utf8')), JSON.parse(readFileSync(D + 'tokenizer_config.json', 'utf8')));
console.log('tokenizer', mb());
const opts = { executionProviders: ['wasm'], graphOptimizationLevel: v === 'basic' ? 'basic' : 'all' };
if (v === 'noarena') Object.assign(opts, { enableCpuMemArena: false, enableMemPattern: false });
let model = new Uint8Array(readFileSync(process.argv.includes('full') ? A + 'laya-web.onnx' : D + 'laya-zh.onnx'));
console.log('model bytes', mb());
const sess = await ort.InferenceSession.create(model, opts);
model = null;
globalThis.gc?.();
console.log('session', mb());
const text = '我今年七十八歲，一個人住，最近腳不好很少出門，三餐常常隨便吃。';
const b = collate(SIGNALS.map((s) => buildNoulSequence(tok, text, SIGNAL_QUESTIONS[s])));
const t = performance.now();
await sess.run({
  input_ids: new ort.Tensor('int64', b.inputIds, [b.n, b.L]),
  attention_mask: new ort.Tensor('int64', b.attention, [b.n, b.L]),
  marker_pos: new ort.Tensor('int64', b.markerPos, [b.n, b.k]),
  marker_mask: new ort.Tensor('bool', b.markerMask, [b.n, b.k]),
  qtype: new ort.Tensor('int64', b.qtype, [b.n]),
});
console.log('after run', mb(), `${Math.round(performance.now() - t)} ms`);
