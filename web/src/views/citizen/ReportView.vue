<script setup lang="ts">
// 鄰里關懷通報：鄰居、里長或店員看到可能需要幫忙的長輩，不需要知道對方姓名，
// 勾選看到的狀況、在地圖上標出大略位置，社工就能把他排進順路關懷。
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { TAIPEI_DISTRICTS } from '@shared/labels.ts';
import { AGE_GUESS, type AgeGuess, isUrgent, type MyReport, REPORT_STAGE_LABEL, type Sign, SIGNS, suggestForReport } from '@shared/report.ts';
import type { GeoPoint } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import ChoiceGroup from '@/components/ChoiceGroup.vue';
import LeafletMap from '@/components/LeafletMap.vue';
import MultiChoiceGroup from '@/components/MultiChoiceGroup.vue';
import { api } from '@/lib/api';
import { location } from '@/lib/bridge';
import { identity } from '@/lib/identity';
import type { MapMarker } from '@/lib/mapTypes';
import { loadProfile } from '@/lib/profile';
import { useToast } from '@/lib/toast';
import { markReportSeen } from '@/lib/watcher';

const router = useRouter();
const toast = useToast();

const signs = ref<Sign[]>([]);
const age = ref<AgeGuess>('elder');
const district = ref<string | null>(loadProfile().district);
const pin = ref<GeoPoint | null>(null);
const place = ref('');
const nickname = ref('');
const note = ref('');
const contactOk = ref(false);
const locating = ref(false);
const submitting = ref(false);
const done = ref<MyReport | null>(null);
const mine = ref<MyReport[]>([]);
const fitKey = ref(0);
let centers: Record<string, GeoPoint> = {};

const SIGN_OPTIONS = SIGNS.map((s) => ({ value: s.value, label: s.label }));
const suggested = computed(() => (signs.value.length ? suggestForReport(signs.value, age.value).map((id) => RESOURCE_BY_ID.get(id)!.name) : []));
const urgent = computed(() => isUrgent(signs.value));

onMounted(async () => {
  centers = await api.districtCenters().catch(() => ({}));
  if (district.value && centers[district.value]) {
    pin.value = centers[district.value];
    fitKey.value++;
  }
  mine.value = await api.myReports().catch(() => []);
});

// 換行政區時，大頭針先移到該區中心，再請通報人點地圖調整
watch(district, (d) => {
  if (d && centers[d]) {
    pin.value = centers[d];
    fitKey.value++;
  }
});

async function useMyLocation() {
  locating.value = true;
  const p = await location();
  locating.value = false;
  if (!p) {
    toast('無法取得定位，請直接點地圖標出位置');
    return;
  }
  pin.value = p;
  fitKey.value++;
}

const markers = computed<MapMarker[]>(() =>
  pin.value ? [{ id: 'pin', lat: pin.value.lat, lng: pin.value.lng, color: '#b4469a', label: '♥', title: '他大概住在這裡' }] : [],
);

const missing = computed(() => {
  const m: string[] = [];
  if (!signs.value.length) m.push('看到的狀況');
  if (!district.value) m.push('行政區');
  if (!pin.value) m.push('地圖上的位置');
  return m;
});

async function submit() {
  if (missing.value.length || !district.value || !pin.value) return;
  submitting.value = true;
  try {
    const r = await api.createReport({
      district: district.value,
      place: place.value,
      location: pin.value,
      signs: signs.value,
      age: age.value,
      nickname: nickname.value,
      note: note.value,
      contactOk: contactOk.value,
      reporterPhone: contactOk.value ? identity.user?.phoneNo : undefined,
    });
    markReportSeen(r);
    done.value = r;
    mine.value = [r, ...mine.value];
    window.scrollTo({ top: 0 });
  } catch (e) {
    toast((e as Error).message);
  } finally {
    submitting.value = false;
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
const submitLabel = computed(() => (submitting.value ? '送出中…' : missing.value.length ? `還需要：${missing.value.join('、')}` : '送出關懷通報'));
</script>

<template>
  <AppBar title="我擔心一位長輩" back="/" />

  <main v-if="done" class="page">
    <section class="card hero center">
      <div class="heart" aria-hidden="true">💛</div>
      <h1>謝謝你多看一眼</h1>
      <p>社工會把他排進附近的訪視路線，順路去關心。</p>
    </section>
    <p class="notice">有人接手、去關心過之後，城市通會通知你。為了保護他的隱私，詳細情形不會告訴你。</p>
    <p class="notice warn">如果他可能有立即危險（例如倒在家裡、叫不醒），請直接撥打 119。</p>
    <button type="button" class="btn btn-primary btn-block" @click="router.push('/')">回首頁</button>
    <button type="button" class="btn btn-ghost btn-block" @click="done = null">再通報一位</button>
  </main>

  <main v-else class="page">
    <p class="notice">
      最需要幫忙的長輩，往往不會自己申請。你不需要知道他的名字，告訴我們你看到什麼，社工會找時間順路去關心他。<strong>他不會知道是誰通報的。</strong>
    </p>

    <section class="card">
      <h2>你看到什麼狀況？</h2>
      <p class="small muted">可以選很多個</p>
      <MultiChoiceGroup v-model="signs" :options="SIGN_OPTIONS" label="看到的狀況" />
      <p v-if="urgent" class="notice warn small">好幾天沒看到人，社工會優先處理。如果可能有立即危險，請先撥打 119。</p>
    </section>

    <section class="card">
      <h2>他看起來大約幾歲？</h2>
      <ChoiceGroup v-model="age" :options="AGE_GUESS" label="大約年齡" />
    </section>

    <section class="card">
      <h2>他大概住在哪裡？</h2>
      <div class="field">
        <label for="rp-district">行政區</label>
        <select id="rp-district" v-model="district" class="input">
          <option :value="null">請選擇</option>
          <option v-for="d in TAIPEI_DISTRICTS" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <div class="spread">
        <span class="small muted">點地圖，把 ♥ 移到他家附近</span>
        <button type="button" class="btn btn-sm btn-secondary nowrap" :disabled="locating" @click="useMyLocation">
          {{ locating ? '定位中…' : '我就在附近' }}
        </button>
      </div>
      <LeafletMap :markers="markers" :fit-key="fitKey" height="240px" @map-click="pin = $event" />
      <div class="field">
        <label for="rp-place">怎麼找到他？（可不填）</label>
        <input id="rp-place" v-model="place" class="input" maxlength="60" placeholder="例：吉林路 100 巷口的公寓 2 樓" />
      </div>
    </section>

    <section class="card">
      <div class="field">
        <label for="rp-nick">你怎麼稱呼他？（可不填）</label>
        <input id="rp-nick" v-model="nickname" class="input" maxlength="10" placeholder="例：王伯伯、賣菜的阿姨" />
      </div>
      <div class="field">
        <label for="rp-note">還有什麼想讓社工知道的？（可不填）</label>
        <textarea id="rp-note" v-model="note" class="input" rows="3" maxlength="200" placeholder="例：平常每天早上都會在巷口坐，這三天都沒看到"></textarea>
      </div>
      <label class="check">
        <input v-model="contactOk" type="checkbox" />
        <span>社工需要時，可以打電話問我（會提供我的姓名與電話給社工）</span>
      </label>
    </section>

    <section v-if="suggested.length" class="card suggest">
      <h3>社工去關心時，可以幫他看看</h3>
      <ul>
        <li v-for="n in suggested" :key="n">{{ n }}</li>
      </ul>
      <p class="small muted">依你勾選的狀況在手機上比對，實際需要由社工訪視後評估。</p>
    </section>

    <section v-if="mine.length" class="card">
      <h3>你通報過的長輩</h3>
      <div v-for="r in mine" :key="r.id" class="spread mine">
        <span>{{ r.nickname || r.place || `${r.district}的長輩` }}<span class="small muted">・{{ fmt(r.createdAt) }}</span></span>
        <span class="chip" :class="r.stage === 'received' ? 'warn' : 'ok'">{{ REPORT_STAGE_LABEL[r.stage] }}</span>
      </div>
    </section>
  </main>

  <div v-if="!done" class="sticky-bar">
    <button type="button" class="btn btn-primary btn-block" :disabled="!!missing.length || submitting" @click="submit">{{ submitLabel }}</button>
  </div>
</template>

<style scoped>
.page {
  padding-bottom: 140px;
}
.heart {
  font-size: 3rem;
  line-height: 1;
}
.suggest {
  background: var(--tp-secondary-50);
}
.suggest ul {
  margin: 0;
  padding-left: 1.2em;
}
.mine {
  padding: 6px 0;
  border-top: 1px solid var(--gray-100);
}
</style>
