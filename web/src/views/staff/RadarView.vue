<script setup lang="ts">
// 順路雷達：把服務人員今天的訪視路線畫在地圖上，找出路線兩側一定距離內、正在等待協助的個案，
// 讓社工或志工可以「順路」收件、陪同或關懷。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { distanceToRoute, formatDistance } from '@shared/geo.ts';
import { HELP_TYPE_LABEL, STATUS_LABEL } from '@shared/labels.ts';
import type { CaseRecord, RouteStop, Staff } from '@shared/types.ts';
import LeafletMap from '@/components/LeafletMap.vue';
import { api, type CarePoint } from '@/lib/api';
import type { MapMarker } from '@/lib/mapTypes';
import { staffSession } from '@/lib/staffSession';
import { resourceNames, STATUS_COLOR } from '@/lib/staffUi';
import { useToast } from '@/lib/toast';

const router = useRouter();
const toast = useToast();
const cases = ref<CaseRecord[]>([]);
const route = ref<RouteStop[]>([]);
const team = ref<Staff[]>([]);
const carePoints = ref<CarePoint[]>([]);
const radius = ref(400);
const showCarePoints = ref(false);
const addingStop = ref(false);
const selectedId = ref<string | null>(null);
const fitKey = ref(0);
const mapRef = ref<InstanceType<typeof LeafletMap> | null>(null);
let timer = 0;

const me = computed(() => staffSession.staff);
const isOffice = computed(() => me.value?.role === 'district_office');

async function load() {
  cases.value = await api.staff.cases().catch(() => cases.value);
}

onMounted(async () => {
  const [r, t] = await Promise.all([api.staff.route().catch(() => []), api.staff.team().catch(() => [])]);
  route.value = r;
  team.value = t;
  await load();
  fitKey.value++;
  if (me.value) carePoints.value = await api.carePoints({ district: me.value.district }).catch(() => []);
  timer = window.setInterval(load, 10_000);
});
onBeforeUnmount(() => window.clearInterval(timer));

interface Hit {
  c: CaseRecord;
  meters: number;
  segment: number;
}

/** 等待協助（未結案、未送件）且有位置的個案，依離路線的距離排序 */
const candidates = computed<Hit[]>(() =>
  cases.value
    .filter((c) => c.location && (c.status === 'received' || (c.assigneeId === me.value?.id && c.status !== 'closed' && c.status !== 'submitted')))
    .map((c) => ({ c, ...distanceToRoute(c.location!, route.value) }))
    .sort((a, b) => a.meters - b.meters),
);
const onRoute = computed(() => candidates.value.filter((h) => h.meters <= radius.value));
const offRoute = computed(() => candidates.value.filter((h) => h.meters > radius.value));

const markers = computed<MapMarker[]>(() => {
  const ms: MapMarker[] = candidates.value.map(({ c, meters }) => ({
    id: c.id,
    lat: c.location!.lat,
    lng: c.location!.lng,
    color: meters <= radius.value ? STATUS_COLOR[c.status] : '#9aa7ae',
    label: meters <= radius.value ? '★' : '',
    title: `${c.citizenName}・${STATUS_LABEL[c.status]}`,
    approximate: c.location!.approximate,
  }));
  if (showCarePoints.value) {
    for (const p of carePoints.value) {
      ms.push({ id: `cp:${p.id}`, lat: p.lat, lng: p.lng, color: '#23703f', title: `關懷據點：${p.name}`, kind: 'dot' });
    }
  }
  return ms;
});

function segmentText(h: Hit): string {
  const a = route.value[h.segment];
  const b = route.value[h.segment + 1];
  if (!a) return '';
  return b ? `第 ${h.segment + 1} 站「${a.name}」→ 第 ${h.segment + 2} 站之間` : `第 ${h.segment + 1} 站「${a.name}」附近`;
}

function select(id: string) {
  if (id.startsWith('cp:')) return;
  selectedId.value = id;
  document.getElementById(`hit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function focus(h: Hit) {
  selectedId.value = h.c.id;
  mapRef.value?.flyTo(h.c.location!, 17);
}

async function claim(c: CaseRecord, assigneeId?: string) {
  try {
    const updated = await api.staff.assign(c.id, assigneeId);
    cases.value = cases.value.map((x) => (x.id === updated.id ? updated : x));
    toast(assigneeId && assigneeId !== me.value?.id ? `已指派給 ${team.value.find((s) => s.id === assigneeId)?.name}` : '已接案，民眾會收到「已安排人員協助」的通知');
  } catch (e) {
    toast((e as Error).message);
  }
}

/** 把個案位置插入路線中最接近的那一段之後 */
async function addToRoute(h: Hit) {
  const stop: RouteStop = { name: `順路：${h.c.citizenName}`, lat: h.c.location!.lat, lng: h.c.location!.lng };
  const next = [...route.value];
  next.splice(Math.max(h.segment + 1, 1), 0, stop);
  route.value = await api.staff.saveRoute(next);
  toast('已加入今日路線');
}

async function removeStop(i: number) {
  const next = route.value.filter((_, k) => k !== i);
  route.value = await api.staff.saveRoute(next);
}

async function mapClick(p: { lat: number; lng: number }) {
  if (!addingStop.value) return;
  addingStop.value = false;
  const name = window.prompt('停靠點名稱', `停靠點 ${route.value.length + 1}`);
  if (!name) return;
  route.value = await api.staff.saveRoute([...route.value, { name, lat: p.lat, lng: p.lng }]);
}

const assignableTeam = computed(() => team.value.filter((s) => s.id !== me.value?.id));
const RADII = [200, 400, 800];
</script>

<template>
  <main class="radar">
    <section class="map-col">
      <div class="card controls">
        <div class="row">
          <strong>雷達範圍</strong>
          <div class="choices" role="group" aria-label="雷達範圍">
            <button v-for="r in RADII" :key="r" type="button" class="choice" :aria-pressed="radius === r" @click="radius = r">{{ r }} 公尺</button>
          </div>
        </div>
        <div class="row">
          <label class="row small"><input v-model="showCarePoints" type="checkbox" /> 顯示社區關懷據點（開放資料）</label>
          <button type="button" class="btn btn-sm" :class="addingStop ? 'btn-accent' : 'btn-secondary'" @click="addingStop = !addingStop">
            {{ addingStop ? '請點地圖選位置…' : '新增停靠點' }}
          </button>
        </div>
      </div>
      <LeafletMap
        ref="mapRef"
        :markers="markers"
        :route="route"
        :route-buffer="radius"
        :fit-key="fitKey"
        :selected-id="selectedId"
        height="calc(100vh - 230px)"
        @select="select"
        @map-click="mapClick"
      />
      <p class="small muted legend">
        <span class="dot" style="background: #1d6f80"></span>今日路線
        <span class="dot" style="background: #d9822b"></span>待安排
        <span class="dot" style="background: #9aa7ae"></span>不在範圍內
        <span v-if="me?.role === 'volunteer'">虛線圈為大略位置</span>
      </p>
    </section>

    <aside class="side">
      <section class="card">
        <h2>順路可協助（{{ onRoute.length }}）</h2>
        <p class="small muted">離你今天路線 {{ radius }} 公尺內、正在等待協助的民眾</p>
      </section>

      <article v-for="h in onRoute" :id="`hit-${h.c.id}`" :key="h.c.id" class="card hit" :class="{ sel: selectedId === h.c.id }" @click="focus(h)">
        <div class="spread">
          <strong>{{ h.c.citizenName }}</strong>
          <span class="chip ok">離路線 {{ formatDistance(h.meters) }}</span>
        </div>
        <span class="small muted">{{ segmentText(h) }}</span>
        <span class="small">{{ resourceNames(h.c) }}</span>
        <span class="row">
          <span v-for="t in h.c.helpTypes" :key="t" class="chip accent">{{ HELP_TYPE_LABEL[t] }}</span>
        </span>
        <div class="row" @click.stop>
          <button v-if="h.c.status === 'received'" type="button" class="btn btn-sm btn-primary" @click="claim(h.c)">我順路接案</button>
          <span v-else class="chip primary">我負責・{{ STATUS_LABEL[h.c.status] }}</span>
          <button type="button" class="btn btn-sm btn-secondary" @click="addToRoute(h)">加入路線</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="router.push(`/staff/case/${h.c.id}`)">詳情</button>
        </div>
        <div v-if="isOffice && h.c.status === 'received'" class="row" @click.stop>
          <select class="input assign" aria-label="指派給" @change="claim(h.c, ($event.target as HTMLSelectElement).value)">
            <option value="">指派給同仁…</option>
            <option v-for="s in assignableTeam" :key="s.id" :value="s.id">{{ s.name }}（{{ s.org }}）</option>
          </select>
        </div>
      </article>
      <p v-if="!onRoute.length" class="empty small">範圍內目前沒有等待協助的民眾，可以把雷達範圍放大看看。</p>

      <section class="card">
        <h3>今日路線</h3>
        <ol class="stops">
          <li v-for="(s, i) in route" :key="i" class="spread">
            <span><span class="small muted">{{ s.time ?? '' }}</span> {{ s.name }}</span>
            <button type="button" class="btn btn-ghost btn-sm" :aria-label="`移除 ${s.name}`" @click="removeStop(i)">移除</button>
          </li>
        </ol>
        <p v-if="!route.length" class="small muted">還沒有路線，按「新增停靠點」在地圖上標出今天要去的地方。</p>
      </section>

      <details v-if="offRoute.length" class="card">
        <summary>其他等待協助的民眾（{{ offRoute.length }}）</summary>
        <div v-for="h in offRoute" :key="h.c.id" class="spread other">
          <span>{{ h.c.citizenName }}<span class="small muted">・離路線 {{ formatDistance(h.meters) }}</span></span>
          <button type="button" class="btn btn-ghost btn-sm" @click="router.push(`/staff/case/${h.c.id}`)">詳情</button>
        </div>
      </details>
    </aside>
  </main>
</template>

<style scoped>
.radar {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 16px;
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
}
.map-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.controls {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}
.controls .choice {
  min-height: 40px;
  padding: 4px 12px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  padding-bottom: 24px;
}
.hit {
  cursor: pointer;
  gap: 6px;
}
.hit.sel {
  outline: 3px solid var(--tp-secondary);
}
.stops {
  margin: 0;
  padding-left: 1.4em;
}
.other {
  padding: 6px 0;
  border-top: 1px solid var(--gray-100);
}
.assign {
  min-height: 40px;
  padding: 4px 10px;
}
.legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
}
@media (max-width: 900px) {
  .radar {
    grid-template-columns: 1fr;
  }
  .side {
    max-height: none;
  }
}
</style>
