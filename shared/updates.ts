// 申請進度的更新通知：比對「上次看到的狀態」與目前的個案，找出要通知使用者的新進度。
// 純函式，前端的通知輪詢（web/src/lib/watcher.ts）與單元測試共用。
import { RESOURCE_BY_ID } from './data/resources.ts';
import { OUTCOME_LABEL, STATUS_LABEL } from './labels.ts';
import type { CaseRecord, CaseStatus, Outcome, TimelineEvent } from './types.ts';

/** 上次看到的個案狀態：s 為狀態，n 為處理紀錄的筆數 */
export interface SeenCase {
  s: CaseStatus;
  n: number;
}

export type UpdateKind = 'new' | 'status' | 'note' | 'result';

export interface CaseUpdate {
  caseId: string;
  kind: UpdateKind;
  /** 短標題，用於推播標題與通知列表 */
  title: string;
  body: string;
  outcome?: Outcome;
}

export function seenOf(c: CaseRecord): SeenCase {
  return { s: c.status, n: c.timeline.length };
}

/** 申請項目名稱：超過兩項時只列前兩項 */
export function resourceTitle(ids: string[]): string {
  const names = ids.map((id) => RESOURCE_BY_ID.get(id)?.name ?? id);
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 項`;
}

/** 服務人員實際寫下的處理紀錄（排除系統自動產生的文字） */
function realNote(e: TimelineEvent): string {
  const note = e.note?.trim() ?? '';
  if (!note || note === `更新為「${STATUS_LABEL[e.status]}」` || note.startsWith('結案：')) return '';
  return note;
}

/**
 * 找出一件申請自上次看過之後的新進度；沒有新進度時回傳 null。
 * @param prev 上次看到的狀態；undefined 代表第一次看到這件申請（例如家屬代為送出）
 * @param who  家屬看長輩的申請時傳入長輩的名字；本人的申請傳 null
 */
export function caseUpdate(c: CaseRecord, prev: SeenCase | undefined, who: string | null): CaseUpdate | null {
  const items = `「${resourceTitle(c.resourceIds)}」`;
  const subject = `${who ? `${who}的` : ''}${items}`;

  if (!prev) {
    const by = c.timeline[0]?.by ?? '服務人員';
    let body = `${by} 幫你送出了${items}的協助需求`;
    if (who) body = by === who ? `${who} 送出了${items}的協助需求` : `${by} 幫${who}送出了${items}的協助需求`;
    return { caseId: c.id, kind: 'new', title: '新的協助需求', body };
  }

  const fresh = c.timeline.slice(Math.max(0, prev.n));
  if (!fresh.length) {
    if (prev.s === c.status) return null;
    // 舊版只記錄狀態、沒有記錄筆數時，只能知道狀態變了
    return { caseId: c.id, kind: 'status', title: `進度更新：${STATUS_LABEL[c.status]}`, body: `${subject}已更新為「${STATUS_LABEL[c.status]}」` };
  }

  const last = fresh[fresh.length - 1];
  const note = realNote(last);
  const more = fresh.length > 1 ? `（另有 ${fresh.length - 1} 則更新）` : '';
  // 處理紀錄已經寫了人名（例如「林志明 接下這件協助」）時，不再重複標示
  const by = note.includes(last.by) ? '' : `（${last.by}）`;

  if (c.status === 'closed' && c.outcome && last.outcome) {
    return {
      caseId: c.id,
      kind: 'result',
      title: c.outcome === 'approved' ? '申請核定通過 🎉' : `申請結果：${OUTCOME_LABEL[c.outcome]}`,
      body: `${subject}${OUTCOME_LABEL[c.outcome]}${note ? `：${note}` : ''}${more}`,
      outcome: c.outcome,
    };
  }

  if (c.status !== prev.s) {
    return {
      caseId: c.id,
      kind: 'status',
      title: `進度更新：${STATUS_LABEL[c.status]}`,
      body: `${subject}${note ? `：${note}` : `已更新為「${STATUS_LABEL[c.status]}」`}${by}${more}`,
    };
  }

  return {
    caseId: c.id,
    kind: 'note',
    title: '負責人員有新留言',
    body: `${subject}：${note || STATUS_LABEL[c.status]}${by}${more}`,
  };
}
