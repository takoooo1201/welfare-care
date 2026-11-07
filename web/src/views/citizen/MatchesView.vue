<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { RESOURCES } from '@shared/data/resources.ts';
import { CATEGORY_LABEL } from '@shared/labels.ts';
import { matchAll, unansweredFields } from '@shared/match.ts';
import type { MatchResult } from '@shared/types.ts';
import AppBar from '@/components/AppBar.vue';
import VerdictBadge from '@/components/VerdictBadge.vue';
import { api, type FamilyLink } from '@/lib/api';
import { loadProfile } from '@/lib/profile';
import { useToast } from '@/lib/toast';

const router = useRouter();
const toast = useToast();
const profile = loadProfile();
const results = matchAll(RESOURCES, profile);
const likely = results.filter((r) => r.verdict === 'likely');
const possible = results.filter((r) => r.verdict === 'possible');
const unlikely = results.filter((r) => r.verdict === 'unlikely');
const unanswered = unansweredFields(profile).length;

const selected = ref<string[]>([]);
const showUnlikely = ref(false);
const family = ref<FamilyLink[]>([]);
const sharing = ref(false);

onMounted(async () => {
  family.value = (await api.familyLinks().catch(() => ({ asElder: [] }))).asElder;
});

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
}

const metLabels = (r: MatchResult) => r.criteria.filter((c) => c.result === 'met').map((c) => c.label);

const requestLink = computed(() => `/request?ids=${selected.value.join(',')}`);

async function shareWithFamily() {
  sharing.value = true;
  try {
    await api.shareRecommendations(
      [...likely, ...possible].map((r) => ({ resourceId: r.resource.id, verdict: r.verdict, delegated: selected.value.includes(r.resource.id) })),
    );
    toast(`已分享給 ${family.value.map((f) => f.familyName).join('、')}，他們可以幫你準備資料`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    sharing.value = false;
  }
}
</script>

<template>
  <AppBar title="推薦給你的資源" back="/" />
  <main class="page">
    <section class="card hero">
      <h2>找到 {{ likely.length }} 項很可能符合<span v-if="possible.length">、{{ possible.length }} 項待確認</span></h2>
      <p class="small muted">依你填的資料初步比對，實際資格以主管機關審核為準。</p>
      <RouterLink v-if="unanswered" to="/profile" class="btn btn-secondary btn-sm">
        還有 {{ unanswered }} 題不確定，回答後會更準確
      </RouterLink>
    </section>

    <p class="muted">勾選想申請的項目，我們可以幫你找人協助申請。</p>

    <template v-for="group in [{ title: '很可能符合', items: likely }, { title: '可能符合，需要再確認', items: possible }]" :key="group.title">
      <h2 v-if="group.items.length" class="section-title">{{ group.title }}</h2>
      <article v-for="r in group.items" :key="r.resource.id" class="card match" :class="{ picked: selected.includes(r.resource.id) }">
        <div class="spread">
          <span class="chip primary">{{ CATEGORY_LABEL[r.resource.category] }}</span>
          <VerdictBadge :verdict="r.verdict" :unknown-count="r.unknownCount" />
        </div>
        <button type="button" class="link-area" @click="router.push(`/resource/${r.resource.id}`)">
          <h3>{{ r.resource.name }}</h3>
          <p>{{ r.resource.summary }}</p>
          <p v-if="metLabels(r).length" class="small ok-text">✓ {{ metLabels(r).slice(0, 3).join('・') }}</p>
          <span class="small more">看資格與申請方式 ›</span>
        </button>
        <label class="check">
          <input type="checkbox" :checked="selected.includes(r.resource.id)" @change="toggle(r.resource.id)" />
          <span>我想申請這一項</span>
        </label>
      </article>
    </template>

    <div v-if="!likely.length && !possible.length" class="empty">
      目前沒有比對到符合的項目。可以撥打 1957 福利諮詢專線，請專人幫你看看。
    </div>

    <button v-if="unlikely.length" type="button" class="btn btn-ghost" @click="showUnlikely = !showUnlikely">
      {{ showUnlikely ? '收起' : `看目前可能不符合的 ${unlikely.length} 項` }}
    </button>
    <template v-if="showUnlikely">
      <button
        v-for="r in unlikely"
        :key="r.resource.id"
        type="button"
        class="card tappable"
        @click="router.push(`/resource/${r.resource.id}`)"
      >
        <div class="spread">
          <h3>{{ r.resource.name }}</h3>
          <VerdictBadge :verdict="r.verdict" />
        </div>
        <p class="small muted">✕ {{ r.criteria.filter((c) => c.result === 'unmet').map((c) => c.label).join('・') }}</p>
      </button>
    </template>
  </main>

  <div class="sticky-bar">
    <div class="stack" style="gap: 8px">
      <button type="button" class="btn btn-primary btn-block" :disabled="!selected.length" @click="router.push(requestLink)">
        {{ selected.length ? `請人協助申請（${selected.length} 項）` : '勾選想申請的項目' }}
      </button>
      <button v-if="family.length" type="button" class="btn btn-secondary btn-block" :disabled="sharing" @click="shareWithFamily">
        分享給家人{{ selected.length ? '，請他幫忙申請' : '' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.match.picked {
  outline: 3px solid var(--tp-primary);
}
.link-area {
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}
.ok-text {
  color: var(--ok);
}
.more {
  color: var(--tp-primary-dark);
  font-weight: 600;
}
.page {
  padding-bottom: 180px;
}
</style>
