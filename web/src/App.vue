<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { ensureIdentity, identity } from './lib/identity';
import { openedNotices } from './lib/inbox';
import type { ShowToast, ToastOptions } from './lib/toast';
import { type Notice, startCaseWatcher } from './lib/watcher';

const route = useRoute();
const router = useRouter();
const isStaff = computed(() => route.path.startsWith('/staff'));
const toast = ref<(ToastOptions & { message: string; noticeIds?: string[] }) | null>(null);
let toastTimer = 0;

const showToast: ShowToast = (message, opts = {}) => {
  toast.value = { message, ...opts };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), opts.link ? 7000 : 4500);
};
provide('toast', showToast);

/** 新進度：跳出可以點的提示，點了就前往該申請 */
function onNotices(notices: Notice[]) {
  const last = notices[notices.length - 1];
  if (notices.length === 1) showToast(last.body, { title: last.title, link: last.link });
  else showToast(`最新：${last.title}`, { title: `你有 ${notices.length} 則新通知`, link: '/notifications' });
  if (toast.value) toast.value.noticeIds = notices.map((n) => n.id);
}

function openToast() {
  const t = toast.value;
  toast.value = null;
  if (!t?.link) return;
  if (t.noticeIds) openedNotices(t.noticeIds);
  void router.push(t.link);
}

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
  stopWatcher = startCaseWatcher(() => !isStaff.value, onNotices);
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
    <button v-if="toast" type="button" class="toast" :class="{ actionable: toast.link }" role="status" @click="openToast">
      <span v-if="toast.title" class="toast-title">🔔 {{ toast.title }}</span>
      <span>{{ toast.message }}</span>
      <span v-if="toast.link" class="toast-more">查看 ›</span>
    </button>
  </Transition>
</template>
