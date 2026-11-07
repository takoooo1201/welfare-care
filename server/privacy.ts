// 依角色決定服務人員能看到的個案內容（最小必要原則）。
//
// - 只能看到自己服務行政區的個案。
// - 鄰里關懷通報：本人還沒同意，先由社工或區公所評估、訪視；志工看不到，除非被指派。
//   通報人的帳號一律不給服務人員看；通報人同意被聯絡時，社工才看得到姓名與電話。
// - 區公所、社工：可看完整資料（承辦需要）。
// - 志工：
//   · 未接案：只看到需要哪種協助與「大略位置」（約 300 公尺格點），
//     不顯示姓名全名、電話、地址、申請項目與敏感身分標籤。
//   · 已接案：可看到聯絡資訊與文件清單，但仍不顯示敏感身分標籤。
import { fuzz } from '../shared/geo.ts';
import type { CaseRecord, CaseStatus, HelpType, Staff } from '../shared/types.ts';

export function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}○`;
  return chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1];
}

export function canSee(c: CaseRecord, staff: Staff): boolean {
  if (c.district !== staff.district) return false;
  if (c.channel === 'neighbor' && staff.role === 'volunteer') return c.assigneeId === staff.id;
  return true;
}

/** 志工能協助的工作類型（順路收件、陪同） */
export const VOLUNTEER_HELP: HelpType[] = ['collect_docs', 'accompany'];

export function viewForStaff(full: CaseRecord, staff: Staff): CaseRecord {
  const { reporterId: _hidden, ...c } = full;
  if (staff.role !== 'volunteer') return c;
  if (c.assigneeId === staff.id) return { ...c, tags: [], reporter: null };
  return {
    ...c,
    reporter: null,
    signs: [],
    citizenName: maskName(c.citizenName),
    phone: null,
    address: null,
    note: '',
    tags: [],
    resourceIds: [],
    documents: [],
    location: c.location ? { ...fuzz(c.location, c.id), source: c.location.source, approximate: true } : null,
    timeline: c.timeline.map(({ at, status, outcome }) => ({ at, status, ...(outcome ? { outcome } : {}), by: '服務人員' })),
  };
}

export function canClaim(c: CaseRecord, staff: Staff): boolean {
  if (!canSee(c, staff) || c.status === 'closed') return false;
  if (staff.role === 'volunteer') {
    return c.assigneeId === null && c.helpTypes.some((h) => VOLUNTEER_HELP.includes(h));
  }
  return true;
}

export function allowedStatuses(staff: Staff): CaseStatus[] {
  return staff.role === 'volunteer' ? ['assigned', 'preparing'] : ['received', 'assigned', 'preparing', 'submitted', 'closed'];
}
