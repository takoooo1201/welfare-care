// 「用說的找福利」的單元測試。模型的回答事先算好放在 fixtures（laya/web-probs.mjs 產生），測試時不跑模型。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildNoulSequence, collate, LAYA, type LayaTokenizer, noulProbs } from './layaSeq.ts';
import { parseAge, rankFromSignals, SIGNAL_QUESTIONS, SIGNALS, type SignalProbs } from './nl.ts';

const TODAY = new Date('2026-11-07T12:00:00+08:00');

interface Case {
  text: string;
  gold: string[];
  probs: SignalProbs;
  firstIds: number[];
  firstMarkers: number[];
}
const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')) as { cases: Case[] };
const CASES = fixture('laya-cases.json').cases;
const HOLDOUT = fixture('laya-holdout.json').cases;
const find = (start: string) => [...CASES, ...HOLDOUT].find((c) => c.text.startsWith(start))!;
const none = Object.fromEntries(SIGNALS.map((s) => [s, 0.05])) as SignalProbs;

test('parseAge：阿拉伯數字、中文數字、取最大的年齡', () => {
  assert.equal(parseAge('我今年七十八歲，一個人住'), 78);
  assert.equal(parseAge('阿嬤85歲'), 85);
  assert.equal(parseAge('我爸一百零二歲了'), 102);
  assert.equal(parseAge('我三十五歲，媽媽六十八歲'), 68);
  assert.equal(parseAge('十歲的小孩'), 10);
  assert.equal(parseAge('我住在三樓，月收入兩萬'), null);
  assert.equal(parseAge('活到一百五十歲'), null);
});

test('越南新住民：新住民家庭服務中心排第 1', () => {
  const c = find('我從越南嫁來台灣');
  const r = rankFromSignals(c.probs, c.text, 5, TODAY);
  assert.equal(r.top[0]?.resource.id, 'tp-new-resident-center');
  assert.ok(r.top[0].reasons.some((x) => x.signal === 'newres'));
});

test('35 歲身體健康：沒有聽到任何狀況，回傳空結果', () => {
  const c = find('我三十五歲');
  const r = rankFromSignals(c.probs, c.text, 5, TODAY);
  assert.equal(r.age, 35);
  assert.deepEqual(r.heard, []);
  assert.deepEqual(r.top, []);
});

test('文字裡有年齡時，以數字為準，不採用模型猜的「65 歲以上」', () => {
  const young = rankFromSignals({ ...none, elder: 0.95, alone: 0.9 }, '我四十歲，一個人住', 5, TODAY);
  assert.ok(!young.heard.some((h) => h.signal === 'elder'));
  // 40 歲獨居：要有身障證明才符合，沒提到身障所以只是「可能」
  const v = (r: typeof young) => r.top.find((t) => t.resource.id === 'tp-alone-elder-emergency')?.verdict;
  assert.equal(v(young), 'possible');
  const old = rankFromSignals({ ...none, elder: 0.1, alone: 0.9 }, '我八十歲，一個人住', 5, TODAY);
  assert.equal(old.top[0]?.resource.id, 'tp-alone-elder-emergency');
  assert.equal(v(old), 'likely');
});

test('每一項推薦都有理由，而且最多 5 項', () => {
  for (const c of [...CASES, ...HOLDOUT]) {
    const r = rankFromSignals(c.probs, c.text, 5, TODAY);
    assert.ok(r.top.length <= 5);
    for (const t of r.top) assert.ok(t.reasons.length > 0, `${c.text}：${t.resource.name} 沒有理由`);
  }
});

/** 準確度的下限，避免改權重時不小心變差（數字見 README 的已知限制） */
test('排名準確度沒有退步（調參用 14 組、沒看過的 10 組）', () => {
  const score = (cases: Case[]) => {
    let top1 = 0;
    let recall = 0;
    for (const c of cases) {
      const ids = rankFromSignals(c.probs, c.text, 5, TODAY).top.map((t) => t.resource.id);
      top1 += +(c.gold.length ? c.gold.includes(ids[0]) : ids.length === 0);
      recall += c.gold.length ? c.gold.filter((g) => ids.includes(g)).length / Math.min(c.gold.length, 5) : +(ids.length === 0);
    }
    return { top1, recall: recall / cases.length };
  };
  const a = score(CASES);
  const b = score(HOLDOUT);
  assert.ok(a.top1 >= 12 && a.recall >= 0.8, `調參組 Top1 ${a.top1}/14、Recall@5 ${a.recall.toFixed(2)}`);
  assert.ok(b.top1 >= 6 && b.recall >= 0.6, `沒看過的 Top1 ${b.top1}/10、Recall@5 ${b.recall.toFixed(2)}`);
});

test('noulProbs：兩個 logits 做 softmax，取第二個（是）', () => {
  const p = noulProbs([0, 0, 0, Math.log(3), 5, 5 - Math.log(4)], 3, 2);
  assert.ok(Math.abs(p[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(p[1] - 0.75) < 1e-9);
  assert.ok(Math.abs(p[2] - 0.2) < 1e-9);
});

/** 每個字元一個 token 的假分詞器，用來檢查序列結構 */
const fakeTok: LayaTokenizer = { encode: (s) => ({ ids: [...s].map((ch) => 100 + (ch.codePointAt(0)! % 1000)) }) };

test('序列結構：[CLS] 題目 [SEP] [MASK] 否 [MASK] 是 [SEP] 描述 [SEP]，兩個 marker 都指向 [MASK]', () => {
  const it = buildNoulSequence(fakeTok, '我一個人住', '這個人一個人住嗎？');
  assert.equal(it.ids[0], LAYA.cls);
  assert.equal(it.ids.at(-1), LAYA.sep);
  assert.equal(it.markers.length, 2);
  for (const m of it.markers) assert.equal(it.ids[m], LAYA.mask);
  assert.equal(it.ids[it.markers[0] - 1], LAYA.sep);
  assert.equal(it.ids.filter((x) => x === LAYA.sep).length, 3);
});

test('描述太長時截斷在 1024 個 token 以內，marker 位置不變', () => {
  const it = buildNoulSequence(fakeTok, '很'.repeat(3000), '這個人一個人住嗎？');
  assert.equal(it.ids.length, LAYA.maxLen);
  assert.equal(it.ids.at(-1), LAYA.sep);
  for (const m of it.markers) assert.equal(it.ids[m], LAYA.mask);
});

test('collate：補齊成同樣長度，attention 只標真正的 token', () => {
  const a = buildNoulSequence(fakeTok, '短', '題目？');
  const b = buildNoulSequence(fakeTok, '比較長的描述內容', '題目？');
  const batch = collate([a, b]);
  assert.equal(batch.L, b.ids.length);
  assert.equal(batch.inputIds.length, 2 * batch.L);
  const attA = [...batch.attention.slice(0, batch.L)].filter((x) => x === 1n).length;
  assert.equal(attA, a.ids.length);
  assert.equal(batch.inputIds[a.ids.length], BigInt(LAYA.pad));
  assert.deepEqual([...batch.qtype], [2n, 2n]);
});

const TOK_DIR = new URL('../web/public/models/laya/', import.meta.url);
const FULL_TOK = new URL('../laya/artifacts/tokenizer.json', import.meta.url);
const hasTok = existsSync(FULL_TOK) && existsSync(new URL('tokenizer-zh.json', TOK_DIR));

test(
  '和 Python 套件產生的 token ids 完全一致（完整版分詞器，以及網頁用的精簡版換回原始編號後）',
  { skip: !hasTok && '需要 laya/artifacts/tokenizer.json 與 web/public/models/laya/tokenizer-zh.json（見 laya/export_onnx.py、laya/trim_vocab.py）' },
  async () => {
    const { Tokenizer } = await import('@huggingface/tokenizers');
    const read = (f: string) => JSON.parse(readFileSync(new URL(f, TOK_DIR), 'utf8'));
    const cfg = read('tokenizer_config.json');
    const fullJson = JSON.parse(readFileSync(FULL_TOK, 'utf8'));
    const zhJson = read('tokenizer-zh.json');
    const full = new Tokenizer(fullJson, cfg);
    const zh = new Tokenizer(zhJson, cfg);
    // 精簡版的 id → token 字串 → 完整版的 id
    const toFull = new Map<number, number>(Object.entries(zhJson.model.vocab as Record<string, number>).map(([t, i]) => [i, fullJson.model.vocab[t]]));
    for (const c of [...CASES, ...HOLDOUT]) {
      for (const s of SIGNALS) {
        const a = buildNoulSequence(full, c.text, SIGNAL_QUESTIONS[s]);
        const b = buildNoulSequence(zh, c.text, SIGNAL_QUESTIONS[s]);
        assert.deepEqual(b.ids.map((i) => toFull.get(i)), a.ids, `${c.text}／${s}`);
        assert.deepEqual(b.markers, a.markers);
      }
      const first = buildNoulSequence(full, c.text, SIGNAL_QUESTIONS[SIGNALS[0]]);
      assert.deepEqual(first.ids, c.firstIds, c.text);
      assert.deepEqual(first.markers, c.firstMarkers, c.text);
    }
  },
);
