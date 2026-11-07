// 「用說的找福利」：民眾用自己的話描述狀況，手機上的 Laya 模型回答幾個是非題（聽懂），
// 再由這裡把機率轉成排名（決定）。純函式，前端與單元測試共用；模型推論在 web/src/lib/laya.ts。
//
// 分工：
//   - Laya：每個「狀況」回答 P(是)，例如「這個人一個人住嗎？」
//   - 規則：年齡從文字裡的數字解析（模型不擅長數字），資格由 match.ts 的規則引擎判斷
//   - 排名：每項福利的分數 = Σ P(狀況) × 這個狀況和這項福利的關聯；規則判定不符合的排除
import { RESOURCE_BY_ID, RESOURCES } from './data/resources.ts';
import { EMPTY_PROFILE, matchResource } from './match.ts';
import type { Profile, Resource, Verdict } from './types.ts';

export type Signal =
  | 'alone'
  | 'care'
  | 'dementia'
  | 'disability'
  | 'aids'
  | 'indigenous'
  | 'newres'
  | 'poor'
  | 'loss'
  | 'elder'
  | 'lonely'
  | 'meals'
  | 'nhi'
  | 'school';

/** 問 Laya 的是非題。措辭經過 14 組測試描述比較（laya/questions_eval.py），中文問句比英文好 */
export const SIGNAL_QUESTIONS: Record<Signal, string> = {
  alone: '這個人一個人住嗎？',
  care: '這個人（或他照顧的家人）行動不便，洗澡、吃飯、走路或出門需要別人幫忙嗎？',
  dementia: '有人失智、記性變差或會迷路嗎？',
  disability: '這個人有身心障礙證明，或是身體有障礙嗎？',
  aids: '這個人需要輪椅、助行器、拐杖等輔具嗎？',
  indigenous: '這個人是原住民嗎？',
  newres: '這個人是從外國（例如越南、印尼、中國大陸）嫁到臺灣或移民來的新住民嗎？',
  poor: '這個人的家庭經濟困難、收入很低或付不出錢嗎？',
  loss: '最近家裡有人過世、重病、受傷或失業嗎？',
  elder: '這個人是 65 歲以上的長者嗎？',
  lonely: '這個人覺得孤單，想找人陪伴、聊天或參加社區活動嗎？',
  meals: '這個人三餐沒辦法好好吃，需要有人送餐嗎？',
  nhi: '這個人覺得健保費負擔很重嗎？',
  school: '家裡有小孩在讀書，學費負擔很重嗎？',
};

/** 畫面上「AI 聽到的狀況」 */
export const SIGNAL_LABEL: Record<Signal, string> = {
  alone: '一個人住',
  care: '生活需要人幫忙',
  dementia: '失智或記性變差',
  disability: '身心障礙',
  aids: '需要輔具',
  indigenous: '原住民',
  newres: '新住民',
  poor: '經濟困難',
  loss: '家裡有變故',
  elder: '65 歲以上',
  lonely: '想找人陪伴',
  meals: '三餐有困難',
  nhi: '健保費負擔重',
  school: '學費負擔重',
};

/** 每個狀況和各項福利的關聯（0～1） */
const WEIGHTS: Record<Signal, Record<string, number>> = {
  alone: { 'tp-alone-elder-emergency': 1, 'tp-care-points': 0.5, 'tp-meal-service': 0.3 },
  care: { 'ltc-2': 1, 'tp-meal-service': 0.7, 'tp-disability-aids': 0.3 },
  dementia: { 'ltc-2': 1, 'tp-care-points': 0.3 },
  disability: { 'tp-disability-living': 1, 'tp-disability-aids': 0.8 },
  aids: { 'tp-disability-aids': 1, 'ltc-2': 0.6 },
  indigenous: { 'bli-indigenous-pension': 1, 'tp-elder-nhi': 0.4 },
  newres: { 'tp-new-resident-center': 1 },
  poor: { 'tp-low-income': 0.8, 'tp-mid-low-income': 0.8, 'tp-mid-low-elder-allowance': 0.8, 'tp-elder-nhi': 0.4, 'tp-emergency-relief': 0.3 },
  loss: { 'tp-emergency-bailout': 1, 'tp-emergency-relief': 0.9 },
  elder: { 'tp-elder-nhi': 0.5, 'tp-care-points': 0.3, 'tp-mid-low-elder-allowance': 0.3 },
  lonely: { 'tp-care-points': 1 },
  meals: { 'tp-meal-service': 1, 'tp-care-points': 0.3 },
  nhi: { 'tp-elder-nhi': 1 },
  school: { 'tp-mid-low-income': 1, 'tp-low-income': 0.5 },
};

export const SIGNALS = Object.keys(SIGNAL_QUESTIONS) as Signal[];
export type SignalProbs = Record<Signal, number>;

/** 視為「聽到了」的機率門檻 */
export const HEARD = 0.5;

const CN_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「七十八」「八十五」「一百零二」→ 數字 */
function cnNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch in CN_DIGIT) cur = CN_DIGIT[ch];
    else if (ch === '十') {
      total += (cur || 1) * 10;
      cur = 0;
    } else if (ch === '百') {
      total += (cur || 1) * 100;
      cur = 0;
    } else return null;
  }
  return total + cur;
}

/** 文字裡提到的年齡（取最大的，通常是需要幫忙的長輩）；沒提到回傳 null */
export function parseAge(text: string): number | null {
  const ages = [...text.matchAll(/([0-9]{1,3}|[零一二兩三四五六七八九十百]{1,5})\s*(?:歲|岁)/g)]
    .map((m) => cnNumber(m[1]))
    .filter((n): n is number => n !== null && n > 0 && n < 120);
  return ages.length ? Math.max(...ages) : null;
}

/** 依聽到的狀況推估資料，交給規則引擎判斷資格（沒聽到的一律當「不確定」，不會當成「不是」） */
export function profileFromSignals(p: SignalProbs, age: number | null, today = new Date()): Profile {
  const yes = (s: Signal) => (p[s] >= HEARD ? 'yes' : 'unknown');
  const years = age ?? (p.elder >= 0.6 ? 70 : null);
  return {
    ...EMPTY_PROFILE,
    birthday: years === null ? null : `${today.getFullYear() - years}-01-01`,
    livesAlone: yes('alone'),
    needsCare: p.care >= HEARD || p.dementia >= HEARD ? 'yes' : 'unknown',
    dementia: yes('dementia'),
    disability: yes('disability'),
    indigenous: yes('indigenous'),
    newResident: yes('newres'),
    hardship: yes('loss'),
  };
}

export interface NlRecommendation {
  resource: Resource;
  score: number;
  verdict: Verdict;
  /** 推薦理由：聽到的狀況與機率，依貢獻排序 */
  reasons: { signal: Signal; label: string; p: number }[];
}

export interface NlResult {
  age: number | null;
  /** 聽到的狀況（機率 ≥ HEARD），依機率排序 */
  heard: { signal: Signal; label: string; p: number }[];
  top: NlRecommendation[];
}

/**
 * 依 Laya 的回答排出最適合的福利（最多 limit 項）。
 * 年齡明確提到時，「65 歲以上」以數字為準，不採用模型的猜測。
 */
export function rankFromSignals(raw: SignalProbs, text: string, limit = 5, today = new Date()): NlResult {
  const age = parseAge(text);
  const p: SignalProbs = { ...raw };
  if (age !== null) p.elder = age >= 65 ? 1 : 0;
  const profile = profileFromSignals(p, age, today);

  const scored = RESOURCES.map((resource) => {
    const contrib = SIGNALS.map((s) => ({ s, v: p[s] * (WEIGHTS[s][resource.id] ?? 0) })).filter((x) => x.v > 0);
    const verdict = matchResource(resource, profile, today).verdict;
    const score = contrib.reduce((sum, x) => sum + x.v, 0) + (verdict === 'likely' ? 0.3 : 0);
    const reasons = contrib
      .filter((x) => p[x.s] >= HEARD)
      .sort((a, b) => b.v - a.v)
      .map((x) => ({ signal: x.s, label: SIGNAL_LABEL[x.s], p: p[x.s] }));
    return { resource, score, verdict, reasons };
  });

  const top = scored
    .filter((r) => r.verdict !== 'unlikely' && r.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const heard = SIGNALS.filter((s) => p[s] >= HEARD)
    .sort((a, b) => p[b] - p[a])
    .map((s) => ({ signal: s, label: SIGNAL_LABEL[s], p: p[s] }));
  return { age, heard, top };
}

export const resourceById = (id: string) => RESOURCE_BY_ID.get(id);
