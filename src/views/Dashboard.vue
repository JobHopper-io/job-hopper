<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { ApplicationStatus, ResumeProduct } from '@/types/database'
import JobCard from '@/components/JobCard.vue'
import FreemiumManualJobSearchPanel from '@/components/FreemiumManualJobSearchPanel.vue'
import FeatureTeaserCard from '@/components/FeatureTeaserCard.vue'
import PostCheckoutConfirmation from '@/components/PostCheckoutConfirmation.vue'
import FilterDropdown from '@/components/FilterDropdown.vue'
import { useUserStore } from '@/stores/user'
import { jobsAPI, type MatchedJob, type MatchingStats } from '@/lib/jobs'
import { applicationsAPI, type TrackedApplicationRow, type JobSnapshot } from '@/lib/applications'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { freemiumAPI } from '@/lib/freemium'
import { getProductPrice } from '@/lib/subscription'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import { formatEmploymentType } from '@/lib/formatJob'
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
const selectedRoleTypes = ref<RoleCategoryValue[]>([])
const selectedLocation = ref('')
const selectedEmploymentTypes = ref<string[]>([])
const selectedWorkModel = ref<('remote' | 'onsite')[]>([])
const selectedDatePosted = ref<'24h' | 'week' | 'month' | null>(null)
const sortOrder = ref<'recommended' | 'newest' | 'pay'>('recommended')
const showSavedOnly = ref(false)

const WORK_MODEL_OPTIONS: { value: 'remote' | 'onsite'; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'Onsite' },
]
const DATE_POSTED_OPTIONS: { value: '24h' | 'week' | 'month'; label: string }[] = [
  { value: '24h', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
]
const SORT_OPTIONS: { value: 'recommended' | 'newest' | 'pay'; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest' },
  { value: 'pay', label: 'Highest pay' },
]

/** Employment-type options are derived from the actual matches instead of a hardcoded list -
 * job_hopper_live.employment_types is free-form text populated by the scraper, not a DB enum,
 * so this stays accurate to whatever casing/wording actually shows up in the data. */
const availableEmploymentTypes = computed(() => {
  const set = new Set<string>()
  for (const m of matches.value) {
    for (const t of m.employmentTypes ?? []) set.add(t)
  }
  return Array.from(set).sort()
})

function toggleInList<T>(list: Ref<T[]>, value: T) {
  list.value = list.value.includes(value) ? list.value.filter((v) => v !== value) : [...list.value, value]
}
const toggleRoleType = (v: RoleCategoryValue) => toggleInList(selectedRoleTypes, v)
const toggleEmploymentType = (v: string) => toggleInList(selectedEmploymentTypes, v)
const toggleWorkModel = (v: 'remote' | 'onsite') => toggleInList(selectedWorkModel, v)

function selectDatePosted(v: '24h' | 'week' | 'month', close: () => void) {
  selectedDatePosted.value = selectedDatePosted.value === v ? null : v
  close()
}
function selectSort(v: 'recommended' | 'newest' | 'pay', close: () => void) {
  sortOrder.value = v
  close()
}

const roleTypeLabel = computed(() => {
  const n = selectedRoleTypes.value.length
  if (n === 0) return 'Job Function'
  const first = ROLE_CATEGORIES.find((r) => r.value === selectedRoleTypes.value[0])?.label ?? selectedRoleTypes.value[0]
  return n === 1 ? first : `${first} (+${n - 1})`
})
const employmentTypeLabel = computed(() => {
  const n = selectedEmploymentTypes.value.length
  if (n === 0) return 'Job Type'
  const first = formatEmploymentType([selectedEmploymentTypes.value[0]]) ?? selectedEmploymentTypes.value[0]
  return n === 1 ? first : `${first} (+${n - 1})`
})
const workModelLabel = computed(() => {
  const n = selectedWorkModel.value.length
  if (n === 0 || n === 2) return 'Work Model'
  return WORK_MODEL_OPTIONS.find((o) => o.value === selectedWorkModel.value[0])?.label ?? 'Work Model'
})
const datePostedLabel = computed(
  () => DATE_POSTED_OPTIONS.find((o) => o.value === selectedDatePosted.value)?.label ?? 'Date Posted',
)
const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.value === sortOrder.value)?.label ?? 'Recommended')

const hasActiveFilters = computed(
  () =>
    selectedRoleTypes.value.length > 0 ||
    selectedEmploymentTypes.value.length > 0 ||
    (selectedWorkModel.value.length > 0 && selectedWorkModel.value.length < 2) ||
    selectedDatePosted.value != null ||
    selectedLocation.value.trim().length > 0,
)
function clearAllFilters() {
  selectedRoleTypes.value = []
  selectedEmploymentTypes.value = []
  selectedWorkModel.value = []
  selectedDatePosted.value = null
  selectedLocation.value = ''
}

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

// Free-tier teaser copy: first items shown, the rest blurred behind an upgrade lock.
// Illustrative only — real values come from the paid Resume Advice / Hiring Intel flows.
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
/** Powers the "Open Applications" link-out card - the full list lives on its own page now. */
const trackedApplicationsCount = computed(() => trackedApplications.value.length)

async function loadApplications() {
  applicationsLoading.value = true
  try {
    const { data, error } = await applicationsAPI.getAll()
    if (!error) trackedApplications.value = data
  } finally {
    applicationsLoading.value = false
  }
}

async function handleUpdateApplicationStatus(
  matchId: string,
  status: ApplicationStatus | null,
  job: JobSnapshot,
) {
  if (status) {
    const { error } = await applicationsAPI.setStatus(matchId, status, job)
    if (error) return
  } else {
    const { error } = await applicationsAPI.remove(matchId)
    if (error) return
  }
  await loadApplications()
}

// Profile completion: key fields that improve matching, itemized so the card can point at
// exactly what's missing instead of just a percentage.
interface ProfileCompletionItem {
  label: string
  done: boolean
}

const profileCompletionItems = computed<ProfileCompletionItem[]>(() => {
  const p = profile.value
  return [
    { label: 'Add your name', done: !!p?.first_name?.trim() && !!p?.last_name?.trim() },
    { label: 'Add your current job title', done: !!p?.current_job_title?.trim() },
    { label: 'Add your target job title', done: !!p?.target_job_title?.trim() },
    { label: 'Select target role categories', done: (p?.target_role_categories?.length ?? 0) > 0 },
    {
      label: 'Add salary expectations or preferred locations',
      done: p?.desired_salary_min != null || p?.desired_salary_max != null || (p?.preferred_locations?.length ?? 0) > 0,
    },
    { label: 'Upload your resume', done: !!p?.resume_bucket_key },
  ]
})

const profileCompletion = computed(() => {
  const items = profileCompletionItems.value
  const filled = items.filter((i) => i.done).length
  return { filled, total: items.length, percent: items.length ? Math.round((filled / items.length) * 100) : 0 }
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

  if (selectedRoleTypes.value.length > 0) {
    result = result.filter((m) => m.roleCategory != null && selectedRoleTypes.value.includes(m.roleCategory))
  }

  if (selectedEmploymentTypes.value.length > 0) {
    result = result.filter((m) => (m.employmentTypes ?? []).some((t) => selectedEmploymentTypes.value.includes(t)))
  }

  // Checking both Remote and Onsite is equivalent to no filter; only a single
  // selection actually narrows the result (no "hybrid" signal in the job data).
  if (selectedWorkModel.value.length === 1) {
    const wantRemote = selectedWorkModel.value[0] === 'remote'
    result = result.filter((m) => m.isRemote === wantRemote)
  }

  if (selectedDatePosted.value) {
    const maxDays = selectedDatePosted.value === '24h' ? 1 : selectedDatePosted.value === 'week' ? 7 : 30
    result = result.filter((m) => m.daysSincePosted != null && m.daysSincePosted <= maxDays)
  }

  const sorted = [...result]
  if (sortOrder.value === 'newest') {
    sorted.sort(
      (a, b) => new Date(b.postedDate ?? b.createdAt).getTime() - new Date(a.postedDate ?? a.createdAt).getTime(),
    )
  } else if (sortOrder.value === 'pay') {
    sorted.sort((a, b) => (b.payMax ?? b.payMin ?? -1) - (a.payMax ?? a.payMin ?? -1))
  } else {
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  }
  return sorted
})

// --- Pagination for the job feed -------------------------------------------
// Keeps the "Recent job matches" list a fixed height instead of growing the page
// as more matches accumulate. Numbered pages below the grid.
const PAGE_SIZE = 5
const currentPage = ref(1)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredMatches.value.length / PAGE_SIZE)),
)

const pagedMatches = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredMatches.value.slice(start, start + PAGE_SIZE)
})

// Compact page-number list with gaps (…) for large counts, e.g. [1,'…',4,5,6,'…',12].
const pageItems = computed<(number | 'gap')[]>(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const items: (number | 'gap')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(total - 1, current + 1)
  if (from > 2) items.push('gap')
  for (let p = from; p <= to; p++) items.push(p)
  if (to < total - 1) items.push('gap')
  items.push(total)
  return items
})

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

// Reset to the first page whenever the filtered result set changes (filters
// toggled, new matches loaded), and clamp if the current page no longer exists.
watch(
  () => filteredMatches.value.length,
  () => {
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  },
)
watch(
  [showSavedOnly, selectedLocation, selectedRoleTypes, selectedEmploymentTypes, selectedWorkModel, selectedDatePosted, sortOrder],
  () => {
    currentPage.value = 1
  },
  { deep: true },
)

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
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
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

      <!--
        Summary cards: only Profile strength lives up here now. Subscription (-> Plan
        tile), Active add-ons, and Matching stats all moved into the side rail so the
        top of the page isn't a mix of a 2-card grid next to full-width banners.
      -->
      <div class="grid-auto-fill mb-8">
        <!-- Profile strength (hidden when 100% or dismissed) -->
        <div v-if="showProfileCompletionCard" class="rounded-[16px] border border-neutral-border bg-white p-5">
          <div class="mb-3 flex items-center gap-2.5">
            <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
              <font-awesome-icon :icon="['fas', 'circle-check']" class="text-sm" aria-hidden="true" />
            </span>
            <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide">Profile strength</h3>
          </div>
          <div class="mb-3">
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-body">
              <span>{{ profileCompletion.filled }} of {{ profileCompletion.total }} complete</span>
              <span class="font-semibold text-brand-charcoal">{{ profileCompletion.percent }}%</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-bg">
              <div
                class="h-full rounded-full bg-brand-primary transition-all"
                :style="{ width: `${profileCompletion.percent}%` }"
              />
            </div>
          </div>
          <ul class="mb-3 space-y-1.5">
            <li
              v-for="item in profileCompletionItems"
              :key="item.label"
              class="flex items-center gap-2 text-sm"
              :class="item.done ? 'text-neutral-body line-through decoration-neutral-border' : 'text-brand-charcoal'"
            >
              <font-awesome-icon
                v-if="item.done"
                :icon="['fas', 'circle-check']"
                class="shrink-0 text-green-600"
                aria-hidden="true"
              />
              <span v-else class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-neutral-border" aria-hidden="true" />
              {{ item.label }}
            </li>
          </ul>
          <div class="flex flex-col items-start gap-0.5">
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
        <!-- Manual job search + Plan tile now live in the side rail next to the job feed. -->

        <!-- Locked upgrade teasers for the paid-only feature depth. -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
          <FeatureTeaserCard
            title="Resume Advice"
            :icon="['fas', 'file-lines']"
            :real-fields="resumeAdviceTeaser.real"
            :blurred-fields="resumeAdviceTeaser.blurred"
          />
          <FeatureTeaserCard
            title="Hiring Intel"
            :icon="['fas', 'user-tie']"
            :real-fields="premiumInsightsTeaser.real"
            :blurred-fields="premiumInsightsTeaser.blurred"
          />
        </div>
      </template>

      <!--
        Core and Premium share this branch: automated-matching status and fully unblurred
        Resume Advice + Hiring Intel (also serves the 6 legacy trial plans, which map to
        'core'). Application Tracker moved to its own /applications page (2026-07-27) so it's
        not competing with the job feed for space on the dashboard; both tiers get a link-out
        banner here instead of the full card inline. Premium additionally gets a banner linking
        out to /premium-tools (Sponsor Watch management).
      -->
      <template v-else-if="baseTier === 'core' || baseTier === 'premium'">
        <!--
          Same card-grid language + bg as the Free branch's FeatureTeaserCard pair
          (rounded-[16px], #EAF1FC, icon-circle header, md:grid-cols-2) instead of full-width
          bars. Automated matching / "Run job search" moved to the side rail (see below),
          same spot Free's manual-search panel lives, instead of a third card up here.
        -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
          <!-- Application Tracker moved to its own page - link out instead of the full card. -->
          <div class="rounded-[16px] border border-[#D3E3F9] bg-[#EAF1FC] p-5">
            <div class="mb-3 flex items-center gap-2.5">
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-primary">
                <font-awesome-icon :icon="['fas', 'clipboard-list']" class="text-sm" aria-hidden="true" />
              </span>
              <p class="font-heading text-base font-semibold text-brand-charcoal">Application Tracker</p>
            </div>
            <p v-if="trackedApplicationsCount > 0" class="text-sm text-neutral-body">
              {{ trackedApplicationsCount }} application{{ trackedApplicationsCount === 1 ? '' : 's' }} tracked
            </p>
            <p v-else class="text-sm text-neutral-body">Track every job you've applied to, all in one place.</p>
            <router-link
              :to="{ name: 'applications' }"
              class="btn-primary mt-4 text-sm inline-flex items-center justify-center"
            >
              Open Applications →
            </router-link>
          </div>

          <!-- Premium only: link out to the dedicated Sponsor Watch surface. -->
          <div v-if="baseTier === 'premium'" class="rounded-[16px] border border-[#D3E3F9] bg-[#EAF1FC] p-5">
            <div class="mb-3 flex items-center gap-2.5">
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-primary">
                <font-awesome-icon :icon="['fas', 'crown']" class="text-sm" aria-hidden="true" />
              </span>
              <p class="font-heading text-base font-semibold text-brand-charcoal">Sponsor Watch</p>
            </div>
            <p class="text-sm text-neutral-body">
              Real-time alerts when a watched employer's H-1B filing volume changes.
            </p>
            <router-link
              :to="{ name: 'premium-tools' }"
              class="btn-primary mt-4 text-sm inline-flex items-center justify-center"
            >
              Open Sponsor Watch →
            </router-link>
          </div>
        </div>
      </template>

      <!--
        Job feed + side rail (Run job search on Free, Plan on every tier). Stacks to one
        column below ~1150px instead of squeezing the rail at laptop widths.
      -->
      <div class="grid grid-cols-1 gap-6 min-[1150px]:grid-cols-[minmax(0,1fr)_320px] min-[1150px]:items-start">
      <div class="min-w-0">
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
      </div>

      <!-- Filter/sort row -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <FilterDropdown :label="roleTypeLabel" :active="selectedRoleTypes.length > 0">
          <template #default="{ close }">
            <div class="max-h-64 w-56 space-y-0.5 overflow-y-auto">
              <label
                v-for="opt in ROLE_CATEGORIES"
                :key="opt.value"
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-body hover:bg-neutral-bg"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  :checked="selectedRoleTypes.includes(opt.value)"
                  @change="toggleRoleType(opt.value)"
                />
                {{ opt.label }}
              </label>
            </div>
            <button
              type="button"
              class="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
              @click="close()"
            >
              Done
            </button>
          </template>
        </FilterDropdown>

        <FilterDropdown
          v-if="availableEmploymentTypes.length > 0"
          :label="employmentTypeLabel"
          :active="selectedEmploymentTypes.length > 0"
        >
          <template #default="{ close }">
            <div class="max-h-64 w-56 space-y-0.5 overflow-y-auto">
              <label
                v-for="t in availableEmploymentTypes"
                :key="t"
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm capitalize text-neutral-body hover:bg-neutral-bg"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  :checked="selectedEmploymentTypes.includes(t)"
                  @change="toggleEmploymentType(t)"
                />
                {{ formatEmploymentType([t]) }}
              </label>
            </div>
            <button
              type="button"
              class="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
              @click="close()"
            >
              Done
            </button>
          </template>
        </FilterDropdown>

        <FilterDropdown :label="workModelLabel" :active="selectedWorkModel.length === 1">
          <template #default="{ close }">
            <div class="w-44 space-y-0.5">
              <label
                v-for="opt in WORK_MODEL_OPTIONS"
                :key="opt.value"
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-body hover:bg-neutral-bg"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  :checked="selectedWorkModel.includes(opt.value)"
                  @change="toggleWorkModel(opt.value)"
                />
                {{ opt.label }}
              </label>
            </div>
            <button
              type="button"
              class="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
              @click="close()"
            >
              Done
            </button>
          </template>
        </FilterDropdown>

        <FilterDropdown :label="datePostedLabel" :active="selectedDatePosted != null">
          <template #default="{ close }">
            <div class="w-44 space-y-0.5">
              <button
                v-for="opt in DATE_POSTED_OPTIONS"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-bg"
                :class="selectedDatePosted === opt.value ? 'font-semibold text-brand-primary' : 'text-neutral-body'"
                @click="selectDatePosted(opt.value, close)"
              >
                {{ opt.label }}
                <font-awesome-icon v-if="selectedDatePosted === opt.value" :icon="['fas', 'check']" class="text-xs" aria-hidden="true" />
              </button>
            </div>
          </template>
        </FilterDropdown>

        <FilterDropdown label="Location" :active="!!selectedLocation.trim()">
          <template #default>
            <input
              v-model="selectedLocation"
              type="text"
              class="input w-56 text-sm"
              placeholder="City, State"
            />
          </template>
        </FilterDropdown>

        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[12px] border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          :class="showSavedOnly
            ? 'border-brand-primary bg-brand-primary text-white shadow-sm hover:opacity-90'
            : 'border-neutral-border bg-white text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-bg'"
          :aria-pressed="showSavedOnly"
          @click="showSavedOnly = !showSavedOnly"
        >
          <font-awesome-icon :icon="['fas', 'bookmark']" aria-hidden="true" />
          Saved{{ savedCount > 0 ? ` (${savedCount})` : '' }}
        </button>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="text-xs font-medium text-neutral-body hover:text-brand-charcoal hover:underline"
          @click="clearAllFilters"
        >
          Clear filters
        </button>

        <div class="ml-auto">
          <FilterDropdown :label="sortLabel">
            <template #default="{ close }">
              <div class="w-44 space-y-0.5">
                <button
                  v-for="opt in SORT_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-bg"
                  :class="sortOrder === opt.value ? 'font-semibold text-brand-primary' : 'text-neutral-body'"
                  @click="selectSort(opt.value, close)"
                >
                  {{ opt.label }}
                  <font-awesome-icon v-if="sortOrder === opt.value" :icon="['fas', 'check']" class="text-xs" aria-hidden="true" />
                </button>
              </div>
            </template>
          </FilterDropdown>
        </div>
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
            v-for="job in pagedMatches"
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

        <!-- Pagination -->
        <nav
          v-if="totalPages > 1"
          class="mt-8 flex flex-wrap items-center justify-center gap-2"
          aria-label="Job matches pages"
        >
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-neutral-border bg-neutral-bg px-3.5 py-1.5 text-sm font-medium text-neutral-body transition-colors hover:border-neutral-body/40 hover:bg-neutral-border/30 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            <font-awesome-icon :icon="['fas', 'chevron-left']" aria-hidden="true" />
            Previous
          </button>

          <template v-for="(item, idx) in pageItems" :key="`${item}-${idx}`">
            <span
              v-if="item === 'gap'"
              class="px-2 text-sm text-neutral-body select-none"
              aria-hidden="true"
            >…</span>
            <button
              v-else
              type="button"
              class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
              :class="item === currentPage
                ? 'bg-brand-primary text-white shadow-sm hover:opacity-90'
                : 'border border-neutral-border bg-neutral-bg text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30'"
              :aria-current="item === currentPage ? 'page' : undefined"
              :aria-label="`Page ${item}`"
              @click="goToPage(item)"
            >
              {{ item }}
            </button>
          </template>

          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-neutral-border bg-neutral-bg px-3.5 py-1.5 text-sm font-medium text-neutral-body transition-colors hover:border-neutral-body/40 hover:bg-neutral-border/30 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            Next
            <font-awesome-icon :icon="['fas', 'chevron-right']" aria-hidden="true" />
          </button>
        </nav>
      </template>
      </div>

      <!-- Side rail: Run job search on every tier (pale-blue), Plan on every tier (pale-amber, the only shadow-lifted tile) -->
      <aside class="flex flex-col gap-5">
        <FreemiumManualJobSearchPanel
          v-if="baseTier === 'free' && showFreemiumJobSearchCta"
          :can-run="freemiumCanRunManualJobSearch"
          :used-searches="freemiumJobSearchesUsed"
          :max-searches="freemiumMaxJobSearches"
          :message="freemiumSearchMessage"
          :loading="freemiumSearchLoading"
          :matches-this-week="matchingStats.thisWeek ?? 0"
          :avg-match-score="matchingStats.avgMatchScore"
          @run="runFreemiumJobSearch"
        />

        <!-- Core/Premium: same pale-blue action-panel slot Free's manual search sits in,
             but unlimited (no usage bar) - automated matching status + on-demand search. -->
        <div v-else-if="baseTier === 'core' || baseTier === 'premium'" class="rounded-[16px] border border-[#D3E3F9] bg-[#EAF1FC] p-5">
          <div class="mb-1.5 flex items-center gap-3">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-green-700">
              <font-awesome-icon :icon="['fas', 'circle-check']" class="text-sm" aria-hidden="true" />
            </span>
            <h2 class="text-base font-heading font-semibold text-brand-charcoal">Automated matching active</h2>
          </div>
          <p class="text-sm text-neutral-body">
            Next digest: {{ nextDigestLabel }} · {{ matchesThisWeekLabel }}
          </p>
          <p v-if="subscriberSearchMessage" class="mt-3 text-sm text-green-700">
            {{ subscriberSearchMessage }}
          </p>
          <button
            type="button"
            class="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="subscriberSearchLoading"
            @click="runSubscriberJobSearch"
          >
            <font-awesome-icon
              v-if="subscriberSearchLoading"
              :icon="['fas', 'spinner']"
              spin
              class="h-4 w-4"
              aria-hidden="true"
            />
            {{ subscriberSearchLoading ? 'Searching…' : 'Run job search' }}
          </button>
        </div>

        <div class="rounded-[16px] border border-[#FBE3B0] bg-[#FFF4E0] p-5 shadow-md">
          <div class="mb-3 flex items-center gap-2.5">
            <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-primary">
              <font-awesome-icon :icon="['fas', 'tag']" class="text-sm" aria-hidden="true" />
            </span>
            <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide">Plan</h3>
          </div>
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
      </aside>
      </div>
    </div>
  </div>
</template>
