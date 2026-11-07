<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { identity } from '@/lib/identity';

/** back：傳路徑則回到該頁；只寫 back 則回上一頁。在城市通裡由 App 頂部的返回鍵處理。 */
const props = defineProps<{ title: string; back?: boolean | string }>();
const router = useRouter();
const showBack = computed(() => !identity.inApp && props.back !== undefined && props.back !== false);

function goBack() {
  if (typeof props.back === 'string' && props.back !== '') router.push(props.back);
  else if (window.history.state?.back) router.back();
  else router.push('/');
}
</script>

<template>
  <header class="appbar">
    <button v-if="showBack" type="button" class="icon-btn" aria-label="返回上一頁" @click="goBack">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <h1>{{ title }}</h1>
    <div class="appbar-right"><slot name="right" /></div>
  </header>
</template>
