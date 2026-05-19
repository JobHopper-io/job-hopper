<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { Product, ResumeProduct } from '@/types/database'
import JobCard from '@/components/JobCard.vue'
import FreemiumManualJobSearchPanel from '@/components/FreemiumManualJobSearchPanel.vue'
import { useUserStore } from '@/stores/user'
import { jobsAPI, type MatchedJob, type MatchingStats } from '@/lib/jobs'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { freemiumAPI } from '@/lib/freemium'
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
  subscriptionStatusLabel,
  subscriptionAddonProducts,
  showFreemiumJobSearchCta,
  freemiumCanRunManualJobSearch,
  freemiumJobSearchesRemaining,
  freemiumMaxJobSearches,
  hasActiveSubscription,
} = storeToRefs(userStore)

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

const dashboardBanner = ref<DashboardBanner | null>(null)
const showDashboardBanner = computed(() => isDashboardBannerActive(dashboardBanner.value))

const dashboardBannerMessageHtml = computed(() => markdownToSafeHtml(dashboardBanner.value?.message))

// Filters
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

const overallLoading = computed(() => isLoading.value || isLoadingMatches.value)

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

async function loadMatchesAndStats() {
  isLoadingMatches.value = true
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
        <p class="text-sm text-neutral-body mt-1">
          Your matches update as new opportunities hit the Hopper and as you refine your profile.
        </p>
      </div>

      <!-- Summary cards: Subscription, Add-ons, Profile completion, Matching stats -->
      <div class="grid-auto-fill mb-8">
        <!-- Subscription status and tier -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Subscription</h3>
          <div v-if="basePlan">
            <p class="font-heading font-semibold text-brand-charcoal">
            {{ basePlan?.display_name }}
          </p>
          <p class="text-sm text-neutral-body mt-1">
            {{ subscriptionStatusLabel }}
          </p>
          </div>
          <div v-else>
            <p class="text-sm text-neutral-body">No active plan</p>
          </div>          
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Manage plan →
          </router-link>
        </div>

        <!-- Active add-ons -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Active add-ons</h3>
          <div v-if="activeAddonsForDisplay.length" class="space-y-1.5">
            <p v-for="label in activeAddonsForDisplay" :key="label" class="text-sm text-neutral-body">✓ {{ label }}</p>
          </div>
          <p v-else class="text-sm text-neutral-body">None</p>
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Add-ons →
          </router-link>
        </div>

        <!-- Profile completion status (hidden when 100% or dismissed) -->
        <div v-if="showProfileCompletionCard" class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Profile completion</h3>
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2.5 bg-neutral-bg rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="profileCompletion.percent === 100 ? 'bg-green-500' : profileCompletion.percent >= 50 ? 'bg-brand-primary' : 'bg-amber-500'"
                :style="{ width: `${profileCompletion.percent}%` }"
              />
            </div>
            <span class="text-sm font-semibold text-brand-charcoal tabular-nums">{{ profileCompletion.percent }}%</span>
          </div>
          <p class="text-xs text-neutral-body mt-2">
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

        <!-- Matching statistics -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Matching statistics</h3>
          <div class="space-y-2 text-sm">
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">This week:</span>
              {{ matchingStats.thisWeek != null ? matchingStats.thisWeek : '—' }}
            </p>
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">Total delivered:</span>
              {{ matchingStats.totalDelivered != null ? matchingStats.totalDelivered : '—' }}
            </p>
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">Avg. match score:</span>
              {{ matchingStats.avgMatchScore != null ? matchingStats.avgMatchScore : '—' }}
            </p>
          </div>
        </div>
      </div>

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

      <!-- Recent job matches -->
      <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
        Recent job matches
      </h2>
      <div class="card p-6 mb-8">
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
            <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
              No jobs match your filters.
            </h2>
            <p class="text-neutral-body mb-6">
              Try clearing one or more filters to see more of your matches.
            </p>
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
            @toggle-save="handleToggleSave"
            @refresh-advice="loadMatchesAndStats"
          />
        </div>
      </template>
    </div>
  </div>
</template>
