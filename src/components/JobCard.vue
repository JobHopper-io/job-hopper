<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import type { MatchedJob } from '@/lib/jobs'
import type { PremiumInsightsOrgChoice, ResumeProduct } from '@/types/database'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { premiumInsightsAPI, premiumInsightsFreemiumReassurance } from '@/lib/premiumInsights'
import { mapPremiumInsightsClientError } from '@/lib/premiumInsightsErrors'
import JobSponsorshipBadge from '@/components/JobSponsorshipBadge.vue'
import ResumeAdviceModal from '@/components/ResumeAdviceModal.vue'
import ResumeAdvicePrecheckModal from '@/components/ResumeAdvicePrecheckModal.vue'
import PremiumInsightsModal from '@/components/PremiumInsightsModal.vue'
import InfoHint from '@/components/InfoHint.vue'

const props = defineProps<{
  job: MatchedJob
  advicePurchase?: ResumeProduct | null
}>()

const emit = defineEmits<{
  (e: 'toggle-save', matchId: string, isSaved: boolean): void
  (e: 'refresh-advice'): void
  (e: 'refresh-job-matches'): void
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

const adviceLoading = ref(false)
const adviceError = ref<string | null>(null)
const adviceModalOpen = ref(false)

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

const showAdviceButton = computed(() => {
  const p = props.advicePurchase
  if (!p) return true
  return p.status === 'cancelled'
})

const showResumeAdviceButton = computed(() => {
  const p = props.advicePurchase
  if (!p || p.status === 'cancelled') return false
  return true
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
      for (let i = 0; i < 24; i++) {
        emit('refresh-advice')
        const { data: row } = await resumeProductsAPI.getTailoringPurchaseForMatch(props.job.matchId)
        if (row?.improvements_text?.trim()) {
          break
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      emit('refresh-advice')
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
              v-if="job.score != null"
              class="inline-flex rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-brand-charcoal"
              aria-label="Match score"
            >
              Match score: {{ job.score.toFixed(0) }}
            </span>
            <JobSponsorshipBadge
              v-if="showSponsorshipBadge"
              :value="job.sponsorshipLikelihood"
            />
            <JobSponsorshipBadge
              v-else-if="showSponsorshipTeaser"
              :value="null"
              locked
            />
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
      <p v-if="adviceStatusText" class="mt-2 text-xs text-neutral-body">
        {{ adviceStatusText }}
      </p>
      <p v-else-if="adviceError" class="mt-2 text-xs text-red-600">
        {{ adviceError }}
      </p>
    </div>
  </article>
</template>

