// 「最少提問」：城市通已經帶入生日與居住地，其餘條件一次只問一題，
// 每次挑「回答後能確定最多項福利」的那一題。純函式，在民眾手機上執行，前後端與單元測試共用。
import { effectiveIncome, matchAll } from './match.ts';
import type { IncomeBand, MatchResult, Profile, Resource, Verdict } from './types.ts';

export type QuestionField =
  | 'taipeiResident'
  | 'livesAlone'
  | 'needsCare'
  | 'household'
  | 'income'
  | 'disability'
  | 'dementia'
  | 'hardship'
  | 'indigenous'
  | 'newResident';

export interface Question {
  field: QuestionField;
  q: string;
  hint?: string;
  /** 可選的答案（不含「不知道」，畫面上一律另外提供） */
  options: { value: string; label: string }[];
}

const YES_NO = [
  { value: 'yes', label: '是' },
  { value: 'no', label: '不是' },
];

/** 題目順序也是分數相同時的優先順序：先問最白話、最容易回答的 */
export const QUESTIONS: Question[] = [
  { field: 'taipeiResident', q: '你的戶籍在臺北市，也住在臺北市嗎？', options: YES_NO },
  { field: 'livesAlone', q: '你一個人住嗎？', hint: '或是同住的家人沒辦法照顧你', options: YES_NO },
  { field: 'needsCare', q: '洗澡、穿衣、吃飯或出門，需要別人幫忙嗎？', options: [{ value: 'yes', label: '需要' }, { value: 'no', label: '不需要' }] },
  {
    field: 'income',
    q: '家裡平均每個人，每個月的收入大約多少？',
    hint: '全家每月收入加起來，除以家裡人數',
    options: [
      { value: 'le_low', label: '2 萬元以下（20,744 元以下）' },
      { value: 'le_midlow', label: '2 萬到 3 萬元（29,635 元以下）' },
      { value: 'le_1_5x', label: '3 萬到 4 萬元（39,960 元以下）' },
      { value: 'above', label: '超過 4 萬元' },
    ],
  },
  {
    field: 'household',
    q: '家裡是低收入戶或中低收入戶嗎？',
    options: [
      { value: 'low', label: '低收入戶' },
      { value: 'midLow', label: '中低收入戶' },
      { value: 'none', label: '都不是' },
    ],
  },
  { field: 'disability', q: '你有身心障礙證明嗎？', options: [{ value: 'yes', label: '有' }, { value: 'no', label: '沒有' }] },
  { field: 'dementia', q: '醫師有診斷過失智症嗎？', options: [{ value: 'yes', label: '有' }, { value: 'no', label: '沒有' }] },
  { field: 'hardship', q: '最近 3 個月，家裡有發生變故嗎？', hint: '例如家人過世、重病、受傷、失業', options: [{ value: 'yes', label: '有' }, { value: 'no', label: '沒有' }] },
  { field: 'indigenous', q: '你是原住民嗎？', options: YES_NO },
  { field: 'newResident', q: '你是新住民，或是新住民的家人嗎？', hint: '外籍、大陸或港澳配偶', options: YES_NO },
];

export interface NextQuestion {
  question: Question;
  /** 回答後可能變成「很可能符合」的福利項目（畫面上告訴民眾「為什麼問這題」） */
  unlocks: Resource[];
}

function verdicts(resources: Resource[], p: Profile, today: Date): Map<string, Verdict> {
  return new Map(matchAll(resources, p, today).map((r) => [r.resource.id, r.verdict]));
}

/** 回答這一題、選了某個答案之後的資料 */
export function answer(p: Profile, field: QuestionField, value: string): Profile {
  return { ...p, [field]: value } as Profile;
}

/** 這一題還沒有答案（低收入戶身分可以推得收入級距，所以也算回答了收入） */
function unanswered(p: Profile, field: QuestionField): boolean {
  if (field === 'income') return effectiveIncome(p) === 'unknown';
  return p[field] === 'unknown';
}

/**
 * 挑下一題：目標是「多找到福利」，不是把人篩掉。
 * 對每個還沒回答的問題試算每一個答案，數有幾項福利會因此變成「很可能符合」，取最多的一題；
 * 一樣多時，依 QUESTIONS 的順序先問比較白話的。沒有任何一題能再多找到福利時回傳 null。
 * @param asked 這次已經問過的題目（包含回答「不知道」的），不會重複問
 */
export function nextQuestion(p: Profile, resources: Resource[], asked: QuestionField[] = [], today = new Date()): NextQuestion | null {
  const now = verdicts(resources, p, today);
  let best: NextQuestion | null = null;
  for (const question of QUESTIONS) {
    if (asked.includes(question.field) || !unanswered(p, question.field)) continue;
    const unlocked = new Set<string>();
    for (const o of question.options) {
      for (const [id, v] of verdicts(resources, answer(p, question.field, o.value), today)) {
        if (v === 'likely' && now.get(id) !== 'likely') unlocked.add(id);
      }
    }
    if (unlocked.size > (best?.unlocks.length ?? 0)) {
      best = { question, unlocks: resources.filter((r) => unlocked.has(r.id)) };
    }
  }
  return best;
}

/** 兩次比對之間，從「待確認」變成「很可能符合」的項目（畫面上顯示「＋ 新確認」） */
export function newlyLikely(before: MatchResult[], after: MatchResult[]): Resource[] {
  const was = new Map(before.map((r) => [r.resource.id, r.verdict]));
  return after.filter((r) => r.verdict === 'likely' && was.get(r.resource.id) !== 'likely').map((r) => r.resource);
}

/**
 * 估算每月現金補助（元）：同一組的津貼不能重複領取，只取最高的一項；
 * 知道收入級距時，用該級距的金額。
 */
export function estimateMonthly(results: MatchResult[], p: Profile, include: Verdict[] = ['likely']): number {
  const band = effectiveIncome(p);
  const groups = new Map<string, number>();
  let total = 0;
  for (const r of results) {
    const m = r.resource.monthly;
    if (!m || !include.includes(r.verdict)) continue;
    const amount = (band !== 'unknown' ? m.byIncome?.[band as Exclude<IncomeBand, 'unknown'>] : undefined) ?? m.max;
    if (m.group) groups.set(m.group, Math.max(groups.get(m.group) ?? 0, amount));
    else total += amount;
  }
  for (const v of groups.values()) total += v;
  return total;
}
