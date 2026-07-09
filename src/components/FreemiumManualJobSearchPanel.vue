<script setup lang="ts">
import { computed } from 'vue'
import jobHopperRabbitLogo from '@/assets/job-hopper-rabbit.png'

const props = defineProps<{
  usedSearches: number
  maxSearches: number
  message: string | null
  loading: boolean
  /** When false, Run job search is disabled (e.g. all free runs used). */
  canRun: boolean
  /** Hero layout when there are no matches yet; compact footer under the job list otherwise */
  centered: boolean
}>()

const emit = defineEmits<{
  run: []
}>()

/** One nudge step before the hard wall: exactly one free search left. */
const showOneRemainingNudge = computed(
  () => props.canRun && !props.message && props.maxSearches - props.usedSearches === 1,
)
</script>

<template>
  <section
    :class="
      centered
        ? 'max-w-md mx-auto text-center'
        : 'rounded-2xl border border-neutral-border bg-white/80 p-6 shadow-sm sm:p-8'
    "
    aria-label="Manual job search"
  >
    <div :class="centered ? 'flex justify-center mb-4' : 'flex justify-center sm:justify-start mb-4'">
      <img :src="jobHopperRabbitLogo" alt="Job-Hopper rabbit" class="w-14 h-14" />
    </div>
    <h2
      :class="
        centered
          ? 'text-2xl font-heading font-semibold text-brand-charcoal mb-2'
          : 'text-xl font-heading font-semibold text-brand-charcoal mb-2'
      "
    >
      {{ centered ? 'Run a job search' : 'Run another job search' }}
    </h2>
    <p :class="centered ? 'text-neutral-body mb-2' : 'text-neutral-body mb-2 text-sm sm:text-base'">
      On the free plan you choose when we scan for new matches. You have used
      <span class="font-semibold text-brand-charcoal">{{ usedSearches }}</span>
      of
      <span class="font-semibold text-brand-charcoal">{{ maxSearches }}</span>
      manual searches. Each run can add up to
      <span class="font-semibold text-brand-charcoal">5</span>
      new matches that meet your bar.
    </p>
    <p v-if="message" class="text-sm text-green-700 mb-4">{{ message }}</p>
    <p v-else-if="!canRun" class="text-sm text-neutral-body mb-4">
      You've used all included manual searches. Subscribe for automated matching, or check back if your limits are
      increased.
    </p>
    <div
      v-else-if="showOneRemainingNudge"
      class="mb-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
      :class="centered ? 'text-left' : ''"
    >
      Just 1 free search left. Make it count, or upgrade anytime.
    </div>
    <button
      type="button"
      class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="loading || !canRun"
      :aria-disabled="!canRun && !loading"
      @click="emit('run')"
    >
      <font-awesome-icon
        v-if="loading"
        :icon="['fas', 'spinner']"
        spin
        class="h-4 w-4"
        aria-hidden="true"
      />
      {{ loading ? 'Searching…' : !canRun ? 'Upgrade to continue' : 'Run job search' }}
    </button>
    <p :class="centered ? 'text-xs text-neutral-body mt-4' : 'text-xs text-neutral-body mt-4'">
      Upgrade to a subscription for automated daily matching and email digests.
    </p>
    <router-link
      :to="{ name: 'billing-purchase' }"
      :class="centered ? 'btn-secondary inline-block mt-4' : 'btn-secondary inline-block mt-3'"
    >
      View plans
    </router-link>
  </section>
</template>
