<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { applicationsAPI, type TrackedApplicationRow } from '@/lib/applications'
import ApplicationTrackerCard from '@/components/ApplicationTrackerCard.vue'

const userStore = useUserStore()
const { baseTier } = storeToRefs(userStore)

const trackedApplications = ref<TrackedApplicationRow[]>([])
const isLoading = ref(true)

async function loadApplications() {
  isLoading.value = true
  try {
    const { data, error } = await applicationsAPI.getAll()
    if (!error) trackedApplications.value = data
  } finally {
    isLoading.value = false
  }
}

async function handleRemoveApplication(matchId: string) {
  const { error } = await applicationsAPI.remove(matchId)
  if (!error) await loadApplications()
}

onMounted(() => {
  if (baseTier.value !== 'free') void loadApplications()
})
</script>

<template>
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-5xl mx-auto">
      <div class="mb-8 flex items-center gap-3">
        <span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
          <font-awesome-icon :icon="['fas', 'clipboard-list']" aria-hidden="true" />
        </span>
        <div>
          <h1 class="text-3xl font-heading font-bold text-brand-charcoal">Application Tracker</h1>
          <p class="text-neutral-body">Every job you've applied to, in one place.</p>
        </div>
      </div>

      <!-- Free: locked teaser, same "upgrade to unlock" pattern as the dashboard's Resume
           Advice / Hiring Intel cards - Core (not just Premium) already unlocks this. -->
      <div v-if="baseTier === 'free'" class="card max-w-xl p-6">
        <div class="mb-4 flex items-center gap-2.5">
          <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-primary" aria-hidden="true" />
          <h3 class="font-heading font-semibold text-brand-charcoal">Application Tracker is a Core+ feature</h3>
        </div>
        <p class="text-sm text-neutral-body mb-4">
          Tag any job as Saved, Applied, Interviewing, Rejected, or Ghosted from its job card, and
          see every application status, in one place, without hunting back through old emails.
        </p>
        <router-link :to="{ name: 'billing-purchase' }" class="btn-primary inline-flex items-center justify-center">
          View plans and upgrade
        </router-link>
      </div>

      <template v-else>
        <div v-if="isLoading" class="text-center py-12">
          <font-awesome-icon :icon="['fas', 'spinner']" spin class="h-8 w-8 text-brand-primary mx-auto mb-4" aria-hidden="true" />
          <p class="text-neutral-body">Loading...</p>
        </div>
        <ApplicationTrackerCard
          v-else
          :applications="trackedApplications"
          @remove="handleRemoveApplication"
        />
      </template>
    </div>
  </div>
</template>
