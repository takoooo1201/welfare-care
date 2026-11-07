// 用 shared/fixtures 裡事先算好的 Laya 機率，評估 shared/nl.ts 的排名（不需要跑模型）。
//   node laya/nl-eval.ts [laya-cases.json|laya-holdout.json]
// Top1：第 1 名在正確答案裡（正確答案為空時，要回傳空結果）；Recall@5：前 5 名涵蓋多少正確答案。
import { readFileSync } from 'node:fs';
import { rankFromSignals, type SignalProbs } from '../shared/nl.ts';

const file = process.argv[2] ?? 'laya-cases.json';
const fx = JSON.parse(readFileSync(new URL(`../shared/fixtures/${file}`, import.meta.url), 'utf8'));
const TODAY = new Date('2026-11-07');

let top1 = 0;
let recall = 0;
for (const c of fx.cases as { text: string; gold: string[]; probs: SignalProbs }[]) {
  const r = rankFromSignals(c.probs, c.text, 5, TODAY);
  const ids = r.top.map((x) => x.resource.id);
  const hit = c.gold.length ? c.gold.includes(ids[0]) : ids.length === 0;
  const rec = c.gold.length ? c.gold.filter((g) => ids.includes(g)).length / Math.min(c.gold.length, 5) : ids.length === 0 ? 1 : 0;
  top1 += +hit;
  recall += rec;
  console.log(`${hit ? '✓' : '✗'} R@5=${rec.toFixed(2)} ${c.text.slice(0, 20)}  年齡=${r.age}`);
  console.log(`   聽到：${r.heard.map((h) => `${h.label} ${h.p.toFixed(2)}`).join('、') || '（無）'}`);
  console.log(`   前 5：${r.top.map((x) => `${x.resource.name}(${x.score.toFixed(2)})`).join('、') || '（無）'}`);
}
const n = fx.cases.length;
console.log(`\n${file}（${fx.model}）\nTop1 ${top1}/${n}　平均 Recall@5 ${(recall / n).toFixed(2)}`);
