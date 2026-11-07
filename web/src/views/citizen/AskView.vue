<script setup lang="ts">
// 一題一頁的資格確認。城市通已經帶入生日與居住地，其餘一次只問一題，
// 每題都挑「回答後能多確認最多項福利」的那一題（shared/questions.ts），全部在手機上計算。
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { RESOURCES } from '@shared/data/resources.ts';
import { ageOn, matchAll } from '@shared/match.ts';
import { answer, estimateMonthly, newlyLikely, nextQuestion, type QuestionField } from '@shared/questions.ts';
import type { Profile, Resource } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import { loadProfile, saveProfile } from '@/lib/profile';
import { money, useTween } from '@/lib/tween';

const router = useRouter();
const profile = ref<Profile>(loadProfile());
const asked = ref<QuestionField[]>([]);
const history = ref<Profile[]>([]);
/** 上一題回答後，新確認為「很可能符合」的項目 */
const gained = ref<Resource[]>([]);

const results = computed(() => matchAll(RESOURCES, profile.value));
const likely = computed(() => results.value.filter((r) => r.verdict === 'likely'));
const monthly = computed(() => estimateMonthly(results.value, profile.value));
const shownLikely = useTween(() => likely.value.length);
const shownMoney = useTween(() => monthly.value);
const next = computed(() => nextQuestion(profile.value, RESOURCES, asked.value));

const age = ageOn(profile.value.birthday);
const known = [age !== null ? `${age} 歲` : null, profile.value.district, profile.value.taipeiResident === 'yes' ? '設籍臺北市' : null]
  .filter(Boolean)
  .join('・');

function pick(value: string) {
  const n = next.value;
  if (!n) return;
  const before = results.value;
  history.value.push(profile.value);
  asked.value.push(n.question.field);
  if (value !== 'unknown') profile.value = answer(profile.value, n.question.field, value);
  saveProfile(profile.value);
  gained.value = newlyLikely(before, results.value);
}

function back() {
  const prev = history.value.pop();
  if (!prev) return;
  profile.value = prev;
  asked.value.pop();
  saveProfile(prev);
  gained.value = [];
}

function finish() {
  saveProfile(profile.value);
  router.push('/matches');
}

const helpIds = computed(() => likely.value.map((r) => r.resource.id));
const helpLabel = computed(() => `請人到家幫我申請（${helpIds.value.length} 項）`);
const unlockText = computed(() => {
  const names = next.value?.unlocks.map((r) => r.name) ?? [];
  return names.length > 3 ? `${names.slice(0, 3).join('、')} 等 ${names.length} 項` : names.join('、');
});
</script>

<template>
  <AppBar title="幫你確認福利" back="/" />
  <main class="page ask">
    <section class="card score" aria-live="polite">
      <div class="score-grid">
        <div>
          <p class="small muted">很可能符合</p>
          <p><span class="big">{{ shownLikely }}</span> 項</p>
        </div>
        <div>
          <p class="small muted">每月約可領</p>
          <p><span class="big">{{ money(shownMoney) }}</span> 元</p>
        </div>
      </div>
      <TransitionGroup v-if="gained.length" name="pop" tag="div" class="gained">
        <span v-for="r in gained" :key="r.id" class="chip ok gain">＋ {{ r.name }}</span>
      </TransitionGroup>
    </section>

    <template v-if="next">
      <p v-if="!asked.length && known" class="notice ok">已從城市通帶入：{{ known }}，不用再填。</p>
      <p v-if="!profile.birthday" class="notice warn">
        還不知道你的生日，很多長者福利沒辦法確認。<RouterLink to="/profile">先填生日</RouterLink>
      </p>
      <section :key="next.question.field" class="card question">
        <p class="small muted">第 {{ asked.length + 1 }} 題</p>
        <h1 class="q">{{ next.question.q }}</h1>
        <p v-if="next.question.hint" class="muted">{{ next.question.hint }}</p>
        <div class="answers">
          <button v-for="o in next.question.options" :key="o.value" type="button" class="btn btn-secondary btn-block" @click="pick(o.value)">
            {{ o.label }}
          </button>
          <button type="button" class="btn btn-ghost btn-block" @click="pick('unknown')">不知道，跳過這題</button>
        </div>
        <p class="small muted why">為什麼問這題？回答後可能多確認：{{ unlockText }}</p>
      </section>
      <div class="spread">
        <button v-if="history.length" type="button" class="btn btn-ghost btn-sm" @click="back">‹ 上一題</button>
        <span v-else></span>
        <button type="button" class="btn btn-ghost btn-sm" @click="finish">先看結果 ›</button>
      </div>
    </template>

    <template v-else>
      <section class="card hero">
        <h1>確認好了</h1>
        <p v-if="monthly">你很可能符合 {{ likely.length }} 項福利，每月約可以領 {{ money(monthly) }} 元。</p>
        <p v-else>你很可能符合 {{ likely.length }} 項福利。</p>
        <ul class="likely-list">
          <li v-for="r in likely" :key="r.resource.id">
            <span>✓ {{ r.resource.name }}</span>
            <span v-if="r.resource.monthly" class="small muted nowrap">每月最多 {{ money(r.resource.monthly.max) }} 元</span>
          </li>
        </ul>
        <p class="small muted">這是初步比對，實際資格以主管機關審核為準。申請可以請社工或志工到家裡幫你。</p>
      </section>
      <button v-if="history.length" type="button" class="btn btn-ghost btn-sm" @click="back">‹ 回上一題修改</button>
    </template>
  </main>

  <div v-if="!next" class="sticky-bar">
    <div class="stack" style="gap: 8px">
      <button v-if="helpIds.length" type="button" class="btn btn-primary btn-block" @click="router.push(`/request?ids=${helpIds.join(',')}&quick=1`)">
        {{ helpLabel }}
      </button>
      <button type="button" class="btn btn-secondary btn-block" @click="finish">看每一項的說明與申請方式</button>
    </div>
  </div>
</template>

<style scoped>
.ask {
  padding-bottom: 180px;
}
.score {
  position: sticky;
  top: 64px;
  z-index: 10;
  background: var(--tp-primary-dark);
  color: #fff;
  gap: 6px;
}
.score .muted {
  color: rgb(255 255 255 / 80%);
}
.score-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 12px;
}
.big {
  font-size: 2.2rem;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.gained {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gain {
  white-space: normal;
}
.pop-enter-active {
  animation: pop 0.45s ease-out;
}
@keyframes pop {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  70% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.question {
  gap: 12px;
  animation: slide 0.25s ease-out;
}
@keyframes slide {
  from {
    transform: translateX(16px);
    opacity: 0;
  }
}
.q {
  font-size: 1.45rem;
}
.answers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.why {
  border-top: 1px solid var(--gray-100);
  padding-top: 10px;
}
.likely-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.likely-list li {
  display: flex;
  flex-direction: column;
  font-weight: 600;
}
.likely-list li .small {
  font-weight: 400;
  padding-left: 1.3em;
}
</style>
