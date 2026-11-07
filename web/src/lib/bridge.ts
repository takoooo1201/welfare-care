// 與城市通 App 的雙向溝通（flutterObject）。
// 格式：postMessage(JSON.stringify({ name, data }))；App 以 JSON 字串 { name, data } 回覆。
// 在一般瀏覽器中沒有 flutterObject，改用瀏覽器 API 或示範資料，方便開發與展示。
import type { GeoPoint } from '@shared/types.ts';

interface FlutterObject {
  postMessage(message: string): void;
  addEventListener(type: 'message', cb: (event: { data: string }) => void): void;
  removeEventListener(type: 'message', cb: (event: { data: string }) => void): void;
}

function flutter(): FlutterObject | null {
  const g = globalThis as unknown as { flutterObject?: FlutterObject };
  return typeof g.flutterObject !== 'undefined' && g.flutterObject ? g.flutterObject : null;
}

export const inTownPass = (): boolean => flutter() !== null;

/** 送出請求並等待同名的回覆；逾時回傳 null */
function call<T>(name: string, data: unknown = null, timeoutMs = 10_000): Promise<T | null> {
  const f = flutter();
  if (!f) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onMessage = (event: { data: string }) => {
      let msg: { name?: string; data?: unknown };
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : (event.data as typeof msg);
      } catch {
        return;
      }
      if (msg?.name !== name) return;
      cleanup();
      resolve((msg.data ?? null) as T | null);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      f.removeEventListener('message', onMessage);
    };
    f.addEventListener('message', onMessage);
    f.postMessage(JSON.stringify({ name, data }));
  });
}

function send(name: string, data: unknown): void {
  flutter()?.postMessage(JSON.stringify({ name, data }));
}

// ── userinfo ──
export interface TownPassUser {
  id: string;
  realName?: string;
  username?: string;
  birthday?: string; // 1988/12/12
  phoneNo?: string;
  addresses?: { city?: string; town?: string; village?: string; street?: string; priority?: boolean }[];
  residentAddress?: string;
  citizen?: boolean;
  nativePeople?: boolean;
}

/** 在瀏覽器開發時使用的示範帳號（與城市通 mock 資料相同結構） */
const BROWSER_DEMO_USER: TownPassUser = {
  id: 'browser-demo-user',
  realName: '示範使用者',
  birthday: '1950/03/15',
  phoneNo: '0912345678',
  addresses: [{ city: '臺北市', town: '中山區', village: '中吉里', street: '吉林路', priority: true }],
  residentAddress: '臺北市中山區吉林路',
  citizen: true,
  nativePeople: false,
};

export async function userinfo(): Promise<TownPassUser> {
  if (!inTownPass()) return BROWSER_DEMO_USER;
  const u = await call<TownPassUser | []>('userinfo');
  return u && !Array.isArray(u) && u.id ? u : { ...BROWSER_DEMO_USER, id: 'townpass-guest', realName: '城市通使用者' };
}

// ── location ──
export async function location(): Promise<GeoPoint | null> {
  if (inTownPass()) {
    const p = await call<{ latitude?: number; longitude?: number } | []>('location', null, 15_000);
    if (p && !Array.isArray(p) && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
      return { lat: p.latitude, lng: p.longitude };
    }
    return null;
  }
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

// ── notify ──
export function notify(title: string, content: string): void {
  if (inTownPass()) {
    send('notify', { title, content });
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: content });
}

// ── phone_call ──
export function phoneCall(phone: string): void {
  const digits = phone.replace(/[^\d#*+]/g, '');
  if (inTownPass()) send('phone_call', digits);
  else window.location.href = `tel:${digits}`;
}

// ── open_link ──
export function openLink(url: string): void {
  if (inTownPass()) send('open_link', url);
  else window.open(url, '_blank', 'noopener');
}
