<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { revealRequestsAPI } from '@/lib/revealRequests'
import type { EmployerRevealRequest } from '@/types/database'
import { CAREER_LEVEL_OPTIONS } from '@/lib/freemium'
import { getRoleCategoryLabel } from '@/lib/roleCategories'
import { formatPayRange } from '@/lib/formatJob'

const requests = ref<EmployerRevealRequest[]>([])
const isLoading = ref(true)
const respondingId = ref<string | null>(null)

function careerLevelLabel(value: string | null): string {
  return CAREER_LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? value ?? 'Unspecified'
}

function statusMeta(status: string) {
  switch (status) {
    case 'approved':
      return { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' }
    case 'declined':
      return { label: 'Declined', className: 'bg-red-50 text-red-700 border-red-200' }
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-neutral-bg text-neutral-body border-neutral-border' }
    default:
      return { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  }
}

async function loadRequests() {
  isLoading.value = true
  const { data } = await revealRequestsAPI.getIncoming()
  requests.value = data ?? []
  isLoading.value = false
}

async function respond(requestId: string, decision: 'approved' | 'declined') {
  respondingId.value = requestId
  try {
    const { error } = await revealRequestsAPI.respond(requestId, decision)
    if (!error) await loadRequests()
  } finally {
    respondingId.value = null
  }
}

onMounted(loadRequests)
</script>

<template>
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-5xl mx-auto">
      <div class="mb-8 flex items-center gap-3">
        <span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
          <font-awesome-icon :icon="['fas', 'user-tie']" aria-hidden="true" />
        </span>
        <div>
          <h1 class="text-3xl font-heading font-bold text-brand-charcoal">Recruiter Requests</h1>
          <p class="text-neutral-body">Employers who want to learn more about you. Nothing is shared unless you approve.</p>
        </div>
      </div>

      <div v-if="isLoading" class="text-center py-12">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="h-8 w-8 text-brand-primary mx-auto mb-4" aria-hidden="true" />
        <p class="text-neutral-body">Loading...</p>
      </div>

      <p v-else-if="!requests.length" class="text-sm text-neutral-body">
        No requests yet. Employers can find and request an introduction once you opt in to recruiter visibility in your profile.
      </p>

      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          v-for="req in requests"
          :key="req.id"
          class="rounded-[16px] border border-neutral-border bg-white p-5"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="font-heading font-semibold text-brand-charcoal">
              {{ req.role_title || 'Untitled role' }}
            </p>
            <span
              class="inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold"
              :class="statusMeta(req.status).className"
            >
              {{ statusMeta(req.status).label }}
            </span>
          </div>
          <p class="text-sm text-neutral-body">at {{ req.employer_company_name }}</p>
          <p v-if="formatPayRange(req.pay_min, req.pay_max, req.pay_type)" class="mt-1 text-sm font-medium text-brand-primary">
            {{ formatPayRange(req.pay_min, req.pay_max, req.pay_type) }}
          </p>
          <p class="mt-2 text-xs text-neutral-body">
            Saw your profile as {{ req.candidate_job_title || 'a candidate' }} ·
            {{ careerLevelLabel(req.candidate_career_level) }}
            <span v-if="req.candidate_years_of_experience != null">
              · {{ req.candidate_years_of_experience }} yrs experience
            </span>
          </p>
          <div v-if="req.candidate_target_role_categories?.length" class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="cat in req.candidate_target_role_categories"
              :key="cat"
              class="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary"
            >
              {{ getRoleCategoryLabel(cat) }}
            </span>
          </div>
          <div v-if="req.candidate_preferred_locations?.length" class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="loc in req.candidate_preferred_locations"
              :key="loc"
              class="rounded-full bg-neutral-bg px-2.5 py-1 text-xs text-neutral-body"
            >
              {{ loc }}
            </span>
          </div>

          <div v-if="req.status === 'pending'" class="mt-4">
            <p class="text-xs text-neutral-body">
              Approving shares your name, email, and phone number with {{ req.employer_company_name }}.
              Declining shares nothing, and they won't be told why.
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="respondingId === req.id"
                class="btn-primary h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                @click="respond(req.id, 'approved')"
              >
                <font-awesome-icon :icon="['fas', 'check']" aria-hidden="true" />
                Approve
              </button>
              <button
                type="button"
                :disabled="respondingId === req.id"
                class="h-9 rounded-full border border-neutral-border px-4 text-sm font-medium text-neutral-body hover:bg-neutral-bg disabled:cursor-not-allowed disabled:opacity-50"
                @click="respond(req.id, 'declined')"
              >
                <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
                Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
