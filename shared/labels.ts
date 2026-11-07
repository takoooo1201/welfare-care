import type { CaseRecord, CaseStatus, Category, Channel, HelpType, Outcome, Role } from './types.ts';

export const TAIPEI_DISTRICTS = [
  '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區',
  '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
] as const;

/** 民眾端看到的四個進度，加上結案 */
export const STATUS_FLOW: CaseStatus[] = ['received', 'assigned', 'preparing', 'submitted'];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  received: '需求已收到',
  assigned: '已安排人員協助',
  preparing: '文件準備中',
  submitted: '已送件、待審核',
  closed: '已結案',
};

export const STATUS_HINT: Record<CaseStatus, string> = {
  received: '服務單位已收到你的需求，會盡快安排人員。',
  assigned: '已有專人負責，會用電話或到府和你聯絡。',
  preparing: '正在一起準備申請文件，可以看下方的文件清單。',
  submitted: '已經送到主管機關，審核結果會另行通知。',
  closed: '這件協助已經完成。',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  approved: '核定通過',
  rejected: '未通過審核',
  completed: '協助完成',
  withdrawn: '已取消申請',
};

export const OUTCOME_HINT: Record<Outcome, string> = {
  approved: '恭喜！主管機關已核定通過，之後會依核定內容提供補助或服務。',
  rejected: '這次沒有通過審核。可以請負責人員說明原因，或撥打 1957 福利諮詢專線，看看還有哪些資源可以申請。',
  completed: '這件協助已經完成。',
  withdrawn: '已依你的意思取消這次申請，需要時可以再提出。',
};

/** 個案目前的狀態文字：結案時顯示結案結果 */
export function caseStatusLabel(c: Pick<CaseRecord, 'status' | 'outcome'>): string {
  return c.status === 'closed' && c.outcome ? OUTCOME_LABEL[c.outcome] : STATUS_LABEL[c.status];
}

/** 進度說明。家屬看長輩的申請時，把「你」換成長輩的名字 */
export function caseStatusHint(c: Pick<CaseRecord, 'status' | 'outcome'>, who?: string): string {
  const hint = c.status === 'closed' && c.outcome ? OUTCOME_HINT[c.outcome] : STATUS_HINT[c.status];
  return who ? hint.replaceAll('你', who) : hint;
}

export const HELP_TYPE_LABEL: Record<HelpType, string> = {
  fill_form: '幫我填申請表',
  collect_docs: '到府收取文件',
  accompany: '陪我去申辦',
  home_visit: '到家裡說明',
  phone_explain: '打電話跟我說明',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  status: '福利身分',
  allowance: '津貼補助',
  emergency: '急難救助',
  care: '照顧服務',
  companion: '陪伴關懷',
  health: '健康醫療',
  service: '諮詢服務',
};

export const ROLE_LABEL: Record<Role, string> = {
  district_office: '區公所',
  social_worker: '社工',
  volunteer: '志工',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  app: '本人申請',
  family: '家屬代送',
  intake: '據點代為建檔',
  neighbor: '鄰里關懷通報',
};
