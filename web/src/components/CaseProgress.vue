<script setup lang="ts">
// 民眾與家屬看到的申請進度卡片
import { computed, ref } from 'vue';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { CHANNEL_LABEL, STATUS_HINT, STATUS_LABEL } from '@shared/labels.ts';
import type { CaseRecord } from '@shared/types.ts';
import StatusSteps from './StatusSteps.vue';

const props = defineProps<{ c: CaseRecord; canEditDocs?: boolean }>();
const emit = defineEmits<{ toggleDoc: [index: number, ready: boolean] }>();
const showTimeline = ref(false);

const names = computed(() => props.c.resourceIds.map((id) => RESOURCE_BY_ID.get(id)?.name ?? id));
const readyCount = computed(() => props.c.documents.filter((d) => d.ready).length);
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<template>
  <article class="card">
    <div class="spread">
      <span class="chip primary">{{ STATUS_LABEL[c.status] }}</span>
      <span class="small muted">{{ CHANNEL_LABEL[c.channel] }}・{{ fmt(c.createdAt) }}</span>
    </div>
    <h3>{{ names.join('、') }}</h3>
    <StatusSteps :status="c.status" />
    <p class="notice">{{ STATUS_HINT[c.status] }}</p>
    <p v-if="c.assigneeName" class="small">負責人員：<strong>{{ c.assigneeName }}</strong></p>

    <div v-if="c.documents.length" class="stack docs">
      <div class="spread">
        <strong>要準備的文件</strong>
        <span class="small muted">已備妥 {{ readyCount }}/{{ c.documents.length }}</span>
      </div>
      <label v-for="(d, i) in c.documents" :key="d.name" class="check">
        <input type="checkbox" :checked="d.ready" :disabled="!canEditDocs" @change="emit('toggleDoc', i, ($event.target as HTMLInputElement).checked)" />
        <span>
          {{ d.name }}
          <span v-if="d.ready && d.by" class="small muted">（{{ d.by }} 已備妥）</span>
        </span>
      </label>
      <p class="small muted">實際應備文件以承辦人員告知為準。</p>
    </div>

    <button type="button" class="btn btn-ghost btn-sm" @click="showTimeline = !showTimeline">
      {{ showTimeline ? '收起處理紀錄' : `看處理紀錄（${c.timeline.length}）` }}
    </button>
    <ol v-if="showTimeline" class="timeline">
      <li v-for="(t, i) in [...c.timeline].reverse()" :key="i">
        <span class="small muted">{{ fmt(t.at) }}</span>
        <span><strong>{{ STATUS_LABEL[t.status] }}</strong>・{{ t.by }}</span>
        <span v-if="t.note" class="small">{{ t.note }}</span>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.docs {
  gap: 8px;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 14px;
  border-left: 3px solid var(--tp-primary-100);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.timeline li {
  display: flex;
  flex-direction: column;
}
</style>
