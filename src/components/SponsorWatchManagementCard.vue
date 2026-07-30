<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { jobsAPI, type WatchedEmployer } from '@/lib/jobs'
import type { RealSponsorshipTier } from '@/types/database'
import SponsorshipTierBadge from '@/components/SponsorshipTierBadge.vue'

const TIER_RANK: Record<RealSponsorshipTier, number> = { Low: 0, Medium: 1, High: 2 }

/** Alert-fired proxy: a Low/Medium/High bucket change between the last check and now. Catches
 * one of the two real alert triggers (crossedBucket in sponsor-watch-check); a >=25% position
 * swing that stays within the same bucket won't show here - sponsor_watch_events (the source of
 * truth for that) is deliberately not exposed to the frontend, see 20260718130000_sponsor_watch_rls.sql.
 * Email remains the source of truth for that narrower case, same as originally designed. */
function scoreDirection(employer: WatchedEmployer): 'increased' | 'decreased' {
  const prev = employer.lastCheckedScore ? TIER_RANK[employer.lastCheckedScore] : 0
  const curr = employer.score ? TIER_RANK[employer.score] : 0
  return curr >= prev ? 'increased' : 'decreased'
}

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

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  } catch {
    return ''
  }
}

/** Most recent check across every watched employer, for the header's freshness note. */
const lastOverallCheck = computed(() => {
  const checked = employers.value
    .map((e) => e.lastCheckedAt)
    .filter((v): v is string => !!v)
    .sort()
  return checked.length ? checked[checked.length - 1] : null
})
</script>

<template>
  <div class="card p-5">
    <div class="mb-4 flex items-start justify-between gap-4 border-b border-neutral-border pb-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
          <font-awesome-icon :icon="['fas', 'bell']" class="text-brand-primary" aria-hidden="true" />
        </span>
        <div>
          <h3 class="font-heading font-semibold text-brand-charcoal">Sponsor Watch</h3>
          <p class="text-xs text-neutral-body">Alerts on H-1B filing volume changes</p>
        </div>
      </div>
      <div v-if="employers.length" class="text-right">
        <p class="font-heading text-2xl font-semibold text-brand-charcoal">{{ employers.length }}</p>
        <p class="text-xs text-neutral-body">
          {{ employers.length === 1 ? 'employer tracked' : 'employers tracked' }}
        </p>
      </div>
    </div>

    <p v-if="lastOverallCheck" class="mb-4 flex items-center gap-1.5 text-xs text-neutral-body">
      <font-awesome-icon :icon="['fas', 'rotate']" class="shrink-0 text-neutral-body/60" aria-hidden="true" />
      Most recently checked {{ formatRelative(lastOverallCheck) }}
    </p>

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

            <div class="mt-1.5 text-xs">
              <span v-if="!employer.lastCheckedAt" class="text-neutral-body/70">
                <font-awesome-icon :icon="['fas', 'hourglass-half']" class="mr-1" aria-hidden="true" />
                Watching — we'll set a baseline on our next data check and email you if
                {{ employer.name }}'s H-1B filing activity changes after that (usually every few months)
              </span>
              <span
                v-else-if="employer.lastCheckedScore && employer.lastCheckedScore !== employer.score"
                class="inline-flex items-center gap-1.5 rounded-md bg-brand-primary/10 px-2 py-1 font-medium text-brand-primary"
              >
                <font-awesome-icon :icon="['fas', 'arrow-right-arrow-left']" aria-hidden="true" />
                Last checked {{ formatRelative(employer.lastCheckedAt) }} — filing activity
                {{ scoreDirection(employer) }}, see email for details
              </span>
              <span v-else class="text-neutral-body/70">
                <font-awesome-icon :icon="['fas', 'circle-check']" class="mr-1" aria-hidden="true" />
                Last checked {{ formatRelative(employer.lastCheckedAt) }} — no significant change
              </span>
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
