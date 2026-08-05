<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { employerAPI } from '@/lib/employer'
import type { EmployerAccount, EmployerRevealRequest } from '@/types/database'
import type { CandidateSearchResult } from '@/lib/employer'
import { ROLE_CATEGORIES, getRoleCategoryLabel } from '@/lib/roleCategories'
import { CAREER_LEVEL_OPTIONS } from '@/lib/freemium'

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

const activeTab = ref<'search' | 'requests'>('search')

const roleCategory = ref('')
const careerLevel = ref('')
const location = ref('')
const isSearching = ref(false)
const searchError = ref('')
const hasSearched = ref(false)
const results = ref<CandidateSearchResult[]>([])
const requestedIds = ref(new Set<string>())

function careerLevelLabel(value: string | null): string {
  return CAREER_LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? value ?? 'Unspecified'
}

const handleSearch = async () => {
  isSearching.value = true
  searchError.value = ''
  try {
    const { data, error } = await employerAPI.searchCandidates({
      roleCategory: roleCategory.value,
      careerLevel: careerLevel.value,
      location: location.value,
    })
    if (error) {
      searchError.value = error.message
      results.value = []
      return
    }
    results.value = data ?? []
    hasSearched.value = true
  } finally {
    isSearching.value = false
  }
}

async function handleRequestReveal(candidateId: string) {
  const { error } = await employerAPI.sendRevealRequest(candidateId)
  // already_requested still means the employer can't request again - treat it the same as
  // success so the button reflects reality either way.
  if (!error || error.message === 'already_requested') {
    requestedIds.value.add(candidateId)
  }
}

const sentRequests = ref<EmployerRevealRequest[]>([])
const isLoadingRequests = ref(false)
const requestsError = ref('')
let hasLoadedRequests = false

async function selectTab(tab: 'search' | 'requests') {
  activeTab.value = tab
  if (tab === 'requests' && !hasLoadedRequests) {
    hasLoadedRequests = true
    isLoadingRequests.value = true
    const { data, error } = await employerAPI.getSentRevealRequests()
    if (error) {
      requestsError.value = error.message
    } else {
      sentRequests.value = data ?? []
    }
    isLoadingRequests.value = false
  }
}

function requestStatusMeta(status: string) {
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

const cancellingId = ref<string | null>(null)

async function handleCancelRequest(req: EmployerRevealRequest) {
  cancellingId.value = req.id
  try {
    const { error } = await employerAPI.cancelRevealRequest(req.id)
    if (!error) {
      requestedIds.value.delete(req.candidate_profile_id)
      const { data } = await employerAPI.getSentRevealRequests()
      sentRequests.value = data ?? []
    }
  } finally {
    cancellingId.value = null
  }
}
</script>

<template>
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-4xl">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal">Employer dashboard</h1>

      <div v-if="isLoading" class="mt-6 flex items-center gap-2 text-neutral-body">
        <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
        <span>Loading…</span>
      </div>

      <template v-else-if="account">
        <div class="mt-6 rounded-[16px] border border-neutral-border bg-white p-6">
          <p class="text-sm text-neutral-body">Signed in as</p>
          <p class="text-lg font-heading font-semibold text-brand-charcoal">{{ account.company_name }}</p>
          <p class="text-sm text-neutral-body">{{ account.work_email }}</p>

          <span
            class="mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
            :class="statusMeta.className"
          >
            {{ statusMeta.label }}
          </span>
        </div>

        <p v-if="account.verification_status !== 'verified'" class="mt-6 text-sm text-neutral-body">
          Candidate search unlocks once your account is verified — we'll email you as soon as it is.
        </p>

        <template v-else>
          <div class="mt-6 flex gap-2 border-b border-neutral-border">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium"
              :class="activeTab === 'search' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-neutral-body'"
              @click="selectTab('search')"
            >
              Search candidates
            </button>
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium"
              :class="activeTab === 'requests' ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-neutral-body'"
              @click="selectTab('requests')"
            >
              My requests
            </button>
          </div>

          <div v-if="activeTab === 'requests'" class="mt-6">
            <div v-if="isLoadingRequests" class="flex items-center gap-2 text-neutral-body">
              <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
              <span>Loading…</span>
            </div>
            <div v-else-if="requestsError" class="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {{ requestsError }}
            </div>
            <p v-else-if="!sentRequests.length" class="text-sm text-neutral-body">
              You haven't requested an introduction to any candidates yet.
            </p>
            <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                v-for="req in sentRequests"
                :key="req.id"
                class="rounded-[16px] border border-neutral-border bg-white p-5"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="font-heading font-semibold text-brand-charcoal">
                    {{ req.candidate_job_title || 'Untitled role' }}
                  </p>
                  <span
                    class="inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold"
                    :class="requestStatusMeta(req.status).className"
                  >
                    {{ requestStatusMeta(req.status).label }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-neutral-body">
                  {{ careerLevelLabel(req.candidate_career_level) }}
                  <span v-if="req.candidate_years_of_experience != null">
                    · {{ req.candidate_years_of_experience }} yrs experience
                  </span>
                </p>
                <div v-if="req.status === 'approved'" class="mt-3 rounded-[12px] bg-neutral-bg p-3 text-sm">
                  <p class="font-medium text-brand-charcoal">
                    {{ req.revealed_first_name }} {{ req.revealed_last_name }}
                  </p>
                  <p class="text-neutral-body">{{ req.revealed_email }}</p>
                  <p v-if="req.revealed_phone_number" class="text-neutral-body">{{ req.revealed_phone_number }}</p>
                </div>
                <button
                  v-if="req.status === 'pending'"
                  type="button"
                  :disabled="cancellingId === req.id"
                  class="mt-4 h-9 rounded-full border border-neutral-border px-4 text-sm font-medium text-neutral-body hover:bg-neutral-bg disabled:cursor-not-allowed disabled:opacity-50"
                  @click="handleCancelRequest(req)"
                >
                  Cancel request
                </button>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'search'" class="mt-6 rounded-[16px] border border-neutral-border bg-white p-6">
            <h2 class="text-lg font-heading font-semibold text-brand-charcoal">Search candidates</h2>
            <p class="mt-1 text-sm text-neutral-body">
              Results show title, experience, and general location only — never a name, resume, or
              contact info.
            </p>

            <form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" @submit.prevent="handleSearch">
              <div>
                <label for="search-role" class="block text-sm font-medium text-brand-charcoal mb-2">Role</label>
                <select id="search-role" v-model="roleCategory" class="input">
                  <option value="">Any role</option>
                  <option v-for="opt in ROLE_CATEGORIES" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <label for="search-level" class="block text-sm font-medium text-brand-charcoal mb-2">
                  Career level
                </label>
                <select id="search-level" v-model="careerLevel" class="input">
                  <option value="">Any level</option>
                  <option v-for="opt in CAREER_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <label for="search-location" class="block text-sm font-medium text-brand-charcoal mb-2">
                  Location
                </label>
                <input
                  id="search-location"
                  v-model="location"
                  type="text"
                  class="input"
                  placeholder="e.g. CA, Austin"
                />
              </div>
              <div class="sm:col-span-3">
                <button
                  type="submit"
                  :disabled="isSearching"
                  class="btn-primary flex h-12 items-center justify-center gap-2 px-6 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <font-awesome-icon v-if="isSearching" :icon="['fas', 'spinner']" spin aria-hidden="true" />
                  <span>{{ isSearching ? 'Searching…' : 'Search' }}</span>
                </button>
              </div>
            </form>

            <div v-if="searchError" class="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {{ searchError }}
            </div>
          </div>

          <div v-show="activeTab === 'search' && hasSearched" class="mt-6">
            <p class="text-sm text-neutral-body">{{ results.length }} candidate{{ results.length === 1 ? '' : 's' }}</p>

            <div v-if="results.length" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                v-for="candidate in results"
                :key="candidate.id"
                class="rounded-[16px] border border-neutral-border bg-white p-5"
              >
                <p class="font-heading font-semibold text-brand-charcoal">
                  {{ candidate.current_job_title || 'Untitled role' }}
                </p>
                <p class="mt-1 text-sm text-neutral-body">
                  {{ careerLevelLabel(candidate.career_level) }}
                  <span v-if="candidate.years_of_experience != null">
                    · {{ candidate.years_of_experience }} yrs experience
                  </span>
                </p>
                <div v-if="candidate.target_role_categories?.length" class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="cat in candidate.target_role_categories"
                    :key="cat"
                    class="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary"
                  >
                    {{ getRoleCategoryLabel(cat) }}
                  </span>
                </div>
                <div v-if="candidate.preferred_locations?.length" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="loc in candidate.preferred_locations"
                    :key="loc"
                    class="rounded-full bg-neutral-bg px-2.5 py-1 text-xs text-neutral-body"
                  >
                    {{ loc }}
                  </span>
                </div>
                <button
                  type="button"
                  :disabled="requestedIds.has(candidate.id)"
                  class="btn-primary mt-4 h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  @click="handleRequestReveal(candidate.id)"
                >
                  {{ requestedIds.has(candidate.id) ? 'Requested' : 'Request intro' }}
                </button>
              </div>
            </div>

            <p v-else class="mt-3 text-sm text-neutral-body">No candidates match those filters yet.</p>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
