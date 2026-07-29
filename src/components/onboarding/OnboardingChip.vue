<script setup lang="ts">
defineProps<{
  label: string
  selected: boolean
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="cursor-pointer select-none rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-150"
    :class="
      selected
        ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
        : 'border-neutral-border bg-white text-neutral-body hover:border-brand-primary/50'
    "
    :aria-pressed="selected"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>
