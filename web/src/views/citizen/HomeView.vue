<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { RESOURCES } from '@shared/data/resources.ts';
import { STATUS_LABEL } from '@shared/labels.ts';
import { matchAll } from '@shared/match.ts';
import type { CaseRecord } from '@shared/types.ts';
import { api, type FamilyLink } from '@/lib/api';
import { phoneCall } from '@/lib/bridge';
import { FAMILY_DEMO, identity, setDemoAsFamily } from '@/lib/identity';
import { isLargeText, setLargeText } from '@/lib/prefs';
import { hasSavedProfile, loadProfile } from '@/lib/profile';

const hasProfile = hasSavedProfile();
const results = computed(() => (hasProfile ? matchAll(RESOURCES, loadProfile()) : []));
const likely = computed(() => results.value.filter((r) => r.verdict === 'likely').length);
const possible = computed(() => results.value.filter((r) => r.verdict === 'possible').length);

const cases = ref<CaseRecord[]>([]);
const elders = ref<FamilyLink[]>([]);
const largeText = ref(isLargeText());
const active = computed(() => cases.value.filter((c) => c.status !== 'closed'));

onMounted(async () => {
  try {
    cases.value = await api.myCases();
    elders.value = (await api.familyLinks()).asFamily;
  } catch {
    /* 離線時仍可使用比對功能 */
  }
});

function toggleLarge() {
  largeText.value = !largeText.value;
  setLargeText(largeText.value);
}
</script>

<template>
  <main class="page">
    <div v-if="identity.demoAsFamily" class="notice warn spread">
      <span>示範中：你現在是家屬「{{ FAMILY_DEMO.name }}」</span>
      <button type="button" class="btn btn-sm btn-secondary" @click="setDemoAsFamily(false)">切回本人</button>
    </div>

    <section class="card hero">
      <p class="muted">{{ identity.name }}，你好</p>
      <h1>福利找上門</h1>
      <p>回答幾個簡單的問題，我們幫你找出可能符合的補助與照顧服務；需要的話，也有人陪你一起申請。</p>
      <template v-if="!hasProfile">
        <RouterLink to="/profile" class="btn btn-primary btn-block">開始找適合我的補助（約 2 分鐘）</RouterLink>
      </template>
      <template v-else>
        <RouterLink to="/matches" class="btn btn-primary btn-block">
          看推薦結果：{{ likely }} 項很可能符合<span v-if="possible">、{{ possible }} 項待確認</span>
        </RouterLink>
        <RouterLink to="/profile" class="btn btn-ghost btn-sm">更新我的資料</RouterLink>
      </template>
    </section>

    <RouterLink v-if="cases.length" to="/my" class="card tappable" style="text-decoration: none; color: inherit">
      <div class="spread">
        <h2>我的申請進度</h2>
        <span aria-hidden="true">›</span>
      </div>
      <p v-if="active.length">
        {{ active.length }} 件處理中・最新狀態：<strong>{{ STATUS_LABEL[active[0].status] }}</strong>
      </p>
      <p v-else class="muted">申請都已處理完成</p>
    </RouterLink>

    <RouterLink to="/family" class="card tappable" style="text-decoration: none; color: inherit">
      <div class="spread">
        <h2>家屬協助</h2>
        <span aria-hidden="true">›</span>
      </div>
      <p v-if="elders.length">你正在協助：{{ elders.map((e) => e.citizenName).join('、') }}</p>
      <p v-else class="muted">邀請子女或信任的家人幫忙準備資料、追蹤進度；或輸入家人的邀請碼來協助他。</p>
    </RouterLink>

    <section class="card">
      <h2>想直接問人？</h2>
      <div class="row">
        <button type="button" class="btn btn-secondary" @click="phoneCall('1957')">福利諮詢專線 1957</button>
        <button type="button" class="btn btn-secondary" @click="phoneCall('1999')">市民熱線 1999</button>
      </div>
    </section>

    <section class="card">
      <div class="spread">
        <div>
          <h3>大字模式</h3>
          <p class="small muted">把文字和按鈕放大</p>
        </div>
        <button type="button" class="btn btn-sm" :class="largeText ? 'btn-primary' : 'btn-secondary'" :aria-pressed="largeText" @click="toggleLarge">
          {{ largeText ? '已開啟' : '開啟' }}
        </button>
      </div>
    </section>

    <p class="small muted center">
      你填的資料只存在這支手機，用來比對資格。推薦結果是初步比對，實際資格以主管機關審核為準。
    </p>
    <p class="center"><RouterLink to="/staff/login" class="small">服務人員入口</RouterLink></p>
  </main>
</template>
