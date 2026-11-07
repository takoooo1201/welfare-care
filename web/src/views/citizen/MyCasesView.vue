<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { CaseRecord } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import CaseProgress from '@/components/CaseProgress.vue';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';

const toast = useToast();
const cases = ref<CaseRecord[] | null>(null);
let timer = 0;

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
      <CaseProgress v-for="c in cases" :key="c.id" :c="c" can-edit-docs @toggle-doc="(i, r) => toggleDoc(c, i, r)" />
    </template>
    <div v-else class="empty stack">
      <p>還沒有申請紀錄。</p>
      <RouterLink to="/matches" class="btn btn-primary">看看可以申請什麼</RouterLink>
    </div>
  </main>
</template>
