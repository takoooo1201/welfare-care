<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { RESOURCES } from '@shared/data/resources.ts';
import { caseStatusLabel, STATUS_FLOW } from '@shared/labels.ts';
import { ageOn, matchAll } from '@shared/match.ts';
import { estimateMonthly, nextQuestion } from '@shared/questions.ts';
import type { MyReport } from '@shared/report.ts';
import type { CaseRecord } from '@shared/types.ts';
import { resourceTitle } from '@shared/updates.ts';
import { api, type FamilyLink } from '@/lib/api';
import { phoneCall } from '@/lib/bridge';
import { FAMILY_DEMO, identity, setDemoAsFamily } from '@/lib/identity';
import { inbox, type InboxItem, openedNotices, unreadCount } from '@/lib/inbox';
import { isLargeText, setLargeText } from '@/lib/prefs';
import { hasSavedProfile, loadProfile } from '@/lib/profile';
import { money } from '@/lib/tween';

const router = useRouter();
// 還沒回答任何問題時，也先用城市通帶入的生日與居住地比對：福利先找上門，不用先填表
const hasProfile = hasSavedProfile();
const profile = loadProfile();
const results = matchAll(RESOURCES, profile);
const likely = results.filter((r) => r.verdict === 'likely').length;
const possible = results.filter((r) => r.verdict === 'possible').length;
const monthlyLikely = estimateMonthly(results, profile);
const monthlyMax = estimateMonthly(results, profile, ['likely', 'possible']);
const moreToAsk = !!nextQuestion(profile, RESOURCES);
const age = ageOn(profile.birthday);
const who = [age !== null && age >= 65 ? `${age} 歲` : null, profile.district].filter(Boolean).join('・');

const cases = ref<CaseRecord[]>([]);
const elders = ref<FamilyLink[]>([]);
const helpers = ref<FamilyLink[]>([]);
const reports = ref<MyReport[]>([]);
const reportsCared = computed(() => reports.value.filter((r) => r.stage !== 'received').length);
const largeText = ref(isLargeText());
const active = computed(() => cases.value.filter((c) => c.status !== 'closed'));
const unread = computed(() => inbox.items.filter((i) => !i.read));

async function load() {
  try {
    cases.value = await api.myCases();
    const links = await api.familyLinks();
    elders.value = links.asFamily;
    helpers.value = links.asElder;
    reports.value = await api.myReports();
  } catch {
    /* 離線時仍可使用比對功能 */
  }
}
onMounted(load);
// 收到新通知時更新首頁的進度摘要
watch(() => inbox.items.length, load);

/** 進度條：4 個步驟走到第幾步 */
function progress(c: CaseRecord): number {
  return ((STATUS_FLOW.indexOf(c.status) + 1) / STATUS_FLOW.length) * 100;
}

function openNotice(i: InboxItem) {
  openedNotices([i.id]);
  router.push(i.link);
}

function toggleLarge() {
  largeText.value = !largeText.value;
  setLargeText(largeText.value);
}
</script>

<template>
  <main class="page">
    <div v-if="identity.demoAsFamily" class="notice warn spread">
      <span>示範中：你現在是家屬「{{ FAMILY_DEMO.name }}」</span>
      <button type="button" class="btn btn-sm btn-secondary nowrap" @click="setDemoAsFamily(false)">切回本人</button>
    </div>

    <header class="home-top">
      <p class="muted">{{ identity.name }}，你好</p>
      <button type="button" class="bell" :aria-label="unreadCount ? `通知，${unreadCount} 則未讀` : '通知'" @click="router.push('/notifications')">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6zm-2.4 15.5a2.5 2.5 0 0 0 4.8 0z"
            fill="currentColor"
          />
        </svg>
        <span v-if="unreadCount" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </button>
    </header>

    <button v-for="i in unread.slice(0, 2)" :key="i.id" type="button" class="card tappable news" :class="{ approved: i.outcome === 'approved' }" @click="openNotice(i)">
      <span class="spread">
        <strong>🔔 {{ i.title }}</strong>
        <span aria-hidden="true">›</span>
      </span>
      <span class="small">{{ i.body }}</span>
    </button>
    <RouterLink v-if="unread.length > 2" to="/notifications" class="small more-link">還有 {{ unread.length - 2 }} 則新通知 ›</RouterLink>

    <section class="card hero">
      <p class="brand">福利找上門<span v-if="who" class="small muted">・{{ who }}</span></p>
      <template v-if="!hasProfile">
        <h1>已經先幫你找了：<br />{{ likely + possible }} 項福利可能在等你</h1>
        <p>用城市通的生日和居住地比對過了，不用填表。只要回答幾個是非題，就能確認哪些可以領。</p>
        <p v-if="monthlyMax" class="money">每月最多可能多領<strong>約 {{ money(monthlyMax) }} 元</strong></p>
        <button type="button" class="btn btn-primary btn-block" @click="router.push('/ask')">回答幾題，確認我能領什麼</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="router.push('/matches')">直接看全部 {{ results.length }} 項</button>
      </template>
      <template v-else>
        <h1>你很可能符合 {{ likely }} 項福利</h1>
        <p v-if="monthlyLikely" class="money">每月約可領<strong>{{ money(monthlyLikely) }} 元</strong></p>
        <p v-if="possible" class="small muted">另外 {{ possible }} 項還需要再確認。</p>
        <button type="button" class="btn btn-primary btn-block" @click="router.push('/matches')">看我的福利，請人幫我申請</button>
        <button v-if="moreToAsk" type="button" class="btn btn-ghost btn-sm" @click="router.push('/ask')">再回答幾題，看看還有沒有</button>
        <button v-else type="button" class="btn btn-ghost btn-sm" @click="router.push('/profile')">修改我的資料</button>
      </template>
    </section>

    <button type="button" class="card tappable care-card" @click="router.push('/report')">
      <span class="spread">
        <strong class="card-title">💛 我擔心身邊的長輩</strong>
        <span aria-hidden="true">›</span>
      </span>
      <span v-if="reports.length" class="small">你通報過 {{ reports.length }} 位，{{ reportsCared }} 位已經有社工接手</span>
      <span v-else class="muted">鄰居好幾天沒出門？不用知道名字，告訴社工你看到什麼，他們會順路去看看。</span>
    </button>

    <button v-if="cases.length" type="button" class="card tappable" @click="router.push('/my')">
      <span class="spread">
        <strong class="card-title">我的申請進度</strong>
        <span aria-hidden="true">›</span>
      </span>
      <template v-if="active.length">
        <span v-for="c in active.slice(0, 2)" :key="c.id" class="mini">
          <span class="spread">
            <span class="mini-name">{{ resourceTitle(c.resourceIds) }}</span>
            <span class="chip" :class="c.status === 'received' ? 'warn' : 'primary'">{{ caseStatusLabel(c) }}</span>
          </span>
          <span class="bar" aria-hidden="true"><span :style="{ width: `${progress(c)}%` }"></span></span>
        </span>
        <span v-if="active.length > 2" class="small muted">還有 {{ active.length - 2 }} 件處理中</span>
      </template>
      <span v-else class="muted">申請都已處理完成</span>
    </button>

    <button type="button" class="card tappable" @click="router.push('/family')">
      <span class="spread">
        <strong class="card-title">家屬協助</strong>
        <span aria-hidden="true">›</span>
      </span>
      <span v-if="helpers.length">👤 {{ helpers.map((e) => e.familyName).join('、') }} 正在協助你</span>
      <span v-if="elders.length">你正在協助：{{ elders.map((e) => e.citizenName).join('、') }}</span>
      <span v-if="!elders.length && !helpers.length" class="muted">邀請子女或信任的家人幫忙準備資料、追蹤進度；或輸入家人的邀請碼來協助他。</span>
    </button>

    <section class="card">
      <h2>想直接問人？</h2>
      <div class="call-grid">
        <button type="button" class="btn btn-secondary" @click="phoneCall('1957')">📞 福利諮詢 1957</button>
        <button type="button" class="btn btn-secondary" @click="phoneCall('1999')">📞 市民熱線 1999</button>
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

<style scoped>
.card-title {
  font-size: 1.2rem;
}
.brand {
  font-weight: 800;
  color: var(--tp-primary-dark);
}
.money {
  font-size: 1.05rem;
}
.money strong {
  display: block;
  font-size: 2rem;
  line-height: 1.2;
  color: var(--tp-primary-dark);
  font-variant-numeric: tabular-nums;
}
.care-card {
  background: var(--tp-secondary-50);
  border-left: 6px solid var(--tp-secondary);
}
.home-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: -8px;
}
.bell {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border: none;
  background: #fff;
  box-shadow: var(--shadow);
  color: var(--tp-primary-dark);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: var(--bad);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}
.news {
  background: var(--tp-secondary-50);
  border-left: 6px solid var(--tp-secondary);
  gap: 4px;
}
.news.approved {
  background: var(--ok-bg);
  border-left-color: var(--ok);
}
.more-link {
  align-self: flex-end;
  margin-top: -8px;
}
.mini {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}
.mini-name {
  font-weight: 600;
  min-width: 0;
}
.bar {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--gray-100);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--tp-primary);
}
.call-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.call-grid .btn {
  padding: 0 8px;
  white-space: nowrap;
}
@media (max-width: 340px) {
  .call-grid {
    grid-template-columns: 1fr;
  }
}
</style>
