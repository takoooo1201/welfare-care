// 用網頁實際使用的執行環境（onnxruntime-web WASM）與模型（laya-zh.onnx＋tokenizer-zh.json，見 trim_vocab.py），
// 重算測試描述的機率，寫回 shared/fixtures/。
//   node laya/web-probs.mjs [執行緒數]
import { readFileSync, writeFileSync } from 'node:fs';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';
const W = new URL('..', import.meta.url).pathname;
const { buildNoulSequence, collate, noulProbs } = await import(W + 'shared/layaSeq.ts');
const { SIGNAL_QUESTIONS, SIGNALS } = await import(W + 'shared/nl.ts');
const D = W + 'web/public/models/laya/';
const tok = new Tokenizer(JSON.parse(readFileSync(D + 'tokenizer-zh.json', 'utf8')), JSON.parse(readFileSync(D + 'tokenizer_config.json', 'utf8')));
ort.env.wasm.numThreads = Number(process.argv[2] ?? 1);
const sess = await ort.InferenceSession.create(readFileSync(D + 'laya-zh.onnx'));
for (const file of ['laya-cases.json', 'laya-holdout.json']) {
  const path = W + 'shared/fixtures/' + file;
  const fx = JSON.parse(readFileSync(path, 'utf8'));
  let ms = 0;
  for (const c of fx.cases) {
    const b = collate(SIGNALS.map((s) => buildNoulSequence(tok, c.text, SIGNAL_QUESTIONS[s])));
    const t = performance.now();
    const out = await sess.run({
      input_ids: new ort.Tensor('int64', b.inputIds, [b.n, b.L]),
      attention_mask: new ort.Tensor('int64', b.attention, [b.n, b.L]),
      marker_pos: new ort.Tensor('int64', b.markerPos, [b.n, b.k]),
      marker_mask: new ort.Tensor('bool', b.markerMask, [b.n, b.k]),
      qtype: new ort.Tensor('int64', b.qtype, [b.n]),
    });
    ms += performance.now() - t;
    const p = noulProbs(out.logits.data, b.n, out.logits.dims[1]);
    c.probs = Object.fromEntries(SIGNALS.map((s, i) => [s, Math.round(p[i] * 1e4) / 1e4]));
  }
  fx.model = 'convaiinnovations/laya multilingual：權重 8 位元（MatMulNBits）＋嵌入表逐列 int8，詞彙裁成中文用 38,298 個（laya-zh.onnx、tokenizer-zh.json）';
  fx.runtime = 'onnxruntime-web 1.30.0（WASM）';
  fx.questions = SIGNAL_QUESTIONS;
  writeFileSync(path, JSON.stringify(fx, null, 1));
  console.log(file, `平均每段描述 ${Math.round(ms / fx.cases.length)} ms（${SIGNALS.length} 題、${ort.env.wasm.numThreads} 執行緒）`);
}
