<script setup lang="ts">
// 通知中心：申請進度、審核結果、家屬轉交等通知。打開這一頁就視為已讀，但這次仍標示哪些是新的。
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar.vue';
import { inbox, type InboxItem, markRead } from '@/lib/inbox';
import { ago } from '@/lib/staffUi';

const router = useRouter();
const fresh = ref(new Set<string>());

onMounted(() => {
  fresh.value = new Set(inbox.items.filter((i) => !i.read).map((i) => i.id));
  markRead();
});

const ICON: Record<InboxItem['kind'], string> = {
  new: '📝',
  status: '📌',
  note: '💬',
  result: '📮',
  delegate: '🤝',
  family: '👪',
  report: '💛',
};

function icon(i: InboxItem): string {
  if (i.kind === 'result') return i.outcome === 'approved' ? '🎉' : i.outcome === 'rejected' ? '📮' : '✅';
  return ICON[i.kind];
}
</script>

<template>
  <AppBar title="通知" back="/" />
  <main class="page">
    <div v-if="!inbox.items.length" class="empty stack">
      <p>還沒有通知。</p>
      <p class="small">申請有新進度、審核有結果，或家人請你幫忙時，會在這裡通知你。</p>
    </div>
    <ul v-else class="list">
      <li v-for="i in inbox.items" :key="i.id">
        <button type="button" class="card tappable item" :class="{ fresh: fresh.has(i.id), [`k-${i.kind}`]: true, approved: i.outcome === 'approved' }" @click="router.push(i.link)">
          <span class="ic" aria-hidden="true">{{ icon(i) }}</span>
          <span class="txt">
            <span class="spread">
              <strong>{{ i.title }}</strong>
              <span v-if="fresh.has(i.id)" class="chip warn">新</span>
            </span>
            <span>{{ i.body }}</span>
            <span class="small muted">{{ ago(i.at) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p class="small muted center">通知只存在這支手機。推播需要開著城市通才會即時收到。</p>
  </main>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
}
.item.fresh {
  border-left: 5px solid var(--tp-secondary);
}
.item.approved {
  background: var(--ok-bg);
}
.ic {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--tp-primary-50);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
</style>
