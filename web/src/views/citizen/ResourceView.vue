<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RESOURCES, RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { formatDistance } from '@shared/geo.ts';
import { CATEGORY_LABEL } from '@shared/labels.ts';
import { matchAll, matchResource } from '@shared/match.ts';
import type { GeoPoint } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import CriteriaList from '@/components/CriteriaList.vue';
import VerdictBadge from '@/components/VerdictBadge.vue';
import { api, type CarePoint, type FamilyLink } from '@/lib/api';
import { location, openLink, phoneCall } from '@/lib/bridge';
import { loadProfile } from '@/lib/profile';
import { useToast } from '@/lib/toast';

const props = defineProps<{ id: string }>();
const router = useRouter();
const toast = useToast();
const profile = loadProfile();
const resource = RESOURCE_BY_ID.get(props.id);
const result = resource ? matchResource(resource, profile) : null;

const family = ref<FamilyLink[]>([]);
const points = ref<CarePoint[]>([]);
const you = ref<GeoPoint | null>(null);
const locating = ref(false);
const isCarePoints = computed(() => resource?.id === 'tp-care-points');

onMounted(async () => {
  family.value = (await api.familyLinks().catch(() => ({ asElder: [] }))).asElder;
  if (isCarePoints.value && profile.district) points.value = (await api.carePoints({ district: profile.district, limit: 5 }).catch(() => [])) ?? [];
});

async function findNearby() {
  locating.value = true;
  you.value = await location();
  locating.value = false;
  if (!you.value) {
    toast('無法取得定位，先列出你所在行政區的據點');
    return;
  }
  points.value = await api.carePoints({ lat: you.value.lat, lng: you.value.lng, limit: 5 });
}

async function delegate() {
  if (!resource) return;
  if (!family.value.length) {
    router.push({ path: '/family', query: { delegate: resource.id } });
    return;
  }
  const items = matchAll(RESOURCES, profile)
    .filter((r) => r.verdict !== 'unlikely' || r.resource.id === resource.id)
    .map((r) => ({ resourceId: r.resource.id, verdict: r.verdict, delegated: r.resource.id === resource.id }));
  try {
    await api.shareRecommendations(items);
    toast(`已請 ${family.value.map((f) => f.familyName).join('、')} 協助申請「${resource.name}」`);
  } catch (e) {
    toast((e as Error).message);
  }
}

const osm = (p: CarePoint) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`;
</script>

<template>
  <template v-if="resource && result">
    <AppBar :title="resource.name" back />
    <main class="page">
      <section class="card">
        <div class="spread">
          <span class="chip primary">{{ CATEGORY_LABEL[resource.category] }}</span>
          <VerdictBadge :verdict="result.verdict" :unknown-count="result.unknownCount" />
        </div>
        <h1>{{ resource.name }}</h1>
        <p>{{ resource.summary }}</p>
        <div class="notice">
          <strong>可以得到什麼</strong>
          <p>{{ resource.benefit }}</p>
        </div>
        <p class="small muted">主管機關：{{ resource.provider }}</p>
      </section>

      <section class="card">
        <h2>資格條件</h2>
        <CriteriaList :criteria="result.criteria" />
        <ul v-if="resource.notes?.length" class="notes small">
          <li v-for="n in resource.notes" :key="n">{{ n }}</li>
        </ul>
      </section>

      <section v-if="isCarePoints" class="card">
        <div class="spread">
          <h2>離你最近的據點</h2>
          <button type="button" class="btn btn-sm btn-secondary" :disabled="locating" @click="findNearby">
            {{ locating ? '定位中…' : '用我的位置找' }}
          </button>
        </div>
        <div v-for="p in points" :key="p.id" class="stack point">
          <div class="spread">
            <strong>{{ p.name }}</strong>
            <span v-if="p.distance !== undefined" class="chip">{{ formatDistance(p.distance) }}</span>
          </div>
          <span class="small muted">{{ p.address }}</span>
          <div class="row">
            <button v-if="p.phone" type="button" class="btn btn-sm btn-secondary" @click="phoneCall(p.phone.split('#')[0])">打電話</button>
            <button type="button" class="btn btn-sm btn-ghost" @click="openLink(osm(p))">看地圖</button>
          </div>
        </div>
        <p v-if="!points.length" class="small muted">先填寫居住的行政區，或用定位找附近的據點。</p>
        <p class="small muted">資料來源：臺北市資料大平臺「社區照顧關懷據點」</p>
      </section>

      <section v-if="resource.documents.length" class="card">
        <h2>要準備的文件</h2>
        <ul class="docs">
          <li v-for="d in resource.documents" :key="d">{{ d }}</li>
        </ul>
        <p class="small muted">實際應備文件以承辦單位告知為準。</p>
      </section>

      <section class="card">
        <h2>怎麼申請</h2>
        <p>{{ resource.apply.where }}</p>
        <div class="row">
          <button v-if="resource.apply.phone" type="button" class="btn btn-secondary" @click="phoneCall(resource.apply.phone)">
            打電話問 {{ resource.apply.phone }}
          </button>
          <button v-if="resource.apply.url" type="button" class="btn btn-ghost" @click="openLink(resource.apply.url)">看官方說明</button>
        </div>
      </section>

      <p class="small muted">
        資料來源：<a :href="resource.source.url" target="_blank" rel="noopener" @click.prevent="openLink(resource.source.url)">{{ resource.source.title }}</a>
        （{{ resource.source.checked }} 查核）。本頁為初步比對，實際資格以主管機關審核為準。
      </p>
    </main>
    <div class="sticky-bar">
      <div class="row two-btn">
        <button type="button" class="btn btn-secondary" @click="delegate">轉交家屬協助</button>
        <button type="button" class="btn btn-primary" @click="router.push(`/request?ids=${resource.id}`)">請人協助申請</button>
      </div>
    </div>
  </template>
  <main v-else class="page empty">找不到這個項目</main>
</template>

<style scoped>
.notes,
.docs {
  margin: 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.point {
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--gray-100);
}
.two-btn {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
}
</style>
