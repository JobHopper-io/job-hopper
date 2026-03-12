<script setup lang="ts">
import { computed } from 'vue'
import type { SponsorshipLikelihood } from '@/types/database'

const props = defineProps<{
  value: SponsorshipLikelihood | null
}>()

const label = computed(() => props.value ?? 'N/A')

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
    <font-awesome-icon :icon="['fas', 'globe-americas']" class="shrink-0" aria-hidden="true" />
    <span>Chance to provide sponsorship: {{ label }}</span>
  </span>
</template>

