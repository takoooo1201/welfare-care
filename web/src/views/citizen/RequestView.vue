<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { HELP_TYPE_LABEL, TAIPEI_DISTRICTS } from '@shared/labels.ts';
import type { CaseRecord, GeoPoint, HelpType } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import ChoiceGroup from '@/components/ChoiceGroup.vue';
import MultiChoiceGroup from '@/components/MultiChoiceGroup.vue';
import { api, type FamilyLink } from '@/lib/api';
import { location, notify } from '@/lib/bridge';
import { identity } from '@/lib/identity';
import { loadProfile, tagsFor } from '@/lib/profile';
import { useToast } from '@/lib/toast';
import { markSeen } from '@/lib/watcher';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const profile = loadProfile();

const forElder = typeof route.query.for === 'string' ? route.query.for : null;
const elder = ref<FamilyLink | null>(null);
const resourceIds = ref(String(route.query.ids ?? '').split(',').filter((id) => RESOURCE_BY_ID.has(id)));
const resources = computed(() => resourceIds.value.map((id) => RESOURCE_BY_ID.get(id)!));

const helpOptions = (Object.keys(HELP_TYPE_LABEL) as HelpType[]).map((value) => ({ value, label: HELP_TYPE_LABEL[value] }));
// 從「確認好了」頁按「請人到家幫我申請」進來：預設到府說明與代填，並直接定位
const quick = route.query.quick === '1' && !forElder;
const helpTypes = ref<HelpType[]>(quick ? ['home_visit', 'fill_form'] : [...new Set(resources.value.flatMap((r) => r.helpTypes))].slice(0, 2));
const phone = ref(forElder ? '' : (identity.user?.phoneNo ?? ''));
const district = ref<string | null>(forElder ? null : profile.district);
const village = ref(forElder ? '' : (profile.village ?? ''));
const address = ref('');
const note = ref('');
// 家屬代送時，家屬的手機通常不在長輩家，預設只提供行政區
const locMode = ref<'gps' | 'district'>(forElder ? 'district' : 'gps');
const gps = ref<GeoPoint | null>(null);
const locating = ref(false);
const agree = ref(false);
const shareTags = ref(true);
const shareWithFamily = ref(true);
const submitting = ref(false);
const created = ref<CaseRecord | null>(null);
const tags = forElder ? [] : tagsFor(profile);

const LOC_OPTIONS = [
  { value: 'gps' as const, label: forElder ? '用我現在的位置（我在家人家）' : '用手機定位' },
  { value: 'district' as const, label: '只提供行政區' },
];

onMounted(async () => {
  if (quick) void locate();
  if (!forElder) return;
  try {
    elder.value = (await api.familyLinks()).asFamily.find((l) => l.citizenId === forElder) ?? null;
    // 帶入長輩上一次申請時留下的聯絡資料，家屬不用重新查
    const last = (await api.elder(forElder)).cases[0];
    if (last) {
      phone.value ||= last.phone ?? '';
      district.value ??= last.district;
      village.value ||= last.village ?? '';
      address.value ||= last.address ?? '';
      prefilled.value = true;
    }
  } catch {
    /* 帶不出來就讓家屬自己填 */
  }
});

const prefilled = ref(false);

/** 還缺哪些資料才能送出 */
const missing = computed(() => {
  const m: string[] = [];
  if (!resourceIds.value.length) m.push('申請項目');
  if (!helpTypes.value.length) m.push('需要的協助');
  if (!district.value) m.push('行政區');
  if (locMode.value === 'gps' && !gps.value) m.push('取得位置（或改選只提供行政區）');
  if (!agree.value) m.push('勾選同意');
  return m;
});

async function locate() {
  locating.value = true;
  gps.value = await location();
  locating.value = false;
  if (!gps.value) toast('無法取得定位，可以改選「只提供行政區」');
}

const canSubmit = computed(() => missing.value.length === 0);

async function submit() {
  if (!canSubmit.value || !district.value) return;
  submitting.value = true;
  try {
    let loc: (GeoPoint & { source: 'gps' | 'address' }) | null = null;
    if (locMode.value === 'gps' && gps.value) loc = { ...gps.value, source: 'gps' };
    else {
      const centers = await api.districtCenters().catch(() => ({}) as Record<string, GeoPoint>);
      const c = centers[district.value];
      if (c) loc = { ...c, source: 'address' };
    }
    const c = await api.createCase({
      phone: phone.value || null,
      district: district.value,
      village: village.value || null,
      address: address.value || null,
      location: loc,
      resourceIds: resourceIds.value,
      helpTypes: helpTypes.value,
      note: note.value,
      tags: shareTags.value ? tags : [],
      shareLocation: !!loc,
      shareWithFamily: shareWithFamily.value,
      onBehalfOf: forElder ?? undefined,
    });
    markSeen([c]);
    created.value = c;
    notify('福利找上門', `已收到${forElder ? `${elder.value?.citizenName ?? '家人'}的` : '你的'}協助需求，服務人員會盡快和你聯絡。`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AppBar :title="forElder ? '幫家人申請協助' : '請人協助申請'" back />

  <main v-if="created" class="page">
    <section class="card hero center">
      <div class="done-mark" aria-hidden="true">✓</div>
      <h1>需求已收到</h1>
      <p>服務單位會盡快安排人員，並用電話和{{ forElder ? '家人' : '你' }}聯絡。</p>
      <p class="small muted">申請編號：{{ created.id }}</p>
    </section>
    <p class="notice">進度更新時，城市通會通知你；也可以隨時到「申請進度」查看。</p>
    <button type="button" class="btn btn-primary btn-block" @click="router.push(forElder ? `/family/elder/${forElder}` : '/my')">看申請進度</button>
    <button type="button" class="btn btn-ghost btn-block" @click="router.push('/')">回首頁</button>
  </main>

  <main v-else class="page">
    <p v-if="forElder" class="notice">
      你正在幫 <strong>{{ elder?.citizenName ?? '家人' }}</strong> 送出協助需求。
      <template v-if="prefilled">已帶入{{ elder?.citizenName ?? '家人' }}上次申請時留下的聯絡資料，請確認是否正確。</template>
    </p>

    <section class="card">
      <h2>要申請的項目</h2>
      <div v-for="r in resources" :key="r.id" class="spread">
        <span>{{ r.name }}</span>
        <button type="button" class="btn btn-ghost btn-sm nowrap" @click="resourceIds = resourceIds.filter((x) => x !== r.id)">移除</button>
      </div>
      <p v-if="!resources.length" class="muted">還沒有選擇項目，請回推薦頁勾選。</p>
    </section>

    <section class="card">
      <div class="field">
        <span class="label">需要哪些協助？（可以多選）</span>
        <MultiChoiceGroup v-model="helpTypes" :options="helpOptions" label="需要的協助" />
      </div>
    </section>

    <section class="card stack">
      <div class="field">
        <label for="rq-phone">{{ forElder ? '家人的聯絡電話' : '聯絡電話' }}</label>
        <input id="rq-phone" v-model.trim="phone" class="input" inputmode="tel" autocomplete="tel" />
      </div>
      <div class="row grid2">
        <div class="field">
          <label for="rq-district">住在哪一區</label>
          <select id="rq-district" v-model="district" class="input">
            <option :value="null">請選擇</option>
            <option v-for="d in TAIPEI_DISTRICTS" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <div class="field">
          <label for="rq-village">里</label>
          <input id="rq-village" v-model.trim="village" class="input" />
        </div>
      </div>
      <div class="field">
        <label for="rq-address">詳細地址（可不填）</label>
        <input id="rq-address" v-model.trim="address" class="input" placeholder="服務人員會再跟你確認" />
      </div>
      <div class="field">
        <span class="label">讓服務人員知道大概位置</span>
        <p class="hint">有位置的話，社工訪視經過附近時，可以順路來幫你。</p>
        <ChoiceGroup v-model="locMode" :options="LOC_OPTIONS" label="位置" />
        <div v-if="locMode === 'gps'" class="row">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="locating" @click="locate">
            {{ locating ? '定位中…' : gps ? '重新定位' : '取得目前位置' }}
          </button>
          <span v-if="gps" class="chip ok">✓ 已取得位置</span>
        </div>
      </div>
      <div class="field">
        <label for="rq-note">方便聯絡的時間或其他需求</label>
        <textarea id="rq-note" v-model="note" class="input" rows="3" maxlength="300" placeholder="例如：上午比較方便、請先打給我女兒"></textarea>
      </div>
    </section>

    <section class="card stack">
      <h2>同意事項</h2>
      <label class="check">
        <input v-model="agree" type="checkbox" />
        <span v-if="forElder">
          我已經和{{ elder?.citizenName ?? '家人' }}確認過，{{ elder?.citizenName ?? '家人' }}同意把申請項目、聯絡方式和位置，提供給區公所、社工與合作志工，用來安排協助。<strong>（必選）</strong>
        </span>
        <span v-else>我同意把申請項目、聯絡方式和位置，提供給區公所、社工與合作志工，用來安排協助。<strong>（必選）</strong></span>
      </label>
      <label v-if="tags.length" class="check">
        <input v-model="shareTags" type="checkbox" />
        <span>
          讓服務人員看到我的資格摘要，可以更快幫我：
          <span class="row" style="margin-top: 6px"><span v-for="t in tags" :key="t" class="chip">{{ t }}</span></span>
        </span>
      </label>
      <label class="check">
        <input v-model="shareWithFamily" type="checkbox" />
        <span>讓已綁定的家屬看到這件申請的進度</span>
      </label>
      <p class="small muted">志工在接案前只會看到大略位置，看不到你的姓名、電話和身分資料。</p>
    </section>
  </main>

  <div v-if="!created" class="sticky-bar">
    <div class="stack" style="gap: 6px">
      <p v-if="missing.length" class="small muted center" aria-live="polite">還需要：{{ missing.join('、') }}</p>
      <button type="button" class="btn btn-primary btn-block" :disabled="!canSubmit || submitting" @click="submit">
        {{ submitting ? '送出中…' : '送出協助需求' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding-bottom: 170px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}
.done-mark {
  width: 64px;
  height: 64px;
  margin: 0 auto;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  font-size: 2rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
