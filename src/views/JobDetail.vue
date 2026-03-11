<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { jobsAPI } from '@/lib/jobs'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { useUserStore } from '@/stores/user'
import type { MatchedJob, PayType, ResumeProduct } from '@/types/database'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const jobIdParam = route.params.id as string
const job = ref<MatchedJob | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

const tailoringPurchase = ref<ResumeProduct | null>(null)
const tailoringLoading = ref(false)
const tailoringCheckoutLoading = ref(false)
const tailoringError = ref<string | null>(null)

async function loadTailoringPurchase(matchId: string) {
  tailoringLoading.value = true
  tailoringError.value = null
  const { data, error } = await resumeProductsAPI.getTailoringPurchaseForMatch(matchId)
  tailoringLoading.value = false
  if (error) {
    tailoringError.value = error.message
    tailoringPurchase.value = null
    return
  }
  tailoringPurchase.value = data
}

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
    await loadTailoringPurchase(data.matchId)
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

const canPurchaseTailoring = computed(() => {
  const p = tailoringPurchase.value
  if (!p) return true
  return p.status === 'cancelled'
})

const tailoringStatusLabel = computed(() => {
  const p = tailoringPurchase.value
  if (!p) return null
  if (p.status === 'pending') return 'Tailoring in progress'
  if (p.status === 'complete') return 'Tailored resume ready'
  return null
})

const hasPremiumInsights = computed(() => userStore.hasAddon('premium_insights'))
const hasInterviewPrep = computed(() => userStore.hasAddon('interview_prep'))

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
    payType === 'hour' ? `$${n}` : `$${Math.round(n / 1000)}k`
  if (payMin != null && payMax != null) return `${formatter(payMin)}–${formatter(payMax)}/${payType === 'hour' ? 'hr' : 'yr'}`
  if (payMin != null) return `${formatter(payMin)}+/${payType === 'hour' ? 'hr' : 'yr'}`
  if (payMax != null) return `Up to ${formatter(payMax)}/${payType === 'hour' ? 'hr' : 'yr'}`
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

const whyFitBullets = computed(() => {
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
  while (bullets.length < 3) {
    bullets.push(
      bullets.length === 0
        ? 'Review the overview and key details to see how your experience aligns.'
        : bullets.length === 1
          ? 'Use the insights above to tailor your resume and responses.'
          : 'Highlight relevant experience when you apply.',
    )
  }
  return bullets.slice(0, 3)
})

async function handleTailoringCheckout() {
  if (!job.value) return
  tailoringCheckoutLoading.value = true
  tailoringError.value = null
  const returnPath = route.path
  const { data, error } = await resumeProductsAPI.startTailoringCheckout(job.value.matchId, returnPath)
  if (error) {
    tailoringCheckoutLoading.value = false
    tailoringError.value = error.message
    return
  }
  if (data?.url) {
    window.location.href = data.url
    return
  }
  tailoringCheckoutLoading.value = false
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
                  {{ job.score.toFixed(0) }}% match
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
                <button
                  v-if="canPurchaseTailoring"
                  type="button"
                  class="btn-secondary inline-flex w-[11.5rem] items-center justify-center gap-2"
                  :disabled="tailoringCheckoutLoading || tailoringLoading"
                  @click="handleTailoringCheckout"
                >
                  <font-awesome-icon
                    v-if="tailoringCheckoutLoading"
                    :icon="['fas', 'spinner']"
                    spin
                    aria-hidden="true"
                  />
                  {{ tailoringCheckoutLoading ? 'Redirecting…' : 'Tailor Resume' }}
                </button>
              </div>
            </div>
            <!-- Tailoring status and error (below actions; does not affect button layout) -->
            <div
              v-if="tailoringLoading || tailoringStatusLabel || tailoringError"
              class="mt-3 text-xs text-neutral-body"
            >
              <div v-if="tailoringLoading" class="flex items-center gap-2">
                <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
                <span>Checking tailoring status…</span>
              </div>
              <div
                v-else-if="tailoringStatusLabel"
                class="flex items-center gap-2"
              >
                <font-awesome-icon
                  v-if="tailoringPurchase?.status === 'complete'"
                  :icon="['fas', 'check']"
                  class="text-green-600 shrink-0"
                  aria-hidden="true"
                />
                <font-awesome-icon
                  v-else
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
              <span class="font-medium text-brand-charcoal">Posted or last-updated:</span> {{ postedDateText }}
            </li>
          </ul>
        </div>

        <!-- Why this might be a fit -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Why this might be a fit</h2>
          <ul class="list-disc pl-5 space-y-2 text-neutral-body">
            <li
              v-for="(bullet, idx) in whyFitBullets"
              :key="idx"
            >
              {{ bullet }}
            </li>
          </ul>
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

        <!-- Hiring insights & contacts (Premium) -->
        <div
          v-if="hasPremiumInsights && job.contacts?.length"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Hiring insights & contacts</h2>
          <p class="text-neutral-body mb-4">
            Based on our research, hiring decisions for this role may involve:
          </p>
          <ul class="space-y-3 text-neutral-body">
            <li
              v-for="(c, idx) in job.contacts"
              :key="idx"
            >
              <span class="font-medium text-brand-charcoal">{{ c.name }}</span>
              <span v-if="c.title"> – {{ c.title }}</span>
              <span v-if="c.location"> – {{ c.location }}</span>
              <p
                v-if="c.note"
                class="mt-1 text-sm"
              >
                {{ c.note }}
              </p>
              <p
                v-else
                class="mt-1 text-sm text-neutral-body/80"
              >
                Potential contact for this role
              </p>
            </li>
          </ul>
          <p class="mt-4 text-sm text-neutral-body">
            Use this information respectfully and professionally. Start with a short, targeted introduction.
          </p>
        </div>

        <!-- Interview prep tips -->
        <div
          v-if="hasInterviewPrep"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Interview prep tips for this role</h2>
          <ul class="list-disc pl-5 space-y-2 text-neutral-body">
            <li>Key themes to highlight in your experience</li>
            <li>Example questions you might be asked</li>
            <li>Smart questions you can ask them</li>
          </ul>
          <p class="mt-3 text-sm text-neutral-body">
            We’ll expand this section with tailored tips in a future update.
          </p>
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

