<script setup lang="ts">
import { computed } from 'vue'
import type { SponsorshipLikelihood } from '@/types/database'

const props = defineProps<{
  value: SponsorshipLikelihood | null
  /** Free tier: obscure the real likelihood behind a blurred, locked teaser. */
  locked?: boolean
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
  <!-- Free-tier teaser: blurred label under a lock, prompting upgrade. -->
  <span
    v-if="locked"
    class="relative inline-flex items-center gap-1.5 rounded-full border border-neutral-border bg-neutral-bg px-2.5 py-0.5 text-xs font-medium"
    aria-label="Sponsorship likelihood — upgrade to unlock"
  >
    <span class="pointer-events-none select-none blur-[3px]" aria-hidden="true">
      <font-awesome-icon :icon="['fas', 'globe-americas']" class="shrink-0" />
      Chance to provide sponsorship: High
    </span>
    <font-awesome-icon
      :icon="['fas', 'lock']"
      class="absolute left-1/2 -translate-x-1/2 text-neutral-body"
      aria-hidden="true"
    />
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="toneClass"
  >
    <font-awesome-icon :icon="['fas', 'globe-americas']" class="shrink-0" aria-hidden="true" />
    <span>Chance to provide sponsorship: {{ label }}</span>
  </span>
</template>

