<script setup lang="ts">
import { computed } from 'vue'
import type { ApplicationStatus } from '@/types/database'
import type { TrackedApplicationRow } from '@/lib/applications'
import { formatPayRange } from '@/lib/formatJob'

const props = defineProps<{
  applications: TrackedApplicationRow[]
}>()

const emit = defineEmits<{
  (e: 'remove', matchId: string): void
}>()

const statusConfig: Record<
  ApplicationStatus,
  { label: string; chipClass: string; dotClass: string; tileClass: string }
> = {
  saved: {
    label: 'Saved',
    chipClass: 'bg-gray-100 text-gray-600',
    dotClass: 'bg-gray-400',
    tileClass: 'text-gray-600',
  },
  applied: {
    label: 'Applied',
    chipClass: 'bg-blue-50 text-blue-700',
    dotClass: 'bg-blue-500',
    tileClass: 'text-blue-600',
  },
  interviewing: {
    label: 'Interviewing',
    chipClass: 'bg-purple-50 text-purple-700',
    dotClass: 'bg-purple-500',
    tileClass: 'text-purple-600',
  },
  rejected: {
    label: 'Rejected',
    chipClass: 'bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
    tileClass: 'text-red-600',
  },
  ghosted: {
    label: 'Ghosted',
    chipClass: 'bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-500',
    tileClass: 'text-amber-600',
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
  <div>
    <!-- Status summary -->
    <div v-if="totalTracked" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div
        v-for="s in statusOrder"
        :key="s"
        class="rounded-[12px] border border-neutral-border bg-white px-4 py-3.5 text-center"
      >
        <p class="font-heading text-2xl font-bold leading-none" :class="statusConfig[s].tileClass">
          {{ countsByStatus[s] }}
        </p>
        <p class="mt-1.5 text-xs font-medium uppercase tracking-wide text-neutral-body">
          {{ statusConfig[s].label }}
        </p>
      </div>
    </div>

    <!-- Applications list -->
    <ul v-if="totalTracked" class="flex flex-col gap-3">
      <li
        v-for="app in applications"
        :key="app.id"
        class="group flex items-start gap-4 rounded-[12px] border border-neutral-border bg-white px-5 py-4 transition-colors hover:border-brand-primary/30 hover:shadow-sm"
      >
        <div
          class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-semibold text-brand-primary"
          aria-hidden="true"
        >
          {{ companyInitial(app.company) }}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-heading text-base font-semibold text-brand-charcoal">
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

          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-body">
            <span v-if="app.location" class="inline-flex items-center gap-1.5">
              <font-awesome-icon :icon="['fas', 'location-dot']" class="opacity-70" aria-hidden="true" />
              {{ app.location }}
            </span>
            <span v-if="formatPayRange(app.payMin, app.payMax, app.payType)" class="inline-flex items-center gap-1.5">
              <font-awesome-icon :icon="['fas', 'sack-dollar']" class="opacity-70" aria-hidden="true" />
              {{ formatPayRange(app.payMin, app.payMax, app.payType) }}
            </span>
            <span class="text-neutral-body/70">Updated {{ formatUpdatedAt(app.updatedAt) }}</span>
          </div>

          <div class="mt-3 flex items-center gap-4 border-t border-neutral-border pt-3">
            <a
              v-if="app.applyLink"
              :href="app.applyLink"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
            >
              View posting
              <font-awesome-icon :icon="['fas', 'arrow-up-right-from-square']" class="text-xs" aria-hidden="true" />
            </a>
            <router-link
              v-if="app.jobId"
              :to="`/job/${app.jobId}`"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-body hover:text-brand-primary hover:underline"
            >
              Job details
            </router-link>
            <button
              type="button"
              class="ml-auto inline-flex items-center gap-1.5 text-sm text-neutral-body opacity-0 transition-opacity hover:text-red-500 focus:opacity-100 focus:outline-none group-hover:opacity-100"
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

    <div v-else class="card flex flex-col items-center gap-3 p-12 text-center">
      <span class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
        <font-awesome-icon :icon="['fas', 'clipboard-list']" class="text-lg" aria-hidden="true" />
      </span>
      <p class="max-w-md text-sm text-neutral-body">
        You haven't tracked any applications yet. Use the status dropdown on any job card to
        mark it as Saved, Applied, Interviewing, Rejected, or Ghosted — we'll keep the job link,
        location, and pay on hand so you can always get back to it.
      </p>
    </div>
  </div>
</template>
