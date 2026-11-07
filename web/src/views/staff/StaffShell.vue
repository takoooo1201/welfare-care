<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { ROLE_LABEL } from '@shared/labels.ts';
import { api } from '@/lib/api';
import { clearStaffSession, staffSession } from '@/lib/staffSession';

const router = useRouter();

onMounted(async () => {
  try {
    const me = await api.staff.me();
    staffSession.staff = me.staff;
    staffSession.allowedStatuses = me.allowedStatuses;
  } catch {
    router.replace('/staff/login');
  }
});

async function logout() {
  await api.staff.logout().catch(() => {});
  clearStaffSession();
  router.replace('/staff/login');
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <strong>福利找上門</strong>
        <span class="muted small">服務管理</span>
      </div>
      <nav class="tabs" aria-label="服務管理功能">
        <RouterLink to="/staff" class="tab" exact-active-class="on">個案列表</RouterLink>
        <RouterLink to="/staff/radar" class="tab" active-class="on">順路雷達</RouterLink>
        <RouterLink v-if="staffSession.staff?.role !== 'volunteer'" to="/staff/intake" class="tab" active-class="on">代為建檔</RouterLink>
      </nav>
      <div v-if="staffSession.staff" class="who">
        <span class="small">
          <strong>{{ staffSession.staff.name }}</strong>
          <span class="chip primary">{{ ROLE_LABEL[staffSession.staff.role] }}</span>
          <span class="muted">{{ staffSession.staff.org }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-sm" @click="logout">登出</button>
      </div>
    </header>
    <RouterView />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}
.top {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: #fff;
  border-bottom: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}
.tab {
  padding: 10px 14px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--gray-700);
  font-weight: 600;
  white-space: nowrap;
}
.tab.on {
  background: var(--tp-primary-50);
  color: var(--tp-primary-dark);
}
.who {
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (max-width: 720px) {
  .who .muted {
    display: none;
  }
}
</style>
