<script setup lang="ts">
// 示範用的服務人員登入：點一下帳號就登入，不需要密碼（正式環境應改接市府帳號系統）。
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ROLE_LABEL } from '@shared/labels.ts';
import type { Staff } from '@shared/types.ts';
import { api } from '@/lib/api';
import { setStaffSession } from '@/lib/staffSession';

const route = useRoute();
const router = useRouter();
const directory = ref<Staff[]>([]);
const error = ref('');
const busy = ref('');

onMounted(async () => {
  directory.value = await api.staff.directory().catch(() => []);
});

async function login(staffId: string) {
  if (busy.value) return;
  busy.value = staffId;
  error.value = '';
  try {
    const r = await api.staff.login(staffId);
    setStaffSession(r.token, r.staff);
    router.replace(typeof route.query.next === 'string' ? route.query.next : '/staff');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <main class="page login">
    <section class="card">
      <h1>服務人員登入</h1>
      <p class="muted">區公所、社工與合作志工使用。依角色只會看到自己行政區、職務需要的資料。</p>
      <p class="small muted">示範版：點一下帳號就能登入。</p>
      <div class="stack accounts">
        <button
          v-for="s in directory"
          :key="s.id"
          type="button"
          class="account"
          :class="{ on: busy === s.id }"
          :disabled="!!busy"
          @click="login(s.id)"
        >
          <span class="who">
            <strong>{{ s.name }}</strong>
            <span class="small muted">{{ `${s.org}・${s.district}` }}</span>
          </span>
          <span class="chip primary">{{ ROLE_LABEL[s.role] }}</span>
        </button>
      </div>
      <p v-if="error" class="notice bad">{{ error }}</p>
    </section>
    <p class="center"><RouterLink to="/" class="small">回民眾版首頁</RouterLink></p>
  </main>
</template>

<style scoped>
.login {
  padding-top: 32px;
}
.account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid var(--gray-200);
  border-radius: 12px;
  background: #fff;
  color: var(--gray-900);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.account:active:not(:disabled),
.account.on {
  outline: 2px solid var(--tp-primary-dark);
  background: var(--tp-primary-50);
}
.account:disabled:not(.on) {
  opacity: 0.6;
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
