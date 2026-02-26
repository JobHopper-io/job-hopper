<script setup lang="ts">
// TEMPORARY TEST PAGE – DO NOT SHIP TO PRODUCTION
// This view is only for internal debugging of the match-jobs Edge Function.
// It should be removed before any production release.

import { ref, onMounted, computed } from 'vue'
import { jobMatchingAPI, type MatchJobsResponse, type RankedJob } from '@/lib/job-matching'

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<MatchJobsResponse | null>(null)
const limit = ref(200)

const jobs = computed<RankedJob[]>(() => result.value?.jobs ?? [])

async function loadMatches() {
  isLoading.value = true
  errorMessage.value = null

  const { data, error } = await jobMatchingAPI.getMatches(limit.value)

  if (error) {
    // TEMPORARY: surface raw error to make debugging easier.
    errorMessage.value = error.message
    result.value = null
  } else {
    result.value = data
  }

  isLoading.value = false
}

onMounted(() => {
  void loadMatches()
})
</script>

<template>
  <!-- TEMPORARY TEST PAGE – DO NOT SHIP TO PRODUCTION -->
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- Big warning banner -->
      <div class="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 sm:px-6">
        <h1 class="text-xl sm:text-2xl font-heading font-bold text-red-800 mb-1">
          TEMPORARY MATCHING DEBUG PAGE – DO NOT SHIP TO PRODUCTION
        </h1>
        <p class="text-sm sm:text-base text-red-800">
          This screen is for internal testing of the <code>match-jobs</code> Edge Function and
          should be removed before launch. Do not link to this page from any user-facing
          navigation.
        </p>
      </div>

      <!-- Controls -->
      <div class="card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-end gap-4">
        <div class="flex-1">
          <label class="block text-sm font-medium text-neutral-body mb-1" for="limit-input">
            Max jobs fetched from <code>job_hopper_live</code>
          </label>
          <input
            id="limit-input"
            v-model.number="limit"
            type="number"
            min="1"
            max="500"
            class="input w-full max-w-xs"
          />
          <p class="mt-1 text-xs text-neutral-body">
            The Edge Function still applies its own safety cap (1–500).
          </p>
        </div>

        <button
          type="button"
          class="btn-primary w-full sm:w-auto"
          :disabled="isLoading"
          @click="loadMatches"
        >
          <span v-if="isLoading">Loading matches…</span>
          <span v-else>Reload matches</span>
        </button>
      </div>

      <!-- Error state -->
      <div v-if="errorMessage" class="card border border-red-300 bg-red-50 p-4 sm:p-6">
        <h2 class="text-lg font-heading font-semibold text-red-800 mb-2">
          Error invoking <code>match-jobs</code>
        </h2>
        <p class="text-sm text-red-800 whitespace-pre-line">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Summary -->
      <div v-if="result" class="card p-4 sm:p-6 space-y-2">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Match summary
        </h2>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Profile:</span>
          <code>{{ result.profile_id }}</code>
        </p>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Matched jobs:</span>
          {{ result.total }} (showing {{ jobs.length }})
        </p>
      </div>

      <!-- Jobs table -->
      <div v-if="jobs.length" class="card p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-neutral-border text-xs sm:text-sm">
            <thead class="bg-neutral-surface">
              <tr>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Score</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Title</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Company</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Created</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Role / Location / Recency
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Matched role keywords
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-border bg-white">
              <tr v-for="job in jobs" :key="job.id" class="align-top">
                <td class="px-3 py-2 whitespace-nowrap font-mono text-xs">
                  {{ job.score.toFixed(2) }}
                </td>
                <td class="px-3 py-2">
                  <div class="font-semibold text-brand-charcoal">
                    {{ job.title || '(no title)' }}
                  </div>
                  <div class="text-[10px] text-neutral-body">
                    #{{ job.id }}
                  </div>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.companyName || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.location || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ new Date(job.createdAt).toLocaleString() }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  <div>Role: {{ job.roleScore }}</div>
                  <div>Location: {{ job.locationScore }}</div>
                  <div>Recency: {{ job.recencyScore.toFixed(2) }}</div>
                </td>
                <td class="px-3 py-2 text-neutral-body">
                  <span v-if="job.matchedRoleKeywords.length">
                    {{ job.matchedRoleKeywords.join(', ') }}
                  </span>
                  <span v-else>—</span>
                </td>
                <td class="px-3 py-2 text-neutral-body">
                  <details class="space-y-1 max-w-xs sm:max-w-md">
                    <summary class="cursor-pointer text-brand-primary underline">
                      View text fields
                    </summary>
                    <div v-if="job.description">
                      <div class="font-semibold text-xs mb-0.5">Description</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.description }}
                      </p>
                    </div>
                    <div v-if="job.jobHighlights" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Highlights</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.jobHighlights }}
                      </p>
                    </div>
                    <div v-if="job.applyLink" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Apply link</div>
                      <a
                        :href="job.applyLink"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[11px] text-brand-primary underline break-all"
                      >
                        {{ job.applyLink }}
                      </a>
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="!isLoading" class="card p-4 sm:p-6">
        <p class="text-sm text-neutral-body">
          No jobs matched for the current profile.
        </p>
      </div>
    </div>
  </div>
</template>

