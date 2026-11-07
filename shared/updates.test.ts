import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CaseRecord, TimelineEvent } from './types.ts';
import { caseUpdate, resourceTitle, seenOf } from './updates.ts';

const AT = '2026-11-07T10:00:00.000Z';

function mkCase(timeline: TimelineEvent[], extra: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 'WC20261107-TEST',
    citizenId: 'u1',
    citizenName: '金大森',
    phone: null,
    district: '中山區',
    village: null,
    address: null,
    location: null,
    resourceIds: ['ltc-2'],
    helpTypes: ['fill_form'],
    note: '',
    channel: 'app',
    status: timeline[timeline.length - 1].status,
    assigneeId: null,
    assigneeName: null,
    createdAt: AT,
    updatedAt: AT,
    timeline,
    documents: [],
    tags: [],
    consent: { shareLocation: false, shareWithFamily: true },
    ...extra,
  };
}

const received: TimelineEvent = { at: AT, status: 'received', by: '金大森', note: '民眾於城市通送出需求' };
const assigned: TimelineEvent = { at: AT, status: 'assigned', by: '陳怡君', note: '指派給 林志明' };

test('沒有新進度時不通知', () => {
  const c = mkCase([received]);
  assert.equal(caseUpdate(c, seenOf(c), null), null);
});

test('狀態改變：標題是新狀態，內容帶出處理紀錄與人員', () => {
  const before = mkCase([received]);
  const after = mkCase([received, assigned]);
  const u = caseUpdate(after, seenOf(before), null);
  assert.equal(u?.kind, 'status');
  assert.equal(u?.title, '進度更新：已安排人員協助');
  assert.equal(u?.body, '「長期照顧服務（長照 2.0）」：指派給 林志明（陳怡君）');
});

test('處理紀錄已寫出人名時，不再重複標示人員', () => {
  const before = mkCase([received]);
  const after = mkCase([received, { at: AT, status: 'assigned', by: '林志明', note: '林志明 接下這件協助' }]);
  assert.equal(caseUpdate(after, seenOf(before), null)?.body, '「長期照顧服務（長照 2.0）」：林志明 接下這件協助');
});

test('家屬看長輩的申請時，內容會寫出長輩的名字', () => {
  const before = mkCase([received]);
  const after = mkCase([received, assigned]);
  assert.match(caseUpdate(after, seenOf(before), '金大森')!.body, /^金大森的「長期照顧服務/);
});

test('狀態沒變但有新的處理紀錄：通知負責人員留言', () => {
  const before = mkCase([received, assigned]);
  const after = mkCase([received, assigned, { at: AT, status: 'assigned', by: '林志明', note: '週二下午到府協助填表' }]);
  const u = caseUpdate(after, seenOf(before), null);
  assert.equal(u?.kind, 'note');
  assert.match(u!.body, /週二下午到府協助填表（林志明）/);
});

test('結案並核定通過：通知申請結果', () => {
  const before = mkCase([received, assigned]);
  const after = mkCase([received, assigned, { at: AT, status: 'closed', outcome: 'approved', by: '林志明' }], { outcome: 'approved' });
  const u = caseUpdate(after, seenOf(before), null);
  assert.equal(u?.kind, 'result');
  assert.equal(u?.outcome, 'approved');
  assert.match(u!.title, /核定通過/);
});

test('第一次看到的申請（例如家屬代為送出）會通知本人', () => {
  const c = mkCase([{ at: AT, status: 'received', by: '金小森（家屬）', note: '家屬 金小森 代為送出需求' }], { channel: 'family' });
  const u = caseUpdate(c, undefined, null);
  assert.equal(u?.kind, 'new');
  assert.equal(u?.body, '金小森（家屬） 幫你送出了「長期照顧服務（長照 2.0）」的協助需求');
});

test('系統自動產生的處理紀錄不會重複出現在通知內容', () => {
  const before = mkCase([received]);
  const after = mkCase([received, { at: AT, status: 'preparing', by: '林志明', note: '更新為「文件準備中」' }]);
  assert.equal(caseUpdate(after, seenOf(before), null)?.body, '「長期照顧服務（長照 2.0）」已更新為「文件準備中」（林志明）');
});

test('申請項目超過兩項時只列前兩項', () => {
  assert.equal(resourceTitle(['ltc-2', 'tp-meal-service', 'tp-elder-nhi']), '長期照顧服務（長照 2.0）、失能者營養餐飲服務（送餐到家） 等 3 項');
});
