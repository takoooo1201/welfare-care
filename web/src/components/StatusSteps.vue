<script setup lang="ts">
import { computed } from 'vue';
import { STATUS_FLOW, STATUS_LABEL } from '@shared/labels.ts';
import type { CaseStatus } from '@shared/types.ts';

const props = defineProps<{ status: CaseStatus }>();
const current = computed(() => (props.status === 'closed' ? STATUS_FLOW.length : STATUS_FLOW.indexOf(props.status)));
</script>

<template>
  <ol class="steps" :aria-label="`目前進度：${STATUS_LABEL[status]}`">
    <li
      v-for="(s, i) in STATUS_FLOW"
      :key="s"
      :class="{ done: i < current, current: i === current }"
      :aria-current="i === current ? 'step' : undefined"
    >
      <span class="dot" aria-hidden="true">{{ i < current ? '✓' : i + 1 }}</span>
      <span class="lbl">{{ STATUS_LABEL[s] }}</span>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
li {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--gray-500);
  padding: 0 2px;
}
li::before {
  content: '';
  position: absolute;
  top: 15px;
  left: -50%;
  width: 100%;
  height: 3px;
  background: var(--gray-200);
  z-index: 0;
}
li:first-child::before {
  display: none;
}
li.done::before,
li.current::before {
  background: var(--tp-primary);
}
.dot {
  position: relative;
  z-index: 1;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid var(--gray-200);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
}
li.done .dot {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
  color: #fff;
}
li.current .dot {
  border-color: var(--tp-primary-dark);
  background: var(--tp-primary-dark);
  color: #fff;
  box-shadow: 0 0 0 4px var(--tp-primary-100);
}
li.done,
li.current {
  color: var(--gray-900);
}
li.current .lbl {
  font-weight: 800;
  color: var(--tp-primary-dark);
}
</style>
