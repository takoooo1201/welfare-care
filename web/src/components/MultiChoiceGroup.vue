<script setup lang="ts" generic="T extends string">
const props = defineProps<{ modelValue: T[]; options: { value: T; label: string }[]; label?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T[]] }>();

function toggle(v: T) {
  emit('update:modelValue', props.modelValue.includes(v) ? props.modelValue.filter((x) => x !== v) : [...props.modelValue, v]);
}
</script>

<template>
  <div class="choices" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="choice"
      :aria-pressed="modelValue.includes(o.value)"
      @click="toggle(o.value)"
    >
      <span v-if="modelValue.includes(o.value)" aria-hidden="true">✓ </span>{{ o.label }}
    </button>
  </div>
</template>
