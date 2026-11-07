<script setup lang="ts">
// 據點代為建檔：給沒有智慧型手機、網路不穩或不會操作 App 的民眾。
// 工作人員取得同意後代為登錄，資格比對和 App 用的是同一套規則。
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RESOURCES } from '@shared/data/resources.ts';
import { HELP_TYPE_LABEL } from '@shared/labels.ts';
import { EMPTY_PROFILE, matchAll } from '@shared/match.ts';
import type { GeoPoint, HelpType, Profile } from '@shared/types.ts';
import ChoiceGroup from '@/components/ChoiceGroup.vue';
import MultiChoiceGroup from '@/components/MultiChoiceGroup.vue';
import ProfileForm from '@/components/ProfileForm.vue';
import VerdictBadge from '@/components/VerdictBadge.vue';
import { api } from '@/lib/api';
import { location } from '@/lib/bridge';
import { tagsFor } from '@/lib/profile';
import { staffSession } from '@/lib/staffSession';
import { useToast } from '@/lib/toast';

const router = useRouter();
const toast = useToast();

const name = ref('');
const phone = ref('');
const village = ref('');
const address = ref('');
const profile = ref<Profile>({ ...EMPTY_PROFILE, district: staffSession.staff?.district ?? null, taipeiResident: 'yes' });
const results = computed(() => matchAll(RESOURCES, profile.value).filter((r) => r.verdict !== 'unlikely'));
const picked = ref<string[]>([]);
const helpTypes = ref<HelpType[]>(['fill_form']);
const here = ref<GeoPoint | null>(null);
const consentMethod = ref<string | null>(null);
const explained = ref(false);
const busy = ref(false);

const helpOptions = (Object.keys(HELP_TYPE_LABEL) as HelpType[]).map((value) => ({ value, label: HELP_TYPE_LABEL[value] }));
const CONSENT = [
  { value: '書面同意', label: '書面同意' },
  { value: '口頭同意（有見證人）', label: '口頭同意（有見證人）' },
  { value: '法定代理人同意', label: '法定代理人同意' },
];

// 很可能符合的項目預設勾選
watch(
  results,
  (rs) => {
    picked.value = rs.filter((r) => r.verdict === 'likely').map((r) => r.resource.id);
  },
  { immediate: true },
);

function togglePick(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id];
}

async function useHere() {
  here.value = await location();
  toast(here.value ? '已使用這台裝置目前的位置' : '無法取得定位，將使用行政區概略位置');
}

const canSubmit = computed(() => !!name.value && !!profile.value.district && picked.value.length > 0 && helpTypes.value.length > 0 && !!consentMethod.value && explained.value);

async function submit() {
  if (!canSubmit.value || !profile.value.district) return;
  busy.value = true;
  try {
    let loc: (GeoPoint & { source: 'gps' | 'address' }) | null = here.value ? { ...here.value, source: 'gps' } : null;
    if (!loc) {
      const centers = await api.districtCenters().catch(() => ({}) as Record<string, GeoPoint>);
      const c = centers[profile.value.district];
      if (c) loc = { ...c, source: 'address' };
    }
    const created = await api.staff.intake({
      citizenName: name.value,
      phone: phone.value || null,
      district: profile.value.district,
      village: village.value || profile.value.village || null,
      address: address.value || null,
      location: loc,
      resourceIds: picked.value,
      helpTypes: helpTypes.value,
      note: '',
      tags: tagsFor(profile.value),
      shareLocation: !!loc,
      shareWithFamily: false,
      consentMethod: consentMethod.value!,
    });
    toast('已建檔，後續請以電話或訪視聯繫民眾');
    router.replace(`/staff/case/${created.id}`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="intake">
    <section class="card">
      <h1>據點代為建檔</h1>
      <p class="muted">給沒有智慧型手機、網路不穩或不會操作 App 的民眾。請先說明資料用途並取得同意，媒合結果與待辦事項會由服務單位以電話或訪視聯繫。</p>
    </section>

    <div class="cols">
      <section class="card stack">
        <h2>1. 民眾資料</h2>
        <div class="field">
          <label for="in-name">姓名</label>
          <input id="in-name" v-model.trim="name" class="input" />
        </div>
        <div class="field">
          <label for="in-phone">聯絡電話（家用電話也可以）</label>
          <input id="in-phone" v-model.trim="phone" class="input" inputmode="tel" />
        </div>
        <div class="field">
          <label for="in-address">地址</label>
          <input id="in-address" v-model.trim="address" class="input" />
        </div>
        <div class="field">
          <label for="in-village">里</label>
          <input id="in-village" v-model.trim="village" class="input" />
        </div>
        <h2>2. 資格問題</h2>
        <ProfileForm v-model="profile" compact />
      </section>

      <section class="stack">
        <div class="card stack">
          <h2>3. 比對結果（{{ results.length }} 項）</h2>
          <label v-for="r in results" :key="r.resource.id" class="check">
            <input type="checkbox" :checked="picked.includes(r.resource.id)" @change="togglePick(r.resource.id)" />
            <span>
              <strong>{{ r.resource.name }}</strong>　<VerdictBadge :verdict="r.verdict" :unknown-count="r.unknownCount" /><br />
              <span class="small muted">{{ r.resource.summary }}</span>
            </span>
          </label>
          <p v-if="!results.length" class="muted">依目前資料沒有比對到項目，可以補充資格問題。</p>
        </div>

        <div class="card stack">
          <h2>4. 需要的協助</h2>
          <MultiChoiceGroup v-model="helpTypes" :options="helpOptions" label="需要的協助" />
          <div class="row">
            <button type="button" class="btn btn-secondary btn-sm" @click="useHere">使用這台裝置的位置（訪視時）</button>
            <span v-if="here" class="chip ok">✓ 已定位</span>
            <span v-else class="small muted">未定位時使用{{ profile.district ?? '行政區' }}的概略位置</span>
          </div>
        </div>

        <div class="card stack">
          <h2>5. 同意紀錄</h2>
          <ChoiceGroup v-model="consentMethod" :options="CONSENT" label="同意方式" />
          <label class="check">
            <input v-model="explained" type="checkbox" />
            <span>已向民眾說明：資料只用於媒合福利與安排協助，會提供給區公所、社工與合作單位；民眾可以隨時要求停止。</span>
          </label>
          <button type="button" class="btn btn-primary btn-block" :disabled="!canSubmit || busy" @click="submit">建立個案</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.intake {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 800px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
