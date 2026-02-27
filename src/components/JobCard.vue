<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { MatchedJob } from '@/lib/jobs'

const props = defineProps<{
  job: MatchedJob
}>()

const emit = defineEmits<{
  (e: 'toggle-save', matchId: string, isSaved: boolean): void
}>()

const router = useRouter()

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
</script>

<template>
  <div class="card p-6 hover:shadow-md transition-shadow">
    <div class="flex justify-between items-start mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="text-xl font-heading font-semibold text-brand-charcoal">
            {{ job.title ?? 'Untitled role' }}
          </h3>
        </div>
        <p class="text-brand-primary font-medium mb-1">
          {{ job.company ?? 'Company unknown' }}
        </p>
        <p class="text-sm text-neutral-body">
          {{ job.location ?? 'Location not specified' }}
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs text-neutral-body">
          Matched score:
          <span class="font-semibold text-brand-charcoal">
            {{ job.score != null ? job.score.toFixed(1) : '—' }}
          </span>
        </p>
      </div>
    </div>

    <p v-if="job.description" class="text-neutral-body mb-4 line-clamp-2">
      {{ job.description }}
    </p>

    <div class="flex gap-3">
      <button
        type="button"
        class="btn-primary flex-1"
        @click="handleViewDetails"
      >
        View details
      </button>
      <button
        type="button"
        class="btn-secondary"
        :disabled="!job.applyLink"
        @click="handleApply"
      >
        Apply on company site
      </button>
      <button
        type="button"
        class="p-3 border border-neutral-border rounded-[12px] hover:bg-neutral-bg"
        :aria-pressed="job.isSaved"
        @click="handleToggleSave"
      >
        <svg
          v-if="!job.isSaved"
          class="w-5 h-5 text-neutral-body"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
        <svg
          v-else
          class="w-5 h-5 text-brand-primary"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

