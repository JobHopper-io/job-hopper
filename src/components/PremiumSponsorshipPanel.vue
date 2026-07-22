<script setup lang="ts">
import { computed } from 'vue'
import type { RealSponsorshipTier } from '@/types/database'

/**
 * Premium-only replacement for the small JobSponsorshipBadge pill (§3 decision 11's real
 * score). Free/Core keep the pill unchanged - this is deliberately heavier: the rationale is
 * real government filing data, not a heuristic guess, and it reads better as a callout than a
 * tag. Same tier→tone mapping as SponsorshipTierBadge (kept in sync manually - both are small
 * enough that a shared source isn't worth the indirection yet).
 */
const props = defineProps<{
  score: RealSponsorshipTier
  rationale: string
}>()

const tone = computed(() => {
  if (props.score === 'High') {
    return {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      bar: 'bg-emerald-500',
      icon: 'text-emerald-700',
      label: 'text-emerald-800',
    }
  }
  if (props.score === 'Medium') {
    return {
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      bar: 'bg-amber-500',
      icon: 'text-amber-700',
      label: 'text-amber-800',
    }
  }
  return {
    border: 'border-red-200',
    bg: 'bg-red-50',
    bar: 'bg-red-500',
    icon: 'text-red-700',
    label: 'text-red-700',
  }
})
</script>

<template>
  <div
    class="relative flex gap-3 overflow-hidden rounded-[12px] border pl-4 pr-4 py-3"
    :class="[tone.border, tone.bg]"
  >
    <span class="absolute inset-y-0 left-0 w-1" :class="tone.bar" aria-hidden="true" />
    <span
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"
      aria-hidden="true"
    >
      <font-awesome-icon :icon="['fas', 'globe-americas']" :class="tone.icon" />
    </span>
    <div class="min-w-0">
      <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-body/80">
        <font-awesome-icon :icon="['fas', 'check-double']" class="text-brand-primary" aria-hidden="true" />
        Real Sponsorship Score
      </p>
      <p class="mt-0.5 font-heading text-base font-semibold" :class="tone.label">
        {{ score }} chance to sponsor
      </p>
      <p class="mt-1 text-sm leading-snug text-neutral-body">
        {{ rationale }}
      </p>
    </div>
  </div>
</template>
