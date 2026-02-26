<script setup lang="ts">
// __TEST_ONLY_START__ — Entire view is for match-jobs debugging. Remove this file, the route in router, and src/lib/job-matching.ts before production.

import { ref, onMounted, computed } from 'vue'
import {
  jobMatchingAPI,
  type MatchJobsResponse,
  type RankedJob,
  type MatchJobsDebugPayload,
} from '@/lib/job-matching'

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<MatchJobsResponse | null>(null)

const jobs = computed<RankedJob[]>(() => result.value?.jobs ?? [])
const debug = computed<MatchJobsDebugPayload | null>(
  () => result.value?.debug ?? null,
)

async function loadMatches() {
  isLoading.value = true
  errorMessage.value = null

  const { data, error } = await jobMatchingAPI.getMatches()

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
// __TEST_ONLY_END__
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

      <!-- Reload control -->
      <div class="card p-4 sm:p-6 flex justify-end">
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

        <div v-if="debug" class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Algorithm inputs & filters
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Roles:</span>
              <span>
                {{
                  debug.input.roles.length
                    ? debug.input.roles.join(', ')
                    : '—'
                }}
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Current title:</span>
              <span>{{ debug.input.currentJobTitle || '—' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Current industry:</span>
              <span>{{ debug.input.currentIndustry || '—' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Preferred locations:</span>
              <span>
                {{
                  debug.input.preferredLocations.length
                    ? debug.input.preferredLocations.join(', ')
                    : '—'
                }}
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Open to relocation:</span>
              <span>{{ debug.input.openToRelocation ? 'Yes' : 'No' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Open to remote:</span>
              <span>{{ debug.input.openToRemote ? 'Yes' : 'No' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Role keywords:</span>
              <span>
                {{
                  debug.input.roleKeywords.length
                    ? debug.input.roleKeywords.join(', ')
                    : '—'
                }}
              </span>
            </p>
            <p class="text-xs text-neutral-body mt-2">
              <span class="font-semibold">Jobs fetched:</span>
              <span>{{ debug.filters.totalJobs }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">After filters:</span>
              <span>{{ debug.filters.includedAfterFilters }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by role:</span>
              <span>{{ debug.filters.excludedByRole }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by remote opt-out:</span>
              <span>{{ debug.filters.excludedByRemoteOptOut }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by location:</span>
              <span>{{ debug.filters.excludedByLocation }}</span>
            </p>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Score statistics & top keywords
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Score range:</span>
              <span>
                <span v-if="debug.scores.minScore !== null">
                  {{ debug.scores.minScore.toFixed(2) }}
                  –
                  {{ debug.scores.maxScore?.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average total score:</span>
              <span>
                <span v-if="debug.scores.averageScore !== null">
                  {{ debug.scores.averageScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average role score:</span>
              <span>
                <span v-if="debug.scores.averageRoleScore !== null">
                  {{ debug.scores.averageRoleScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average location score:</span>
              <span>
                <span v-if="debug.scores.averageLocationScore !== null">
                  {{ debug.scores.averageLocationScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average recency score:</span>
              <span>
                <span v-if="debug.scores.averageRecencyScore !== null">
                  {{ debug.scores.averageRecencyScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>

            <div class="mt-2">
              <p class="text-xs font-semibold text-neutral-body mb-1">
                Top matched role keywords (by job count)
              </p>
              <ul class="text-[11px] text-neutral-body max-h-32 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
                <li v-if="!debug.keywords.length">None</li>
                <li
                  v-for="kw in debug.keywords"
                  v-else
                  :key="kw.keyword"
                  class="flex justify-between gap-2"
                >
                  <span class="truncate">{{ kw.keyword }}</span>
                  <span class="font-mono text-[10px]">
                    {{ kw.matchedJobCount }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
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

      <div v-if="debug" class="card p-4 sm:p-6 space-y-3">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Sample excluded jobs by reason
        </h2>
        <p class="text-xs text-neutral-body">
          These small samples show how filters removed jobs at each step without
          dumping every job.
        </p>
        <div class="grid gap-4 sm:grid-cols-3">
          <div>
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal mb-1">
              By role (no keyword match)
            </h3>
            <p class="text-[11px] text-neutral-body mb-1">
              Showing up to {{ debug.samples.excludedByRole.length }} examples.
            </p>
            <ul class="text-[11px] text-neutral-body space-y-1 max-h-40 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
              <li v-if="!debug.samples.excludedByRole.length">None</li>
              <li
                v-for="job in debug.samples.excludedByRole"
                v-else
                :key="`role-${job.id}`"
              >
                <div class="font-semibold truncate">
                  {{ job.title || '(no title)' }}
                </div>
                <div class="flex justify-between gap-1">
                  <span class="truncate">
                    {{ job.companyName || '—' }}
                  </span>
                  <span class="truncate">
                    {{ job.location || '—' }}
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal mb-1">
              By remote opt-out
            </h3>
            <p class="text-[11px] text-neutral-body mb-1">
              Showing up to {{ debug.samples.excludedByRemote.length }} examples.
            </p>
            <ul class="text-[11px] text-neutral-body space-y-1 max-h-40 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
              <li v-if="!debug.samples.excludedByRemote.length">None</li>
              <li
                v-for="job in debug.samples.excludedByRemote"
                v-else
                :key="`remote-${job.id}`"
              >
                <div class="font-semibold truncate">
                  {{ job.title || '(no title)' }}
                </div>
                <div class="flex justify-between gap-1">
                  <span class="truncate">
                    {{ job.companyName || '—' }}
                  </span>
                  <span class="truncate">
                    {{ job.location || '—' }}
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal mb-1">
              By location
            </h3>
            <p class="text-[11px] text-neutral-body mb-1">
              Showing up to
              {{ debug.samples.excludedByLocation.length }}
              examples.
            </p>
            <ul class="text-[11px] text-neutral-body space-y-1 max-h-40 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
              <li v-if="!debug.samples.excludedByLocation.length">None</li>
              <li
                v-for="job in debug.samples.excludedByLocation"
                v-else
                :key="`loc-${job.id}`"
              >
                <div class="font-semibold truncate">
                  {{ job.title || '(no title)' }}
                </div>
                <div class="flex justify-between gap-1">
                  <span class="truncate">
                    {{ job.companyName || '—' }}
                  </span>
                  <span class="truncate">
                    {{ job.location || '—' }}
                  </span>
                </div>
              </li>
            </ul>
          </div>
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

