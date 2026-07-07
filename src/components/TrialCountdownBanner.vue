<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Whole days left in the trial; 0 or negative means "ends today". */
  daysRemaining: number
  /** Formatted charge date, e.g. "Jul 14". */
  chargeDateLabel: string
  /** Formatted charge amount, e.g. "$29". */
  amountLabel: string
}>()

const severity = computed<'neutral' | 'warning' | 'urgent'>(() => {
  if (props.daysRemaining <= 0) return 'urgent'
  if (props.daysRemaining <= 3) return 'warning'
  return 'neutral'
})

const message = computed(() => {
  if (severity.value === 'urgent') {
    return `Your trial ends today. Your card will be charged ${props.amountLabel} tonight.`
  }
  if (severity.value === 'warning') {
    const days = props.daysRemaining
    return `${days} day${days === 1 ? '' : 's'} left in your trial. You'll be charged ${props.amountLabel} on ${props.chargeDateLabel}.`
  }
  return `You're on a free trial — ${props.daysRemaining} days left. Your card will be charged ${props.amountLabel} on ${props.chargeDateLabel}.`
})

const containerClass = computed(() => {
  if (severity.value === 'urgent') return 'bg-red-50 border-red-200'
  if (severity.value === 'warning') return 'bg-amber-50 border-amber-200'
  return 'bg-white border-neutral-border'
})

const textClass = computed(() => {
  if (severity.value === 'urgent') return 'text-red-800'
  if (severity.value === 'warning') return 'text-amber-900'
  return 'text-neutral-body'
})

const iconClass = computed(() => {
  if (severity.value === 'urgent') return 'text-red-600'
  if (severity.value === 'warning') return 'text-amber-600'
  return 'text-brand-primary'
})

const ctaClass = computed(() =>
  severity.value === 'urgent' ? 'btn-primary' : 'btn-secondary',
)
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-[12px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    :class="containerClass"
    role="status"
  >
    <div class="flex items-start gap-3">
      <font-awesome-icon
        :icon="['fas', severity === 'urgent' ? 'exclamation-triangle' : 'clock']"
        class="mt-0.5 shrink-0"
        :class="iconClass"
        aria-hidden="true"
      />
      <p class="text-sm" :class="textClass">
        {{ message }}
      </p>
    </div>
    <router-link :to="{ name: 'billing' }" :class="[ctaClass, 'shrink-0 text-center text-sm']">
      Manage subscription
    </router-link>
  </div>
</template>
