// 前後端共用的型別定義。

/** 三態回答：是／否／不確定 */
export type Tri = 'yes' | 'no' | 'unknown';

/** 低收入戶、中低收入戶身分 */
export type HouseholdStatus = 'low' | 'midLow' | 'none' | 'unknown';

/**
 * 家庭每人每月收入級距（以臺北市 115 年度標準切分）
 * - le_low：20,744 元以下（最低生活費）
 * - le_midlow：29,635 元以下（中低收入戶標準）
 * - le_1_5x：39,960 元以下（中低收入老人生活津貼、身障生活補助標準）
 * - above：超過 39,960 元
 */
export type IncomeBand = 'le_low' | 'le_midlow' | 'le_1_5x' | 'above' | 'unknown';

export const INCOME_ORDER: Exclude<IncomeBand, 'unknown'>[] = ['le_low', 'le_midlow', 'le_1_5x', 'above'];

/** 使用者填寫的基本資料。只存在使用者自己的手機，比對也在手機上完成。 */
export interface Profile {
  birthday: string | null; // YYYY-MM-DD
  district: string | null; // 例：中山區
  village: string | null; // 例：中吉里
  taipeiResident: Tri; // 設籍並實際居住臺北市
  household: HouseholdStatus;
  income: IncomeBand;
  disability: Tri; // 領有身心障礙證明
  indigenous: Tri; // 原住民身分
  newResident: Tri; // 新住民（外籍、大陸、港澳配偶）
  livesAlone: Tri; // 獨自居住
  needsCare: Tri; // 洗澡、穿衣、吃飯、外出等日常生活需要他人協助
  dementia: Tri; // 經醫師診斷失智症
  hardship: Tri; // 最近 3 個月家中遭遇變故（家人過世、重病、失業等）
}

export type TriField =
  | 'taipeiResident'
  | 'disability'
  | 'indigenous'
  | 'newResident'
  | 'livesAlone'
  | 'needsCare'
  | 'dementia'
  | 'hardship';

/** 資格條件。由官方說明整理成可以自動比對的結構；無法自動判斷的放在 manual。 */
export type Criterion =
  | { kind: 'age'; min?: number; max?: number; label: string }
  | { kind: 'tri'; field: TriField; equals: 'yes' | 'no'; label: string }
  | { kind: 'household'; in: HouseholdStatus[]; label: string }
  | { kind: 'income'; atMost: Exclude<IncomeBand, 'unknown'>; label: string }
  | { kind: 'all'; of: Criterion[]; label: string }
  | { kind: 'any'; of: Criterion[]; label: string }
  | { kind: 'manual'; label: string };

export type CriterionResult = 'met' | 'unmet' | 'unknown' | 'manual';

export interface EvaluatedCriterion {
  label: string;
  result: CriterionResult;
}

export type Category = 'status' | 'allowance' | 'emergency' | 'care' | 'companion' | 'health' | 'service';

export type HelpType = 'fill_form' | 'collect_docs' | 'accompany' | 'home_visit' | 'phone_explain';

export interface Resource {
  id: string;
  name: string;
  category: Category;
  provider: string;
  summary: string; // 白話說明
  benefit: string; // 補助或服務內容
  tags: string[];
  criteria: Criterion[];
  documents: string[];
  apply: { where: string; phone?: string; url?: string; note?: string };
  helpTypes: HelpType[]; // 常見的協助方式
  notes?: string[];
  source: { title: string; url: string; checked: string };
}

/** likely：已知條件都符合；possible：沒有不符合，但有條件還不確定；unlikely：有條件不符合 */
export type Verdict = 'likely' | 'possible' | 'unlikely';

export interface MatchResult {
  resource: Resource;
  verdict: Verdict;
  criteria: EvaluatedCriterion[];
  unknownCount: number;
}

// ── 協助個案 ──────────────────────────────────────────

export type CaseStatus = 'received' | 'assigned' | 'preparing' | 'submitted' | 'closed';

/** 個案來源：本人在 App 送出、家屬代為送出、據點或社工代為建檔 */
export type Channel = 'app' | 'family' | 'intake';

export type Role = 'district_office' | 'social_worker' | 'volunteer';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface CaseLocation extends GeoPoint {
  source: 'gps' | 'address';
  /** true 代表座標已模糊化（志工未接案前只看得到大略位置） */
  approximate?: boolean;
}

export interface TimelineEvent {
  at: string; // ISO 時間
  status: CaseStatus;
  note?: string;
  by: string; // 顯示名稱
}

export interface DocItem {
  name: string;
  ready: boolean;
  by?: string; // 誰標記為已備妥
}

export interface CaseRecord {
  id: string;
  citizenId: string;
  citizenName: string; // 依權限可能遮蔽
  phone: string | null; // 依權限可能為 null
  district: string;
  village: string | null;
  address: string | null; // 依權限可能為 null
  location: CaseLocation | null;
  resourceIds: string[];
  helpTypes: HelpType[];
  note: string;
  channel: Channel;
  status: CaseStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEvent[];
  documents: DocItem[];
  /** 依權限可能遮蔽：是否為低收入戶、身障等敏感身分 */
  tags: string[];
  consent: { shareLocation: boolean; shareWithFamily: boolean; method?: string };
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  org: string;
  district: string;
}

export interface RouteStop extends GeoPoint {
  name: string;
  time?: string;
}
