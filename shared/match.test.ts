import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESOURCES } from './data/resources.ts';
import { ageOn, EMPTY_PROFILE, matchAll } from './match.ts';
import type { Profile } from './types.ts';

const TODAY = new Date('2026-11-07T12:00:00+08:00');
const verdicts = (p: Profile) => Object.fromEntries(matchAll(RESOURCES, p, TODAY).map((r) => [r.resource.id, r.verdict]));

test('ageOn 依生日計算足歲', () => {
  assert.equal(ageOn('1951-11-07', TODAY), 75);
  assert.equal(ageOn('1951-11-08', TODAY), 74);
  assert.equal(ageOn('1988/12/12', TODAY), 37);
  assert.equal(ageOn(null, TODAY), null);
});

test('獨居、中低收入的 75 歲長者', () => {
  const v = verdicts({
    ...EMPTY_PROFILE,
    birthday: '1951-03-02',
    taipeiResident: 'yes',
    household: 'midLow',
    disability: 'no',
    indigenous: 'no',
    newResident: 'no',
    livesAlone: 'yes',
    needsCare: 'no',
    dementia: 'no',
    hardship: 'no',
  });
  assert.equal(v['tp-mid-low-elder-allowance'], 'likely');
  assert.equal(v['tp-elder-nhi'], 'likely');
  assert.equal(v['tp-alone-elder-emergency'], 'likely');
  assert.equal(v['tp-care-points'], 'likely');
  assert.equal(v['tp-meal-service'], 'likely'); // 只需備餐協助的獨居長者
  assert.equal(v['tp-low-income'], 'unlikely'); // 中低收入戶的收入高於低收入戶標準
  assert.equal(v['tp-mid-low-income'], 'unlikely'); // 已經是中低收入戶
  assert.equal(v['ltc-2'], 'unlikely'); // 沒有失能
  assert.equal(v['bli-indigenous-pension'], 'unlikely');
});

test('58 歲原住民：原住民給付與健保補助', () => {
  const v = verdicts({ ...EMPTY_PROFILE, birthday: '1968-05-01', indigenous: 'yes', taipeiResident: 'yes' });
  assert.equal(v['bli-indigenous-pension'], 'likely');
  assert.equal(v['tp-elder-nhi'], 'likely');
  assert.equal(v['tp-mid-low-elder-allowance'], 'unlikely');
});

test('資料不完整時列為「可能符合」，不會誤判為不符合', () => {
  const v = verdicts({ ...EMPTY_PROFILE, birthday: '1950-01-01' });
  assert.equal(v['tp-mid-low-elder-allowance'], 'possible');
  assert.equal(v['tp-low-income'], 'possible');
});

test('遭遇急難時，急難類資源排在最前面', () => {
  const results = matchAll(RESOURCES, { ...EMPTY_PROFILE, birthday: '1980-01-01', taipeiResident: 'yes', hardship: 'yes' }, TODAY);
  assert.equal(results[0].resource.category, 'emergency');
});

test('每筆資源都有來源網址與查核日期', () => {
  for (const r of RESOURCES) {
    assert.match(r.source.url, /^https:\/\//, r.id);
    assert.match(r.source.checked, /^\d{4}-\d{2}-\d{2}$/, r.id);
  }
});
