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
}>()

const emit = defineEmits<{
  run: []
}>()

/** One nudge step before the hard wall: exactly one free search left. */
const showOneRemainingNudge = computed(
  () => props.canRun && !props.message && props.maxSearches - props.usedSearches === 1,
)

const usagePercent = computed(() =>
  props.maxSearches > 0 ? Math.min(100, Math.round((props.usedSearches / props.maxSearches) * 100)) : 0,
)
</script>

<template>
  <section
    class="rounded-2xl border border-neutral-border bg-white/80 p-6 shadow-sm sm:p-8"
    aria-label="Manual job search"
  >
    <div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex items-start gap-4">
        <img :src="jobHopperRabbitLogo" alt="Job-Hopper rabbit" class="h-12 w-12 shrink-0" />
        <div class="min-w-0">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-1">Run another job search</h2>
          <p class="text-sm text-neutral-body sm:text-base">
            On the free plan you choose when we scan for new matches. Each run can add up to
            <span class="font-semibold text-brand-charcoal">5</span> new matches that meet your bar.
          </p>

          <div class="mt-3 max-w-xs">
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-body">
              <span>{{ usedSearches }} of {{ maxSearches }} searches used</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-bg">
              <div
                class="h-full rounded-full bg-brand-primary transition-all"
                :style="{ width: `${usagePercent}%` }"
              />
            </div>
          </div>

          <p v-if="message" class="mt-3 text-sm text-green-700">{{ message }}</p>
          <p v-else-if="!canRun" class="mt-3 text-sm text-neutral-body">
            You've used all included manual searches. Subscribe for automated matching, or check back if your limits
            are increased.
          </p>
          <div
            v-else-if="showOneRemainingNudge"
            class="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
          >
            Just 1 free search left. Make it count, or upgrade anytime.
          </div>
        </div>
      </div>

      <div class="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
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
        <router-link :to="{ name: 'billing-purchase' }" class="btn-secondary inline-flex items-center justify-center">
          View plans
        </router-link>
      </div>
    </div>
    <p class="mt-4 text-xs text-neutral-body">
      Upgrade to a subscription for automated daily matching and email digests.
    </p>
  </section>
</template>
