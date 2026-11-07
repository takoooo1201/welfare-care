<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import type { CaseRecord } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import CaseProgress from '@/components/CaseProgress.vue';
import VerdictBadge from '@/components/VerdictBadge.vue';
import { api, type ElderData } from '@/lib/api';
import { useToast } from '@/lib/toast';

const props = defineProps<{ id: string }>();
const router = useRouter();
const toast = useToast();
const data = ref<ElderData | null>(null);
const error = ref('');
let timer = 0;

const recs = computed(() => data.value?.recommendations?.items ?? []);
const delegated = computed(() => recs.value.filter((r) => r.delegated && RESOURCE_BY_ID.has(r.resourceId)));
const others = computed(() => recs.value.filter((r) => !r.delegated && RESOURCE_BY_ID.has(r.resourceId)));
const activeIds = computed(() => new Set(data.value?.cases.filter((c) => c.status !== 'closed').flatMap((c) => c.resourceIds) ?? []));

async function load() {
  try {
    data.value = await api.elder(props.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function toggleDoc(c: CaseRecord, index: number, ready: boolean) {
  try {
    await api.setDocument(c.id, index, ready);
    await load();
  } catch (e) {
    toast((e as Error).message);
  }
}

onMounted(() => {
  void load();
  timer = window.setInterval(load, 8000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <AppBar :title="data ? `協助 ${data.elder.name}` : '協助家人'" back="/family" />
  <main class="page">
    <p v-if="error" class="notice bad">{{ error }}</p>
    <div v-else-if="!data" class="loading">載入中…</div>
    <template v-else>
      <section v-if="delegated.length" class="card hero">
        <h2>{{ data.elder.name }} 請你幫忙申請</h2>
        <div v-for="r in delegated" :key="r.resourceId" class="stack item">
          <div class="spread">
            <strong>{{ RESOURCE_BY_ID.get(r.resourceId)!.name }}</strong>
            <span v-if="activeIds.has(r.resourceId)" class="chip ok">已送出協助需求</span>
          </div>
          <p class="small">{{ RESOURCE_BY_ID.get(r.resourceId)!.summary }}</p>
          <div class="row">
            <button type="button" class="btn btn-sm btn-secondary" @click="router.push(`/resource/${r.resourceId}`)">看資格與文件</button>
            <button
              v-if="!activeIds.has(r.resourceId)"
              type="button"
              class="btn btn-sm btn-primary"
              @click="router.push(`/request?ids=${r.resourceId}&for=${data!.elder.id}`)"
            >
              幫他送出協助需求
            </button>
          </div>
        </div>
      </section>

      <h2 class="section-title">申請進度</h2>
      <CaseProgress v-for="c in data.cases" :key="c.id" :c="c" can-edit-docs @toggle-doc="(i, r) => toggleDoc(c, i, r)" />
      <p v-if="!data.cases.length" class="muted">目前沒有進行中的申請。</p>

      <template v-if="others.length">
        <h2 class="section-title">{{ data.elder.name }} 可能符合的其他資源</h2>
        <button
          v-for="r in others"
          :key="r.resourceId"
          type="button"
          class="card tappable"
          @click="router.push(`/resource/${r.resourceId}`)"
        >
          <div class="spread">
            <strong>{{ RESOURCE_BY_ID.get(r.resourceId)!.name }}</strong>
            <VerdictBadge :verdict="r.verdict" />
          </div>
        </button>
      </template>
      <p v-if="!recs.length" class="small muted">{{ data.elder.name }} 還沒有分享推薦結果。</p>
      <p class="small muted">資源頁面上的資格比對是依「你自己」填的資料計算；家人的資格請以他分享的結果為準。</p>
    </template>
  </main>
</template>

<style scoped>
.item {
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--tp-primary-100);
}
</style>
