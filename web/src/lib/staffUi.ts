import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import type { CaseRecord, CaseStatus } from '@shared/types.ts';

export const STATUS_COLOR: Record<CaseStatus, string> = {
  received: '#d9822b',
  assigned: '#1d6f80',
  preparing: '#2f6fed',
  submitted: '#6b7c85',
  closed: '#9aa7ae',
};

export const STATUS_CHIP: Record<CaseStatus, string> = {
  received: 'warn',
  assigned: 'primary',
  preparing: 'primary',
  submitted: '',
  closed: '',
};

export function resourceNames(c: CaseRecord): string {
  if (!c.resourceIds.length) return '（接案後顯示申請項目）';
  return c.resourceIds.map((id) => RESOURCE_BY_ID.get(id)?.name ?? id).join('、');
}

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}
