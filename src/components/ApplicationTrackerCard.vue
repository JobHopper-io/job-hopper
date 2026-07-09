<script lang="ts">
export type ApplicationStatus = 'Applied' | 'Interviewing' | 'Offer'

export interface TrackedApplication {
  id: string
  title: string
  company: string
  status: ApplicationStatus
}
</script>

<script setup lang="ts">
/**
 * Compact Application Tracker card (Core+ dashboard).
 *
 * Presentational only. There is no applications data model yet — the full
 * tracker is a later (Day 22-30) feature — so callers pass whatever rows exist
 * (currently none) and the card renders a clean empty state until then. When the
 * backing table/API lands, feed it real rows and the list renders automatically.
 */
defineProps<{
  applications: TrackedApplication[]
}>()

/** Status chip styling. Offer = success green, Interviewing = brand blue, Applied = neutral. */
const statusChipClass: Record<ApplicationStatus, string> = {
  Applied: 'bg-gray-100 text-gray-600',
  Interviewing: 'bg-blue-50 text-blue-700',
  Offer: 'bg-green-50 text-green-700',
}
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
    </div>

    <ul v-if="applications.length" class="flex flex-col gap-3.5">
      <li
        v-for="app in applications"
        :key="app.id"
        class="flex items-center justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-brand-charcoal">{{ app.title }}</p>
          <p class="truncate text-sm text-neutral-body">{{ app.company }}</p>
        </div>
        <span
          class="shrink-0 rounded-[12px] px-3 py-1 text-xs font-semibold"
          :class="statusChipClass[app.status]"
        >
          {{ app.status }}
        </span>
      </li>
    </ul>

    <p v-else class="text-sm text-neutral-body">
      You haven't tracked any applications yet. Roles you apply to will show up here with
      their status — Applied, Interviewing, and Offer.
    </p>
  </div>
</template>
