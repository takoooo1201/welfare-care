<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ROLE_LABEL } from '@shared/labels.ts';
import type { Staff } from '@shared/types.ts';
import { api } from '@/lib/api';
import { setStaffSession } from '@/lib/staffSession';

const route = useRoute();
const router = useRouter();
const directory = ref<Staff[]>([]);
const staffId = ref('');
const pin = ref('');
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  directory.value = await api.staff.directory().catch(() => []);
});

async function login() {
  busy.value = true;
  error.value = '';
  try {
    const r = await api.staff.login(staffId.value, pin.value);
    setStaffSession(r.token, r.staff);
    router.replace(typeof route.query.next === 'string' ? route.query.next : '/staff');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page login">
    <section class="card">
      <h1>服務人員登入</h1>
      <p class="muted">區公所、社工與合作志工使用。依角色只會看到自己行政區、職務需要的資料。</p>
      <form class="stack" @submit.prevent="login">
        <div class="field">
          <span class="label">選擇帳號</span>
          <div class="stack accounts">
            <label v-for="s in directory" :key="s.id" class="check" :class="{ on: staffId === s.id }">
              <input v-model="staffId" type="radio" name="staff" :value="s.id" />
              <span>
                <strong>{{ s.name }}</strong>　<span class="chip primary">{{ ROLE_LABEL[s.role] }}</span><br />
                <span class="small muted">{{ s.org }}・{{ s.district }}</span>
              </span>
            </label>
          </div>
        </div>
        <div class="field">
          <label for="pin">PIN 碼</label>
          <input id="pin" v-model="pin" class="input" type="password" inputmode="numeric" autocomplete="current-password" />
          <p class="hint">示範帳號的 PIN 碼都是 1234</p>
        </div>
        <p v-if="error" class="notice bad">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="!staffId || !pin || busy">登入</button>
      </form>
    </section>
    <p class="center"><RouterLink to="/" class="small">回民眾版首頁</RouterLink></p>
  </main>
</template>

<style scoped>
.login {
  padding-top: 32px;
}
.accounts .check.on {
  outline: 2px solid var(--tp-primary-dark);
  background: var(--tp-primary-50);
}
</style>
