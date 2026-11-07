// 目前使用者的身分（來自城市通 userinfo）。
// 示範模式可以切換成「家屬」身分，方便在同一支手機上展示家屬協助流程。
import { reactive } from 'vue';
import { inTownPass, type TownPassUser, userinfo } from './bridge';
import { readLocal, writeLocal } from './prefs';

export const FAMILY_DEMO = { id: 'demo-family-kim', name: '金小森' };

export const identity = reactive({
  ready: false,
  inApp: false,
  user: null as TownPassUser | null,
  demoAsFamily: readLocal<boolean>('wc.demoAsFamily', false),
  get id(): string {
    return this.demoAsFamily ? FAMILY_DEMO.id : (this.user?.id ?? '');
  },
  get name(): string {
    return this.demoAsFamily ? FAMILY_DEMO.name : (this.user?.realName || this.user?.username || '民眾');
  },
});

let loading: Promise<void> | null = null;

export function ensureIdentity(): Promise<void> {
  loading ??= (async () => {
    identity.inApp = inTownPass();
    identity.user = await userinfo();
    identity.ready = true;
  })();
  return loading;
}

export function setDemoAsFamily(on: boolean): void {
  identity.demoAsFamily = on;
  writeLocal('wc.demoAsFamily', on);
}
