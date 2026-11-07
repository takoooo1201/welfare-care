// 資格初步比對引擎。純函式，前端（民眾手機上）與後端（據點代為建檔）共用。
// 結果只是「初步比對」，實際資格一律以主管機關審核為準。
import { INCOME_ORDER } from './types.ts';
import type {
  Criterion,
  CriterionResult,
  EvaluatedCriterion,
  IncomeBand,
  MatchResult,
  Profile,
  Resource,
  Verdict,
} from './types.ts';

export const EMPTY_PROFILE: Profile = {
  birthday: null,
  district: null,
  village: null,
  taipeiResident: 'unknown',
  household: 'unknown',
  income: 'unknown',
  disability: 'unknown',
  indigenous: 'unknown',
  newResident: 'unknown',
  livesAlone: 'unknown',
  needsCare: 'unknown',
  dementia: 'unknown',
  hardship: 'unknown',
};

/** 依生日計算足歲；沒有生日回傳 null */
export function ageOn(birthday: string | null, today: Date = new Date()): number | null {
  if (!birthday) return null;
  const m = birthday.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age;
}

/** 已知低收入戶或中低收入戶時，可以推得收入級距 */
export function effectiveIncome(p: Profile): IncomeBand {
  if (p.income !== 'unknown') return p.income;
  if (p.household === 'low') return 'le_low';
  if (p.household === 'midLow') return 'le_midlow';
  return 'unknown';
}

export function evaluate(c: Criterion, p: Profile, today: Date): CriterionResult {
  switch (c.kind) {
    case 'age': {
      const age = ageOn(p.birthday, today);
      if (age === null) return 'unknown';
      if (c.min !== undefined && age < c.min) return 'unmet';
      if (c.max !== undefined && age > c.max) return 'unmet';
      return 'met';
    }
    case 'tri': {
      const v = p[c.field];
      if (v === 'unknown') return 'unknown';
      return v === c.equals ? 'met' : 'unmet';
    }
    case 'household':
      if (p.household === 'unknown') return c.in.includes('unknown') ? 'met' : 'unknown';
      return c.in.includes(p.household) ? 'met' : 'unmet';
    case 'income': {
      const band = effectiveIncome(p);
      if (band === 'unknown') return 'unknown';
      return INCOME_ORDER.indexOf(band) <= INCOME_ORDER.indexOf(c.atMost) ? 'met' : 'unmet';
    }
    case 'all': {
      const rs = c.of.map((x) => evaluate(x, p, today));
      if (rs.includes('unmet')) return 'unmet';
      if (rs.includes('unknown')) return 'unknown';
      return rs.every((r) => r === 'manual') ? 'manual' : 'met';
    }
    case 'any': {
      const rs = c.of.map((x) => evaluate(x, p, today));
      if (rs.includes('met')) return 'met';
      if (rs.every((r) => r === 'unmet')) return 'unmet';
      return 'unknown';
    }
    case 'manual':
      return 'manual';
  }
}

export function matchResource(resource: Resource, profile: Profile, today = new Date()): MatchResult {
  const criteria: EvaluatedCriterion[] = resource.criteria.map((c) => ({
    label: c.label,
    result: evaluate(c, profile, today),
  }));
  const unknownCount = criteria.filter((c) => c.result === 'unknown').length;
  let verdict: Verdict = 'likely';
  if (criteria.some((c) => c.result === 'unmet')) verdict = 'unlikely';
  else if (unknownCount > 0) verdict = 'possible';
  return { resource, verdict, criteria, unknownCount };
}

const VERDICT_RANK: Record<Verdict, number> = { likely: 0, possible: 1, unlikely: 2 };

/** 比對全部資源並排序：很可能符合 → 可能符合（待確認少的優先）→ 目前不符合 */
export function matchAll(resources: Resource[], profile: Profile, today = new Date()): MatchResult[] {
  const urgent = profile.hardship === 'yes';
  return resources
    .map((r) => matchResource(r, profile, today))
    .sort((a, b) => {
      const v = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
      if (v !== 0) return v;
      if (urgent) {
        const e = Number(b.resource.category === 'emergency') - Number(a.resource.category === 'emergency');
        if (e !== 0) return e;
      }
      return a.unknownCount - b.unknownCount;
    });
}

/** 哪些「不確定」的問題回答後，最能讓推薦更精準（給「再回答幾題」提示用） */
export function unansweredFields(profile: Profile): (keyof Profile)[] {
  const keys: (keyof Profile)[] = [
    'birthday', 'taipeiResident', 'household', 'income', 'disability', 'indigenous',
    'newResident', 'livesAlone', 'needsCare', 'dementia', 'hardship',
  ];
  return keys.filter((k) => profile[k] === null || profile[k] === 'unknown');
}
