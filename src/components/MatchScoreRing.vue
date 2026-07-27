<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    score: number
    size?: number
    showLabel?: boolean
  }>(),
  { size: 40, showLabel: false },
)

/** Score tiers are visual-only signposting (color + label), not a change to the underlying
 * matching algorithm's 0-100 score. */
const tier = computed(() => {
  if (props.score >= 80) return { label: 'Strong match', color: '#16A34A' }
  if (props.score >= 60) return { label: 'Good match', color: '#2F6ECC' }
  if (props.score >= 40) return { label: 'Fair match', color: '#D97706' }
  return { label: 'Match', color: '#6B7280' }
})

const strokeWidth = computed(() => Math.max(3, Math.round(props.size / 10)))
const radius = computed(() => props.size / 2 - strokeWidth.value)
const circumference = computed(() => 2 * Math.PI * radius.value)
const clampedScore = computed(() => Math.min(100, Math.max(0, props.score)))
const offset = computed(() => circumference.value * (1 - clampedScore.value / 100))
const fontSize = computed(() => Math.max(10, Math.round(props.size / 3.2)))
</script>

<template>
  <div
    class="inline-flex items-center gap-2"
    role="img"
    :aria-label="`Match score ${Math.round(score)} out of 100 - ${tier.label}`"
  >
    <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
      <svg :width="size" :height="size" class="-rotate-90">
        <circle
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          stroke="var(--color-neutral-border)"
          :stroke-width="strokeWidth"
        />
        <circle
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          :stroke="tier.color"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="offset"
          style="transition: stroke-dashoffset 0.4s ease"
        />
      </svg>
      <span
        class="absolute inset-0 flex items-center justify-center font-heading font-bold text-brand-charcoal"
        :style="{ fontSize: `${fontSize}px` }"
      >
        {{ Math.round(score) }}
      </span>
    </div>
    <span
      v-if="showLabel"
      class="text-xs font-semibold uppercase tracking-wide"
      aria-hidden="true"
      :style="{ color: tier.color }"
    >
      {{ tier.label }}
    </span>
  </div>
</template>
