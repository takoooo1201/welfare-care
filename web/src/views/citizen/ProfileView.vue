<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar.vue';
import ProfileForm from '@/components/ProfileForm.vue';
import { identity } from '@/lib/identity';
import { hasSavedProfile, loadProfile, saveProfile } from '@/lib/profile';

const router = useRouter();
const profile = ref(loadProfile());
const prefilled = !hasSavedProfile() && !identity.demoAsFamily && !!(profile.value.birthday || profile.value.district);

function done() {
  saveProfile(profile.value);
  router.push('/matches');
}
</script>

<template>
  <AppBar title="我的基本資料" back="/" />
  <main class="page">
    <p class="notice">🔒 這些資料只存在你的手機，用來比對你可能符合的補助，不會上傳。</p>
    <p v-if="prefilled" class="notice ok">已經從城市通帶入你的生日和居住地，請確認是否正確。</p>
    <ProfileForm v-model="profile" />
  </main>
  <div class="sticky-bar">
    <button type="button" class="btn btn-primary btn-block" @click="done">看推薦結果</button>
  </div>
</template>
