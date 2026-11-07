import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUrgent, type MyReport, parseSigns, reportStage, reportUpdate, suggestForReport } from './report.ts';

const TODAY = new Date('2026-11-07T12:00:00+08:00');

test('依看到的狀況建議福利：獨居又行動不便的長者', () => {
  const ids = suggestForReport(['alone', 'mobility'], 'elder', TODAY);
  for (const id of ['tp-alone-elder-emergency', 'ltc-2', 'tp-meal-service']) assert.ok(ids.includes(id), id);
  assert.ok(ids.length <= 5);
});

test('65 歲以下的人不會被建議老人津貼', () => {
  const ids = suggestForReport(['alone', 'poor'], 'adult', TODAY);
  assert.ok(!ids.includes('tp-mid-low-elder-allowance'));
  assert.ok(ids.includes('tp-low-income'));
});

test('好幾天沒看到人列為優先；不認得的狀況會被忽略', () => {
  assert.equal(isUrgent(['unseen']), true);
  assert.deepEqual(parseSigns(['alone', 'hack', 'alone', 3]), ['alone']);
});

test('通報人只會收到「有人接手」和「已經去關心」兩種通知', () => {
  const r: MyReport = { id: 'x', createdAt: '', updatedAt: '', district: '中山區', place: '吉林路巷口', nickname: '', stage: reportStage('assigned') };
  assert.equal(reportUpdate(r, 'received')?.title, '你的關懷通報有人接手了');
  assert.match(reportUpdate(r, 'received')!.body, /吉林路巷口的長輩/);
  assert.equal(reportUpdate({ ...r, stage: reportStage('closed') }, 'assigned')?.title, '社工已經去關心過了');
  assert.equal(reportUpdate(r, 'assigned'), null);
  assert.equal(reportUpdate(r, undefined), null);
});
