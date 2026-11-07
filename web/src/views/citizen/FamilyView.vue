<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RESOURCE_BY_ID } from '@shared/data/resources.ts';
import AppBar from '@/components/AppBar.vue';
import { api, type FamilyLink } from '@/lib/api';
import { FAMILY_DEMO, identity, setDemoAsFamily } from '@/lib/identity';
import { useToast } from '@/lib/toast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const delegateId = typeof route.query.delegate === 'string' ? route.query.delegate : null;
const delegateName = delegateId ? RESOURCE_BY_ID.get(delegateId)?.name : null;

const asElder = ref<FamilyLink[]>([]);
const asFamily = ref<FamilyLink[]>([]);
const invite = ref<{ code: string; expiresAt: string } | null>(null);
const code = ref('');
const now = ref(Date.now());
let clock = 0;
let poll = 0;

const minutesLeft = computed(() => (invite.value ? Math.max(0, Math.ceil((Date.parse(invite.value.expiresAt) - now.value) / 60000)) : 0));

async function load() {
  const r = await api.familyLinks().catch(() => null);
  if (!r) return;
  if (invite.value && r.asElder.length > asElder.value.length) {
    toast(`${r.asElder[r.asElder.length - 1].familyName} 已經完成綁定`);
    invite.value = null;
  }
  asElder.value = r.asElder;
  asFamily.value = r.asFamily;
}

async function createInvite() {
  try {
    invite.value = await api.createInvite();
  } catch (e) {
    toast((e as Error).message);
  }
}

async function accept() {
  try {
    const r = await api.acceptInvite(code.value);
    toast(`已綁定，你現在可以協助 ${r.citizenName}`);
    code.value = '';
    await load();
  } catch (e) {
    toast((e as Error).message);
  }
}

async function remove(link: FamilyLink, who: string) {
  if (!window.confirm(`確定要解除與 ${who} 的綁定嗎？解除後對方就看不到相關資料。`)) return;
  await api.removeLink(link.id).catch((e: Error) => toast(e.message));
  await load();
}

onMounted(() => {
  void load();
  clock = window.setInterval(() => (now.value = Date.now()), 15_000);
  poll = window.setInterval(() => invite.value && load(), 4000);
});
onBeforeUnmount(() => {
  window.clearInterval(clock);
  window.clearInterval(poll);
});
</script>

<template>
  <AppBar title="家屬協助" back="/" />
  <main class="page">
    <section v-if="!identity.demoAsFamily" class="card">
      <h2>請家人幫我</h2>
      <p class="muted">邀請子女或信任的家人，用他自己的城市通幫你看推薦、準備文件和追蹤進度。</p>
      <p v-if="delegateName" class="notice warn">要把「{{ delegateName }}」轉交給家人協助，請先邀請家人綁定。</p>

      <div v-if="invite" class="notice stack center">
        <span>請家人打開城市通 →「福利找上門」→「家屬協助」，輸入這組邀請碼：</span>
        <div class="big-code" aria-live="polite">{{ invite.code }}</div>
        <span class="small muted">{{ minutesLeft }} 分鐘內有效，只能使用一次</span>
      </div>
      <button v-else type="button" class="btn btn-primary btn-block" @click="createInvite">產生邀請碼</button>

      <div v-for="l in asElder" :key="l.id" class="spread linked">
        <span>👤 <strong>{{ l.familyName }}</strong> 正在協助你</span>
        <button type="button" class="btn btn-sm btn-danger" @click="remove(l, l.familyName)">解除</button>
      </div>
      <p v-if="asElder.length" class="small muted">家人可以看到你分享的推薦結果，以及你同意分享的申請進度。</p>
    </section>

    <section class="card">
      <h2>我是家屬，要協助家人</h2>
      <div class="field">
        <label for="fam-code">輸入家人給你的 6 位數邀請碼</label>
        <div class="row nowrap">
          <input id="fam-code" v-model="code" class="input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" />
          <button type="button" class="btn btn-primary" :disabled="code.replace(/\D/g, '').length !== 6" @click="accept">綁定</button>
        </div>
      </div>
      <button
        v-for="l in asFamily"
        :key="l.id"
        type="button"
        class="card tappable elder"
        @click="router.push(`/family/elder/${l.citizenId}`)"
      >
        <div class="spread">
          <strong>協助 {{ l.citizenName }}</strong>
          <span aria-hidden="true">›</span>
        </div>
        <span class="small muted">看推薦、準備文件、追蹤申請進度</span>
      </button>
    </section>

    <section class="card demo">
      <h3>示範模式</h3>
      <p class="small muted">同一支手機示範家屬流程：切換成家屬「{{ FAMILY_DEMO.name }}」後，輸入長輩產生的邀請碼。</p>
      <button type="button" class="btn btn-secondary btn-sm" @click="setDemoAsFamily(!identity.demoAsFamily)">
        {{ identity.demoAsFamily ? '切回本人身分' : `切換成家屬（${FAMILY_DEMO.name}）` }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.linked {
  padding: 10px 0;
  border-top: 1px solid var(--gray-100);
}
.nowrap {
  flex-wrap: nowrap;
}
.elder {
  box-shadow: none;
  border: 2px solid var(--tp-primary-100);
}
.demo {
  background: var(--gray-100);
  box-shadow: none;
}
</style>
