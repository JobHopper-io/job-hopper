<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Employer Review
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Approve, reject, or suspend employer accounts for Recruiter-Visible Mode.
      </p>
    </header>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="w-full sm:max-w-xs">
            <label
              for="search"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Search by company or email
            </label>
            <input
              id="search"
              v-model="search"
              type="search"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-white"
              placeholder="Acme Inc or hiring@acme.com"
              @keyup.enter="handleSearch"
            >
          </div>
          <div class="w-full sm:w-48">
            <label
              for="status-filter"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Status
            </label>
            <select
              id="status-filter"
              v-model="statusFilter"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
              @change="handleSearch"
            >
              <option value="">
                All
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="verified">
                Verified
              </option>
              <option value="rejected">
                Rejected
              </option>
              <option value="suspended">
                Suspended
              </option>
            </select>
          </div>
        </div>
        <div class="flex items-end gap-3">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="loading"
            @click="handleSearch"
          >
            {{ loading ? 'Searching…' : 'Search' }}
          </button>
          <p
            v-if="error"
            class="text-sm text-red-600"
          >
            {{ error }}
          </p>
        </div>
      </div>

      <div class="-mx-4 sm:-mx-6 lg:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Company
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Work email
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Status
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Last reviewed
              </th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">
                Review
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="employer in employers"
              :key="employer.id"
            >
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="font-medium text-brand-charcoal">
                  {{ employer.company_name }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="text-neutral-body">
                  {{ employer.work_email }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="statusBadgeClass(employer.verification_status)"
                >
                  {{ employer.verification_status }}
                </span>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div
                  v-if="employer.reviewed_at"
                  class="text-neutral-body text-xs"
                >
                  {{ new Date(employer.reviewed_at).toLocaleDateString() }}
                  <div
                    v-if="employer.review_reason"
                    class="text-neutral-muted"
                  >
                    {{ employer.review_reason }}
                  </div>
                </div>
                <span
                  v-else
                  class="text-neutral-muted"
                >
                  —
                </span>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="flex flex-col items-end gap-2">
                  <select
                    v-model="drafts[employer.id].status"
                    class="w-full max-w-[9rem] rounded-lg border border-neutral-border px-2 py-1 text-xs"
                  >
                    <option value="verified">
                      Verified
                    </option>
                    <option value="rejected">
                      Rejected
                    </option>
                    <option value="suspended">
                      Suspended
                    </option>
                  </select>
                  <input
                    v-model="drafts[employer.id].reason"
                    type="text"
                    placeholder="Reason (optional)"
                    class="w-full max-w-[9rem] rounded-lg border border-neutral-border px-2 py-1 text-xs"
                  >
                  <button
                    type="button"
                    class="btn-primary text-xs"
                    :disabled="mutatingId === employer.id"
                    @click="handleReview(employer)"
                  >
                    {{ mutatingId === employer.id ? 'Saving…' : 'Update' }}
                  </button>
                  <p
                    v-if="rowError[employer.id]"
                    class="text-[11px] text-red-600 text-right"
                  >
                    {{ rowError[employer.id] }}
                  </p>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && employers.length === 0">
              <td
                colspan="5"
                class="px-4 sm:px-6 py-6 text-center text-sm text-neutral-body"
              >
                No employer accounts found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="total > pageSize"
        class="flex items-center justify-between pt-4 border-t border-neutral-border text-xs text-neutral-body"
      >
        <p>
          Showing
          {{ page * pageSize + 1 }}
          –
          {{ Math.min((page + 1) * pageSize, total) }}
          of
          {{ total }}
          employers
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-1 rounded-md border border-neutral-border text-xs"
            :disabled="page === 0 || loading"
            @click="goToPage(page - 1)"
          >
            Previous
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded-md border border-neutral-border text-xs"
            :disabled="(page + 1) * pageSize >= total || loading"
            @click="goToPage(page + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { adminAPI } from '@/lib/admin'

interface AdminEmployerRow {
  id: string
  company_name: string
  work_email: string
  verification_status: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_reason: string | null
}

const search = ref('')
const statusFilter = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const employers = ref<AdminEmployerRow[]>([])
const page = ref(0)
const pageSize = 25
const total = ref(0)
const mutatingId = ref<string | null>(null)
const rowError = reactive<Record<string, string>>({})
const drafts = reactive<Record<string, { status: 'verified' | 'rejected' | 'suspended'; reason: string }>>({})

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'verified':
      return 'bg-green-100 text-green-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    case 'suspended':
      return 'bg-neutral-800 text-white'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

const fetchEmployers = async () => {
  loading.value = true
  error.value = null

  try {
    const { data, error: apiError } = await adminAPI.listEmployers({
      search: search.value.trim() || undefined,
      status: statusFilter.value || undefined,
      limit: pageSize,
      offset: page.value * pageSize,
    })

    if (apiError) {
      error.value = apiError.message
      return
    }

    employers.value = data?.employers ?? []
    total.value = data?.total ?? employers.value.length

    for (const employer of employers.value) {
      if (!drafts[employer.id]) {
        drafts[employer.id] = { status: 'verified', reason: '' }
      }
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  page.value = 0
  await fetchEmployers()
}

const goToPage = async (newPage: number) => {
  if (newPage < 0) return
  page.value = newPage
  await fetchEmployers()
}

const handleReview = async (employer: AdminEmployerRow) => {
  const draft = drafts[employer.id]
  if (!draft) return

  mutatingId.value = employer.id
  rowError[employer.id] = ''

  try {
    const { data, error: apiError } = await adminAPI.reviewEmployer(
      employer.id,
      draft.status,
      draft.reason.trim() || undefined,
    )
    if (apiError) {
      rowError[employer.id] = apiError.message
      return
    }
    if (!data) return

    const idx = employers.value.findIndex((e) => e.id === employer.id)
    if (idx !== -1) {
      employers.value[idx] = { ...employers.value[idx], ...data.employer }
    }
    drafts[employer.id] = { status: 'verified', reason: '' }
  } finally {
    mutatingId.value = null
  }
}

onMounted(fetchEmployers)
</script>
