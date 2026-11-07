<script setup lang="ts">
import type { CriterionResult, EvaluatedCriterion } from '@shared/types.ts';

defineProps<{ criteria: EvaluatedCriterion[] }>();

const ICON: Record<CriterionResult, string> = { met: '✓', unknown: '?', unmet: '✕', manual: '…' };
const TEXT: Record<CriterionResult, string> = {
  met: '符合',
  unknown: '還不確定',
  unmet: '目前不符合',
  manual: '需由承辦單位確認',
};
</script>

<template>
  <ul class="criteria">
    <li v-for="(c, i) in criteria" :key="i" :class="c.result">
      <span class="ic" aria-hidden="true">{{ ICON[c.result] }}</span>
      <span>
        {{ c.label }}
        <span class="sr">（{{ TEXT[c.result] }}）</span>
        <span v-if="c.result === 'manual'" class="small muted">　需由承辦單位確認</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.criteria {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 0.95rem;
}
.ic {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  margin-top: 1px;
}
.met .ic {
  background: var(--ok-bg);
  color: var(--ok);
}
.unknown .ic {
  background: var(--warn-bg);
  color: var(--warn);
}
.unmet .ic {
  background: var(--bad-bg);
  color: var(--bad);
}
.manual .ic {
  background: var(--gray-100);
  color: var(--gray-600);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
