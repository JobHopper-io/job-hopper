<script setup lang="ts">
import { computed } from 'vue'
import type { ApplicationStatus } from '@/types/database'
import type { TrackedApplicationRow } from '@/lib/applications'

const props = defineProps<{
  applications: TrackedApplicationRow[]
}>()

const emit = defineEmits<{
  (e: 'remove', matchId: string): void
}>()

const statusConfig: Record<ApplicationStatus, { label: string; chipClass: string; countClass: string }> = {
  saved: { label: 'Saved', chipClass: 'bg-gray-100 text-gray-600', countClass: 'text-gray-600' },
  applied: { label: 'Applied', chipClass: 'bg-blue-50 text-blue-700', countClass: 'text-blue-600' },
  interviewing: { label: 'Interviewing', chipClass: 'bg-purple-50 text-purple-700', countClass: 'text-purple-600' },
  rejected: { label: 'Rejected', chipClass: 'bg-red-50 text-red-700', countClass: 'text-red-600' },
  ghosted: { label: 'Ghosted', chipClass: 'bg-amber-50 text-amber-700', countClass: 'text-amber-600' },
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
</script>

<template>
  <div class="card p-5">
    <div class="mb-4 flex items-center gap-2.5">
      <font-awesome-icon
        :icon="['fas', 'clipboard-list']"
        class="text-brand-primary"
        aria-hidden="true"
      />
      <h3 class="font-heading font-semibold text-brand-charcoal">Application Tracker</h3>
      <span v-if="totalTracked" class="ml-auto text-xs text-neutral-body">
        {{ totalTracked }} total
      </span>
    </div>

    <!-- Status summary bar -->
    <div
      v-if="totalTracked"
      class="mb-4 grid grid-cols-5 gap-1.5 rounded-[12px] bg-neutral-bg p-2"
    >
      <div
        v-for="s in statusOrder"
        :key="s"
        class="flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5"
      >
        <span class="text-lg font-bold leading-none" :class="statusConfig[s].countClass">
          {{ countsByStatus[s] }}
        </span>
        <span class="text-[10px] font-medium uppercase tracking-wide text-neutral-body">
          {{ statusConfig[s].label }}
        </span>
      </div>
    </div>

    <!-- Recent applications list -->
    <ul v-if="recentApplications.length" class="flex flex-col gap-2">
      <li
        v-for="app in recentApplications"
        :key="app.id"
        class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-bg/60"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-brand-charcoal">
            {{ app.title ?? 'Untitled role' }}
          </p>
          <p class="truncate text-sm text-neutral-body">
            {{ app.company ?? 'Unknown company' }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span
            class="rounded-[12px] px-3 py-1 text-xs font-semibold"
            :class="statusConfig[app.status]?.chipClass"
          >
            {{ statusConfig[app.status]?.label ?? app.status }}
          </span>
          <button
            type="button"
            class="text-xs text-neutral-body hover:text-red-500 transition-colors focus:outline-none"
            aria-label="Remove application tracking"
            title="Remove"
            @click="emit('remove', app.matchId)"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <p v-else class="text-sm text-neutral-body">
      You haven't tracked any applications yet. Use the status dropdown on any job card to
      mark it as Applied, Interviewing, Rejected, or Ghosted.
    </p>
  </div>
</template>
