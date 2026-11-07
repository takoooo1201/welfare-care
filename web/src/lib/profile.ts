// 使用者填寫的資格資料只存在這支手機（localStorage），資格比對也在手機上完成，不上傳伺服器。
// 只有在使用者「請人協助申請」並勾選同意時，才會把摘要標籤（例如「65 歲以上」）一併送出。
import { ageOn, EMPTY_PROFILE } from '@shared/match.ts';
import { TAIPEI_DISTRICTS } from '@shared/labels.ts';
import type { Profile } from '@shared/types.ts';
import type { TownPassUser } from './bridge';
import { identity } from './identity';
import { readLocal, writeLocal } from './prefs';

const key = () => `wc.profile.${identity.id}`;

export function prefillFromUser(u: TownPassUser | null): Profile {
  if (!u) return { ...EMPTY_PROFILE };
  const addr = u.addresses?.find((a) => a.priority) ?? u.addresses?.[0];
  let district = addr?.town ?? null;
  if (!district) district = u.residentAddress?.match(/(\S{2}區)/)?.[1] ?? null;
  if (district && !(TAIPEI_DISTRICTS as readonly string[]).includes(district)) district = null;
  const b = u.birthday?.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return {
    ...EMPTY_PROFILE,
    birthday: b ? `${b[1]}-${b[2].padStart(2, '0')}-${b[3].padStart(2, '0')}` : null,
    district,
    village: addr?.village ?? null,
    taipeiResident: u.citizen === true ? 'yes' : u.citizen === false ? 'no' : 'unknown',
    indigenous: u.nativePeople === true ? 'yes' : u.nativePeople === false ? 'no' : 'unknown',
  };
}

export function hasSavedProfile(): boolean {
  return readLocal<Profile | null>(key(), null) !== null;
}

export function loadProfile(): Profile {
  const saved = readLocal<Profile | null>(key(), null);
  if (saved) return { ...EMPTY_PROFILE, ...saved };
  return identity.demoAsFamily ? { ...EMPTY_PROFILE } : prefillFromUser(identity.user);
}

export function saveProfile(p: Profile): void {
  writeLocal(key(), p);
}

export function clearProfile(): void {
  writeLocal(key(), null);
}

/** 給服務人員看的摘要標籤（使用者同意後才會送出） */
export function tagsFor(p: Profile): string[] {
  const tags: string[] = [];
  const age = ageOn(p.birthday);
  if (age !== null && age >= 65) tags.push('65 歲以上');
  if (p.livesAlone === 'yes') tags.push('獨居');
  if (p.needsCare === 'yes') tags.push('失能');
  if (p.dementia === 'yes') tags.push('失智');
  if (p.household === 'low') tags.push('低收入戶');
  if (p.household === 'midLow') tags.push('中低收入戶');
  if (p.disability === 'yes') tags.push('身心障礙');
  if (p.indigenous === 'yes') tags.push('原住民');
  if (p.newResident === 'yes') tags.push('新住民');
  if (p.hardship === 'yes') tags.push('急難');
  return tags;
}
