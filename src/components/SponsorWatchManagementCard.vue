<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { jobsAPI, type WatchedEmployer } from '@/lib/jobs'
import SponsorshipTierBadge from '@/components/SponsorshipTierBadge.vue'

const employers = ref<WatchedEmployer[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const removingId = ref<string | null>(null)

async function load() {
  isLoading.value = true
  loadError.value = null
  const { data, error } = await jobsAPI.listWatchedEmployers()
  if (error) {
    loadError.value = 'Could not load your watched employers. Try refreshing the page.'
  } else {
    employers.value = data
  }
  isLoading.value = false
}

onMounted(load)

async function unwatch(employer: WatchedEmployer) {
  if (removingId.value) return
  removingId.value = employer.subscriptionId
  const { error } = await jobsAPI.unwatchEmployer(employer.employerId)
  removingId.value = null
  if (error) {
    loadError.value = `Could not stop watching ${employer.name}. Try again.`
    return
  }
  employers.value = employers.value.filter((e) => e.subscriptionId !== employer.subscriptionId)
}

function formatWatchedSince(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="card p-5">
    <div class="mb-4 flex items-center gap-2.5">
      <font-awesome-icon :icon="['fas', 'bell']" class="text-brand-primary" aria-hidden="true" />
      <h3 class="font-heading font-semibold text-brand-charcoal">Sponsor Watch</h3>
      <span v-if="employers.length" class="ml-auto text-xs text-neutral-body">
        {{ employers.length }} watched
      </span>
    </div>

    <p v-if="loadError" class="mb-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {{ loadError }}
    </p>

    <p v-if="isLoading" class="text-sm text-neutral-body">
      <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" /> Loading watched employers…
    </p>

    <template v-else>
      <ul v-if="employers.length" class="flex flex-col gap-2.5">
        <li
          v-for="employer in employers"
          :key="employer.subscriptionId"
          class="flex items-start gap-3 rounded-[12px] border border-neutral-border/60 px-3 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-brand-charcoal">{{ employer.name }}</p>
                <p v-if="employer.domain" class="truncate text-xs text-neutral-body">{{ employer.domain }}</p>
              </div>
              <SponsorshipTierBadge v-if="employer.score" :value="employer.score">
                {{ employer.score }}
              </SponsorshipTierBadge>
            </div>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-body">
              <span>Watching since {{ formatWatchedSince(employer.watchedSince) }}</span>
            </div>
          </div>

          <button
            type="button"
            class="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-neutral-border bg-neutral-bg px-2.5 py-1 text-xs font-medium text-neutral-body transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="removingId === employer.subscriptionId"
            :aria-label="`Stop watching ${employer.name}`"
            @click="unwatch(employer)"
          >
            <font-awesome-icon
              :icon="['fas', removingId === employer.subscriptionId ? 'spinner' : 'bell-slash']"
              :spin="removingId === employer.subscriptionId"
              aria-hidden="true"
            />
            Unwatch
          </button>
        </li>
      </ul>

      <p v-else class="text-sm text-neutral-body">
        You're not watching any employers yet. Watch one from a job's sponsorship badge on your
        matches to get alerted when their H-1B filing volume changes.
      </p>
    </template>
  </div>
</template>
