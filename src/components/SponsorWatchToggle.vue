<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { jobsAPI } from '@/lib/jobs'

/**
 * Sponsor Watch (Premium, D51-55): subscribe/unsubscribe to quarterly filing-volume alerts for
 * a job's resolved employer. Self-contained (calls jobsAPI directly, like the Resume Advice
 * checkout button elsewhere in JobCard) rather than emitting up - watching is a per-employer
 * toggle, not something that needs the whole job list re-sorted/refetched the way saving does.
 */
const props = defineProps<{
  employerId: string
  watched: boolean
}>()

const isWatched = ref(props.watched)
watch(
  () => props.watched,
  (value) => {
    isWatched.value = value
  },
)

const loading = ref(false)
const error = ref<string | null>(null)

async function toggle() {
  if (loading.value) return
  loading.value = true
  error.value = null
  const wasWatched = isWatched.value
  const { error: apiError } = wasWatched
    ? await jobsAPI.unwatchEmployer(props.employerId)
    : await jobsAPI.watchEmployer(props.employerId)
  loading.value = false
  if (apiError) {
    error.value = apiError.message
    return
  }
  isWatched.value = !wasWatched
}

const label = computed(() =>
  isWatched.value ? 'Stop watching this employer' : 'Watch this employer for sponsorship alerts',
)
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
    :class="isWatched
      ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15'
      : 'border-neutral-border bg-neutral-bg text-neutral-body hover:border-brand-primary/40 hover:text-brand-primary'"
    :disabled="loading"
    :aria-pressed="isWatched"
    :aria-label="label"
    :title="error ?? label"
    @click.stop="toggle"
  >
    <font-awesome-icon
      :icon="['fas', loading ? 'spinner' : 'bell']"
      :spin="loading"
      class="shrink-0"
      aria-hidden="true"
    />
    <span>{{ isWatched ? 'Watching' : 'Watch' }}</span>
  </button>
</template>
