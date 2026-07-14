<script setup lang="ts">
import { computed } from 'vue'
import type { ApplicationStatus, PayType } from '@/types/database'
import type { TrackedApplicationRow } from '@/lib/applications'

const props = defineProps<{
  applications: TrackedApplicationRow[]
}>()

const emit = defineEmits<{
  (e: 'remove', matchId: string): void
}>()

const statusConfig: Record<
  ApplicationStatus,
  { label: string; chipClass: string; dotClass: string; countClass: string }
> = {
  saved: {
    label: 'Saved',
    chipClass: 'bg-gray-100 text-gray-600',
    dotClass: 'bg-gray-400',
    countClass: 'text-gray-600',
  },
  applied: {
    label: 'Applied',
    chipClass: 'bg-blue-50 text-blue-700',
    dotClass: 'bg-blue-500',
    countClass: 'text-blue-600',
  },
  interviewing: {
    label: 'Interviewing',
    chipClass: 'bg-purple-50 text-purple-700',
    dotClass: 'bg-purple-500',
    countClass: 'text-purple-600',
  },
  rejected: {
    label: 'Rejected',
    chipClass: 'bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
    countClass: 'text-red-600',
  },
  ghosted: {
    label: 'Ghosted',
    chipClass: 'bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-500',
    countClass: 'text-amber-600',
  },
}

const statusOrder: ApplicationStatus[] = ['saved', 'applied', 'interviewing', 'rejected', 'ghosted']

const countsByStatus = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of statusOrder) counts[s] = 0
  for (const app of props.applications) {
    counts[app.status] = (counts[app.status] ?? 0) + 1
  }
  return counts
})

const totalTracked = computed(() => props.applications.length)

const recentApplications = computed(() => props.applications.slice(0, 5))
const hasMore = computed(() => totalTracked.value > recentApplications.value.length)

function formatPayRange(payMin: number | null, payMax: number | null, payType: PayType | null): string | null {
  if ((payMin == null && payMax == null) || !payType) return null
  const fmt = (n: number) => (payType === 'year' ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)
  const suffix =
    payType === 'hour' ? 'hr' : payType === 'month' ? 'mo' : payType === 'week' ? 'wk' : payType === 'day' ? 'day' : 'yr'
  if (payMin != null && payMax != null) return `${fmt(payMin)}–${fmt(payMax)}/${suffix}`
  if (payMin != null) return `${fmt(payMin)}+/${suffix}`
  return `Up to ${fmt(payMax as number)}/${suffix}`
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function companyInitial(company: string | null): string {
  const c = company?.trim()
  return c ? c[0].toUpperCase() : '?'
}
</script>

<template>
  <div class="card p-5">
    <div class="mb-4 flex items-center gap-2.5">
      <font-awesome-icon :icon="['fas', 'clipboard-list']" class="text-brand-primary" aria-hidden="true" />
      <h3 class="font-heading font-semibold text-brand-charcoal">Application Tracker</h3>
      <span v-if="totalTracked" class="ml-auto text-xs text-neutral-body">
        {{ totalTracked }} total
      </span>
    </div>

    <!-- Status summary bar -->
    <div v-if="totalTracked" class="mb-4 grid grid-cols-5 gap-1.5 rounded-[12px] bg-neutral-bg p-2">
      <div v-for="s in statusOrder" :key="s" class="flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5">
        <span class="text-lg font-bold leading-none" :class="statusConfig[s].countClass">
          {{ countsByStatus[s] }}
        </span>
        <span class="text-[10px] font-medium uppercase tracking-wide text-neutral-body">
          {{ statusConfig[s].label }}
        </span>
      </div>
    </div>

    <!-- Recent applications list -->
    <ul v-if="recentApplications.length" class="flex flex-col gap-2.5">
      <li
        v-for="app in recentApplications"
        :key="app.id"
        class="group flex items-start gap-3 rounded-[12px] border border-neutral-border/60 px-3 py-2.5 transition-colors hover:border-brand-primary/30 hover:bg-neutral-bg/60"
      >
        <div
          class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary"
          aria-hidden="true"
        >
          {{ companyInitial(app.company) }}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-brand-charcoal">
                {{ app.title ?? 'Untitled role' }}
              </p>
              <p class="truncate text-sm text-neutral-body">
                {{ app.company ?? 'Unknown company' }}
              </p>
            </div>
            <span
              class="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] px-2.5 py-1 text-xs font-semibold"
              :class="statusConfig[app.status]?.chipClass"
            >
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="statusConfig[app.status]?.dotClass" />
              {{ statusConfig[app.status]?.label ?? app.status }}
            </span>
          </div>

          <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-body">
            <span v-if="app.location" class="inline-flex items-center gap-1">
              <font-awesome-icon :icon="['fas', 'location-dot']" class="opacity-70" aria-hidden="true" />
              {{ app.location }}
            </span>
            <span v-if="formatPayRange(app.payMin, app.payMax, app.payType)" class="inline-flex items-center gap-1">
              <font-awesome-icon :icon="['fas', 'sack-dollar']" class="opacity-70" aria-hidden="true" />
              {{ formatPayRange(app.payMin, app.payMax, app.payType) }}
            </span>
            <span class="text-neutral-body/70">Updated {{ formatUpdatedAt(app.updatedAt) }}</span>
          </div>

          <div class="mt-2 flex items-center gap-3">
            <a
              v-if="app.applyLink"
              :href="app.applyLink"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
            >
              View posting
              <font-awesome-icon :icon="['fas', 'arrow-up-right-from-square']" class="text-[10px]" aria-hidden="true" />
            </a>
            <router-link
              v-if="app.jobId"
              :to="`/job/${app.jobId}`"
              class="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-body hover:text-brand-primary hover:underline"
            >
              Job details
            </router-link>
            <button
              type="button"
              class="ml-auto inline-flex items-center gap-1 text-xs text-neutral-body opacity-0 transition-opacity hover:text-red-500 focus:opacity-100 focus:outline-none group-hover:opacity-100"
              aria-label="Remove application tracking"
              title="Remove"
              @click="emit('remove', app.matchId)"
            >
              <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="hasMore" class="mt-3 text-center text-xs text-neutral-body">
      Showing 5 most recently updated of {{ totalTracked }}.
    </p>

    <p v-if="!recentApplications.length" class="text-sm text-neutral-body">
      You haven't tracked any applications yet. Use the status dropdown on any job card to
      mark it as Saved, Applied, Interviewing, Rejected, or Ghosted — we'll keep the job link,
      location, and pay on hand so you can always get back to it.
    </p>
  </div>
</template>
