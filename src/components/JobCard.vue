<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MatchedJob } from '@/lib/jobs'
import { resumeProductsAPI } from '@/lib/resumeProducts'

const props = defineProps<{
  job: MatchedJob
}>()

const emit = defineEmits<{
  (e: 'toggle-save', matchId: string, isSaved: boolean): void
}>()

const router = useRouter()

const tailoringLoading = ref(false)
const tailoringError = ref<string | null>(null)

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

async function handleTailoringCheckout() {
  tailoringLoading.value = true
  tailoringError.value = null
  try {
    const { data, error } = await resumeProductsAPI.startTailoringCheckout(
      props.job.matchId,
      '/dashboard',
    )
    if (error) {
      tailoringLoading.value = false
      tailoringError.value = error.message
      return
    }
    if (data?.url) {
      window.location.href = data.url
      return
    }
    tailoringLoading.value = false
    tailoringError.value = 'Unable to start checkout. Please try again.'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error starting checkout'
    tailoringLoading.value = false
    tailoringError.value = message
  }
}
</script>

<template>
  <article
    class="relative overflow-hidden rounded-2xl border border-neutral-border bg-neutral-card shadow-sm transition-shadow hover:shadow-md"
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
              {{ job.score.toFixed(0) }}% match
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

      <p v-if="job.description" class="mt-3 text-sm text-neutral-body line-clamp-2">
        {{ job.description }}
      </p>

      <!-- Actions -->
      <div class="mt-4 flex w-full flex-wrap items-center gap-2 border-t border-neutral-border pt-4">
        <button
          type="button"
          class="btn-primary min-w-0 flex-1 text-sm"
          @click="handleViewDetails"
        >
          View details
        </button>
        <button
          type="button"
          class="btn-secondary shrink-0 text-sm"
          :disabled="!job.applyLink"
          @click="handleApply"
        >
          Apply
        </button>
          <button
            type="button"
            class="btn-secondary w-[11.5rem] shrink-0 text-sm"
            :disabled="tailoringLoading"
            @click="handleTailoringCheckout"
          >
            <font-awesome-icon
              v-if="tailoringLoading"
              :icon="['fas', 'spinner']"
              spin
              class="mr-1.5"
              aria-hidden="true"
            />
            {{ tailoringLoading ? 'Redirecting…' : 'Tailor Resume' }}
          </button>
      </div>
      <p v-if="tailoringError" class="mt-2 text-xs text-red-600">
        {{ tailoringError }}
      </p>
    </div>
  </article>
</template>

