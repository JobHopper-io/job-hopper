<script setup lang="ts">
import { computed } from 'vue'

/**
 * Shared Low/Medium/High(/N/A) pill styling, extracted from JobSponsorshipBadge so the
 * tone-to-color mapping has exactly one place to change. Content is passed via slot -
 * callers own their own label/icon/tooltip.
 */
const props = defineProps<{
  value: 'Low' | 'Medium' | 'High' | 'N/A' | null
}>()

const toneClass = computed(() => {
  if (props.value === 'High') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (props.value === 'Medium') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (props.value === 'Low') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-neutral-bg text-neutral-body border-neutral-border'
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="toneClass"
  >
    <slot />
  </span>
</template>
