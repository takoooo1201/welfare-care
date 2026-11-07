<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { ensureIdentity, identity } from './lib/identity';
import { startCaseWatcher } from './lib/watcher';

const route = useRoute();
const isStaff = computed(() => route.path.startsWith('/staff'));
const toast = ref('');
let toastTimer = 0;

function showToast(message: string) {
  toast.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 4500);
}
provide('toast', showToast);

// 除錯列：App 的 WebView 裡沒有 DevTools，網址加上 ?debug 時把路由與錯誤顯示在畫面上
const DEV = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
const debugLines = ref<string[]>([]);
function debug(line: string) {
  debugLines.value = [...debugLines.value.slice(-3), `${new Date().toLocaleTimeString()} ${line}`];
}
if (DEV) {
  window.addEventListener('error', (e) => debug(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => debug(`reject: ${String(e.reason)}`));
  window.addEventListener('pagehide', () => debug('pagehide'));
  debug(`load ${location.pathname}${location.search}`);
}

let stopWatcher: (() => void) | null = null;
onMounted(async () => {
  await ensureIdentity();
  stopWatcher = startCaseWatcher(() => !isStaff.value, showToast);
});
onBeforeUnmount(() => stopWatcher?.());
</script>

<template>
  <RouterView v-if="identity.ready || isStaff" :key="identity.id" />
  <div v-else class="loading">載入中…</div>
  <div v-if="DEV" class="debug-bar">
    <div>route {{ route.fullPath }}</div>
    <div v-for="(l, i) in debugLines" :key="i">{{ l }}</div>
  </div>
  <Transition name="toast">
    <div v-if="toast" class="toast" role="status" @click="toast = ''">{{ toast }}</div>
  </Transition>
</template>
