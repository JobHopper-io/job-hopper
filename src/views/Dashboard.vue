<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { ApplicationStatus, Product, ResumeProduct } from '@/types/database'
import JobCard from '@/components/JobCard.vue'
import FreemiumManualJobSearchPanel from '@/components/FreemiumManualJobSearchPanel.vue'
import FeatureTeaserCard from '@/components/FeatureTeaserCard.vue'
import ApplicationTrackerCard from '@/components/ApplicationTrackerCard.vue'
import PostCheckoutConfirmation from '@/components/PostCheckoutConfirmation.vue'
import { useUserStore } from '@/stores/user'
import { jobsAPI, type MatchedJob, type MatchingStats } from '@/lib/jobs'
import { applicationsAPI, type TrackedApplicationRow } from '@/lib/applications'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { freemiumAPI } from '@/lib/freemium'
import { getProductPrice } from '@/lib/subscription'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import { dashboardBannerAPI, isDashboardBannerActive } from '@/lib/dashboardBanner'
import { markdownToSafeHtml } from '@/lib/markdown'
import type { DashboardBanner } from '@/types/database'
import jobHopperRabbitLogo from '@/assets/job-hopper-rabbit.png'

const PROFILE_COMPLETION_DISMISSED_KEY = 'profileCompletionCardDismissed'

const userStore = useUserStore()
const {
  profile,
  isLoading,
  basePlan,
  baseTier,
  subscriptionStatusLabel,
  subscriptionAddonProducts,
  showFreemiumJobSearchCta,
  freemiumCanRunManualJobSearch,
  freemiumJobSearchesRemaining,
  freemiumMaxJobSearches,
  hasActiveSubscription,
  trialEndsAt,
  trialProducts,
} = storeToRefs(userStore)

// Users only ever see three plan labels — Free / Core / Premium — never the raw
// product display_name. Legacy career-level plans all resolve to "Core" via baseTier;
// career level still drives matching under the hood but is not surfaced here.
const baseTierLabel = computed(
  () => baseTier.value.charAt(0).toUpperCase() + baseTier.value.slice(1),
)

const trialChargeDateLabel = computed(() => {
  if (!trialEndsAt.value) return ''
  return new Date(trialEndsAt.value).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
})

const trialAmountLabel = computed(() => {
  const basePlanTrialProduct = trialProducts.value.find((p) => p.category === 'base_plan')
  if (!basePlanTrialProduct) return ''
  return `$${getProductPrice(basePlanTrialProduct)}`
})

const profileCompletionDismissed = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(PROFILE_COMPLETION_DISMISSED_KEY) === '1'
)
function dismissProfileCompletion() {
  profileCompletionDismissed.value = true
  try {
    localStorage.setItem(PROFILE_COMPLETION_DISMISSED_KEY, '1')
  } catch {
    // ignore localStorage errors (e.g. private mode)
  }
}

const matches = ref<MatchedJob[]>([])
const adviceByMatchId = ref<Record<string, ResumeProduct>>({})
const isLoadingMatches = ref(false)
const matchesError = ref<string | null>(null)
const freemiumSearchLoading = ref(false)
const freemiumSearchMessage = ref<string | null>(null)

// Subscriber (Core/Premium) on-demand manual search — distinct from the freemium path.
const subscriberSearchLoading = ref(false)
const subscriberSearchMessage = ref<string | null>(null)

const dashboardBanner = ref<DashboardBanner | null>(null)
const showDashboardBanner = computed(() => isDashboardBannerActive(dashboardBanner.value))

const dashboardBannerMessageHtml = computed(() => markdownToSafeHtml(dashboardBanner.value?.message))

// Filters
/** Hidden to match the current dashboard design; filtering logic stays wired in case the panel returns. */
const showFiltersPanel = false
const selectedRoleTypes = ref<RoleCategoryValue[]>([])
const selectedLocation = ref('')
const salaryRange = ref<[number, number]>([0, 200000])
const showSavedOnly = ref(false)

// Dynamic greeting
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const userName = computed(() => {
  return profile.value?.first_name || ''
})

const activeAddonsForDisplay = computed(() =>
  subscriptionAddonProducts.value.map((p: Product) => p.display_name),
)

// Free-tier teaser copy: first items shown, the rest blurred behind an upgrade lock.
// Illustrative only — real values come from the paid Resume Advice / Premium Insights flows.
const resumeAdviceTeaser = {
  real: [
    '✓ Strong keyword match for your target title',
    '✓ Experience level aligns with the roles you want',
  ],
  blurred: [
    '○ Skills to highlight so you pass ATS screens',
    '○ Sections worth adding to your resume',
    '○ Estimated salary band for your profile',
  ],
}
const premiumInsightsTeaser = {
  real: [
    '→ See which employers are actively hiring now',
    '→ How your profile ranks against the role',
  ],
  blurred: [
    '→ Visa sponsorship likelihood score',
    '→ Average time from application to offer',
    '→ Hiring manager contact identified',
  ],
}

// The daily-job-matching edge function always schedules the next run for the
// following day (randomized time, stored server-side in `scheduled_jobs` and not
// exposed to the client), so "tomorrow" is the accurate user-facing cadence.
const nextDigestLabel = 'tomorrow'

// Application Tracker: inline status tagging for job cards (Core+).
const trackedApplications = ref<TrackedApplicationRow[]>([])
const applicationsLoading = ref(false)

/** Map of matchId -> application status for quick lookup per JobCard. */
const applicationStatusByMatchId = computed<Record<string, ApplicationStatus>>(() => {
  const map: Record<string, ApplicationStatus> = {}
  for (const app of trackedApplications.value) {
    map[app.matchId] = app.status
  }
  return map
})

async function loadApplications() {
  applicationsLoading.value = true
  try {
    const { data, error } = await applicationsAPI.getAll()
    if (!error) trackedApplications.value = data
  } finally {
    applicationsLoading.value = false
  }
}

async function handleUpdateApplicationStatus(matchId: string, status: ApplicationStatus | null) {
  if (status) {
    const { error } = await applicationsAPI.setStatus(matchId, status)
    if (error) return
  } else {
    const { error } = await applicationsAPI.remove(matchId)
    if (error) return
  }
  await loadApplications()
}

async function handleRemoveApplication(matchId: string) {
  const { error } = await applicationsAPI.remove(matchId)
  if (!error) await loadApplications()
}

// Profile completion: key fields that improve matching
const profileCompletion = computed(() => {
  const p = profile.value
  if (!p) return { filled: 0, total: 8, percent: 0 }
  const fields = [
    !!p.first_name?.trim(),
    !!p.last_name?.trim(),
    !!p.current_job_title?.trim(),
    !!p.target_job_title?.trim(),
    (p.target_role_categories?.length ?? 0) > 0,
    (p.desired_salary_min != null || p.desired_salary_max != null) || (p.preferred_locations?.length ?? 0) > 0,
    p.years_of_experience != null,
    !!p.resume_bucket_key
  ]
  const filled = fields.filter(Boolean).length
  return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100) }
})

const showProfileCompletionCard = computed(
  () => profileCompletion.value.percent < 100 && !profileCompletionDismissed.value
)

const matchingStats = ref<MatchingStats>({
  thisWeek: 0,
  totalDelivered: 0,
  avgMatchScore: null,
})

// Core automated-matching status line: real "matches this week" count from stats.
const matchesThisWeekLabel = computed(() => {
  const n = matchingStats.value.thisWeek ?? 0
  return `${n} new match${n === 1 ? '' : 'es'} this week`
})

const overallLoading = computed(() => isLoading.value || isLoadingMatches.value)

const savedCount = computed(() => matches.value.filter((m) => m.isSaved).length)

const filteredMatches = computed(() => {
  let result = matches.value

  if (showSavedOnly.value) {
    result = result.filter((m) => m.isSaved)
  }

  const location = selectedLocation.value.trim().toLowerCase()
  if (location) {
    result = result.filter((m) =>
      (m.location ?? '').toLowerCase().includes(location),
    )
  }

  // Placeholder: salary and role-type filtering can be layered in here
  // once those attributes are available on MatchedJob/job metadata.

  return result
})

const showFreemiumExhaustedUpgrade = computed(
  () =>
    !hasActiveSubscription.value &&
    freemiumMaxJobSearches.value > 0 &&
    freemiumJobSearchesRemaining.value === 0,
)

const freemiumJobSearchesUsed = computed(() =>
  Math.max(0, freemiumMaxJobSearches.value - freemiumJobSearchesRemaining.value),
)

async function runFreemiumJobSearch() {
  if (!freemiumCanRunManualJobSearch.value) return
  freemiumSearchMessage.value = null
  matchesError.value = null
  freemiumSearchLoading.value = true
  try {
    const { data, error } = await freemiumAPI.runJobSearch()
    if (error) {
      matchesError.value = error.message
      return
    }
    if (data) {
      freemiumSearchMessage.value =
        data.matchesCreated > 0
          ? `Added ${data.matchesCreated} new match${data.matchesCreated === 1 ? '' : 'es'}.`
          : 'Search completed; no new matches met the bar this time. Try again later or adjust your profile.'
    }
    await userStore.refreshFreemium()
    await loadMatchesAndStats()
  } finally {
    freemiumSearchLoading.value = false
  }
}

async function runSubscriberJobSearch() {
  if (subscriberSearchLoading.value) return
  subscriberSearchMessage.value = null
  matchesError.value = null
  subscriberSearchLoading.value = true
  try {
    const { data, error } = await jobsAPI.runManualJobSearch()
    if (error) {
      matchesError.value = error.message
      return
    }
    if (data) {
      subscriberSearchMessage.value =
        data.matchesCreated > 0
          ? `Added ${data.matchesCreated} new match${data.matchesCreated === 1 ? '' : 'es'}.`
          : 'Search completed; no new matches met the bar this time. Check back after the next digest or refine your profile.'
    }
    await loadMatchesAndStats()
  } finally {
    subscriberSearchLoading.value = false
  }
}

async function loadMatchesAndStats(options?: { silent?: boolean }) {
  if (!options?.silent) {
    isLoadingMatches.value = true
  }
  matchesError.value = null
  try {
    const [matchesResult, statsResult, tailoringResult] = await Promise.all([
      jobsAPI.getJobMatches(),
      jobsAPI.getMatchingStats(),
      resumeProductsAPI.getTailoringPurchasesByMatchId(),
    ])

    if (matchesResult.error) {
      matchesError.value = matchesResult.error.message
      matches.value = []
    } else {
      matches.value = matchesResult.data
    }

    if (!statsResult.error) {
      matchingStats.value = statsResult.data
    }

    if (!tailoringResult.error) {
      adviceByMatchId.value = tailoringResult.data
    } else {
      adviceByMatchId.value = {}
    }
    void userStore.refreshFreemium()
  } finally {
    isLoadingMatches.value = false
  }
}

async function handleToggleSave(matchId: string, isSaved: boolean) {
  if (isSaved) {
    await jobsAPI.unsaveJob(matchId)
  } else {
    await jobsAPI.saveJob(matchId)
  }
  const { data } = await jobsAPI.getJobMatches()
  matches.value = data
}

watch(profile, () => {
  // Filters start neutral; do not auto-populate from profile.
})

async function loadDashboardBanner() {
  const { data } = await dashboardBannerAPI.get()
  dashboardBanner.value = data
}

onMounted(() => {
  void loadMatchesAndStats()
  void loadApplications()
  void loadDashboardBanner()
})
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div
        v-if="showDashboardBanner && dashboardBanner"
        class="mb-8 rounded-2xl bg-brand-primary shadow-lg ring-1 ring-black/5"
        role="region"
        aria-label="Announcement"
      >
        <div
          class="px-5 py-4 sm:px-8 sm:py-5 text-center font-heading [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-white/70 hover:[&_a]:decoration-white"
        >
          <div
            class="prose prose-invert prose-sm sm:prose-base max-w-none mx-auto text-center text-white [text-wrap:balance] prose-headings:font-heading prose-headings:font-semibold prose-headings:text-white prose-p:text-white prose-p:leading-snug prose-p:my-2 prose-li:text-white prose-li:marker:text-white prose-strong:text-white prose-em:text-white prose-a:text-white prose-blockquote:text-white prose-code:text-white prose-pre:text-white first:prose-p:mt-0 last:prose-p:mb-0"
            v-html="dashboardBannerMessageHtml"
          />
        </div>
      </div>

      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">
          {{ greeting }}, {{ userName }}
        </h1>
        <p class="text-neutral-body">
          Here are your latest job matches.
        </p>
        <!-- Implies background/automated matching — hidden on Free, which is manual-only. -->
        <p v-if="baseTier !== 'free'" class="text-sm text-neutral-body mt-1">
          Your matches update as new opportunities hit the Hopper and as you refine your profile.
        </p>
      </div>

      <PostCheckoutConfirmation />

      <!-- Summary cards: Subscription, Add-ons, Matching stats, Profile strength -->
      <div class="grid-auto-fill mb-8">
        <!-- Subscription status and tier -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Subscription</h3>
          <!-- Free tier: plain, low-pressure upgrade prompt (no urgency styling). -->
          <template v-if="baseTier === 'free'">
            <p class="font-heading font-semibold text-brand-charcoal">Free</p>
            <p class="text-sm text-neutral-body mt-1">No card on file</p>
            <router-link
              :to="{ name: 'billing-purchase' }"
              class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline"
            >
              Upgrade
            </router-link>
          </template>
          <template v-else>
            <div v-if="basePlan">
              <p class="font-heading font-semibold text-brand-charcoal">
                {{ baseTierLabel }}
              </p>
              <p class="text-sm text-neutral-body mt-1">
                {{ subscriptionStatusLabel }}
              </p>
              <p v-if="trialEndsAt" class="text-sm text-neutral-body mt-1">
                Billing begins {{ trialChargeDateLabel }} · {{ trialAmountLabel }}/mo
              </p>
              <p class="text-sm text-neutral-body mt-1">
                Next digest: {{ nextDigestLabel }}
              </p>
            </div>
            <div v-else>
              <p class="text-sm text-neutral-body">No active plan</p>
            </div>
            <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
              Manage plan →
            </router-link>
          </template>
        </div>

        <!-- Active add-ons -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Active add-ons</h3>
          <p class="font-heading font-semibold text-brand-charcoal">
            {{ activeAddonsForDisplay.length }} active
          </p>
          <p class="text-sm text-neutral-body mt-1">
            {{ activeAddonsForDisplay.length ? activeAddonsForDisplay.join(' + ') : 'No add-ons yet' }}
          </p>
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Add-ons →
          </router-link>
        </div>

        <!-- Matching statistics -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Matching statistics</h3>
          <p class="font-heading font-semibold text-brand-charcoal">
            {{ matchingStats.thisWeek != null ? matchingStats.thisWeek : '—' }} matches
          </p>
          <p class="text-sm text-neutral-body mt-1">This week</p>
          <p class="text-xs text-neutral-body mt-2">
            Total delivered: {{ matchingStats.totalDelivered != null ? matchingStats.totalDelivered : '—' }} · Avg. match score: {{ matchingStats.avgMatchScore != null ? matchingStats.avgMatchScore : '—' }}
          </p>
        </div>

        <!-- Profile strength (hidden when 100% or dismissed) -->
        <div v-if="showProfileCompletionCard" class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Profile strength</h3>
          <p class="font-heading font-semibold text-brand-charcoal">
            {{ profileCompletion.percent }}%
          </p>
          <p class="text-sm text-neutral-body mt-1">
            {{ profileCompletion.filled }} of {{ profileCompletion.total }} key fields
          </p>
          <div class="mt-2 flex flex-col items-start gap-0.5">
            <router-link to="/profile" class="text-sm text-brand-primary font-medium hover:underline">
              Complete profile →
            </router-link>
            <button
              type="button"
              class="text-xs text-neutral-body hover:text-brand-charcoal hover:underline transition-colors focus:outline-none"
              aria-label="Dismiss this card"
              @click="dismissProfileCompletion"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <!--
        Tier-specific main panel. Switched on baseTier so Core/Premium slot in cleanly.
        Only the Free branch is built in this task.
      -->
      <template v-if="baseTier === 'free'">
        <!-- Manual job search (freemium): below status cards, above Recent matches -->
        <div v-if="showFreemiumJobSearchCta" class="mb-8">
          <FreemiumManualJobSearchPanel
            :centered="false"
            :can-run="freemiumCanRunManualJobSearch"
            :used-searches="freemiumJobSearchesUsed"
            :max-searches="freemiumMaxJobSearches"
            :message="freemiumSearchMessage"
            :loading="freemiumSearchLoading"
            @run="runFreemiumJobSearch"
          />
        </div>

        <!-- Locked upgrade teasers for the paid-only feature depth. -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
          <FeatureTeaserCard
            title="Resume Advice"
            :real-fields="resumeAdviceTeaser.real"
            :blurred-fields="resumeAdviceTeaser.blurred"
          />
          <FeatureTeaserCard
            title="Premium Insights"
            :real-fields="premiumInsightsTeaser.real"
            :blurred-fields="premiumInsightsTeaser.blurred"
          />
        </div>
      </template>

      <!--
        Core tier: automated-matching status, Application Tracker, and fully
        unblurred Resume Advice + Premium Insights. Also serves the 6 legacy trial
        plans (entry_mid / senior_management / director_vp_c_level), which map to
        'core' in the store — they differ only by the subscription card's plan name.
      -->
      <template v-else-if="baseTier === 'core'">
        <!-- Automated matching status (success-tinted; the only green surface on the page). -->
        <div class="mb-8 rounded-[12px] border border-green-200 bg-green-50 px-5 py-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <font-awesome-icon
                  :icon="['fas', 'circle-check']"
                  class="text-green-700"
                  aria-hidden="true"
                />
                <p class="font-heading font-semibold text-green-700">Automated matching active</p>
              </div>
              <p class="mt-1 pl-7 text-sm text-green-700">
                Next digest: {{ nextDigestLabel }} · {{ matchesThisWeekLabel }}
              </p>
            </div>
            <!-- On-demand search so a fresh, no-history account isn't stuck waiting for the digest. -->
            <button
              type="button"
              class="btn-primary shrink-0 text-sm inline-flex items-center justify-center gap-2"
              :disabled="subscriberSearchLoading"
              @click="runSubscriberJobSearch"
            >
              <font-awesome-icon
                v-if="subscriberSearchLoading"
                :icon="['fas', 'spinner']"
                spin
                aria-hidden="true"
              />
              {{ subscriberSearchLoading ? 'Searching…' : 'Run job search' }}
            </button>
          </div>
          <p v-if="subscriberSearchMessage" class="mt-3 pl-7 text-sm text-green-700">
            {{ subscriberSearchMessage }}
          </p>
        </div>

        <!-- Application Tracker (compact). -->
        <div class="mb-8">
          <ApplicationTrackerCard
            :applications="trackedApplications"
            @remove="handleRemoveApplication"
          />
        </div>
      </template>

      <!--
        TODO(premium dashboard — task after): render under v-else-if="baseTier === 'premium'".
        Everything in Core plus the five Premium Tools concept cards.
      -->

      <!-- Recent job matches -->
      <div
        v-if="matchesError"
        class="mb-4 rounded-[12px] bg-red-50 text-red-800 px-5 py-4 text-sm"
        role="alert"
      >
        {{ matchesError }}
      </div>
      <div class="flex items-center justify-between gap-3 mb-4">
        <h2 class="text-xl font-heading font-semibold text-brand-charcoal">
          Recent job matches
        </h2>
        <!-- Saved-jobs view: the full filters panel is disabled (showFiltersPanel),
             so this standalone toggle is the one way to see saved jobs. -->
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          :class="showSavedOnly
            ? 'bg-brand-primary text-white shadow-sm hover:opacity-90'
            : 'border border-neutral-border bg-neutral-bg text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30'"
          :aria-pressed="showSavedOnly"
          @click="showSavedOnly = !showSavedOnly"
        >
          <font-awesome-icon :icon="['fas', 'bookmark']" aria-hidden="true" />
          Saved{{ savedCount > 0 ? ` (${savedCount})` : '' }}
        </button>
      </div>
      <div v-if="showFiltersPanel" class="card p-6 mb-8">
        <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">
          Filters
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Role type</label>
            <select v-model="selectedRoleTypes" multiple class="input">
              <option v-for="opt in ROLE_CATEGORIES" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Location</label>
            <input
              v-model="selectedLocation"
              type="text"
              class="input"
              placeholder="City, State"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Salary range</label>
            <div class="flex gap-2">
              <input
                v-model.number="salaryRange[0]"
                type="number"
                class="input"
                placeholder="Min"
              />
              <input
                v-model.number="salaryRange[1]"
                type="number"
                class="input"
                placeholder="Max"
              />
            </div>
          </div>
          <div class="flex items-end">
            <label class="flex items-center">
              <input
                v-model="showSavedOnly"
                type="checkbox"
                class="mr-2 w-4 h-4"
              />
              <span class="text-sm text-neutral-body">Show saved jobs only</span>
            </label>
          </div>
        </div>
        <p class="text-xs text-neutral-body mt-4">
          Use filters to broaden or narrow what you see. Your core preferences still guide your matches behind the scenes.
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="overallLoading" class="text-center py-12">
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Loading...</p>
      </div>

      <!-- Empty State: no matches at all -->
      <div
        v-else-if="matches.length === 0"
        class="card p-12 text-center"
      >
        <div v-if="showFreemiumJobSearchCta && freemiumCanRunManualJobSearch" class="max-w-md mx-auto">
          <p class="text-neutral-body">
            Your matches will show here after you run a job search using the section above.
          </p>
        </div>
        <div v-else-if="showFreemiumJobSearchCta && !freemiumCanRunManualJobSearch" class="max-w-md mx-auto">
          <p class="text-neutral-body">
            You've used all included manual job searches. Use <span class="font-medium text-brand-charcoal">View plans</span>
            in the section above to subscribe for automated matching, or check back if your limits are increased.
          </p>
        </div>
        <div v-else class="max-w-md mx-auto">
          <div class="flex items-center justify-center mx-auto mb-4">
            <img
              :src="jobHopperRabbitLogo"
              alt="Job-Hopper rabbit"
              class="w-14 h-14"
            >
          </div>
          <template v-if="showFreemiumExhaustedUpgrade">
            <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
              You have used all free manual searches
            </h2>
            <p class="text-neutral-body mb-6">
              Subscribe to keep automated matching running in the background, or check back if your limits are increased.
            </p>
            <router-link :to="{ name: 'billing-purchase' }" class="btn-primary inline-block">
              View plans and upgrade
            </router-link>
          </template>
          <template v-else>
            <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
              Your
              <span class="font-heading font-bold text-brand-primary text-3xl tracking-tight leading-none">
                Hopper
              </span>
              is warming up.
            </h2>
            <p class="text-neutral-body mb-6">
              We're scanning new jobs now based on your profile. Check back soon, or loosen your filters to see a wider range of roles.
            </p>
            <router-link to="/profile" class="btn-primary inline-block">
              Review my preferences
            </router-link>
          </template>
        </div>
      </div>

      <!-- Matches exist but filters hide all of them -->
      <template v-else-if="filteredMatches.length === 0">
        <div class="card p-12 text-center">
          <div class="max-w-md mx-auto">
            <template v-if="showSavedOnly && savedCount === 0">
              <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
                No saved jobs yet.
              </h2>
              <p class="text-neutral-body mb-6">
                Tap the bookmark on any job to keep it here for later.
              </p>
            </template>
            <template v-else>
              <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
                No jobs match your filters.
              </h2>
              <p class="text-neutral-body mb-6">
                Try clearing one or more filters to see more of your matches.
              </p>
            </template>
          </div>
        </div>
      </template>

      <!-- Job feed -->
      <template v-else>
        <div class="grid grid-cols-1 gap-6">
          <JobCard
            v-for="job in filteredMatches"
            :key="job.matchId"
            :job="job"
            :advicePurchase="adviceByMatchId[job.matchId] ?? null"
            :applicationStatus="applicationStatusByMatchId[job.matchId] ?? null"
            @toggle-save="handleToggleSave"
            @refresh-advice="() => loadMatchesAndStats({ silent: true })"
            @refresh-job-matches="() => loadMatchesAndStats({ silent: true })"
            @update-application-status="handleUpdateApplicationStatus"
          />
        </div>
      </template>
    </div>
  </div>
</template>
