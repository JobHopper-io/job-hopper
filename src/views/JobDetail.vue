<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { jobsAPI, type MatchedJob } from '@/lib/jobs'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import type { ResumeProduct } from '@/types/database'

const route = useRoute()
const router = useRouter()

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
                <h1 class="text-2xl font-heading font-bold leading-tight text-brand-charcoal sm:text-3xl">
                  {{ job.title }}
                </h1>
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
                  {{ job.isSaved ? 'Saved' : 'Save' }}
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
                  @click="handleApplyClick"
                >
                  Apply
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

        <!-- Description -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Description</h2>
          <div
            class="text-neutral-body leading-relaxed prose prose-sm max-w-none"
            v-html="job.description?.trim() || 'This role does not have a detailed description yet.'"
          />
        </div>
      </div>
    </div>
  </div>
</template>

