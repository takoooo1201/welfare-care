import { reactive } from 'vue';
import type { CaseStatus, Staff } from '@shared/types.ts';
import { readLocal, writeLocal } from './prefs';

export const staffSession = reactive({
  token: readLocal<string | null>('wc.staffToken', null),
  staff: readLocal<Staff | null>('wc.staff', null),
  allowedStatuses: [] as CaseStatus[],
});

export function setStaffSession(token: string, staff: Staff): void {
  staffSession.token = token;
  staffSession.staff = staff;
  writeLocal('wc.staffToken', token);
  writeLocal('wc.staff', staff);
}

export function clearStaffSession(): void {
  staffSession.token = null;
  staffSession.staff = null;
  staffSession.allowedStatuses = [];
  writeLocal('wc.staffToken', null);
  writeLocal('wc.staff', null);
}
