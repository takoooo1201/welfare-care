// 用 fp32 模型確認 onnxruntime-web 本身與 PyTorch 一致（PyTorch 參考值來自 export_onnx.py 的輸出）
import { readFileSync } from 'node:fs';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';
const W = new URL('..', import.meta.url).pathname;
const { buildNoulSequence, collate } = await import(W + 'shared/layaSeq.ts');
const D = W + 'laya/artifacts/'; // 完整詞彙版的分詞器（fp32 模型用原始 token id）
const tok = new Tokenizer(JSON.parse(readFileSync(D + 'tokenizer.json', 'utf8')), JSON.parse(readFileSync(D + 'tokenizer_config.json', 'utf8')));
const model = process.argv[2] ?? W + 'laya/artifacts/laya-multilingual.fp32.onnx';
ort.env.wasm.numThreads = 1;
const sess = await ort.InferenceSession.create(model);
const items = ['這個人一個人住嗎？', '這個人經濟困難嗎？'].map((q) => buildNoulSequence(tok, '我今年七十八歲，一個人住。', q));
const b = collate(items);
const out = await sess.run({
  input_ids: new ort.Tensor('int64', b.inputIds, [b.n, b.L]),
  attention_mask: new ort.Tensor('int64', b.attention, [b.n, b.L]),
  marker_pos: new ort.Tensor('int64', b.markerPos, [b.n, b.k]),
  marker_mask: new ort.Tensor('bool', b.markerMask, [b.n, b.k]),
  qtype: new ort.Tensor('int64', b.qtype, [b.n]),
});
console.log(model.split('/').pop(), Array.from(out.logits.data).map((x) => x.toFixed(4)).join(' '), '（PyTorch：1.3798 0.4365 2.4828 -0.2827）');
