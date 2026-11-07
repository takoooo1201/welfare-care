<script setup lang="ts">
// 民眾與家屬看到的申請進度卡片
import { computed, ref } from 'vue';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { caseStatusHint, caseStatusLabel, CHANNEL_LABEL, OUTCOME_LABEL, STATUS_LABEL } from '@shared/labels.ts';
import type { CaseRecord } from '@shared/types.ts';
import { ago } from '@/lib/staffUi';
import StatusSteps from './StatusSteps.vue';

/** who：家屬看長輩的申請時傳入長輩名字，說明文字會改成第三人稱 */
const props = defineProps<{ c: CaseRecord; canEditDocs?: boolean; who?: string; unread?: boolean }>();
const emit = defineEmits<{ toggleDoc: [index: number, ready: boolean] }>();
const showTimeline = ref(false);

const names = computed(() => props.c.resourceIds.map((id) => RESOURCE_BY_ID.get(id)?.name ?? id));
const readyCount = computed(() => props.c.documents.filter((d) => d.ready).length);
const outcome = computed(() => (props.c.status === 'closed' ? (props.c.outcome ?? null) : null));
const chipClass = computed(() => {
  if (outcome.value === 'approved') return 'ok';
  if (outcome.value === 'rejected') return 'bad';
  if (props.c.status === 'closed') return '';
  return props.c.status === 'received' ? 'warn' : 'primary';
});

/** 最新一筆處理紀錄（送出之後才有） */
const latest = computed(() => {
  if (props.c.timeline.length < 2) return null;
  const e = props.c.timeline[props.c.timeline.length - 1];
  const auto = !e.note || e.note === `更新為「${STATUS_LABEL[e.status]}」`;
  const text = auto ? (e.outcome ? `結案：${OUTCOME_LABEL[e.outcome]}` : `進度更新為「${STATUS_LABEL[e.status]}」`) : e.note!;
  return { ...e, text };
});

const RESULT_ICON: Record<string, string> = { approved: '🎉', rejected: '📮', completed: '✅', withdrawn: '↩️' };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<template>
  <article class="card case" :class="{ unread }">
    <div class="spread top">
      <span class="row">
        <span class="chip" :class="chipClass">{{ caseStatusLabel(c) }}</span>
        <span v-if="unread" class="chip warn">● 有新進度</span>
      </span>
      <span class="small muted">{{ CHANNEL_LABEL[c.channel] }}・{{ fmt(c.createdAt) }}</span>
    </div>
    <h3>{{ names.join('、') }}</h3>

    <div v-if="outcome" class="result" :class="outcome">
      <span class="result-ic" aria-hidden="true">{{ RESULT_ICON[outcome] }}</span>
      <span class="stack tight">
        <strong>{{ OUTCOME_LABEL[outcome] }}</strong>
        <span class="small">{{ caseStatusHint(c, who) }}</span>
      </span>
    </div>
    <template v-else>
      <StatusSteps :status="c.status" />
      <p class="notice">{{ caseStatusHint(c, who) }}</p>
    </template>

    <div v-if="latest" class="latest">
      <span class="small muted">最新進度・{{ ago(latest.at) }}</span>
      <span>{{ latest.text }}</span>
      <span class="small muted">— {{ latest.by }}</span>
    </div>
    <p v-if="c.assigneeName" class="small">負責人員：<strong>{{ c.assigneeName }}</strong></p>

    <div v-if="c.documents.length && !outcome" class="stack docs">
      <div class="spread">
        <strong>要準備的文件</strong>
        <span class="small" :class="readyCount === c.documents.length ? 'ok-text' : 'muted'">已備妥 {{ readyCount }}/{{ c.documents.length }}</span>
      </div>
      <div class="bar" aria-hidden="true"><span :style="{ width: `${(readyCount / c.documents.length) * 100}%` }"></span></div>
      <label v-for="(d, i) in c.documents" :key="d.name" class="check">
        <input type="checkbox" :checked="d.ready" :disabled="!canEditDocs" @change="emit('toggleDoc', i, ($event.target as HTMLInputElement).checked)" />
        <span>
          {{ d.name }}
          <span v-if="d.ready && d.by" class="small muted">（{{ d.by }} 已備妥）</span>
        </span>
      </label>
      <p class="small muted">實際應備文件以承辦人員告知為準。</p>
    </div>

    <button type="button" class="btn btn-ghost btn-sm" :aria-expanded="showTimeline" @click="showTimeline = !showTimeline">
      {{ showTimeline ? '收起處理紀錄' : `看全部處理紀錄（${c.timeline.length}）` }}
    </button>
    <ol v-if="showTimeline" class="timeline">
      <li v-for="(t, i) in [...c.timeline].reverse()" :key="i">
        <span class="small muted">{{ fmt(t.at) }}</span>
        <span><strong>{{ t.outcome ? OUTCOME_LABEL[t.outcome] : STATUS_LABEL[t.status] }}</strong>・{{ t.by }}</span>
        <span v-if="t.note" class="small">{{ t.note }}</span>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.case.unread {
  box-shadow: 0 0 0 3px var(--tp-secondary), var(--shadow);
}
.top {
  flex-wrap: wrap;
}
.tight {
  gap: 2px;
}
.docs {
  gap: 8px;
}
.bar {
  height: 8px;
  border-radius: 4px;
  background: var(--gray-100);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--ok);
  border-radius: 4px;
  transition: width 0.3s ease;
}
.ok-text {
  color: var(--ok);
  font-weight: 700;
}
.latest {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-left: 4px solid var(--tp-primary);
  background: var(--tp-primary-50);
  border-radius: 0 10px 10px 0;
}
.result {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 12px;
  background: var(--gray-100);
}
.result.approved {
  background: var(--ok-bg);
  color: var(--ok);
}
.result.rejected {
  background: var(--bad-bg);
  color: var(--bad);
}
.result-ic {
  font-size: 2rem;
  line-height: 1;
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
