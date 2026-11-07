<script setup lang="ts">
// 「用說的找福利」：民眾用自己的話描述狀況，手機上的 Laya 模型聽出 14 個狀況（是非題），
// 再由規則（shared/nl.ts、match.ts）排出最適合的 5 項。和 /ask 的一題一頁問答是兩個獨立的功能。
// 描述內容只在這支手機上處理，不會送到伺服器，也不會存起來。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { HEARD, rankFromSignals, SIGNAL_LABEL, SIGNALS, type Signal, type SignalProbs } from '@shared/nl.ts';
import AppBar from '@/components/AppBar.vue';
import VerdictBadge from '@/components/VerdictBadge.vue';
import { LAYA_DOWNLOAD_MB, laya, layaDownloaded, listen, loadLaya } from '@/lib/laya';

const router = useRouter();

const EXAMPLES = [
  '我今年七十八歲，一個人住，最近腳不好很少出門。',
  '我媽媽失智了，洗澡吃飯都要人幫忙，我白天要上班。',
  '我從越南嫁來台灣，語言不太通，想找人諮詢。',
  '我七十歲，退休後沒什麼收入，健保費繳得很吃力。',
];

const text = ref('');
const busy = ref(false);
const elapsed = ref(0);
const error = ref('');
const downloaded = ref(false);
/** 模型的原始回答；使用者修正時只改 overrides，不重跑模型 */
const raw = ref<SignalProbs | null>(null);
const heardText = ref('');
const overrides = ref<Partial<Record<Signal, number>>>({});
const runMs = ref(0);

onMounted(async () => {
  downloaded.value = await layaDownloaded();
  // 下載過就先在背景載入，按下按鈕時比較快
  if (downloaded.value) loadLaya();
});

let timer: ReturnType<typeof setInterval> | undefined;
onUnmounted(() => clearInterval(timer));

const probs = computed<SignalProbs | null>(() => (raw.value ? { ...raw.value, ...overrides.value } : null));
const result = computed(() => (probs.value ? rankFromSignals(probs.value, heardText.value) : null));
const notHeard = computed(() => (probs.value ? SIGNALS.filter((s) => probs.value![s] < HEARD && !(s === 'elder' && result.value?.age !== null)) : []));

const pct = computed(() => (laya.total ? Math.round((laya.loaded / laya.total) * 100) : 0));
const mb = (n: number) => Math.round(n / 1e6);
const status = computed(() => {
  if (laya.state === 'loading' && laya.total && laya.loaded < laya.total) return `正在下載模型 ${mb(laya.loaded)} / ${mb(laya.total)} MB（${pct.value}%）`;
  if (laya.state === 'loading') return '正在把模型載入手機的記憶體…';
  return `AI 正在聽懂你的描述…已經 ${elapsed.value} 秒`;
});
const submitLabel = computed(() => (busy.value ? '請稍候…' : '幫我找福利'));
const helpIds = computed(() => result.value?.top.map((t) => t.resource.id) ?? []);
const helpLabel = computed(() => `請人協助申請這 ${helpIds.value.length} 項`);

async function submit() {
  const t = text.value.trim();
  if (!t || busy.value) return;
  busy.value = true;
  error.value = '';
  elapsed.value = 0;
  const start = Date.now();
  timer = setInterval(() => (elapsed.value = Math.round((Date.now() - start) / 1000)), 500);
  try {
    const r = await listen(t);
    raw.value = r.probs;
    runMs.value = r.ms;
    heardText.value = t;
    overrides.value = {};
    downloaded.value = true;
    // 等結果畫出來再捲到最上面（iOS 會保留送出時的捲動位置）
    await nextTick();
    window.scrollTo({ top: 0 });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    clearInterval(timer);
    busy.value = false;
  }
}

/** 點掉聽錯的狀況，或補上沒聽到的狀況；只重新排名，不重跑模型 */
function toggle(s: Signal) {
  const on = (probs.value?.[s] ?? 0) >= HEARD;
  overrides.value = { ...overrides.value, [s]: on ? 0 : 1 };
}

function again() {
  raw.value = null;
  overrides.value = {};
}

const percent = (p: number) => `${Math.round(p * 100)}%`;
</script>

<template>
  <AppBar title="用說的找福利" back="/" />
  <main class="page talk">
    <template v-if="!result">
      <section class="card hero">
        <h1>說說你的狀況就好</h1>
        <p>像跟社工聊天一樣，用自己的話說：幾歲、跟誰住、哪裡不方便、最近遇到什麼困難。</p>
        <textarea v-model="text" aria-label="你的狀況" class="input talk-input" rows="5" maxlength="400" placeholder="例如：我七十八歲，一個人住，腳不好很少出門" :disabled="busy"></textarea>
        <p class="small muted">💬 可以按鍵盤上的麥克風，用說的輸入</p>
        <button type="button" class="btn btn-primary btn-block" :disabled="!text.trim() || busy" @click="submit">{{ submitLabel }}</button>
      </section>

      <section v-if="busy" class="card" aria-live="polite">
        <p>{{ status }}</p>
        <span class="bar" :class="{ indeterminate: !(laya.state === 'loading' && laya.total && laya.loaded < laya.total) }" aria-hidden="true">
          <span :style="{ width: laya.state === 'loading' && laya.total ? `${pct}%` : '40%' }"></span>
        </span>
        <p class="small muted">AI 會在你的手機上回答 14 個是非題，手機比較舊的話可能要十幾秒。</p>
      </section>

      <p v-if="error" class="notice bad">模型沒辦法執行：{{ error }}。可以改用「回答幾題」的方式找福利。</p>

      <section v-if="!busy" class="card">
        <h2>不知道怎麼說？點一句試試</h2>
        <div class="examples">
          <button v-for="e in EXAMPLES" :key="e" type="button" class="btn btn-secondary btn-block example" @click="text = e">{{ e }}</button>
        </div>
      </section>

      <p class="notice ok">🔒 AI 模型在你的手機上執行，你說的話不會上傳，也不會存起來。</p>
      <p v-if="!downloaded" class="small muted">第一次使用要下載約 {{ LAYA_DOWNLOAD_MB }} MB 的模型（建議連 Wi‑Fi），之後就不用再下載。</p>
    </template>

    <template v-else>
      <section class="card">
        <p class="small muted">你說：</p>
        <p class="said">「{{ heardText }}」</p>
        <h2>AI 聽到的狀況</h2>
        <p class="small muted">聽錯了就點掉；漏掉的可以在下面補上。</p>
        <div class="chips">
          <span v-if="result.age !== null" class="chip primary">{{ result.age }} 歲</span>
          <button v-for="h in result.heard" :key="h.signal" type="button" class="chip primary chip-btn" :aria-label="`${h.label}，按一下移除`" @click="toggle(h.signal)">
            {{ `${h.label} ${percent(h.p)} ✕` }}
          </button>
          <span v-if="!result.heard.length && result.age === null" class="muted">沒有聽出特別的狀況</span>
        </div>
        <details v-if="notHeard.length">
          <summary class="small">AI 漏聽了？補上狀況</summary>
          <div class="chips add">
            <button v-for="s in notHeard" :key="s" type="button" class="chip chip-btn" @click="toggle(s)">{{ `＋ ${SIGNAL_LABEL[s]}` }}</button>
          </div>
        </details>
      </section>

      <h2 v-if="result.top.length">最適合你的 {{ result.top.length }} 項福利</h2>
      <button
        v-for="(t, i) in result.top"
        :key="t.resource.id"
        type="button"
        class="card tappable rec"
        @click="router.push(`/resource/${t.resource.id}`)"
      >
        <span class="spread">
          <strong class="rec-name">{{ `${i + 1}. ${t.resource.name}` }}</strong>
          <span aria-hidden="true">›</span>
        </span>
        <span class="small">{{ t.resource.summary }}</span>
        <span class="spread wrap">
          <VerdictBadge :verdict="t.verdict" />
          <span class="small muted">{{ `因為聽到：${t.reasons.map((r) => r.label).join('、')}` }}</span>
        </span>
      </button>

      <section v-if="!result.top.length" class="card">
        <h2>目前沒有找到適合的福利</h2>
        <p>可以多說一點，例如家裡的收入、身體狀況、跟誰住；或是改用「回答幾題」的方式確認。</p>
        <button type="button" class="btn btn-secondary btn-block" @click="router.push('/ask')">改成回答幾題</button>
      </section>

      <p class="small muted">
        這是 AI 的初步判斷，可能聽錯；實際資格以主管機關審核為準。（在手機上用了 {{ (runMs / 1000).toFixed(1) }} 秒，內容沒有上傳）
      </p>
    </template>
  </main>

  <div v-if="result" class="sticky-bar">
    <div class="stack" style="gap: 8px">
      <button v-if="helpIds.length" type="button" class="btn btn-primary btn-block" @click="router.push(`/request?ids=${helpIds.join(',')}`)">{{ helpLabel }}</button>
      <button type="button" class="btn btn-secondary btn-block" @click="again">重新描述</button>
    </div>
  </div>
</template>

<style scoped>
.talk {
  padding-bottom: 180px;
}
.talk-input {
  min-height: 132px;
  font-size: 1.1rem;
  line-height: 1.6;
  resize: vertical;
}
.examples {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.example {
  height: auto;
  min-height: 48px;
  padding: 10px 14px;
  white-space: normal;
  text-align: left;
  justify-content: flex-start;
  line-height: 1.45;
}
.said {
  font-size: 1.1rem;
  color: var(--gray-700);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chips.add {
  margin-top: 8px;
}
.chip-btn {
  border: none;
  min-height: 36px;
  padding: 4px 12px;
  font-size: 0.95rem;
  cursor: pointer;
}
.rec {
  gap: 8px;
}
.rec-name {
  font-size: 1.1rem;
}
.wrap {
  flex-wrap: wrap;
  gap: 6px;
}
.bar {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: var(--gray-100);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--tp-primary);
  transition: width 0.2s;
}
.bar.indeterminate span {
  animation: slide 1.2s ease-in-out infinite;
}
@keyframes slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}
details summary {
  cursor: pointer;
  color: var(--tp-primary-dark);
  font-weight: 600;
  min-height: 32px;
}
</style>
