<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { employerAPI } from '@/lib/employer'
import type { EmployerAccount } from '@/types/database'

const account = ref<EmployerAccount | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  const { data } = await employerAPI.getCurrentEmployerAccount()
  account.value = data
  isLoading.value = false
})

const statusMeta = computed(() => {
  switch (account.value?.verification_status) {
    case 'verified':
      return { label: 'Verified', className: 'bg-green-50 text-green-700 border-green-200' }
    case 'rejected':
      return { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: 'Pending review', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  }
})
</script>

<template>
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal">Employer dashboard</h1>

      <div v-if="isLoading" class="mt-6 flex items-center gap-2 text-neutral-body">
        <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
        <span>Loading…</span>
      </div>

      <div v-else-if="account" class="mt-6 rounded-[16px] border border-neutral-border bg-white p-6">
        <p class="text-sm text-neutral-body">Signed in as</p>
        <p class="text-lg font-heading font-semibold text-brand-charcoal">{{ account.company_name }}</p>
        <p class="text-sm text-neutral-body">{{ account.work_email }}</p>

        <span
          class="mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
          :class="statusMeta.className"
        >
          {{ statusMeta.label }}
        </span>

        <p class="mt-6 text-sm text-neutral-body">
          Candidate search isn't live yet — we'll email you as soon as it is.
        </p>
      </div>
    </div>
  </div>
</template>
