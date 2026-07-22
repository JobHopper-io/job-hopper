<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import type { MatchedJob } from '@/lib/jobs'
import type { JobSnapshot } from '@/lib/applications'
import type { ApplicationStatus, PremiumInsightsOrgChoice, ResumeProduct } from '@/types/database'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { premiumInsightsAPI, premiumInsightsFreemiumReassurance } from '@/lib/premiumInsights'
import { mapPremiumInsightsClientError } from '@/lib/premiumInsightsErrors'
import JobSponsorshipBadge from '@/components/JobSponsorshipBadge.vue'
import PremiumSponsorshipPanel from '@/components/PremiumSponsorshipPanel.vue'
import SponsorWatchToggle from '@/components/SponsorWatchToggle.vue'
import ResumeAdviceModal from '@/components/ResumeAdviceModal.vue'
import ResumeAdvicePrecheckModal from '@/components/ResumeAdvicePrecheckModal.vue'
import PremiumInsightsModal from '@/components/PremiumInsightsModal.vue'
import InfoHint from '@/components/InfoHint.vue'

const props = defineProps<{
  job: MatchedJob
  advicePurchase?: ResumeProduct | null
  applicationStatus?: ApplicationStatus | null
}>()

const emit = defineEmits<{
  (e: 'toggle-save', matchId: string, isSaved: boolean): void
  (e: 'refresh-advice'): void
  (e: 'refresh-job-matches'): void
  (
    e: 'update-application-status',
    matchId: string,
    status: ApplicationStatus | null,
    job: JobSnapshot,
  ): void
}>()

const router = useRouter()
const userStore = useUserStore()
const {
  baseTier,
  freemiumResumeAdviceRemaining,
  freemiumMaxResumeAdvice,
  hasPremiumInsightsAddon,
  canRequestPremiumInsights,
} = storeToRefs(userStore)

/** Free tier: Resume Advice, Premium Insights, and the sponsorship signal are shown
 * as locked upgrade teasers instead of functional controls. Core/Premium are unaffected. */
const isFree = computed(() => baseTier.value === 'free')

function goUpgrade() {
  void router.push({ name: 'billing-purchase' })
}

// ── Application status tagging ──────────────────────────────────────────
const statusOptions: { value: ApplicationStatus; label: string; chipClass: string }[] = [
  { value: 'saved', label: 'Saved', chipClass: 'bg-gray-100 text-gray-600' },
  { value: 'applied', label: 'Applied', chipClass: 'bg-blue-50 text-blue-700' },
  { value: 'interviewing', label: 'Interviewing', chipClass: 'bg-purple-50 text-purple-700' },
  { value: 'rejected', label: 'Rejected', chipClass: 'bg-red-50 text-red-700' },
  { value: 'ghosted', label: 'Ghosted', chipClass: 'bg-amber-50 text-amber-700' },
]

const statusDropdownOpen = ref(false)
const statusDropdownEl = ref<HTMLElement | null>(null)

const currentStatusConfig = computed(() =>
  props.applicationStatus
    ? statusOptions.find((o) => o.value === props.applicationStatus) ?? null
    : null,
)

function handleClickOutside(e: MouseEvent) {
  if (statusDropdownEl.value && !statusDropdownEl.value.contains(e.target as Node)) {
    statusDropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

function toggleStatusDropdown() {
  statusDropdownOpen.value = !statusDropdownOpen.value
}

const jobSnapshot = computed<JobSnapshot>(() => ({
  jobId: props.job.jobId || null,
  title: props.job.title,
  company: props.job.company,
  applyLink: props.job.applyLink,
  location: props.job.location,
  payMin: props.job.payMin,
  payMax: props.job.payMax,
  payType: props.job.payType,
}))

function selectStatus(status: ApplicationStatus | null) {
  statusDropdownOpen.value = false
  emit('update-application-status', props.job.matchId, status, jobSnapshot.value)
}

function clearStatus(e: MouseEvent) {
  e.stopPropagation()
  selectStatus(null)
}

const adviceLoading = ref(false)
const adviceError = ref<string | null>(null)
const adviceModalOpen = ref(false)

// Fulfillment is async: the row reaches a terminal status later, via the n8n callback or
// the stale-row sweeper. Poll past the sweeper's 10-min threshold so a stuck row resolves
// to 'failed' on screen instead of the old bounded loop giving up mid-generation (~112s).
// Only emit refresh-advice at terminal, to avoid hammering the dashboard with reloads.
const ADVICE_POLL_INTERVAL_MS = 3000
const ADVICE_POLL_TIMEOUT_MS = 12 * 60 * 1000
let advicePollCancelled = false

function isTerminalAdviceStatus(status: ResumeProduct['status'] | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'cancelled'
}

async function pollAdviceUntilTerminal(matchId: string) {
  const deadline = Date.now() + ADVICE_POLL_TIMEOUT_MS
  while (!advicePollCancelled && Date.now() < deadline) {
    const { data: row } = await resumeProductsAPI.getTailoringPurchaseForMatch(matchId)
    if (advicePollCancelled) return
    if (isTerminalAdviceStatus(row?.status)) {
      emit('refresh-advice')
      return
    }
    await new Promise((r) => setTimeout(r, ADVICE_POLL_INTERVAL_MS))
  }
  if (!advicePollCancelled) emit('refresh-advice')
}

onUnmounted(() => {
  advicePollCancelled = true
})

const precheckOpen = ref(false)
const precheckVariant = ref<'upload-required' | 'confirm-free-credit'>('upload-required')

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
  const fromJob = props.job.premiumInsightsOrgChoices
  return fromJob?.length ? fromJob : null
})

const showPremiumInsightsOrgChoiceHint = computed(
  () =>
    Boolean(
      insightsOrgChoicesForModal.value?.length &&
        !insightsModalOpen.value &&
        props.job.premiumInsightsStatus === 'pending',
    ),
)

const insightsModalContacts = computed(
  () => insightsModalOverrideContacts.value ?? props.job.contacts,
)

function closePrecheck() {
  precheckOpen.value = false
}

function handleGetResumeAdviceClick() {
  adviceError.value = null
  const profile = userStore.profile
  if (!profile?.resume_bucket_key?.trim()) {
    precheckVariant.value = 'upload-required'
    precheckOpen.value = true
    return
  }
  // Only Free tier sees the freemium credit confirmation. Core/Premium get full,
  // unlimited Resume Advice — run directly, no popup, no credit check.
  if (isFree.value && freemiumResumeAdviceRemaining.value > 0) {
    precheckVariant.value = 'confirm-free-credit'
    precheckOpen.value = true
    return
  }
  void runAdviceCheckout()
}

function onConfirmFreeCredit() {
  closePrecheck()
  void runAdviceCheckout()
}

// A failed row is retryable, so it offers the purchase/generate button again — like no
// purchase at all. A complete row shows the result (View button), never a re-buy.
const showAdviceButton = computed(() => {
  const p = props.advicePurchase
  if (!p) return true
  return p.status === 'cancelled' || p.status === 'failed'
})

const showResumeAdviceButton = computed(() => {
  const p = props.advicePurchase
  if (!p || p.status === 'cancelled' || p.status === 'failed') return false
  return true
})

const adviceFailed = computed(() => props.advicePurchase?.status === 'failed')

const adviceErrorMessage = computed<string | null>(() => {
  const p = props.advicePurchase
  if (p?.status !== 'failed') return null
  return p.error_message?.trim() || 'Resume advice could not be generated.'
})

const adviceStatusText = computed<string | null>(() => {
  const p = props.advicePurchase
  if (!p || p.status === 'cancelled') return null
  if (p.status === 'pending') return 'Generating resume advice'
  return null
})

function onCloseInsightsModal() {
  insightsModalOpen.value = false
  insightsModalLoading.value = false
  insightsModalOverrideContacts.value = null
  insightsModalOverrideCompany.value = null
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  insightsModalOrgChoicesOverride.value = null
  insightsModalOrgChoiceSubmitting.value = false
  insightsOrgChoiceDismissed.value = false
  emit('refresh-job-matches')
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
  insightsModalOpen.value = true
}

function handlePremiumInsightsClick() {
  // Reachable only on Core/Premium (Free shows a locked upgrade teaser instead). Both
  // get full, unlimited Premium Insights — run directly, no popup, no credit check.
  void runPremiumInsights()
}

const showPremiumInsightsRow = computed(() => {
  const st = props.job.premiumInsightsStatus
  if (st === 'complete' || st === 'pending' || st === 'failed' || st === 'cancelled') return true
  return canRequestPremiumInsights.value
})

const showPremiumInsightsViewButton = computed(
  () =>
    props.job.premiumInsightsStatus === 'complete' &&
    (props.job.contacts?.length ?? 0) > 0,
)

const showPremiumInsightsGetButton = computed(() => {
  if (!showPremiumInsightsRow.value) return false
  if (props.job.premiumInsightsStatus === 'pending') return false
  if (
    props.job.premiumInsightsStatus === 'complete' &&
    (props.job.contacts?.length ?? 0) > 0
  ) {
    return false
  }
  return canRequestPremiumInsights.value
})

const showPremiumInsightsPending = computed(
  () =>
    props.job.premiumInsightsStatus === 'pending' &&
    !(insightsOrgChoicesForModal.value && insightsOrgChoicesForModal.value.length > 0),
)

async function runPremiumInsights() {
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
    const result = await premiumInsightsAPI.runForJobMatch(props.job.matchId)
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
  insightsOrgChoiceDismissed.value = true
  insightsModalOrgChoiceSubmitting.value = true
  insightsModalLoading.value = true
  insightsModalError.value = null
  insightsModalFreemiumNote.value = null
  try {
    const result = await premiumInsightsAPI.resolveOrgDisambiguation(props.job.matchId, payload)
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
    emit('refresh-job-matches')
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

const showSponsorshipBadge = computed(() => {
  const profile = userStore.profile
  const value = props.job.sponsorshipLikelihood
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
  isPremium.value && props.job.sponsorshipRealScore
    ? props.job.sponsorshipRealScore
    : props.job.sponsorshipLikelihood,
)
const sponsorshipBadgeRationale = computed(() =>
  isPremium.value && props.job.sponsorshipRealScore ? props.job.sponsorshipRealRationale : null,
)

/** Premium + a real score gets the heavier panel instead of the small pill (design pass,
 * 2026-07-22) - Free/Core and Premium-without-a-real-score-yet keep the pill unchanged. */
const showPremiumSponsorshipPanel = computed(
  () => showSponsorshipBadge.value && isPremium.value && !!props.job.sponsorshipRealScore,
)
const premiumPanelScore = computed(() => props.job.sponsorshipRealScore)

/* Compact action-row buttons: one shared size so the footer reads as a single
 * balanced toolbar (the global btn-primary/btn-secondary are heavier and sized
 * for standalone CTAs). */
const actionBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-[12px] px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed'
const actionBtnPrimary = `${actionBtn} bg-brand-primary text-white shadow-sm hover:opacity-90`
const actionBtnOutline = `${actionBtn} border border-brand-primary/40 bg-white text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5`
const actionBtnLocked = `${actionBtn} border border-neutral-border bg-neutral-bg text-gray-400 hover:text-gray-500`

function handleViewDetails() {
  void router.push(`/job/${props.job.jobId}`)
}

function handleApply() {
  if (props.job.applyLink) {
    window.open(props.job.applyLink, '_blank', 'noopener,noreferrer')
  }
}

function handleToggleSave() {
  emit('toggle-save', props.job.matchId, props.job.isSaved)
}

async function runAdviceCheckout() {
  adviceLoading.value = true
  adviceError.value = null
  try {
    const { data, error } = await resumeProductsAPI.startAdviceCheckout(
      props.job.matchId,
      '/dashboard',
      // Subscribers (Core/Premium) never hit the paid checkout — always the free path.
      { forceFree: !isFree.value },
    )
    if (error) {
      adviceLoading.value = false
      adviceError.value = error.message
      return
    }
    if (data && 'freemium' in data && data.freemium) {
      adviceModalOpen.value = true
      emit('refresh-advice')
      await pollAdviceUntilTerminal(props.job.matchId)
      void userStore.refreshFreemium()
      adviceLoading.value = false
      return
    }
    if (data && 'url' in data && typeof data.url === 'string') {
      window.location.href = data.url
      return
    }
    adviceLoading.value = false
    adviceError.value = 'Unable to start checkout. Please try again.'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error starting checkout'
    adviceLoading.value = false
    adviceError.value = message
  }
}
</script>

<template>
  <article
    class="relative rounded-2xl border border-neutral-border bg-neutral-card shadow-sm transition-shadow hover:shadow-md"
    style="border-left: 4px solid var(--color-brand-primary);"
  >
    <div class="p-5 sm:p-6">
      <!-- Title + save -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0 flex-1 pr-11 sm:pr-0">
          <h3 class="text-lg font-heading font-semibold leading-tight text-brand-charcoal sm:text-xl">
            {{ job.title ?? 'Untitled role' }}
          </h3>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-body">
            <span class="inline-flex items-center gap-1.5 font-medium text-brand-primary">
              <font-awesome-icon :icon="['fas', 'building']" class="shrink-0 opacity-80" aria-hidden="true" />
              {{ job.company ?? 'Company unknown' }}
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
            <span
              v-if="job.score != null"
              class="inline-flex rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-brand-charcoal"
              aria-label="Match score"
            >
              Match score: {{ job.score.toFixed(0) }}
            </span>
            <JobSponsorshipBadge
              v-if="showSponsorshipBadge && !showPremiumSponsorshipPanel"
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
            <span
              v-if="!isFree && currentStatusConfig"
              class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
              :class="currentStatusConfig.chipClass"
            >
              {{ currentStatusConfig.label }}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="absolute right-4 top-5 shrink-0 transition-colors sm:static sm:right-auto sm:top-auto"
          :class="job.isSaved
            ? 'rounded-full bg-brand-primary px-3 py-2 text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2'
            : 'rounded-full border border-neutral-border bg-neutral-bg px-3 py-2 text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2'"
          :aria-pressed="job.isSaved"
          :aria-label="job.isSaved ? 'Unsave this job' : 'Save this job'"
          @click="handleToggleSave"
        >
          <font-awesome-icon
            :icon="['fas', 'bookmark']"
            :class="job.isSaved ? 'text-white' : 'text-neutral-body'"
            class="text-sm"
            aria-hidden="true"
          />
          <span class="ml-1.5 text-xs font-medium sm:inline" :class="job.isSaved ? 'text-white' : 'text-neutral-body'">
            {{ job.isSaved ? 'Saved' : 'Save' }}
          </span>
        </button>
      </div>

      <PremiumSponsorshipPanel
        v-if="showPremiumSponsorshipPanel && premiumPanelScore && sponsorshipBadgeRationale"
        class="mt-3"
        :score="premiumPanelScore"
        :rationale="sponsorshipBadgeRationale"
      />

      <p v-if="job.aiBriefing" class="mt-3 text-sm text-neutral-body line-clamp-2">
        {{ job.aiBriefing }}
      </p>

      <!-- Actions: Apply is the one solid CTA; feature actions are quiet outlines;
           View details sits apart on the right as a text link. -->
      <div class="mt-4 flex w-full flex-wrap items-center gap-2 border-t border-neutral-border pt-4">
        <button
          type="button"
          :class="actionBtnPrimary"
          :disabled="!job.applyLink"
          @click="handleApply"
        >
          Apply
          <font-awesome-icon
            :icon="['fas', 'arrow-up-right-from-square']"
            class="text-xs opacity-90"
            aria-hidden="true"
          />
        </button>
        <!-- Free tier: locked upgrade teasers instead of the functional flows. -->
        <template v-if="isFree">
          <button type="button" :class="actionBtnLocked" @click="goUpgrade">
            <font-awesome-icon :icon="['fas', 'lock']" class="text-xs" aria-hidden="true" />
            Get resume advice
          </button>
          <button type="button" :class="actionBtnLocked" @click="goUpgrade">
            <font-awesome-icon :icon="['fas', 'lock']" class="text-xs" aria-hidden="true" />
            Premium Insights
          </button>
        </template>
        <template v-else>
          <!-- Application status tagging -->
          <div ref="statusDropdownEl" class="relative inline-flex">
            <button
              type="button"
              :class="[
                actionBtn,
                currentStatusConfig
                  ? 'border-brand-primary/40 bg-white text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5'
                  : 'border border-dashed border-neutral-border bg-neutral-bg text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30',
              ]"
              @click="toggleStatusDropdown"
            >
              <span v-if="currentStatusConfig" class="flex items-center gap-1.5">
                <span
                  class="inline-block h-2 w-2 rounded-full"
                  :class="{
                    'bg-gray-400': props.applicationStatus === 'saved',
                    'bg-blue-500': props.applicationStatus === 'applied',
                    'bg-purple-500': props.applicationStatus === 'interviewing',
                    'bg-red-500': props.applicationStatus === 'rejected',
                    'bg-amber-500': props.applicationStatus === 'ghosted',
                  }"
                />
                {{ currentStatusConfig.label }}
              </span>
              <span v-else class="flex items-center gap-1.5">
                <font-awesome-icon :icon="['fas', 'tag']" class="text-xs opacity-70" aria-hidden="true" />
                Track status
              </span>
              <font-awesome-icon :icon="['fas', 'chevron-down']" class="ml-1 text-[10px] opacity-60" aria-hidden="true" />
            </button>
            <!-- Dropdown menu -->
            <div
              v-if="statusDropdownOpen"
              class="absolute left-0 top-full z-50 mt-1 min-w-[170px] rounded-[12px] border border-neutral-border bg-white shadow-lg"
              role="menu"
            >
              <div class="py-1.5">
                <button
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-neutral-bg/80"
                  :class="props.applicationStatus === opt.value ? 'font-semibold text-brand-charcoal' : 'text-neutral-body'"
                  role="menuitem"
                  @click="selectStatus(opt.value)"
                >
                  <span
                    class="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    :class="{
                      'bg-gray-400': opt.value === 'saved',
                      'bg-blue-500': opt.value === 'applied',
                      'bg-purple-500': opt.value === 'interviewing',
                      'bg-red-500': opt.value === 'rejected',
                      'bg-amber-500': opt.value === 'ghosted',
                    }"
                  />
                  <span
                    class="rounded-[8px] px-2 py-0.5 text-xs font-medium"
                    :class="opt.chipClass"
                  >
                    {{ opt.label }}
                  </span>
                </button>
                <div v-if="currentStatusConfig" class="border-t border-neutral-border my-1" />
                <button
                  v-if="currentStatusConfig"
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-neutral-body transition-colors hover:bg-neutral-bg/80"
                  role="menuitem"
                  @click="clearStatus"
                >
                  <font-awesome-icon :icon="['fas', 'xmark']" class="text-xs opacity-70" aria-hidden="true" />
                  Clear status
                </button>
              </div>
            </div>
          </div>
          <span v-if="showAdviceButton" class="inline-flex items-center gap-1.5">
            <button
              type="button"
              :class="actionBtnOutline"
              :disabled="adviceLoading"
              @click="handleGetResumeAdviceClick"
            >
              <font-awesome-icon
                v-if="adviceLoading"
                :icon="['fas', 'spinner']"
                spin
                aria-hidden="true"
              />
              {{ adviceLoading ? 'Please wait…' : 'Get resume advice' }}
            </button>
            <InfoHint
              tooltip="Get tailored feedback on how well your resume matches this specific role."
            />
          </span>
          <button
            v-if="showResumeAdviceButton"
            type="button"
            :class="actionBtnOutline"
            @click="adviceModalOpen = true"
          >
            View resume advice
          </button>
          <template v-if="showPremiumInsightsRow">
            <span v-if="showPremiumInsightsGetButton" class="inline-flex items-center gap-1.5">
              <button
                type="button"
                :class="actionBtnOutline"
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
              <InfoHint
                tooltip="See hiring activity, sponsorship likelihood, and hiring-manager contacts for this role."
              />
            </span>
            <button
              v-if="showPremiumInsightsOrgChoiceHint"
              type="button"
              :class="actionBtnOutline"
              @click="openOrgChoiceModal"
            >
              Choose employer…
            </button>
            <button
              v-if="showPremiumInsightsPending"
              type="button"
              :class="actionBtnOutline"
              class="opacity-80"
              disabled
            >
              <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
              Finding contacts…
            </button>
            <button
              v-if="showPremiumInsightsViewButton"
              type="button"
              :class="actionBtnOutline"
              @click="openInsightsViewModal"
            >
              View hiring contacts
            </button>
          </template>
        </template>
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1.5 rounded-[12px] px-2 py-2 text-sm font-semibold text-brand-primary transition-colors hover:underline focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          @click="handleViewDetails"
        >
          View details
          <font-awesome-icon :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
        </button>
      </div>
      <ResumeAdvicePrecheckModal
        :open="precheckOpen"
        :variant="precheckVariant"
        :max-free-credits="freemiumMaxResumeAdvice"
        :remaining-free-credits="freemiumResumeAdviceRemaining"
        @close="closePrecheck"
        @confirm="onConfirmFreeCredit"
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
      <p v-if="adviceFailed" class="mt-2 text-xs text-red-600">
        {{ adviceErrorMessage }} You can try again.
      </p>
      <p v-else-if="adviceStatusText" class="mt-2 text-xs text-neutral-body">
        {{ adviceStatusText }}
      </p>
      <p v-else-if="adviceError" class="mt-2 text-xs text-red-600">
        {{ adviceError }}
      </p>
    </div>
  </article>
</template>

