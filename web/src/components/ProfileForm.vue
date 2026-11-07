<script setup lang="ts">
// 資格問題。用白話問，每一題都可以選「不確定」。
import { TAIPEI_DISTRICTS } from '@shared/labels.ts';
import type { HouseholdStatus, IncomeBand, Profile, Tri, TriField } from '@shared/types.ts';
import ChoiceGroup from './ChoiceGroup.vue';

const profile = defineModel<Profile>({ required: true });
defineProps<{ compact?: boolean }>();

const TRI: { value: Tri; label: string }[] = [
  { value: 'yes', label: '是' },
  { value: 'no', label: '不是' },
  { value: 'unknown', label: '不確定' },
];

const HOUSEHOLD: { value: HouseholdStatus; label: string }[] = [
  { value: 'low', label: '低收入戶' },
  { value: 'midLow', label: '中低收入戶' },
  { value: 'none', label: '都不是' },
  { value: 'unknown', label: '不確定' },
];

const INCOME: { value: IncomeBand; label: string }[] = [
  { value: 'le_low', label: '20,744 元以下' },
  { value: 'le_midlow', label: '20,745～29,635 元' },
  { value: 'le_1_5x', label: '29,636～39,960 元' },
  { value: 'above', label: '超過 39,960 元' },
  { value: 'unknown', label: '不確定' },
];

const TRI_QUESTIONS: { field: TriField; q: string; hint?: string }[] = [
  { field: 'taipeiResident', q: '戶籍在臺北市，也住在臺北市嗎？' },
  { field: 'disability', q: '有身心障礙證明嗎？' },
  { field: 'indigenous', q: '是原住民嗎？' },
  { field: 'newResident', q: '是新住民嗎？', hint: '外籍、大陸或港澳配偶，或是新住民的家人' },
  { field: 'livesAlone', q: '一個人住嗎？', hint: '或同住的家人沒辦法照顧你' },
  { field: 'needsCare', q: '洗澡、穿衣、吃飯或出門，需要別人幫忙嗎？' },
  { field: 'dementia', q: '醫師有診斷過失智症嗎？' },
  { field: 'hardship', q: '最近 3 個月家裡有發生變故嗎？', hint: '例如家人過世、重病、受傷、失業或沒辦法工作' },
];

function setTri(field: TriField, v: Tri) {
  profile.value = { ...profile.value, [field]: v };
}
</script>

<template>
  <div class="stack" :class="{ compact }">
    <div class="field">
      <label for="pf-birthday">生日</label>
      <input id="pf-birthday" v-model="profile.birthday" class="input" type="date" max="2026-12-31" />
    </div>

    <div class="row two">
      <div class="field">
        <label for="pf-district">住在哪一區</label>
        <select id="pf-district" v-model="profile.district" class="input">
          <option :value="null">請選擇</option>
          <option v-for="d in TAIPEI_DISTRICTS" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <div class="field">
        <label for="pf-village">里（可不填）</label>
        <input id="pf-village" v-model.trim="profile.village" class="input" placeholder="例：中吉里" />
      </div>
    </div>

    <div class="field">
      <span class="label">家裡是低收入戶或中低收入戶嗎？</span>
      <ChoiceGroup v-model="profile.household" :options="HOUSEHOLD" label="福利身分" />
    </div>

    <div class="field">
      <span class="label">家裡平均每個人每個月的收入大約多少？</span>
      <p class="hint">全家每月收入加起來，除以家裡人數。不清楚可以選「不確定」。</p>
      <ChoiceGroup v-model="profile.income" :options="INCOME" label="每人每月收入" />
    </div>

    <div v-for="t in TRI_QUESTIONS" :key="t.field" class="field">
      <span class="label">{{ t.q }}</span>
      <p v-if="t.hint" class="hint">{{ t.hint }}</p>
      <ChoiceGroup :model-value="profile[t.field]" :options="TRI" :label="t.q" @update:model-value="setTri(t.field, $event)" />
    </div>
  </div>
</template>

<style scoped>
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}
.stack {
  gap: 22px;
}
.compact {
  gap: 16px;
}
</style>
