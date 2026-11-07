<script setup lang="ts">
import type { Verdict } from '@shared/types.ts';

defineProps<{ verdict: Verdict; unknownCount?: number }>();
</script>

<template>
  <span v-if="verdict === 'likely'" class="chip ok">很可能符合</span>
  <span v-else-if="verdict === 'possible'" class="chip warn">可能符合<template v-if="unknownCount">・{{ unknownCount }} 項待確認</template></span>
  <span v-else class="chip">目前可能不符合</span>
</template>
