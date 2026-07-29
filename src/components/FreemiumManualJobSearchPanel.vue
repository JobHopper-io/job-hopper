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
  /** Matching Statistics, folded into this tile so the rail doesn't need a second stat card. */
  matchesThisWeek: number
  avgMatchScore: number | null
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
    class="rounded-[16px] border border-[#D3E3F9] bg-[#EAF1FC] p-5"
    aria-label="Manual job search"
  >
    <div class="mb-1.5 flex items-center gap-3">
      <img :src="jobHopperRabbitLogo" alt="" class="h-9 w-9 shrink-0" />
      <h2 class="text-base font-heading font-semibold text-brand-charcoal">Run another job search</h2>
    </div>
    <p class="text-sm text-neutral-body">
      Search for roles matching your skills. Results are saved to your matches list.
    </p>

    <div class="mt-4">
      <div class="mb-1 flex items-center justify-between text-xs text-neutral-body">
        <span>{{ usedSearches }} of {{ maxSearches }} searches used</span>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
        <div
          class="h-full rounded-full bg-brand-primary transition-all"
          :style="{ width: `${usagePercent}%` }"
        />
      </div>
    </div>

    <p v-if="message" class="mt-3 text-sm text-green-700">{{ message }}</p>
    <div
      v-else-if="showOneRemainingNudge"
      class="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      Just 1 free search left. Make it count, or upgrade anytime.
    </div>

    <div class="mt-4 flex flex-col items-stretch gap-2">
      <button
        v-if="canRun"
        type="button"
        class="btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="emit('run')"
      >
        <font-awesome-icon
          v-if="loading"
          :icon="['fas', 'spinner']"
          spin
          class="h-4 w-4"
          aria-hidden="true"
        />
        {{ loading ? 'Searching…' : 'Run job search' }}
      </button>
      <span
        v-else
        class="inline-flex items-center justify-center gap-2 rounded-[12px] border border-neutral-border bg-white/60 px-4 py-2.5 text-sm font-medium text-neutral-body"
      >
        <font-awesome-icon :icon="['fas', 'lock']" class="text-xs" aria-hidden="true" />
        Upgrade to continue
      </span>
      <router-link
        :to="{ name: 'billing-purchase' }"
        class="text-center text-sm font-medium text-brand-primary hover:underline"
      >
        View plans
      </router-link>
    </div>

    <div class="mt-4 border-t border-[#D3E3F9] pt-3 text-xs text-neutral-body">
      {{ matchesThisWeek }} match{{ matchesThisWeek === 1 ? '' : 'es' }} delivered this week<template v-if="avgMatchScore != null"> · {{ avgMatchScore }} avg match score</template>
    </div>
  </section>
</template>
