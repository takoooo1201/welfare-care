// 定期檢查申請進度。有新進度（狀態改變、負責人員留言、審核結果）、長輩轉交項目、
// 家人完成綁定、自己送出的鄰里關懷通報有人接手時，透過城市通 notify 推播，並存進通知收件匣（lib/inbox.ts）。
//
// 上次看到的狀態存在 wc.watch.<id>，所以關掉服務後再打開，也會補通知這段期間的進度。
// 正式版應改由後端透過 App 推播通道（例如 FCM）通知，見 README「已知限制」。
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { type ReportStage, reportUpdate } from '@shared/report.ts';
import type { CaseRecord } from '@shared/types.ts';
import { caseUpdate, type SeenCase, seenOf } from '@shared/updates.ts';
import { api, type ElderData, type FamilyLink } from './api';
import { notify } from './bridge';
import { identity } from './identity';
import { addToInbox, type InboxItem } from './inbox';
import { readLocal, writeLocal } from './prefs';

const INTERVAL_MS = 8000;

interface WatchState {
  /** false 代表還沒完整檢查過一次：第一次只記錄、不通知 */
  ready: boolean;
  cases: Record<string, SeenCase>;
  /** 已通知過的轉交項目：`${長輩 id}:${資源 id}` */
  delegated: string[];
  /** 已通知過的家屬綁定（link id） */
  links: string[];
  /** 自己送出的鄰里關懷通報，上次看到的進度 */
  reports?: Record<string, ReportStage>;
}

export type Notice = Omit<InboxItem, 'read'>;

const stateKey = (id: string) => `wc.watch.${id}`;
const emptyState = (): WatchState => ({ ready: false, cases: {}, delegated: [], links: [] });

let runTick: (() => Promise<void>) | null = null;

export function startCaseWatcher(shouldRun: () => boolean, onNotices: (notices: Notice[]) => void): () => void {
  let busy = false;

  async function tick() {
    if (busy || !identity.ready || !identity.id || document.hidden || !shouldRun()) return;
    busy = true;
    const id = identity.id;
    try {
      const mine = await api.myCases();
      const { asElder, asFamily } = await api.familyLinks();
      const reports = await api.myReports().catch(() => []);
      const elders: { link: FamilyLink; data: ElderData | null }[] = await Promise.all(
        asFamily.map(async (link) => ({ link, data: await api.elder(link.citizenId).catch(() => null) })),
      );
      if (identity.id !== id) return; // 示範模式切換了身分

      // 以下同步執行，不會和 markSeen() 交錯
      const state = readLocal<WatchState>(stateKey(id), emptyState());
      const silent = !state.ready;
      const now = new Date().toISOString();
      const notices: Notice[] = [];

      const check = (c: CaseRecord, who: string | null, link: string) => {
        const u = caseUpdate(c, state.cases[c.id], who);
        if (u && !silent) {
          notices.push({ id: `${c.id}:${c.timeline.length}`, at: c.updatedAt, kind: u.kind, title: u.title, body: u.body, link, caseId: c.id, outcome: u.outcome });
        }
        state.cases[c.id] = seenOf(c);
      };

      for (const c of mine) check(c, null, '/my');

      for (const { link, data } of elders) {
        if (!data) continue;
        const elderPage = `/family/elder/${link.citizenId}`;
        for (const c of data.cases) check(c, link.citizenName, elderPage);
        for (const r of data.recommendations?.items ?? []) {
          const k = `${link.citizenId}:${r.resourceId}`;
          if (!r.delegated || state.delegated.includes(k)) continue;
          state.delegated.push(k);
          if (silent) continue;
          const name = RESOURCE_BY_ID.get(r.resourceId)?.name ?? r.resourceId;
          notices.push({
            id: `delegate:${k}`,
            at: now,
            kind: 'delegate',
            title: `${link.citizenName} 請你幫忙申請`,
            body: `${link.citizenName}把「${name}」轉交給你，請幫忙準備資料、送出協助需求。`,
            link: elderPage,
          });
        }
      }

      for (const l of asElder) {
        if (state.links.includes(l.id)) continue;
        state.links.push(l.id);
        if (silent) continue;
        notices.push({
          id: `family:${l.id}`,
          at: now,
          kind: 'family',
          title: '家人完成綁定',
          body: `${l.familyName} 已經可以協助你：幫你看推薦、準備文件、追蹤申請進度。`,
          link: '/family',
        });
      }

      state.reports ??= {};
      for (const r of reports) {
        const u = reportUpdate(r, state.reports[r.id]);
        state.reports[r.id] = r.stage;
        if (u && !silent) notices.push({ id: `report:${r.id}:${r.stage}`, at: r.updatedAt, kind: 'report', title: u.title, body: u.body, link: '/report' });
      }

      state.ready = true;
      writeLocal(stateKey(id), state);

      if (notices.length) {
        addToInbox(notices);
        for (const n of notices) notify(`福利找上門｜${n.title}`, n.body);
        onNotices(notices);
      }
    } catch {
      /* 網路不穩時下次再試 */
    } finally {
      busy = false;
    }
  }

  // 從背景回到前景時馬上檢查，補上離開期間的進度
  const onVisible = () => {
    if (!document.hidden) void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  runTick = tick;
  void tick();
  const timer = window.setInterval(tick, INTERVAL_MS);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    runTick = null;
  };
}

/** 馬上檢查一次（例如剛完成綁定） */
export function checkNow(): void {
  void runTick?.();
}

/** 剛送出的關懷通報先記下來，之後只通知「有人接手」 */
export function markReportSeen(r: { id: string; stage: ReportStage }): void {
  if (!identity.id) return;
  const state = readLocal<WatchState>(stateKey(identity.id), emptyState());
  state.reports = { ...state.reports, [r.id]: r.stage };
  writeLocal(stateKey(identity.id), state);
}

/** 自己剛送出或剛看過的狀態先記下來，避免通知自己做的事 */
export function markSeen(cases: CaseRecord[]): void {
  if (!identity.id) return;
  const state = readLocal<WatchState>(stateKey(identity.id), emptyState());
  for (const c of cases) state.cases[c.id] = seenOf(c);
  writeLocal(stateKey(identity.id), state);
}
