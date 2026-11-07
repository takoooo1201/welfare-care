import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESOURCES } from './data/resources.ts';
import { EMPTY_PROFILE, matchAll } from './match.ts';
import { answer, estimateMonthly, newlyLikely, nextQuestion, type QuestionField } from './questions.ts';
import type { Profile } from './types.ts';

const TODAY = new Date('2026-11-07T12:00:00+08:00');
/** 城市通帶入的資料：生日、行政區、是否為臺北市民、是否為原住民 */
const FROM_TOWNPASS: Profile = { ...EMPTY_PROFILE, birthday: '1950-03-15', district: '中山區', taipeiResident: 'yes', indigenous: 'no' };

test('只有城市通帶入的資料時，第一題問收入（能多確認最多項福利）', () => {
  const n = nextQuestion(FROM_TOWNPASS, RESOURCES, [], TODAY);
  assert.equal(n?.question.field, 'income');
  assert.ok(n!.unlocks.some((r) => r.id === 'tp-mid-low-elder-allowance'));
});

test('已經問過（包含答「不知道」）的題目不會再問', () => {
  const n = nextQuestion(FROM_TOWNPASS, RESOURCES, ['income'], TODAY);
  assert.ok(n);
  assert.notEqual(n.question.field, 'income');
});

test('依序回答後，問完就停，而且不會多問', () => {
  const answers: Partial<Record<QuestionField, string>> = { income: 'le_midlow', livesAlone: 'yes', needsCare: 'yes' };
  let p = FROM_TOWNPASS;
  const asked: QuestionField[] = [];
  for (;;) {
    const n = nextQuestion(p, RESOURCES, asked, TODAY);
    if (!n) break;
    asked.push(n.question.field);
    p = answer(p, n.question.field, answers[n.question.field] ?? 'no');
    assert.ok(asked.length <= 10, '題數不能超過題庫');
  }
  assert.ok(asked.length <= 6, `問了 ${asked.length} 題`);
  const likely = matchAll(RESOURCES, p, TODAY).filter((r) => r.verdict === 'likely').map((r) => r.resource.id);
  for (const id of ['tp-mid-low-elder-allowance', 'tp-alone-elder-emergency', 'ltc-2']) assert.ok(likely.includes(id), id);
});

test('每月金額：同一組津貼只算最高的一項，並依收入級距計算', () => {
  const p: Profile = { ...FROM_TOWNPASS, income: 'le_1_5x', disability: 'yes' };
  const results = matchAll(RESOURCES, p, TODAY);
  // 中低收入老人生活津貼（4,164）與身障生活補助（最高 9,485）同組，只取 9,485；另加老人健保 826
  assert.equal(estimateMonthly(results, p, ['likely']), 9485 + 826);
  const lowIncome: Profile = { ...FROM_TOWNPASS, income: 'le_midlow' };
  assert.equal(estimateMonthly(matchAll(RESOURCES, lowIncome, TODAY), lowIncome), 8329 + 826);
});

test('新確認的項目：從待確認變成很可能符合', () => {
  const before = matchAll(RESOURCES, FROM_TOWNPASS, TODAY);
  const after = matchAll(RESOURCES, answer(FROM_TOWNPASS, 'livesAlone', 'yes'), TODAY);
  assert.deepEqual(
    newlyLikely(before, after).map((r) => r.id).sort(),
    ['tp-alone-elder-emergency', 'tp-meal-service'],
  );
});
