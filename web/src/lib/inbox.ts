// 通知收件匣：申請進度、家屬轉交等通知，存在使用者自己的手機（localStorage）。
// 推播只會在當下跳一次，收件匣讓使用者之後還能回頭看。
import { computed, reactive, watch } from 'vue';
import { identity } from './identity';
import { readLocal, writeLocal } from './prefs';

export type InboxKind = 'new' | 'status' | 'note' | 'result' | 'delegate' | 'family' | 'report';

export interface InboxItem {
  id: string;
  at: string;
  kind: InboxKind;
  title: string;
  body: string;
  /** 點通知後前往的頁面 */
  link: string;
  caseId?: string;
  /** 結案結果，用於顯示圖示顏色 */
  outcome?: string;
  read: boolean;
}

const MAX_ITEMS = 50;
const key = () => `wc.inbox.${identity.id}`;

export const inbox = reactive({ items: [] as InboxItem[] });

watch(
  () => identity.id,
  (id) => {
    inbox.items = id ? readLocal<InboxItem[]>(key(), []) : [];
  },
  { immediate: true },
);

function save() {
  writeLocal(key(), inbox.items);
}

export const unreadCount = computed(() => inbox.items.filter((i) => !i.read).length);

export function addToInbox(items: Omit<InboxItem, 'read'>[]): void {
  if (!items.length) return;
  const fresh = items.filter((n) => !inbox.items.some((i) => i.id === n.id)).map((n) => ({ ...n, read: false }));
  inbox.items = [...fresh.reverse(), ...inbox.items].slice(0, MAX_ITEMS);
  save();
}

/** 把符合條件的通知標為已讀；不給條件時全部標為已讀 */
export function markRead(match?: (i: InboxItem) => boolean): void {
  let changed = false;
  for (const i of inbox.items) {
    if (!i.read && (!match || match(i))) {
      i.read = true;
      changed = true;
    }
  }
  if (changed) save();
}

/**
 * 點了通知、準備前往該頁時呼叫。申請進度頁（/my、長輩頁）會自己標示「有新進度」再標為已讀，
 * 其他頁面（例如家屬協助）在這裡直接標為已讀。
 */
export function openedNotices(ids: string[]): void {
  markRead((i) => ids.includes(i.id) && i.link !== '/my' && !i.link.startsWith('/family/elder/'));
}

/** 有未讀通知的申請編號 */
export const unreadCaseIds = computed(() => new Set(inbox.items.filter((i) => !i.read && i.caseId).map((i) => i.caseId!)));
