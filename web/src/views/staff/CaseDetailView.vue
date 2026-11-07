<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import { caseStatusLabel, CHANNEL_LABEL, HELP_TYPE_LABEL, OUTCOME_LABEL, STATUS_FLOW, STATUS_LABEL } from '@shared/labels.ts';
import type { CaseRecord, CaseStatus, Outcome, Staff } from '@shared/types.ts';
import ChoiceGroup from '@/components/ChoiceGroup.vue';
import LeafletMap from '@/components/LeafletMap.vue';
import StatusSteps from '@/components/StatusSteps.vue';
import { api } from '@/lib/api';
import { staffSession } from '@/lib/staffSession';
import { STATUS_COLOR, STATUS_CHIP } from '@/lib/staffUi';
import { useToast } from '@/lib/toast';

const props = defineProps<{ id: string }>();
const router = useRouter();
const toast = useToast();
const c = ref<CaseRecord | null>(null);
const team = ref<Staff[]>([]);
const note = ref('');
const outcome = ref<Outcome | null>(null);
const busy = ref(false);
const error = ref('');

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: 'approved', label: '✓ 核定通過' },
  { value: 'rejected', label: '未通過審核' },
  { value: 'completed', label: '協助完成' },
  { value: 'withdrawn', label: '民眾取消' },
];

const me = computed(() => staffSession.staff);
const isMine = computed(() => c.value?.assigneeId === me.value?.id);
const isVolunteer = computed(() => me.value?.role === 'volunteer');
const isOffice = computed(() => me.value?.role === 'district_office');
const canClaim = computed(() => !!c.value && c.value.status !== 'closed' && !c.value.assigneeId);
const canAct = computed(() => !!c.value && !canClaim.value && (!isVolunteer.value || isMine.value));

/** 依流程的下一步，做成主要按鈕 */
const nextStatus = computed<CaseStatus | null>(() => {
  if (!c.value) return null;
  const next = STATUS_FLOW[STATUS_FLOW.indexOf(c.value.status) + 1] as CaseStatus | undefined;
  return next && staffSession.allowedStatuses.includes(next) ? next : null;
});
const otherStatuses = computed(() =>
  staffSession.allowedStatuses.filter((s) => s !== c.value?.status && s !== nextStatus.value && s !== 'closed'),
);
const canClose = computed(() => staffSession.allowedStatuses.includes('closed') && c.value?.status !== 'closed');

const chipClass = computed(() => {
  if (!c.value) return '';
  if (c.value.outcome === 'approved' && c.value.status === 'closed') return 'ok';
  if (c.value.outcome === 'rejected' && c.value.status === 'closed') return 'bad';
  return STATUS_CHIP[c.value.status];
});

const consentText = computed(() => {
  if (!c.value) return '';
  if (c.value.channel === 'neighbor') return '鄰居以城市通通報，本人尚未同意・位置為通報人標出的大略位置';
  const how = c.value.consent.method
    ? `代為建檔・${c.value.consent.method}`
    : c.value.channel === 'family'
      ? '家屬代為送出，並確認已取得本人同意'
      : '民眾於 App 勾選同意';
  const where = c.value.location?.source === 'gps' ? '已分享手機定位' : c.value.location ? '只提供行政區' : '未提供位置';
  return `${how}・${where}`;
});

const fmt = (iso: string) => new Date(iso).toLocaleString('zh-TW', { hour12: false });

onMounted(async () => {
  try {
    c.value = await api.staff.case(props.id);
    if (isOffice.value) team.value = await api.staff.team();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

/** 誰會收到通知：鄰里通報只會通知通報人「有人接手、已去關心」，處理紀錄不會給通報人看 */
const audience = computed(() => (c.value?.channel === 'neighbor' ? '通報的鄰居' : '民眾與家屬'));

async function claim(assigneeId?: string) {
  if (!c.value) return;
  busy.value = true;
  try {
    c.value = await api.staff.assign(c.value.id, assigneeId);
    toast(`已安排人員，${audience.value}會收到通知`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}

function onAssign(e: Event) {
  const select = e.target as HTMLSelectElement;
  const id = select.value;
  select.value = '';
  if (id) void claim(id);
}

async function setStatus(status: CaseStatus, result?: Outcome) {
  if (!c.value) return;
  const noteOnly = status === c.value.status && (status !== 'closed' || result === c.value.outcome);
  busy.value = true;
  try {
    c.value = await api.staff.setStatus(c.value.id, status, note.value, result);
    note.value = '';
    outcome.value = null;
    const notice = c.value.channel === 'neighbor' ? '' : `，${audience.value}會收到通知`;
    if (noteOnly) toast(`已新增處理紀錄${notice}`);
    else if (status === 'closed' && result) toast(`已結案：${OUTCOME_LABEL[result]}${notice}`);
    else toast(`已更新為「${STATUS_LABEL[status]}」${notice}`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}

function addNote() {
  if (!c.value) return;
  void setStatus(c.value.status, c.value.status === 'closed' ? (c.value.outcome ?? undefined) : undefined);
}
</script>

<template>
  <main class="detail">
    <button type="button" class="btn btn-ghost btn-sm" @click="router.back()">‹ 返回</button>
    <p v-if="error" class="notice bad">{{ error }}</p>
    <div v-else-if="!c" class="loading">載入中…</div>
    <template v-else>
      <section class="card">
        <div class="spread">
          <h1>{{ c.citizenName }}</h1>
          <span class="chip" :class="chipClass">{{ caseStatusLabel(c) }}</span>
        </div>
        <p class="small muted">{{ c.id }}・{{ CHANNEL_LABEL[c.channel] }}・建立於 {{ fmt(c.createdAt) }}</p>
        <StatusSteps :status="c.status" />
        <p v-if="c.channel === 'neighbor'" class="notice warn small">
          這是鄰居通報的個案，本人還不知道。訪視時請先表明身分與來意，取得本人同意後，再協助申請下列福利；本人拒絕時請尊重並結案（民眾取消）。
        </p>
      </section>

      <div class="cols">
        <section class="card info">
          <h2>需求內容</h2>
          <dl>
            <dt>{{ c.channel === 'neighbor' ? '訪視時可評估' : '申請項目' }}</dt>
            <dd>
              <template v-if="c.resourceIds.length">
                <div v-for="id in c.resourceIds" :key="id">{{ RESOURCE_BY_ID.get(id)?.name ?? id }}</div>
              </template>
              <span v-else class="muted">接案後顯示</span>
            </dd>
            <dt>需要的協助</dt>
            <dd class="row"><span v-for="h in c.helpTypes" :key="h" class="chip accent">{{ HELP_TYPE_LABEL[h] }}</span></dd>
            <dt v-if="c.tags.length">{{ c.channel === 'neighbor' ? '通報人看到的狀況' : '資格摘要' }}</dt>
            <dd v-if="c.tags.length" class="row"><span v-for="t in c.tags" :key="t" class="chip">{{ t }}</span></dd>
            <dt v-if="c.note">備註</dt>
            <dd v-if="c.note">{{ c.note }}</dd>
          </dl>

          <h2>聯絡方式</h2>
          <p v-if="isVolunteer && !isMine" class="notice">接案後才會顯示姓名、電話與地址。</p>
          <dl v-else>
            <dt>電話</dt>
            <dd>
              <a v-if="c.phone" :href="`tel:${c.phone.replace(/[^\d#]/g, '')}`">{{ c.phone }}</a>
              <span v-else class="muted">未提供</span>
            </dd>
            <dt>地址</dt>
            <dd>{{ c.district }}{{ c.village ?? '' }}　{{ c.address ?? '' }}</dd>
            <dt>同意紀錄</dt>
            <dd class="small">{{ consentText }}</dd>
            <template v-if="c.channel === 'neighbor'">
              <dt>通報人</dt>
              <dd v-if="c.reporter" class="small">
                {{ c.reporter.name }}<template v-if="c.reporter.phone">・<a :href="`tel:${c.reporter.phone.replace(/[^\d#]/g, '')}`">{{ c.reporter.phone }}</a></template>
                （同意被聯絡）
              </dd>
              <dd v-else class="small muted">匿名（通報人不希望被聯絡）</dd>
            </template>
          </dl>

          <template v-if="c.documents.length">
            <h2>文件準備（{{ c.documents.filter((d) => d.ready).length }}/{{ c.documents.length }}）</h2>
            <ul class="docs">
              <li v-for="d in c.documents" :key="d.name">
                <span :class="d.ready ? 'ok-text' : 'muted'">{{ d.ready ? '✓' : '○' }}</span> {{ d.name }}
                <span v-if="d.by" class="small muted">（{{ d.by }}）</span>
              </li>
            </ul>
          </template>
        </section>

        <section class="stack">
          <div class="card">
            <h2>處理</h2>
            <template v-if="canClaim">
              <button type="button" class="btn btn-primary btn-block" :disabled="busy" @click="claim()">我來接案</button>
            </template>
            <p v-else-if="c.assigneeName" class="small">負責人員：<strong>{{ c.assigneeName }}</strong></p>
            <select v-if="isOffice && c.status !== 'closed'" class="input" aria-label="指派給同仁" :disabled="busy" @change="onAssign">
              <option value="">{{ c.assigneeId ? '改派給同仁…' : '或指派給同仁…' }}</option>
              <option v-for="s in team.filter((t) => t.id !== me?.id && t.id !== c!.assigneeId)" :key="s.id" :value="s.id">{{ s.name }}（{{ s.org }}）</option>
            </select>

            <template v-if="canAct">
              <textarea v-model="note" class="input" rows="2" maxlength="200" placeholder="處理紀錄（會顯示在民眾的進度中，並通知民眾與家屬）"></textarea>
              <button v-if="nextStatus" type="button" class="btn btn-primary btn-block" :disabled="busy" @click="setStatus(nextStatus)">
                下一步：改為「{{ STATUS_LABEL[nextStatus] }}」
              </button>
              <button type="button" class="btn btn-secondary btn-block" :disabled="busy || !note.trim()" @click="addNote">只新增處理紀錄</button>
              <div v-if="otherStatuses.length" class="row">
                <span class="small muted">其他：</span>
                <button v-for="s in otherStatuses" :key="s" type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="setStatus(s)">
                  改為「{{ STATUS_LABEL[s] }}」
                </button>
              </div>

              <div v-if="canClose" class="close-box stack">
                <strong>結案</strong>
                <p class="small muted">
                  {{ c.channel === 'neighbor' ? '通報的鄰居只會知道「已經去關心過了」，不會看到結果。' : '選擇結果後，民眾與家屬會收到通知。' }}
                </p>
                <ChoiceGroup v-model="outcome" :options="OUTCOME_OPTIONS" label="結案結果" />
                <button type="button" class="btn btn-sm" :class="outcome === 'approved' ? 'btn-primary' : 'btn-secondary'" :disabled="busy || !outcome" @click="setStatus('closed', outcome!)">
                  {{ outcome ? `結案：${OUTCOME_LABEL[outcome]}` : '請先選擇結案結果' }}
                </button>
              </div>
            </template>
          </div>

          <LeafletMap
            v-if="c.location"
            :markers="[{ id: c.id, lat: c.location.lat, lng: c.location.lng, color: STATUS_COLOR[c.status], title: c.citizenName, approximate: c.location.approximate }]"
            height="240px"
            :zoom="16"
            :center="c.location"
          />
          <p v-if="c.location?.approximate" class="small muted">虛線圈為大略位置（約 300 公尺內）</p>
          <p v-else-if="c.channel === 'neighbor'" class="small muted">位置為通報人在地圖上標出的大略位置</p>
          <p v-else-if="c.location?.source === 'address'" class="small muted">位置為行政區概略位置</p>

          <div class="card">
            <h2>處理紀錄</h2>
            <ol class="timeline">
              <li v-for="(t, i) in [...c.timeline].reverse()" :key="i">
                <span class="small muted">{{ fmt(t.at) }}</span>
                <span><strong>{{ t.outcome ? `結案：${OUTCOME_LABEL[t.outcome]}` : STATUS_LABEL[t.status] }}</strong>・{{ t.by }}</span>
                <span v-if="t.note" class="small">{{ t.note }}</span>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.detail {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}
.detail > .btn {
  align-self: flex-start;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.info h2:not(:first-child) {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--gray-100);
}
dl {
  margin: 0;
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 12px;
}
dt {
  color: var(--gray-600);
  font-size: 0.9rem;
}
dd {
  margin: 0;
}
.docs {
  list-style: none;
  padding: 0;
  margin: 0;
}
.ok-text {
  color: var(--ok);
  font-weight: 800;
}
.close-box {
  gap: 8px;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px dashed var(--gray-200);
}
.close-box .btn {
  align-self: flex-start;
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
@media (max-width: 800px) {
  .cols {
    grid-template-columns: 1fr;
  }
  dl {
    grid-template-columns: 80px 1fr;
  }
}
</style>
