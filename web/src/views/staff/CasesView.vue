<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { caseStatusLabel, CHANNEL_LABEL, HELP_TYPE_LABEL } from '@shared/labels.ts';
import type { CaseRecord, CaseStatus } from '@shared/types.ts';
import { api } from '@/lib/api';
import { staffSession } from '@/lib/staffSession';
import { ago, resourceNames, STATUS_CHIP } from '@/lib/staffUi';

const router = useRouter();
const cases = ref<CaseRecord[] | null>(null);
const filter = ref<'all' | 'open' | CaseStatus>('open');
const mineOnly = ref(false);
let timer = 0;

async function load() {
  cases.value = await api.staff.cases().catch(() => cases.value ?? []);
}

const FILTERS: { value: 'all' | 'open' | CaseStatus; label: string }[] = [
  { value: 'open', label: '處理中' },
  { value: 'received', label: '待安排' },
  { value: 'submitted', label: '已送件' },
  { value: 'closed', label: '已結案' },
  { value: 'all', label: '全部' },
];

const counts = computed(() => {
  const all = cases.value ?? [];
  return {
    received: all.filter((c) => c.status === 'received').length,
    mine: all.filter((c) => c.assigneeId === staffSession.staff?.id && c.status !== 'closed').length,
    open: all.filter((c) => c.status !== 'closed').length,
  };
});

const shown = computed(() =>
  (cases.value ?? []).filter((c) => {
    if (mineOnly.value && c.assigneeId !== staffSession.staff?.id) return false;
    if (filter.value === 'all') return true;
    if (filter.value === 'open') return c.status !== 'closed' && c.status !== 'submitted';
    return c.status === filter.value;
  }),
);

onMounted(() => {
  void load();
  timer = window.setInterval(load, 10_000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <main class="wide">
    <section class="stats">
      <div class="card stat"><span class="num warn-text">{{ counts.received }}</span><span>待安排</span></div>
      <div class="card stat"><span class="num">{{ counts.mine }}</span><span>我負責的</span></div>
      <div class="card stat"><span class="num">{{ counts.open }}</span><span>{{ staffSession.staff?.district }}處理中</span></div>
    </section>

    <div class="spread toolbar">
      <div class="choices" role="group" aria-label="篩選狀態">
        <button v-for="f in FILTERS" :key="f.value" type="button" class="choice" :aria-pressed="filter === f.value" @click="filter = f.value">
          {{ f.label }}
        </button>
      </div>
      <label class="row small"><input v-model="mineOnly" type="checkbox" /> 只看我負責的</label>
    </div>

    <p v-if="staffSession.staff?.role === 'volunteer'" class="notice">
      志工在接案前只會看到大略位置與需要的協助類型；接案後才會顯示聯絡方式。
    </p>

    <div v-if="cases === null" class="loading">載入中…</div>
    <div v-else class="list">
      <button v-for="c in shown" :key="c.id" type="button" class="card tappable item" @click="router.push(`/staff/case/${c.id}`)">
        <div class="spread">
          <span class="row">
            <strong class="name">{{ c.citizenName }}</strong>
            <span class="small muted">{{ c.district }}{{ c.village ?? '' }}</span>
          </span>
          <span class="chip" :class="c.status === 'closed' && c.outcome === 'approved' ? 'ok' : c.status === 'closed' && c.outcome === 'rejected' ? 'bad' : STATUS_CHIP[c.status]">
            {{ caseStatusLabel(c) }}
          </span>
        </div>
        <span>{{ resourceNames(c) }}</span>
        <span class="row">
          <span v-for="h in c.helpTypes" :key="h" class="chip accent">{{ HELP_TYPE_LABEL[h] }}</span>
          <span v-for="t in c.tags" :key="t" class="chip">{{ t }}</span>
        </span>
        <span class="small muted">
          {{ CHANNEL_LABEL[c.channel] }}・{{ ago(c.createdAt) }}
          <template v-if="c.assigneeName">・負責：{{ c.assigneeName }}</template>
        </span>
      </button>
      <p v-if="!shown.length" class="empty">沒有符合條件的個案</p>
    </div>
  </main>
</template>

<style scoped>
.wide {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.stat {
  align-items: center;
  gap: 0;
  padding: 12px;
}
.num {
  font-size: 1.8rem;
  font-weight: 800;
}
.warn-text {
  color: #b9661b;
}
.toolbar {
  flex-wrap: wrap;
}
.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.item {
  gap: 8px;
}
.name {
  font-size: 1.05rem;
}
</style>
