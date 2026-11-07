// 定期檢查申請進度；狀態改變時，透過城市通推播通知本人與已綁定的家屬。
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { STATUS_LABEL } from '@shared/labels.ts';
import type { CaseRecord } from '@shared/types.ts';
import { api } from './api';
import { notify } from './bridge';
import { identity } from './identity';
import { readLocal, writeLocal } from './prefs';

const INTERVAL_MS = 8000;

export function startCaseWatcher(shouldRun: () => boolean, onChange: (message: string) => void): () => void {
  let busy = false;

  async function tick() {
    if (busy || !identity.ready || !identity.id || document.hidden || !shouldRun()) return;
    busy = true;
    try {
      const watched: { c: CaseRecord; who: string | null }[] = (await api.myCases()).map((c) => ({ c, who: null }));
      const { asFamily } = await api.familyLinks();
      for (const link of asFamily) {
        const data = await api.elder(link.citizenId).catch(() => null);
        for (const c of data?.cases ?? []) watched.push({ c, who: link.citizenName });
      }
      const key = `wc.seen.${identity.id}`;
      const seen = readLocal<Record<string, string>>(key, {});
      for (const { c, who } of watched) {
        const prev = seen[c.id];
        if (prev && prev !== c.status) {
          const names = c.resourceIds.map((id) => RESOURCE_BY_ID.get(id)?.name ?? id).join('、');
          const message = `${who ? `${who}的` : '你的'}「${names}」：${STATUS_LABEL[c.status]}`;
          notify('福利找上門', message);
          onChange(message);
        }
        seen[c.id] = c.status;
      }
      writeLocal(key, seen);
    } catch {
      /* 網路不穩時下次再試 */
    } finally {
      busy = false;
    }
  }

  void tick();
  const timer = window.setInterval(tick, INTERVAL_MS);
  return () => window.clearInterval(timer);
}

/** 自己剛送出或剛看過的狀態先記下來，避免重複通知 */
export function markSeen(cases: CaseRecord[]): void {
  const key = `wc.seen.${identity.id}`;
  const seen = readLocal<Record<string, string>>(key, {});
  for (const c of cases) seen[c.id] = c.status;
  writeLocal(key, seen);
}
