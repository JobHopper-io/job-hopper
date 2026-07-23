<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { jobsAPI } from '@/lib/jobs'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { premiumInsightsAPI, premiumInsightsFreemiumReassurance } from '@/lib/premiumInsights'
import { mapPremiumInsightsClientError } from '@/lib/premiumInsightsErrors'
import { useUserStore } from '@/stores/user'
import type { MatchedJob, PayType, PremiumInsightsOrgChoice, ResumeProduct } from '@/types/database'
import JobSponsorshipBadge from '@/components/JobSponsorshipBadge.vue'
import SponsorWatchToggle from '@/components/SponsorWatchToggle.vue'
import ResumeAdviceModal from '@/components/ResumeAdviceModal.vue'
import ResumeAdvicePrecheckModal from '@/components/ResumeAdvicePrecheckModal.vue'
import PremiumInsightsModal from '@/components/PremiumInsightsModal.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { baseTier, freemiumResumeAdviceRemaining, freemiumMaxResumeAdvice, hasPremiumInsightsAddon, freemiumPremiumInsightsRemaining, freemiumMaxPremiumInsights, canRequestPremiumInsights } = storeToRefs(userStore)

/** Free tier: Resume Advice, Premium Insights, and the sponsorship signal are locked
 * upgrade teasers here too — same gating as JobCard on the dashboard. */
const isFree = computed(() => baseTier.value === 'free')

function goUpgrade() {
  void router.push({ name: 'billing-purchase' })
}

const jobIdParam = route.params.id as string
const job = ref<MatchedJob | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

const advicePurchase = ref<ResumeProduct | null>(null)
const tailoringLoading = ref(false)
const adviceCheckoutLoading = ref(false)
const tailoringError = ref<string | null>(null)
const adviceModalOpen = ref(false)

const precheckOpen = ref(false)
const precheckVariant = ref<'upload-required' | 'confirm-free-credit'>('upload-required')

const insightsPrecheckOpen = ref(false)
const insightsLoading = ref(false)
const insightsModalOpen = ref(false)
const insightsModalLoading = ref(false)
const insightsModalOverrideContacts = ref<MatchedJob['contacts'] | null>(null)
const insightsModalOverrideCompany = ref<Record<string, unknown> | null>(null)
const insightsModalError = ref<string | null>(null)
const insightsModalFreemiumNote = ref<string | null>(null)
const insightsModalOrgChoicesOverride = ref<PremiumInsightsOrgChoice[] | null>(null)
const insightsModalOrgChoiceSubmitting = ref(false)
/** After Continue, ignore stale org options on the job until a new insights run. */
const insightsOrgChoiceDismissed = ref(false)

const insightsOrgChoicesForModal = computed(() => {
  if (insightsOrgChoiceDismissed.value) return null
  const o = insightsModalOrgChoicesOverride.value
  if (o !== null) return o.length > 0 ? o : null
  const fromJob = job.value?.premiumInsightsOrgChoices
  return fromJob?.length ? fromJob : null
})

const showPremiumInsightsOrgChoiceHint = computed(
  () =>
    Boolean(
      job.value &&
        insightsOrgChoicesForModal.value?.length &&
        !insightsModalOpen.value &&
        job.value.premiumInsightsStatus === 'pending',
    ),
)

const insightsModalContacts = computed(
  () => insightsModalOverrideContacts.value ?? job.value?.contacts,
)

function closePrecheck() {
  precheckOpen.value = false
}

function handleGetResumeAdviceClick() {
  if (!job.value) return
  tailoringError.value = null
  const profile = userStore.profile
  if (!profile?.resume_bucket_key?.trim()) {
    precheckVariant.value = 'upload-required'
    precheckOpen.value = true
    return
  }
  // Only Free tier sees the freemium credit confirmation. Core/Premium skip the popup and
  // run directly via the free generation path (Core still passes the server-side daily
  // quota; Premium is uncapped). Matches JobCard.
  if (isFree.value && freemiumResumeAdviceRemaining.value > 0) {
    precheckVariant.value = 'confirm-free-credit'
    precheckOpen.value = true
    return
  }
  void executeTailoringCheckout()
}

function onConfirmFreeCredit() {
  closePrecheck()
  void executeTailoringCheckout()
}

async function loadTailoringPurchase(matchId: string) {
  tailoringLoading.value = true
  tailoringError.value = null
  const { data, error } = await resumeProductsAPI.getTailoringPurchaseForMatch(matchId)
  tailoringLoading.value = false
  if (error) {
    tailoringError.value = error.message
    advicePurchase.value = null
    return
  }
  advicePurchase.value = data
}

// Fulfillment is asynchronous: the edge function returns 200 immediately and the row
// reaches a terminal status later, either from the n8n result or from the stale-row
// sweeper in run-scheduled-jobs. Poll past the sweeper's 10-minute threshold so a
// stuck row resolves to 'failed' on screen instead of spinning forever.
const ADVICE_POLL_INTERVAL_MS = 3000
const ADVICE_POLL_TIMEOUT_MS = 12 * 60 * 1000

let advicePollActive = false
let advicePollCancelled = false

function isTerminalAdviceStatus(status: ResumeProduct['status'] | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'cancelled'
}

async function pollAdviceUntilTerminal(matchId: string) {
  if (advicePollActive) return
  advicePollActive = true
  const deadline = Date.now() + ADVICE_POLL_TIMEOUT_MS
  try {
    while (!advicePollCancelled && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, ADVICE_POLL_INTERVAL_MS))
      if (advicePollCancelled) return
      await loadTailoringPurchase(matchId)
      const status = advicePurchase.value?.status
      if (!status || isTerminalAdviceStatus(status)) return
    }
    if (!advicePollCancelled) {
      tailoringError.value =
        'Resume advice is taking longer than expected. Refresh the page to check again.'
    }
  } finally {
    advicePollActive = false
  }
}

onUnmounted(() => {
  advicePollCancelled = true
})

onMounted(async () => {
  try {
    if (!jobIdParam) {
      loadError.value = 'Invalid job id'
      return
    }
    const { data, error } = await jobsAPI.getJobMatchByJobId(jobIdParam)
    if (error) {
      loadError.value = error.message
      return
    }
    if (!data) {
      loadError.value = 'Job not found in your matches'
      return
    }
    job.value = data
    void loadWhyFit(data.matchId)
    await loadTailoringPurchase(data.matchId)
    // A generation started on an earlier visit may still be in flight.
    if (advicePurchase.value?.status === 'pending') {
      void pollAdviceUntilTerminal(data.matchId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    loadError.value = message
  } finally {
    isLoading.value = false
  }
})

async function handleToggleSave() {
  if (!job.value) return
  if (job.value.isSaved) {
    await jobsAPI.unsaveJob(job.value.matchId)
    job.value.isSaved = false
  } else {
    await jobsAPI.saveJob(job.value.matchId)
    job.value.isSaved = true
  }
}

function handleApplyClick() {
  if (!job.value || !job.value.applyLink) return
  window.open(job.value.applyLink, '_blank', 'noopener,noreferrer')
}

// A failed generation is retryable, so it behaves like no purchase at all: offer the
// button again rather than the (empty) advice modal.
const canPurchaseAdvice = computed(() => {
  const p = advicePurchase.value
  if (!p) return true
  return p.status === 'cancelled' || p.status === 'failed'
})

const showResumeAdviceButton = computed(() => {
  const p = advicePurchase.value
  if (!p || p.status === 'cancelled' || p.status === 'failed') return false
  return true
})

const adviceFailed = computed(() => advicePurchase.value?.status === 'failed')

const adviceErrorMessage = computed(() => {
  const p = advicePurchase.value
  if (p?.status !== 'failed') return null
  return p.error_message?.trim() || 'Resume advice could not be generated.'
})

// A terminal 'complete' always outranks a prior transient error: an earlier poll may
// have timed out (or briefly seen a failure) before the callback wrote the result.
watch(
  () => advicePurchase.value?.status,
  (status) => {
    if (status === 'complete') tailoringError.value = null
  },
)

const tailoringStatusLabel = computed(() => {
  const p = advicePurchase.value
  if (!p || p.status === 'cancelled') return null
  if (p.status === 'pending') return 'Generating resume advice'
  if (p.status === 'failed') return 'Resume advice failed'
  return null
})

const showSponsorshipBadge = computed(() => {
  const profile = userStore.profile
  const value = job.value?.sponsorshipLikelihood ?? null
  if (isFree.value) return false
  if (!profile || profile.requires_us_sponsorship !== true) return false
  if (!value || value === 'N/A') return false
  return true
})

/** Free tier sees a blurred, locked sponsorship badge when they require sponsorship. */
const showSponsorshipTeaser = computed(
  () => isFree.value && userStore.profile?.requires_us_sponsorship === true,
)

/** §3 decision 11: the Real Score replaces the badge's value for Premium only - Free/Core keep
 * the heuristic (inferSponsorshipLikelihood), unchanged, same as before this feature existed. */
const isPremium = computed(() => baseTier.value === 'premium')
const sponsorshipBadgeValue = computed(() =>
  isPremium.value && job.value?.sponsorshipRealScore
    ? job.value.sponsorshipRealScore
    : (job.value?.sponsorshipLikelihood ?? null),
)
const sponsorshipBadgeRationale = computed(() =>
  isPremium.value && job.value?.sponsorshipRealScore ? job.value.sponsorshipRealRationale : null,
)

const tierTagLabel = computed(() => {
  return job.value?.subscriptionTierDisplayName ?? null
})

function formatPayRange(
  payMin: number | null,
  payMax: number | null,
  payType: PayType | null,
): string | null {
  if ((payMin == null && payMax == null) || !payType) return null
  const formatter = (n: number) =>
    payType === 'year' ? `$${Math.round(n / 1000)}k` : `$${n}`
  const suffix =
    payType === 'hour'
      ? 'hr'
      : payType === 'month'
        ? 'mo'
        : payType === 'week'
          ? 'wk'
          : 'yr'
  if (payMin != null && payMax != null) return `${formatter(payMin)}–${formatter(payMax)}/${suffix}`
  if (payMin != null) return `${formatter(payMin)}+/${suffix}`
  if (payMax != null) return `Up to ${formatter(payMax)}/${suffix}`
  return null
}

function formatEmployeeCount(n: number | null): string {
  if (n == null) return 'Not specified'
  if (n <= 10) return '1–10'
  if (n <= 50) return '11–50'
  if (n <= 200) return '51–200'
  if (n <= 500) return '201–500'
  if (n <= 1000) return '501–1,000'
  return '1,000+'
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

const payRangeText = computed(() =>
  job.value
    ? formatPayRange(job.value.payMin, job.value.payMax, job.value.payType)
    : null,
)
const companySizeText = computed(() =>
  job.value ? formatEmployeeCount(job.value.employeeCount) : 'Not specified',
)
const scheduleText = computed(() => {
  const s = job.value?.schedules
  if (!s?.length) return null
  const joined = s.join(', ')
  return joined.length > 60 ? 'Various shifts' : joined
})
const employmentTypeText = computed(() => {
  const t = job.value?.employmentTypes
  if (!t?.length) return null
  return t.map((x) => x.replace(/_/g, ' ')).join(', ')
})
const postedDateText = computed(() => {
  const j = job.value
  if (!j) return null
  return formatDate(j.postedDate) ?? formatDate(j.createdAt)
})

/** Rule-based fallback only - used when LLM generation is unavailable (see loadWhyFit). */
const staticWhyFitBullets = computed(() => {
  const j = job.value
  const profile = userStore.profile
  const bullets: string[] = []

  if (j && j.score != null && j.score >= 70) {
    bullets.push('Your background appears to be a strong match for the core responsibilities in this role.')
  }
  if (j && profile) {
    const prefs = profile.preferred_locations ?? []
    const jobLoc = (j.location ?? '').toLowerCase()
    const jobRemote = j.isRemote === true
    const openRemote = profile.open_to_remote === true
    if (jobRemote && openRemote) {
      bullets.push('The location and work arrangement align with your preferences.')
    } else if (prefs.some((loc) => jobLoc.includes((loc ?? '').toLowerCase()))) {
      bullets.push('The location and work arrangement align with your preferences.')
    }
  }
  if (j && profile) {
    const targets = profile.target_role_categories ?? []
    const jobCat = j.roleCategory
    if (jobCat && targets.includes(jobCat)) {
      bullets.push('This role falls within the role categories you’re targeting.')
    }
    if (bullets.length === 0 && j.score != null && j.score >= 50) {
      bullets.push('This match is based on your profile and the role requirements.')
    }
  }
  return bullets;
})

const whyFitBullets = ref<string[]>([])
const whyFitLoading = ref(false)

/** Generates (or reads the cache for) the LLM "why this is a fit" bullets. Falls back
 * silently to the rule-based static bullets if the LLM path errors or is unavailable -
 * the page should never show an error for this, just a less personalized reason. */
async function loadWhyFit(matchId: string) {
  const cached = job.value?.whyFitBullets
  if (cached && cached.length > 0) {
    whyFitBullets.value = cached
    return
  }
  whyFitLoading.value = true
  try {
    const { data, error } = await jobsAPI.generateWhyFit(matchId)
    if (error || !data) {
      whyFitBullets.value = staticWhyFitBullets.value
      return
    }
    whyFitBullets.value = data.bullets
    if (job.value) job.value.whyFitBullets = data.bullets
  } finally {
    whyFitLoading.value = false
  }
}

async function reloadJobFromRoute() {
  if (!jobIdParam) return
  const { data, error } = await jobsAPI.getJobMatchByJobId(jobIdParam)
  if (!error && data) {
    job.value = data
  }
}

function closeInsightsPrecheck() {
  insightsPrecheckOpen.value = false
}

async function onCloseInsightsModal() {
  insightsModalOpen.value = false
  insightsModalLoading.value = false
  insightsModalOverrideContacts.value = null
  insightsModalOverrideCompany.value = null
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  insightsModalOrgChoicesOverride.value = null
  insightsModalOrgChoiceSubmitting.value = false
  insightsOrgChoiceDismissed.value = false
  await reloadJobFromRoute()
}

function openInsightsViewModal() {
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  insightsModalLoading.value = false
  insightsModalOverrideContacts.value = null
  insightsModalOverrideCompany.value = null
  insightsModalOrgChoicesOverride.value = null
  insightsModalOpen.value = true
}

function openOrgChoiceModal() {
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  insightsModalLoading.value = false
  insightsOrgChoiceDismissed.value = false
  insightsModalOpen.value = true
}

function handlePremiumInsightsClick() {
  if (hasPremiumInsightsAddon.value) {
    void runPremiumInsights()
    return
  }
  if (freemiumPremiumInsightsRemaining.value > 0) {
    insightsPrecheckOpen.value = true
  }
}

function onConfirmInsightsCredit() {
  closeInsightsPrecheck()
  void runPremiumInsights()
}

const showPremiumInsightsRow = computed(() => {
  const j = job.value
  if (!j) return false
  const st = j.premiumInsightsStatus
  if (st === 'complete' || st === 'pending' || st === 'failed' || st === 'cancelled') return true
  return canRequestPremiumInsights.value
})

const showPremiumInsightsViewButton = computed(() => {
  const j = job.value
  return (
    !!j &&
    j.premiumInsightsStatus === 'complete' &&
    (j.contacts?.length ?? 0) > 0
  )
})

const showPremiumInsightsGetButton = computed(() => {
  const j = job.value
  if (!j || !showPremiumInsightsRow.value) return false
  if (j.premiumInsightsStatus === 'pending') return false
  if (j.premiumInsightsStatus === 'complete' && (j.contacts?.length ?? 0) > 0) return false
  return canRequestPremiumInsights.value
})

const showPremiumInsightsPending = computed(
  () =>
    job.value?.premiumInsightsStatus === 'pending' &&
    !(insightsOrgChoicesForModal.value && insightsOrgChoicesForModal.value.length > 0),
)

async function runPremiumInsights() {
  if (!job.value) return
  insightsLoading.value = true
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  insightsModalOverrideContacts.value = null
  insightsModalOverrideCompany.value = null
  insightsModalOrgChoicesOverride.value = null
  insightsOrgChoiceDismissed.value = false
  insightsModalOpen.value = true
  insightsModalLoading.value = true
  try {
    const result = await premiumInsightsAPI.runForJobMatch(job.value.matchId)
    insightsModalLoading.value = false
    if (result.needsOrgChoice) {
      insightsModalOrgChoicesOverride.value = result.needsOrgChoice.organizations
      void userStore.refreshFreemium()
      return
    }
    if (result.error) {
      const friendly = mapPremiumInsightsClientError(result.error.message)
      insightsModalError.value = friendly
      insightsModalFreemiumNote.value = premiumInsightsFreemiumReassurance(
        result.meta,
        hasPremiumInsightsAddon.value,
      )
      void userStore.refreshFreemium()
      return
    }
    insightsModalError.value = null
    insightsModalFreemiumNote.value = null
    if (result.data?.contacts?.length) {
      insightsModalOverrideContacts.value = result.data.contacts
      insightsModalOverrideCompany.value = result.data.company_summary ?? null
    }
    void userStore.refreshFreemium()
  } catch (err) {
    insightsModalLoading.value = false
    const raw = err instanceof Error ? err.message : 'Unexpected error requesting Premium Insights'
    const friendly = mapPremiumInsightsClientError(raw)
    insightsModalError.value = friendly
  } finally {
    insightsLoading.value = false
    insightsModalLoading.value = false
  }
}

async function onConfirmOrgDisambiguation(
  payload: { decline: true } | { selectedApolloOrganizationId: string },
) {
  if (!job.value) return
  insightsOrgChoiceDismissed.value = true
  insightsModalOrgChoiceSubmitting.value = true
  insightsModalLoading.value = true
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  try {
    const result = await premiumInsightsAPI.resolveOrgDisambiguation(job.value.matchId, payload)
    insightsModalLoading.value = false
    if (result.needsOrgChoice) {
      insightsOrgChoiceDismissed.value = false
      insightsModalOrgChoicesOverride.value = result.needsOrgChoice.organizations
      void userStore.refreshFreemium()
      return
    }
    if (result.error) {
      const friendly = mapPremiumInsightsClientError(result.error.message)
      insightsModalError.value = friendly
      insightsModalFreemiumNote.value = premiumInsightsFreemiumReassurance(
        result.meta,
        hasPremiumInsightsAddon.value,
      )
      void userStore.refreshFreemium()
      return
    }
    insightsModalOrgChoicesOverride.value = null
    insightsModalError.value = null
    insightsModalFreemiumNote.value = null
    if (result.data?.contacts?.length) {
      insightsModalOverrideContacts.value = result.data.contacts
      insightsModalOverrideCompany.value = result.data.company_summary ?? null
    }
    void userStore.refreshFreemium()
    await reloadJobFromRoute()
  } catch (err) {
    insightsModalLoading.value = false
    const raw = err instanceof Error ? err.message : 'Unexpected error requesting Premium Insights'
    const friendly = mapPremiumInsightsClientError(raw)
    insightsModalError.value = friendly
  } finally {
    insightsModalOrgChoiceSubmitting.value = false
    insightsModalLoading.value = false
  }
}

async function executeTailoringCheckout() {
  if (!job.value) return
  adviceCheckoutLoading.value = true
  tailoringError.value = null
  const returnPath = route.path
  // Core/Premium get Resume Advice via the free generation path — never the paid Stripe
  // checkout, even once freemium credits are spent. The edge function still enforces its
  // own server-side guardrails (per-tier daily quota). Free keeps the credit-then-purchase
  // flow. Matches JobCard.
  const { data, error } = await resumeProductsAPI.startAdviceCheckout(job.value.matchId, returnPath, {
    forceFree: !isFree.value,
  })
  if (error) {
    adviceCheckoutLoading.value = false
    tailoringError.value = error.message
    return
  }
  if (data && 'freemium' in data && data.freemium) {
    adviceModalOpen.value = true
    await loadTailoringPurchase(job.value.matchId)
    await pollAdviceUntilTerminal(job.value.matchId)
    void userStore.refreshFreemium()
    adviceCheckoutLoading.value = false
    return
  }
  if (data && 'url' in data && typeof data.url === 'string') {
    window.location.href = data.url
    return
  }
  adviceCheckoutLoading.value = false
  tailoringError.value = 'Unable to start checkout. Please try again.'
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <!-- Back Button -->
      <button
        @click="router.push('/dashboard')"
        class="inline-flex items-center gap-2 text-brand-primary hover:underline mb-6 text-sm font-medium"
        type="button"
      >
        <font-awesome-icon :icon="['fas', 'chevron-left']" class="text-xs" aria-hidden="true" />
        Back to Feed
      </button>

      <div v-if="isLoading" class="text-center py-12">
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mx-auto mb-4 block"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Loading job details...</p>
      </div>

      <div v-else-if="loadError" class="card p-6 text-center text-red-600">
        {{ loadError }}
      </div>

      <div v-else-if="job" class="space-y-6">
        <!-- Job hero card -->
        <article
          class="relative overflow-hidden rounded-2xl border border-neutral-border bg-neutral-card shadow-md"
          style="border-left: 4px solid var(--color-brand-primary);"
        >
          <div class="p-6 sm:p-8">
            <!-- Top row: title + save -->
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div class="min-w-0 flex-1 pr-12 sm:pr-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h1 class="text-2xl font-heading font-bold leading-tight text-brand-charcoal sm:text-3xl">
                    {{ job.title }}
                  </h1>
                  <span
                    v-if="tierTagLabel"
                    class="inline-flex shrink-0 rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-medium text-neutral-body"
                  >
                    {{ tierTagLabel }}
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-body">
                  <span class="inline-flex items-center gap-1.5 font-medium text-brand-primary">
                    <font-awesome-icon :icon="['fas', 'building']" class="shrink-0 opacity-80" aria-hidden="true" />
                    {{ job.company }}
                  </span>
                  <span v-if="job.location" class="inline-flex items-center gap-1.5">
                    <font-awesome-icon :icon="['fas', 'location-dot']" class="shrink-0 opacity-70" aria-hidden="true" />
                    {{ job.location }}
                  </span>
                  <span
                    v-if="job.isRecentlyPosted"
                    class="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2.5 py-0.5 text-xs font-medium text-brand-primary"
                  >
                    <font-awesome-icon :icon="['fas', 'clock']" class="shrink-0" aria-hidden="true" />
                    Recently posted — early applicants tend to get noticed first
                  </span>
                  <span
                    v-if="job.isStale"
                    class="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                  >
                    <font-awesome-icon :icon="['fas', 'clock']" class="shrink-0" aria-hidden="true" />
                    Posted {{ job.daysSincePosted }} days ago — may no longer be accepting applications
                  </span>
                  <JobSponsorshipBadge
                    v-if="showSponsorshipBadge"
                    :value="sponsorshipBadgeValue"
                    :rationale="sponsorshipBadgeRationale"
                  />
                  <JobSponsorshipBadge
                    v-else-if="showSponsorshipTeaser"
                    :value="null"
                    locked
                  />
                  <SponsorWatchToggle
                    v-if="isPremium && job.sponsorshipRealScore && job.sponsorshipEmployerId"
                    :employer-id="job.sponsorshipEmployerId"
                    :watched="job.sponsorshipWatched"
                  />
                </div>
              </div>
              <button
                type="button"
                class="absolute right-4 top-6 shrink-0 transition-colors sm:static sm:right-auto sm:top-auto"
                :class="job.isSaved
                  ? 'rounded-full bg-brand-primary px-4 py-2.5 text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2'
                  : 'rounded-full border border-neutral-border bg-neutral-bg px-4 py-2.5 text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2'"
                :aria-pressed="job.isSaved"
                :aria-label="job.isSaved ? 'Unsave this job' : 'Save this job'"
                @click="handleToggleSave"
              >
                <font-awesome-icon
                  :icon="['fas', 'bookmark']"
                  :class="job.isSaved ? 'text-white' : 'text-neutral-body'"
                  aria-hidden="true"
                />
                <span class="ml-2 text-sm font-medium" :class="job.isSaved ? 'text-white' : 'text-neutral-body'">
                  {{ job.isSaved ? 'Saved' : 'Save this job' }}
                </span>
              </button>
            </div>

            <!-- Match + actions -->
            <div class="mt-6 flex flex-col gap-4 border-t border-neutral-border pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div class="flex flex-wrap items-center gap-3">
                <span
                  v-if="job.score != null"
                  class="inline-flex items-center rounded-full bg-neutral-bg px-3 py-1 text-sm font-semibold text-brand-charcoal"
                  aria-label="Match score"
                >
                  Match score: {{ job.score.toFixed(0) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="!job.applyLink"
                  aria-label="Apply on company site"
                  @click="handleApplyClick"
                >
                  Apply on company site
                </button>
                <!-- Free tier: locked upgrade teasers instead of the functional flows. -->
                <template v-if="isFree">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-2 rounded-[12px] border border-neutral-border bg-neutral-bg px-6 py-3 font-medium text-gray-400 transition-colors hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                    @click="goUpgrade"
                  >
                    <font-awesome-icon :icon="['fas', 'lock']" class="text-sm" aria-hidden="true" />
                    Get resume advice
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-2 rounded-[12px] border border-neutral-border bg-neutral-bg px-6 py-3 font-medium text-gray-400 transition-colors hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                    @click="goUpgrade"
                  >
                    <font-awesome-icon :icon="['fas', 'lock']" class="text-sm" aria-hidden="true" />
                    Premium Insights
                  </button>
                </template>
                <template v-else>
                <button
                  v-if="canPurchaseAdvice"
                  type="button"
                  class="btn-secondary inline-flex w-[11.5rem] items-center justify-center gap-2"
                  :disabled="adviceCheckoutLoading || tailoringLoading"
                  @click="handleGetResumeAdviceClick"
                >
                  <font-awesome-icon
                    v-if="adviceCheckoutLoading"
                    :icon="['fas', 'spinner']"
                    spin
                    aria-hidden="true"
                  />
                  {{ adviceCheckoutLoading ? 'Please wait…' : 'Get resume advice' }}
                </button>
                <button
                  v-if="showResumeAdviceButton"
                  type="button"
                  class="btn-secondary inline-flex w-[11.5rem] items-center justify-center gap-2"
                  :disabled="tailoringLoading"
                  @click="adviceModalOpen = true"
                >
                  View resume advice
                </button>
                <template v-if="showPremiumInsightsRow">
                  <button
                    v-if="showPremiumInsightsGetButton"
                    type="button"
                    class="btn-secondary inline-flex w-[12.5rem] items-center justify-center gap-2"
                    :disabled="insightsLoading"
                    @click="handlePremiumInsightsClick"
                  >
                    <font-awesome-icon
                      v-if="insightsLoading"
                      :icon="['fas', 'spinner']"
                      spin
                      aria-hidden="true"
                    />
                    <font-awesome-icon
                      v-else
                      :icon="['fas', 'user-tie']"
                      class="opacity-80"
                      aria-hidden="true"
                    />
                    {{ insightsLoading ? 'Please wait…' : 'Premium Insights' }}
                  </button>
                  <button
                    v-if="showPremiumInsightsOrgChoiceHint"
                    type="button"
                    class="btn-secondary inline-flex w-[12.5rem] items-center justify-center gap-2 text-sm"
                    @click="openOrgChoiceModal"
                  >
                    Choose employer…
                  </button>
                  <button
                    v-if="showPremiumInsightsPending"
                    type="button"
                    class="btn-secondary inline-flex w-[12.5rem] items-center justify-center gap-2 opacity-80"
                    disabled
                  >
                    <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
                    Finding contacts…
                  </button>
                  <button
                    v-if="showPremiumInsightsViewButton"
                    type="button"
                    class="btn-secondary inline-flex w-[12.5rem] items-center justify-center gap-2"
                    @click="openInsightsViewModal"
                  >
                    View hiring contacts
                  </button>
                </template>
                </template>
              </div>
            </div>
            <ResumeAdvicePrecheckModal
              :open="precheckOpen"
              :variant="precheckVariant"
              :max-free-credits="freemiumMaxResumeAdvice"
              :remaining-free-credits="freemiumResumeAdviceRemaining"
              @close="closePrecheck"
              @confirm="onConfirmFreeCredit"
            />
            <ResumeAdvicePrecheckModal
              :open="insightsPrecheckOpen"
              variant="confirm-premium-insights-credit"
              :max-free-credits="freemiumMaxPremiumInsights"
              :remaining-free-credits="freemiumPremiumInsightsRemaining"
              @close="closeInsightsPrecheck"
              @confirm="onConfirmInsightsCredit"
            />
            <ResumeAdviceModal
              :open="adviceModalOpen"
              :advice-text="advicePurchase?.improvements_text"
              :error-message="adviceErrorMessage"
              @close="adviceModalOpen = false"
            />
            <PremiumInsightsModal
              :open="insightsModalOpen"
              :loading="insightsModalLoading"
              :contacts="insightsModalContacts"
              :company-summary="insightsModalOverrideCompany"
              :error-message="insightsModalError"
              :freemium-note="insightsModalFreemiumNote"
              :org-choice-options="insightsOrgChoicesForModal"
              :org-choice-submitting="insightsModalOrgChoiceSubmitting"
              @close="onCloseInsightsModal"
              @confirm-org-choice="onConfirmOrgDisambiguation"
            />
            <!-- Purchase status and error (below actions; does not affect button layout) -->
            <div
              v-if="tailoringLoading || tailoringStatusLabel || tailoringError"
              class="mt-3 text-xs text-neutral-body"
            >
              <div v-if="tailoringLoading" class="flex items-center gap-2">
                <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
                <span>Checking resume advice status…</span>
              </div>
              <div
                v-else-if="adviceFailed"
                class="flex items-start gap-2 text-red-600"
              >
                <font-awesome-icon
                  :icon="['fas', 'exclamation-triangle']"
                  class="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{{ adviceErrorMessage }} You can try again.</span>
              </div>
              <div
                v-else-if="tailoringStatusLabel"
                class="flex items-center gap-2"
              >
                <font-awesome-icon
                  :icon="['fas', 'spinner']"
                  spin
                  class="shrink-0"
                  aria-hidden="true"
                />
                <span>{{ tailoringStatusLabel }}</span>
              </div>
              <p v-if="tailoringError" class="text-red-600">
                {{ tailoringError }}
              </p>
            </div>
          </div>
        </article>

        <!-- Overview -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Overview</h2>
          <div
            class="text-neutral-body leading-relaxed prose prose-sm max-w-none"
            v-html="(job.aiBriefing || job.description)?.trim() || 'No overview available for this role.'"
          />
        </div>

        <!-- Key details -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Key details</h2>
          <ul class="list-disc pl-5 space-y-2 text-neutral-body">
            <li v-if="scheduleText">
              <span class="font-medium text-brand-charcoal">Shift or schedule:</span> {{ scheduleText }}
            </li>
            <li v-if="payRangeText">
              <span class="font-medium text-brand-charcoal">Estimated salary or wage range:</span> {{ payRangeText }}
            </li>
            <li>
              <span class="font-medium text-brand-charcoal">Company size:</span> {{ companySizeText }}
            </li>
            <li v-if="employmentTypeText">
              <span class="font-medium text-brand-charcoal">Employment type:</span> {{ employmentTypeText }}
            </li>
            <li v-if="postedDateText">
              <span class="font-medium text-brand-charcoal">Posted on:</span> {{ postedDateText }}
            </li>
          </ul>
        </div>

        <!-- Why this might be a fit -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Why this might be a fit</h2>
          <div v-if="whyFitLoading" class="flex items-center gap-2 text-neutral-body text-sm">
            <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
            <span>Generating your personalized match reasoning...</span>
          </div>
          <ul v-else-if="whyFitBullets.length" class="list-disc pl-5 space-y-2 text-neutral-body">
            <li
              v-for="(bullet, idx) in whyFitBullets"
              :key="idx"
            >
              {{ bullet }}
            </li>
          </ul>
          <p v-else class="text-sm text-neutral-body">
            This match is based on your profile and the role requirements.
          </p>
        </div>

        <!-- How to apply -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">How to apply</h2>
          <p class="text-neutral-body leading-relaxed mb-4">
            Apply directly on the company’s chosen platform using the button below. Use the insights above to tailor your resume and responses so you stand out from generic applicants.
          </p>
          <button
            type="button"
            class="btn-primary"
            :disabled="!job.applyLink"
            aria-label="Apply on company site"
            @click="handleApplyClick"
          >
            Apply on company site
          </button>
        </div>

        <!-- Full description -->
        <div
          v-if="job.description?.trim()"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Full description</h2>
          <div
            class="text-neutral-body leading-relaxed prose prose-sm max-w-none"
            v-html="job.description.trim()"
          />
        </div>
      </div>
    </div>
  </div>
</template>

