// 鄰里關懷通報：不會用手機、也不會自己申請的長輩，由鄰居、里長或店員用城市通通報。
// 通報人只描述看到的狀況，不需要知道對方的姓名；系統依狀況建議社工訪視時可以評估的福利。
// 純函式，前端（送出前預覽）與後端（建立個案）共用。
import { RESOURCE_BY_ID } from './data/resources.ts';
import { EMPTY_PROFILE, matchResource } from './match.ts';
import type { CaseStatus, Profile } from './types.ts';

export type Sign = 'alone' | 'mobility' | 'meals' | 'unseen' | 'poor' | 'memory' | 'loss';

export const SIGNS: { value: Sign; label: string; tag: string; resources: string[] }[] = [
  { value: 'alone', label: '好像一個人住', tag: '疑似獨居', resources: ['tp-alone-elder-emergency', 'tp-care-points'] },
  { value: 'mobility', label: '走路不方便、很少出門', tag: '行動不便', resources: ['ltc-2', 'tp-meal-service'] },
  { value: 'meals', label: '好像沒有好好吃飯', tag: '飲食不足', resources: ['tp-meal-service', 'tp-care-points'] },
  { value: 'unseen', label: '好幾天沒看到他', tag: '多日未見', resources: ['tp-alone-elder-emergency', 'tp-care-points'] },
  { value: 'poor', label: '生活看起來很拮据', tag: '經濟困難', resources: ['tp-mid-low-elder-allowance', 'tp-low-income', 'tp-mid-low-income'] },
  { value: 'memory', label: '記性變差、會迷路', tag: '疑似失智', resources: ['ltc-2'] },
  { value: 'loss', label: '家裡最近有變故', tag: '家庭變故', resources: ['tp-emergency-bailout', 'tp-emergency-relief'] },
];

const SIGN_BY_VALUE = new Map(SIGNS.map((s) => [s.value, s]));

export type AgeGuess = 'elder' | 'adult' | 'unknown';

export const AGE_GUESS: { value: AgeGuess; label: string }[] = [
  { value: 'elder', label: '65 歲以上' },
  { value: 'adult', label: '65 歲以下' },
  { value: 'unknown', label: '看不出來' },
];

export function parseSigns(v: unknown): Sign[] {
  return Array.isArray(v) ? [...new Set(v.filter((s): s is Sign => SIGN_BY_VALUE.has(s as Sign)))] : [];
}

/** 好幾天沒看到人，可能有立即危險，社工要優先處理 */
export const isUrgent = (signs: readonly string[]): boolean => signs.includes('unseen');

export const signTags = (signs: readonly string[]): string[] =>
  signs.map((s) => SIGN_BY_VALUE.get(s as Sign)?.tag).filter((t): t is string => !!t);

/** 依看到的狀況推估的資料（只用來過濾不適用的福利，不會存下來） */
function guessProfile(signs: Sign[], age: AgeGuess, today: Date): Profile {
  const year = today.getFullYear() - (age === 'elder' ? 70 : 40);
  return {
    ...EMPTY_PROFILE,
    birthday: age === 'unknown' ? null : `${year}-01-01`,
    taipeiResident: 'yes',
    livesAlone: signs.includes('alone') || signs.includes('unseen') ? 'yes' : 'unknown',
    needsCare: signs.includes('mobility') ? 'yes' : 'unknown',
    dementia: signs.includes('memory') ? 'yes' : 'unknown',
    hardship: signs.includes('loss') ? 'yes' : 'unknown',
  };
}

/** 社工訪視時可以評估的福利（最多 5 項），已經確定不適用的（例如 65 歲以下的老人津貼）會排除 */
export function suggestForReport(signs: Sign[], age: AgeGuess, today = new Date()): string[] {
  const profile = guessProfile(signs, age, today);
  const ids = [...new Set(signs.flatMap((s) => SIGN_BY_VALUE.get(s)?.resources ?? []))];
  const ok = ids.filter((id) => {
    const r = RESOURCE_BY_ID.get(id);
    return r && matchResource(r, profile, today).verdict !== 'unlikely';
  });
  return (ok.length ? ok : ['tp-care-points']).slice(0, 5);
}

/** 通報人看得到的進度：只有「收到、已安排、已關心」，不透露長輩的任何資料 */
export type ReportStage = 'received' | 'assigned' | 'visited';

export function reportStage(status: CaseStatus): ReportStage {
  if (status === 'received') return 'received';
  if (status === 'assigned') return 'assigned';
  return 'visited';
}

export const REPORT_STAGE_LABEL: Record<ReportStage, string> = {
  received: '社工已收到',
  assigned: '已安排社工去關心',
  visited: '社工已經去關心過了',
};

/** 給通報人的回報 */
export interface MyReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  district: string;
  place: string;
  nickname: string;
  stage: ReportStage;
}

/** 通報的進度有變化時，要推播給通報人的內容；沒有變化時回傳 null */
export function reportUpdate(r: MyReport, prev: ReportStage | undefined): { title: string; body: string } | null {
  if (!prev || prev === r.stage || r.stage === 'received') return null;
  const who = r.nickname ? `「${r.nickname}」` : `${r.place || r.district}的長輩`;
  return r.stage === 'assigned'
    ? { title: '你的關懷通報有人接手了', body: `社工已經安排去關心你通報的${who}，謝謝你的關心。` }
    : { title: '社工已經去關心過了', body: `社工已經去關心你通報的${who}。因為隱私，詳細情形不會告訴你，謝謝你多看一眼。` };
}
