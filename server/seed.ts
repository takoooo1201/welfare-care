// 示範資料：服務人員帳號、今日訪視路線與幾筆待協助個案。
// 姓名、電話、地址皆為虛構，只用於展示，不對應任何真實民眾。
import type { CaseRecord, CaseStatus, Channel, HelpType, RouteStop, Staff } from '../shared/types.ts';
import { db, saveCase, saveRoute } from './db.ts';

export const DEMO_PIN = '1234';

const STAFF: Staff[] = [
  { id: 'zs-office', name: '陳怡君', role: 'district_office', org: '中山區公所社會課', district: '中山區' },
  { id: 'zs-sw', name: '林志明', role: 'social_worker', org: '中山社會福利服務中心', district: '中山區' },
  { id: 'zs-vol', name: '張美玲', role: 'volunteer', org: '中山區志願服務隊', district: '中山區' },
  { id: 'dt-sw', name: '王建華', role: 'social_worker', org: '大同社會福利服務中心', district: '大同區' },
];

const ROUTES: Record<string, RouteStop[]> = {
  'zs-sw': [
    { name: '中山區行政中心（出發）', time: '08:30', lat: 25.06437, lng: 121.5336 },
    { name: '訪視：松江路長者', time: '09:30', lat: 25.056, lng: 121.533 },
    { name: '訪視：吉林路個案', time: '10:30', lat: 25.05411, lng: 121.53024 },
    { name: '訪視：農安街家庭', time: '13:30', lat: 25.064, lng: 121.5265 },
  ],
  'zs-vol': [
    { name: '家', time: '09:00', lat: 25.0505, lng: 121.5265 },
    { name: '志工隊集合', time: '09:30', lat: 25.0605, lng: 121.5365 },
    { name: '關懷據點共餐', time: '11:30', lat: 25.0685, lng: 121.5335 },
  ],
};

interface Demo {
  name: string;
  phone: string;
  village: string;
  address: string;
  lat: number;
  lng: number;
  resourceIds: string[];
  helpTypes: HelpType[];
  tags: string[];
  note: string;
  channel: Channel;
  status: CaseStatus;
  assignee?: string;
  daysAgo: number;
  district?: string;
}

const CASES: Demo[] = [
  {
    name: '李秀華', phone: '0912-000-101', village: '中吉里', address: '臺北市中山區松江路（示範地址）', lat: 25.0571, lng: 121.5348,
    resourceIds: ['tp-mid-low-elder-allowance', 'tp-alone-elder-emergency'], helpTypes: ['collect_docs', 'fill_form'],
    tags: ['65 歲以上', '獨居', '中低收入戶'], note: '行動不便，上午比較方便', channel: 'app', status: 'received', daysAgo: 1,
  },
  {
    name: '黃金水', phone: '0912-000-102', village: '中吉里', address: '臺北市中山區吉林路（示範地址）', lat: 25.0533, lng: 121.5288,
    resourceIds: ['ltc-2'], helpTypes: ['accompany', 'phone_explain'],
    tags: ['65 歲以上', '失能'], note: '女兒白天上班，請先打電話', channel: 'family', status: 'received', daysAgo: 0,
  },
  {
    name: '吳美雲', phone: '02-2500-0103', village: '中原里', address: '臺北市中山區新生北路（示範地址）', lat: 25.059, lng: 121.529,
    resourceIds: ['tp-elder-nhi', 'tp-care-points'], helpTypes: ['collect_docs'],
    tags: ['65 歲以上'], note: '沒有智慧型手機，由里辦公處協助建檔', channel: 'intake', status: 'received', daysAgo: 2,
  },
  {
    name: '陳阿土', phone: '0912-000-104', village: '大直里', address: '臺北市中山區北安路（示範地址）', lat: 25.079, lng: 121.54,
    resourceIds: ['tp-meal-service'], helpTypes: ['home_visit'],
    tags: ['65 歲以上', '獨居'], note: '', channel: 'app', status: 'received', daysAgo: 3,
  },
  {
    name: '劉玉英', phone: '0912-000-105', village: '聚葉里', address: '臺北市中山區民族西路（示範地址）', lat: 25.07, lng: 121.5205,
    resourceIds: ['tp-disability-living'], helpTypes: ['fill_form', 'collect_docs'],
    tags: ['身心障礙'], note: '', channel: 'app', status: 'preparing', assignee: 'zs-sw', daysAgo: 6,
  },
  {
    name: '蔡明德', phone: '0912-000-106', village: '行仁里', address: '臺北市中山區建國北路（示範地址）', lat: 25.062, lng: 121.545,
    resourceIds: ['tp-low-income'], helpTypes: ['collect_docs'],
    tags: ['急難'], note: '最近失業', channel: 'app', status: 'assigned', assignee: 'zs-vol', daysAgo: 4,
  },
  {
    name: '鄭麗珠', phone: '0912-000-107', village: '集英里', address: '臺北市中山區長安東路（示範地址）', lat: 25.0485, lng: 121.532,
    resourceIds: ['tp-mid-low-income'], helpTypes: ['fill_form'],
    tags: ['經濟弱勢'], note: '', channel: 'family', status: 'submitted', assignee: 'zs-sw', daysAgo: 10,
  },
  {
    name: '許文雄', phone: '0912-000-108', village: '延平里', address: '臺北市大同區延平北路（示範地址）', lat: 25.063, lng: 121.513,
    resourceIds: ['tp-mid-low-elder-allowance'], helpTypes: ['collect_docs'],
    tags: ['65 歲以上'], note: '', channel: 'app', status: 'received', daysAgo: 1, district: '大同區',
  },
];

const FLOW: CaseStatus[] = ['received', 'assigned', 'preparing', 'submitted'];

export function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM staff').get() as { n: number }).n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO staff (id, name, role, org, district, pin) VALUES (?, ?, ?, ?, ?, ?)');
  for (const s of STAFF) insert.run(s.id, s.name, s.role, s.org, s.district, DEMO_PIN);
  for (const [staffId, stops] of Object.entries(ROUTES)) saveRoute(staffId, stops);

  CASES.forEach((d, i) => {
    const created = new Date(Date.now() - d.daysAgo * 86_400_000 - (i + 1) * 3_600_000);
    const assignee = STAFF.find((s) => s.id === d.assignee);
    const steps = FLOW.slice(0, FLOW.indexOf(d.status) + 1);
    const by = d.channel === 'intake' ? '中山區公所 陳怡君' : d.channel === 'family' ? '家屬' : d.name;
    const timeline = steps.map((status, k) => ({
      at: new Date(created.getTime() + k * 7_200_000).toISOString(),
      status,
      by: k === 0 ? by : (assignee?.name ?? '服務人員'),
      note: k === 0 ? (d.channel === 'intake' ? '據點代為建檔（同意方式：書面同意）' : '於城市通送出需求') : undefined,
    }));
    const c: CaseRecord = {
      id: `WCDEMO-${String(i + 1).padStart(2, '0')}`,
      citizenId: `demo-citizen-${i + 1}`,
      citizenName: d.name,
      phone: d.phone,
      district: d.district ?? '中山區',
      village: d.village,
      address: d.address,
      location: { lat: d.lat, lng: d.lng, source: d.channel === 'intake' ? 'address' : 'gps' },
      resourceIds: d.resourceIds,
      helpTypes: d.helpTypes,
      note: d.note,
      channel: d.channel,
      status: d.status,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee ? `${assignee.name}（${assignee.org}）` : null,
      createdAt: created.toISOString(),
      updatedAt: timeline[timeline.length - 1].at,
      timeline,
      documents: [{ name: '申請書', ready: d.status === 'submitted' }, { name: '新式戶口名簿影本', ready: d.status !== 'received' }],
      tags: d.tags,
      consent: { shareLocation: true, shareWithFamily: true, method: d.channel === 'intake' ? '書面同意' : undefined },
    };
    saveCase(c);
  });
  console.log(`已建立示範資料：${STAFF.length} 位服務人員、${CASES.length} 筆個案（PIN：${DEMO_PIN}）`);
}
