// 把一題 Laya 是非題（noul）組成模型的輸入序列，與 Python 套件 laya.common.build_sequence 完全一致：
//   [CLS] "noul question: 題目" [SEP] [MASK] " false: …" [MASK] " true: …" [SEP] 使用者的描述 [SEP]
// 模型在兩個 [MASK] 的位置分別打分數，softmax 後第二個就是 P(是)。
// 純函式，網頁（web/src/lib/laya.ts）與單元測試（對照 Python 產生的 token ids）共用。

/** 只用到分詞器的這一個方法，方便測試時替換 */
export interface LayaTokenizer {
  encode(text: string, options: { add_special_tokens: false }): { ids: number[] };
}

/** laya-multilingual（mmBERT）的特殊 token 與長度設定，見 rl_agent_config.json */
export const LAYA = {
  cls: 2, // <bos>
  sep: 1, // <eos>
  mask: 4, // <mask>
  pad: 0,
  maskText: '<mask>',
  maxLen: 1024,
  headMaxLen: 256,
  optionMaxTokens: 48,
  qtypeNoul: 2,
};

const NOUL_OPTIONS = ['false: no, the statement does not hold', 'true: yes, the statement holds'];

export interface LayaItem {
  ids: number[];
  /** 每個選項的 [MASK] 位置 */
  markers: number[];
}

const clean = (s: string) => s.replaceAll(LAYA.maskText, ' ');

export function buildNoulSequence(tok: LayaTokenizer, state: string, question: string, stateIds?: number[]): LayaItem {
  const enc = (s: string) => tok.encode(s, { add_special_tokens: false }).ids;
  let head = enc(`noul question: ${clean(question)}`);
  const opts = NOUL_OPTIONS.map((o) => [LAYA.mask, ...enc(` ${o}`).slice(0, LAYA.optionMaxTokens)]);
  const budget = LAYA.headMaxLen - opts.reduce((n, o) => n + o.length, 0);
  head = head.slice(0, Math.max(8, budget));
  const ids = [LAYA.cls, ...head, LAYA.sep];
  const markers: number[] = [];
  for (const o of opts) {
    markers.push(ids.length);
    ids.push(...o);
  }
  ids.push(LAYA.sep);
  const room = Math.max(0, LAYA.maxLen - ids.length - 1);
  const st = (stateIds ?? enc(clean(state))).slice(0, room);
  const out = [...ids, ...st, LAYA.sep].slice(0, LAYA.maxLen);
  return { ids: out, markers: markers.filter((m) => m < LAYA.maxLen) };
}

/** 把多題補齊成同樣長度，組成一批送進模型（與 laya.onnx_agent._collate_items_numpy 相同） */
export function collate(items: LayaItem[]) {
  const n = items.length;
  const L = Math.max(...items.map((i) => i.ids.length));
  const k = Math.max(2, ...items.map((i) => i.markers.length));
  const inputIds = new BigInt64Array(n * L).fill(BigInt(LAYA.pad));
  const attention = new BigInt64Array(n * L);
  const markerPos = new BigInt64Array(n * k);
  const markerMask = new Uint8Array(n * k);
  const qtype = new BigInt64Array(n).fill(BigInt(LAYA.qtypeNoul));
  items.forEach((it, r) => {
    it.ids.forEach((id, c) => {
      inputIds[r * L + c] = BigInt(id);
      attention[r * L + c] = 1n;
    });
    it.markers.forEach((m, c) => {
      markerPos[r * k + c] = BigInt(m);
      markerMask[r * k + c] = 1;
    });
  });
  return { n, L, k, inputIds, attention, markerPos, markerMask, qtype };
}

/** 每列前兩個選項（false、true）的 logits → P(true) */
export function noulProbs(logits: ArrayLike<number>, n: number, k: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < n; r++) {
    const f = Number(logits[r * k]);
    const t = Number(logits[r * k + 1]);
    const m = Math.max(f, t);
    const ef = Math.exp(f - m);
    const et = Math.exp(t - m);
    out.push(et / (ef + et));
  }
  return out;
}
