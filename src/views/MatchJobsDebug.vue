<script setup lang="ts">
// __TEST_ONLY_START__ — Entire view is for test-job-matching debugging. Remove this file, the route in router, and src/lib/test-job-matching.ts before production.

import { ref, onMounted, computed, reactive } from 'vue'
import { profileAPI } from '@/lib/profile'
import {
  jobMatchingTestAPI,
  DEFAULT_TEST_MATCH_CONFIG,
  type MatchJobsResponse,
  type RankedJob,
  type MatchJobsDebugPayload,
  type SubscriberPreferencesOverride,
  type MatchConfigOverride,
} from '@/lib/test-job-matching'
import type { Profile } from '@/types/database'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<MatchJobsResponse | null>(null)

// Preferences form (defaults from user profile)
const prefsForm = reactive<{
  roles: string
  currentJobTitle: string
  currentIndustry: string
  payRangeMin: string
  payRangeMax: string
  preferredLocations: string[]
  openToRelocation: boolean
  openToRemote: boolean
  locationRadiusMiles: string
}>({
  roles: '',
  currentJobTitle: '',
  currentIndustry: '',
  payRangeMin: '',
  payRangeMax: '',
  preferredLocations: [],
  openToRelocation: false,
  openToRemote: false,
  locationRadiusMiles: '',
})

// Match config form (defaults from DEFAULT_TEST_MATCH_CONFIG)
const configForm = reactive<MatchConfigOverride>({
  keywordWeights: { ...DEFAULT_TEST_MATCH_CONFIG.keywordWeights },
  payWeights: { ...DEFAULT_TEST_MATCH_CONFIG.payWeights },
  locationWeights: { ...DEFAULT_TEST_MATCH_CONFIG.locationWeights },
  recencyWeights: { ...DEFAULT_TEST_MATCH_CONFIG.recencyWeights },
  thresholds: { ...DEFAULT_TEST_MATCH_CONFIG.thresholds },
})

const JOBS_PER_PAGE = 25
const currentPage = ref(1)

const jobs = computed<RankedJob[]>(() => result.value?.jobs ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil(jobs.value.length / JOBS_PER_PAGE)))
const pagedJobs = computed(() => {
  const start = (currentPage.value - 1) * JOBS_PER_PAGE
  return jobs.value.slice(start, start + JOBS_PER_PAGE)
})
const pageRangeLabel = computed(() => {
  if (jobs.value.length === 0) return '0'
  const start = (currentPage.value - 1) * JOBS_PER_PAGE + 1
  const end = Math.min(currentPage.value * JOBS_PER_PAGE, jobs.value.length)
  return `${start}–${end}`
})

const debug = computed<MatchJobsDebugPayload | null>(
  () => result.value?.debug ?? null,
)

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

function profileToPrefsForm(p: Profile | null) {
  if (!p) return
  prefsForm.roles = Array.isArray(p.target_role_categories)
    ? (p.target_role_categories as string[]).join(', ')
    : ''
  prefsForm.currentJobTitle = p.current_job_title ?? ''
  prefsForm.currentIndustry = p.current_industry ?? ''
  prefsForm.payRangeMin = p.desired_salary_min != null ? String(p.desired_salary_min) : ''
  prefsForm.payRangeMax = p.desired_salary_max != null ? String(p.desired_salary_max) : ''
  prefsForm.preferredLocations = Array.isArray(p.preferred_locations)
    ? (p.preferred_locations as string[]).slice()
    : []
  prefsForm.openToRelocation = p.open_to_relocation === true
  prefsForm.openToRemote = p.open_to_remote === true
  prefsForm.locationRadiusMiles =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p as any).location_radius_miles != null ? String((p as any).location_radius_miles) : ''
}

function buildPreferencesOverride(): SubscriberPreferencesOverride {
  const roles = prefsForm.roles
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    roles: roles.length ? roles : undefined,
    currentJobTitle: prefsForm.currentJobTitle || null,
    currentIndustry: prefsForm.currentIndustry || null,
    payRangeMin:
      prefsForm.payRangeMin !== '' && !Number.isNaN(Number(prefsForm.payRangeMin))
        ? Number(prefsForm.payRangeMin)
        : undefined,
    payRangeMax:
      prefsForm.payRangeMax !== '' && !Number.isNaN(Number(prefsForm.payRangeMax))
        ? Number(prefsForm.payRangeMax)
        : undefined,
    preferredLocations:
      prefsForm.preferredLocations.length > 0 ? prefsForm.preferredLocations : undefined,
    openToRelocation: prefsForm.openToRelocation,
    openToRemote: prefsForm.openToRemote,
    locationRadiusMiles:
      prefsForm.locationRadiusMiles !== '' && !Number.isNaN(Number(prefsForm.locationRadiusMiles))
        ? Number(prefsForm.locationRadiusMiles)
        : undefined,
  }
}

function buildMatchConfigOverride(): MatchConfigOverride {
  return {
    keywordWeights: { ...configForm.keywordWeights },
    payWeights: { ...configForm.payWeights },
    locationWeights: { ...configForm.locationWeights },
    recencyWeights: { ...configForm.recencyWeights },
    thresholds: { ...configForm.thresholds },
  }
}

async function resetToDefaults() {
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  profileToPrefsForm(profile ?? null)
  configForm.keywordWeights = { ...DEFAULT_TEST_MATCH_CONFIG.keywordWeights }
  configForm.payWeights = { ...DEFAULT_TEST_MATCH_CONFIG.payWeights }
  configForm.locationWeights = { ...DEFAULT_TEST_MATCH_CONFIG.locationWeights }
  configForm.recencyWeights = { ...DEFAULT_TEST_MATCH_CONFIG.recencyWeights }
  configForm.thresholds = { ...DEFAULT_TEST_MATCH_CONFIG.thresholds }
}

async function loadMatches() {
  isLoading.value = true
  errorMessage.value = null

  const { data, error } = await jobMatchingTestAPI.getTestMatches({
    preferencesOverride: buildPreferencesOverride(),
    matchConfigOverride: buildMatchConfigOverride(),
  })

  if (error) {
    errorMessage.value = error.message
    result.value = null
  } else {
    result.value = data
    currentPage.value = 1
  }

  isLoading.value = false
}

onMounted(async () => {
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  profileToPrefsForm(profile ?? null)
})
// __TEST_ONLY_END__
</script>

<template>
  <!-- TEMPORARY TEST PAGE – DO NOT SHIP TO PRODUCTION -->
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- Big warning banner -->
      <div class="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 sm:px-6">
        <h1 class="text-xl sm:text-2xl font-heading font-bold text-red-800 mb-1">
          TEMPORARY MATCHING DEBUG PAGE – DO NOT SHIP TO PRODUCTION
        </h1>
        <p class="text-sm sm:text-base text-red-800">
          This screen is for internal testing of the <code>test-job-matching</code> Edge Function and
          should be removed before launch. Do not link to this page from any user-facing
          navigation.
        </p>
      </div>

      <!-- Preferences & config form -->
      <div class="card p-4 sm:p-6 space-y-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Algorithm input
        </h2>

        <section class="space-y-3">
          <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
            Preferences (defaults from your profile)
          </h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Target roles (comma-separated)</label>
              <input
                v-model="prefsForm.roles"
                type="text"
                class="input w-full"
                placeholder="e.g. Engineering, Product"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Current job title (comma-separated keywords)</label>
              <input
                v-model="prefsForm.currentJobTitle"
                type="text"
                class="input w-full"
                placeholder="e.g. Engineer, Manager"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Current industry (comma-separated keywords)</label>
              <input
                v-model="prefsForm.currentIndustry"
                type="text"
                class="input w-full"
                placeholder="e.g. Tech, Finance"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Desired salary min</label>
              <input
                v-model="prefsForm.payRangeMin"
                type="number"
                class="input w-full"
                placeholder="Annual"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Desired salary max</label>
              <input
                v-model="prefsForm.payRangeMax"
                type="number"
                class="input w-full"
                placeholder="Annual"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Location radius (miles)</label>
              <input
                v-model="prefsForm.locationRadiusMiles"
                type="number"
                min="0"
                class="input w-full"
                placeholder="e.g. 25"
              >
            </div>
            <div>
              <PreferredLocationsInput
                v-model="prefsForm.preferredLocations"
                label="Preferred locations"
                input-id="debug-preferred-locations"
              />
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="prefsForm.openToRelocation"
                  type="checkbox"
                  class="rounded border-neutral-border"
                >
                <span class="text-sm text-neutral-body">Open to relocation</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="prefsForm.openToRemote"
                  type="checkbox"
                  class="rounded border-neutral-border"
                >
                <span class="text-sm text-neutral-body">Open to remote</span>
              </label>
            </div>
          </div>
        </section>

        <section class="space-y-3 border-t border-neutral-border pt-4">
          <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
            Match config (defaults from algorithm)
          </h3>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-2">
              <p class="text-xs font-semibold text-neutral-body">Keyword weights</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.keywordWeights!.currentJobTitleKeyword"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when a current job title keyword (comma-separated) appears in the job"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when a current job title keyword (comma-separated) appears in the job">currentJobTitleKeyword</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.keywordWeights!.currentIndustryKeyword"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when a current industry keyword (comma-separated) appears in the job"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when a current industry keyword (comma-separated) appears in the job">currentIndustryKeyword</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold text-neutral-body">Pay weights</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.payWeights!.insideRange"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job salary range overlaps your desired range"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job salary range overlaps your desired range">insideRange</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.payWeights!.nearRange"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job salary is slightly above or below your range (within tolerance)"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job salary is slightly above or below your range (within tolerance)">nearRange</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.payWeights!.missingSalary"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job has no salary listed"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job has no salary listed">missingSalary</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.payWeights!.belowRangePenalty"
                    type="number"
                    class="input w-20 text-sm"
                    title="Penalty when job salary is below your range (beyond tolerance)"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Penalty when job salary is below your range (beyond tolerance)">belowRangePenalty</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold text-neutral-body">Location weights</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.locationWeights!.sameMetro"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job location matches a preferred location (metro)"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job location matches a preferred location (metro)">sameMetro</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.locationWeights!.sameState"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job is in same state/region as a preferred location"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job is in same state/region as a preferred location">sameState</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.locationWeights!.remotePreferred"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job is remote and you are open to remote"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job is remote and you are open to remote">remotePreferred</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.locationWeights!.relocationAllowed"
                    type="number"
                    class="input w-20 text-sm"
                    title="Score when job is outside preferred locations but you are open to relocation"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Score when job is outside preferred locations but you are open to relocation">relocationAllowed</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.locationWeights!.otherLocationPenalty"
                    type="number"
                    class="input w-20 text-sm"
                    title="Penalty when job is in a non-preferred location and you are not open to relocation"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Penalty when job is in a non-preferred location and you are not open to relocation">otherLocationPenalty</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold text-neutral-body">Recency weights</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.recencyWeights!.baseRecency"
                    type="number"
                    step="0.1"
                    class="input w-20 text-sm"
                    title="Base score for job recency; decay is applied per day"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Base score for job recency; decay is applied per day">baseRecency</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.recencyWeights!.perDayDecay"
                    type="number"
                    step="0.01"
                    class="input w-20 text-sm"
                    title="Amount subtracted from recency score per day since posted"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Amount subtracted from recency score per day since posted">perDayDecay</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.recencyWeights!.maxAgeDays"
                    type="number"
                    class="input w-20 text-sm"
                    title="Jobs older than this many days are excluded (recency score becomes -Infinity)"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Jobs older than this many days are excluded (recency score becomes -Infinity)">maxAgeDays</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold text-neutral-body">Thresholds</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.thresholds!.minTotalScore"
                    type="number"
                    class="input w-20 text-sm"
                    title="Minimum total score for a job to be included in results"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Minimum total score for a job to be included in results">minTotalScore</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.thresholds!.noKeywordMatchPenalty"
                    type="number"
                    class="input w-20 text-sm"
                    title="Penalty when user has title/industry keywords but the job matches none (job is excluded if score drops below half this)"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Penalty when user has title/industry keywords but the job matches none (job is excluded if score drops below half this)">noKeywordMatchPenalty</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.thresholds!.overPayTolerancePct"
                    type="number"
                    step="0.01"
                    class="input w-20 text-sm"
                    title="Tolerance (e.g. 0.25 = 25%) above your max salary still counts as nearRange"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Tolerance (e.g. 0.25 = 25%) above your max salary still counts as nearRange">overPayTolerancePct</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="configForm.thresholds!.underPayTolerancePct"
                    type="number"
                    step="0.01"
                    class="input w-20 text-sm"
                    title="Tolerance (e.g. 0.15 = 15%) below your min salary still counts as nearRange"
                  >
                  <span class="text-[11px] text-neutral-body truncate" title="Tolerance (e.g. 0.15 = 15%) below your min salary still counts as nearRange">underPayTolerancePct</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            class="btn-primary"
            :disabled="isLoading"
            @click="loadMatches"
          >
            <span v-if="isLoading">Running…</span>
            <span v-else>Run matching</span>
          </button>
          <button
            type="button"
            class="btn-secondary"
            :disabled="isLoading"
            @click="resetToDefaults"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <!-- Error state -->
      <div v-if="errorMessage" class="card border border-red-300 bg-red-50 p-4 sm:p-6">
        <h2 class="text-lg font-heading font-semibold text-red-800 mb-2">
          Error invoking <code>test-job-matching</code>
        </h2>
        <p class="text-sm text-red-800 whitespace-pre-line">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Summary & debug (filters, scores, keywords only) -->
      <div v-if="result" class="card p-4 sm:p-6 space-y-2">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Match summary
        </h2>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Profile:</span>
          <code>{{ result.profile_id }}</code>
        </p>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Matched jobs:</span>
          {{ result.total }}
          <span v-if="result.total > 0">(showing {{ pageRangeLabel }} of {{ result.total }})</span>
        </p>

        <div v-if="debug" class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Filters
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Jobs fetched:</span>
              <span>{{ debug.filters.totalJobs }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">After filters:</span>
              <span>{{ debug.filters.includedAfterFilters }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by role:</span>
              <span>{{ debug.filters.excludedByRole }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by remote opt-out:</span>
              <span>{{ debug.filters.excludedByRemoteOptOut }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by location/recency:</span>
              <span>{{ debug.filters.excludedByLocation }}</span>
            </p>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Score statistics & top keywords
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Score range:</span>
              <span>
                <span v-if="debug.scores.minScore !== null">
                  {{ debug.scores.minScore.toFixed(2) }}
                  –
                  {{ debug.scores.maxScore?.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Max possible score:</span>
              <span>{{ debug.scores.maxPossibleScore ?? '—' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average total score:</span>
              <span>
                <span v-if="debug.scores.averageScore !== null">
                  {{ debug.scores.averageScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average role score:</span>
              <span>
                <span v-if="debug.scores.averageRoleScore !== null">
                  {{ debug.scores.averageRoleScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average location score:</span>
              <span>
                <span v-if="debug.scores.averageLocationScore !== null">
                  {{ debug.scores.averageLocationScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average recency score:</span>
              <span>
                <span v-if="debug.scores.averageRecencyScore !== null">
                  {{ debug.scores.averageRecencyScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>

            <div class="mt-2">
              <p class="text-xs font-semibold text-neutral-body mb-1">
                Keywords (all — from current job title + industry, comma-separated)
              </p>
              <ul class="text-[11px] text-neutral-body max-h-32 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
                <li v-if="!debug.keywords.length">None</li>
                <li
                  v-for="kw in debug.keywords"
                  v-else
                  :key="kw.keyword"
                  class="flex justify-between gap-2"
                >
                  <span class="truncate">{{ kw.keyword }}</span>
                  <span class="font-mono text-[10px]">
                    {{ kw.matchedJobCount }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Jobs table (paginated) -->
      <div v-if="jobs.length" class="card p-0 overflow-hidden">
        <div class="px-3 py-2 border-b border-neutral-border bg-neutral-surface flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm text-neutral-body">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-secondary text-sm py-1 px-2"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              Previous
            </button>
            <button
              type="button"
              class="btn-secondary text-sm py-1 px-2"
              :disabled="currentPage >= totalPages"
              @click="goToPage(currentPage + 1)"
            >
              Next
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-neutral-border text-xs sm:text-sm">
            <thead class="bg-neutral-surface">
              <tr>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Score / % of max</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Title</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Company</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Created</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Role / Location / Recency
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Matched role keywords
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-border bg-white">
              <tr v-for="job in pagedJobs" :key="job.id" class="align-top">
                <td class="px-3 py-2 whitespace-nowrap font-mono text-xs">
                  {{ job.score.toFixed(2) }}
                  <span v-if="debug?.scores?.maxPossibleScore != null && debug.scores.maxPossibleScore > 0">
                    ({{ ((100 * job.score) / debug.scores.maxPossibleScore).toFixed(1) }}%)
                  </span>
                </td>
                <td class="px-3 py-2">
                  <div class="font-semibold text-brand-charcoal">
                    {{ job.title || '(no title)' }}
                  </div>
                  <div class="text-[10px] text-neutral-body">
                    #{{ job.id }}
                  </div>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.companyName || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.location || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ new Date(job.createdAt).toLocaleString() }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  <div>Role: {{ job.components?.role ?? '—' }}</div>
                  <div>Location: {{ job.components?.location ?? '—' }}</div>
                  <div>Recency: {{ job.components?.recency != null ? job.components.recency.toFixed(2) : '—' }}</div>
                </td>
                <td class="px-3 py-2 text-neutral-body">
                  <span v-if="job.matchedRoleKeywords?.length">
                    {{ job.matchedRoleKeywords.join(', ') }}
                  </span>
                  <span v-else>—</span>
                </td>
                <td class="px-3 py-2 text-neutral-body">
                  <details class="space-y-1 max-w-xs sm:max-w-md">
                    <summary class="cursor-pointer text-brand-primary underline">
                      View text fields
                    </summary>
                    <div v-if="job.description">
                      <div class="font-semibold text-xs mb-0.5">Description</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.description }}
                      </p>
                    </div>
                    <div v-if="job.aiBriefing" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Highlights</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.aiBriefing }}
                      </p>
                    </div>
                    <div v-if="job.applyLink" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Apply link</div>
                      <a
                        :href="job.applyLink"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[11px] text-brand-primary underline break-all"
                      >
                        {{ job.applyLink }}
                      </a>
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="!isLoading" class="card p-4 sm:p-6">
        <p class="text-sm text-neutral-body">
          No jobs matched for the current input.
        </p>
      </div>
    </div>
  </div>
</template>
