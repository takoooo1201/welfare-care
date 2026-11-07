<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CaseRecord } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import CaseProgress from '@/components/CaseProgress.vue';
import { api } from '@/lib/api';
import { inbox, markRead, unreadCaseIds } from '@/lib/inbox';
import { useToast } from '@/lib/toast';

const toast = useToast();
const cases = ref<CaseRecord[] | null>(null);
const highlight = ref(new Set<string>());
let timer = 0;

// 有新進度的申請排最前面（點通知進來時第一眼就看到），其餘依處理中、已完成排列
const fresh = computed(() => (cases.value ?? []).filter((c) => highlight.value.has(c.id)));
const active = computed(() => (cases.value ?? []).filter((c) => c.status !== 'closed' && !highlight.value.has(c.id)));
const closed = computed(() => (cases.value ?? []).filter((c) => c.status === 'closed' && !highlight.value.has(c.id)));

async function load() {
  try {
    cases.value = await api.myCases();
  } catch (e) {
    if (cases.value === null) cases.value = [];
    toast((e as Error).message);
  }
}

async function toggleDoc(c: CaseRecord, index: number, ready: boolean) {
  try {
    const updated = await api.setDocument(c.id, index, ready);
    cases.value = cases.value!.map((x) => (x.id === updated.id ? updated : x));
  } catch (e) {
    toast((e as Error).message);
  }
}

// 有新進度的申請：這次瀏覽時標示出來，並把相關通知標為已讀
watch(
  unreadCaseIds,
  (ids) => {
    const mine = inbox.items.filter((i) => !i.read && i.link === '/my').map((i) => i.caseId!);
    if (!mine.length) return;
    highlight.value = new Set([...highlight.value, ...mine]);
    markRead((i) => i.link === '/my');
    if (ids.size) void load();
  },
  { immediate: true },
);

onMounted(() => {
  void load();
  timer = window.setInterval(load, 8000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <AppBar title="我的申請進度" back="/" />
  <main class="page">
    <div v-if="cases === null" class="loading">載入中…</div>
    <template v-else-if="cases.length">
      <CaseProgress
        v-for="c in [...fresh, ...active]"
        :key="c.id"
        :c="c"
        :unread="highlight.has(c.id)"
        :can-edit-docs="c.status !== 'closed'"
        @toggle-doc="(i, r) => toggleDoc(c, i, r)"
      />
      <template v-if="closed.length">
        <h2 class="section-title">已完成</h2>
        <CaseProgress v-for="c in closed" :key="c.id" :c="c" />
      </template>
    </template>
    <div v-else class="empty stack">
      <p>還沒有申請紀錄。</p>
      <RouterLink to="/matches" class="btn btn-primary">看看可以申請什麼</RouterLink>
    </div>
  </main>
</template>
