<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Institutional Leads
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        The B2B/institutional sales pipeline: universities, employers, career partners, and
        workforce orgs, from both outbound connectors and inbound partner-page fills.
      </p>
    </header>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div class="w-full sm:max-w-xs">
            <label
              for="search"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Search by organization
            </label>
            <input
              id="search"
              v-model="search"
              type="search"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-white"
              placeholder="University of..."
              @keyup.enter="handleSearch"
            >
          </div>
          <div class="w-full sm:w-44">
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
              <option
                v-for="s in STATUSES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </div>
          <div class="w-full sm:w-44">
            <label
              for="category-filter"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Category
            </label>
            <select
              id="category-filter"
              v-model="categoryFilter"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
              @change="handleSearch"
            >
              <option value="">
                All
              </option>
              <option
                v-for="c in CATEGORIES"
                :key="c"
                :value="c"
              >
                {{ c }}
              </option>
            </select>
          </div>
          <div class="w-full sm:w-44">
            <label
              for="source-filter"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Source
            </label>
            <select
              id="source-filter"
              v-model="sourceFilter"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
              @change="handleSearch"
            >
              <option value="">
                All
              </option>
              <option
                v-for="s in SOURCES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </div>
          <div class="w-full sm:w-40">
            <label
              for="has-contact-filter"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Has contact
            </label>
            <select
              id="has-contact-filter"
              v-model="hasContactFilter"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
              @change="handleSearch"
            >
              <option value="">
                All
              </option>
              <option value="yes">
                Yes
              </option>
              <option value="no">
                No
              </option>
            </select>
          </div>
          <div class="w-full sm:w-56">
            <label
              for="sort-by"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Sort by
            </label>
            <select
              id="sort-by"
              v-model="sortBy"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
              @change="handleSearch"
            >
              <option value="opportunity_score">
                Opportunity score (high to low)
              </option>
              <option value="created_at">
                Newest first
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
                Organization
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Category
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Score
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Status
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Decision maker
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Contact
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Campaign
              </th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">
                Override status
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="lead in leads"
              :key="lead.id"
              :class="lead.status === 'bounced' ? 'bg-red-50/60' : undefined"
            >
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="font-medium text-brand-charcoal">
                  {{ lead.organization_name }}
                </div>
                <div class="text-xs text-neutral-muted">
                  {{ lead.source }}
                </div>
                <router-link
                  :to="`/admin/partner-dashboard/${lead.id}`"
                  class="text-xs text-brand-primary hover:underline"
                >
                  Partner dashboard
                </router-link>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ lead.category }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ lead.opportunity_score ?? '—' }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="statusBadgeClass(lead.status)"
                >
                  {{ lead.status }}
                </span>
                <div
                  v-if="lead.status === 'bounced' && lead.last_send_error"
                  class="text-[11px] text-red-700 mt-1 max-w-[16rem]"
                >
                  {{ lead.last_send_error }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="text-brand-charcoal">
                  {{ lead.decision_maker_name ?? '—' }}
                </div>
                <div
                  v-if="lead.decision_maker_title"
                  class="text-xs text-neutral-muted"
                >
                  {{ lead.decision_maker_title }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ lead.contact_email ?? '—' }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ lead.campaign ?? '—' }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="flex flex-col items-end gap-2">
                  <select
                    v-model="drafts[lead.id]"
                    class="w-full max-w-[9rem] rounded-lg border border-neutral-border px-2 py-1 text-xs"
                  >
                    <option
                      v-for="s in STATUSES"
                      :key="s"
                      :value="s"
                    >
                      {{ s }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn-primary text-xs"
                    :disabled="mutatingId === lead.id || drafts[lead.id] === lead.status"
                    @click="handleStatusUpdate(lead)"
                  >
                    {{ mutatingId === lead.id ? 'Saving…' : 'Update' }}
                  </button>
                  <p
                    v-if="rowError[lead.id]"
                    class="text-[11px] text-red-600 text-right"
                  >
                    {{ rowError[lead.id] }}
                  </p>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && leads.length === 0">
              <td
                colspan="8"
                class="px-4 sm:px-6 py-6 text-center text-sm text-neutral-body"
              >
                No institutional leads found.
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
          leads
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
import { adminAPI, institutionalLeadStatusBadgeClass, type AdminInstitutionalLeadRow, type InstitutionalLeadStatus } from '@/lib/admin'

// category/source/status are plain-text columns (no DB enum) - lists mirror
// submit-partner-lead's VALID_CATEGORIES and the outbound connector scripts' `source` values.
const STATUSES: InstitutionalLeadStatus[] = ['new', 'contacted', 'bounced', 'dead']
const CATEGORIES = ['university', 'employer', 'career_partner', 'workforce_org']
const SOURCES = ['college_scorecard', 'warn', 'apollo_career_partner', 'landing_page_form']

const search = ref('')
const statusFilter = ref('')
const categoryFilter = ref('')
const sourceFilter = ref('')
const hasContactFilter = ref<'' | 'yes' | 'no'>('')
const sortBy = ref<'created_at' | 'opportunity_score'>('opportunity_score')
const loading = ref(false)
const error = ref<string | null>(null)
const leads = ref<AdminInstitutionalLeadRow[]>([])
const page = ref(0)
const pageSize = 25
const total = ref(0)
const mutatingId = ref<string | null>(null)
const rowError = reactive<Record<string, string>>({})
const drafts = reactive<Record<string, InstitutionalLeadStatus>>({})

const statusBadgeClass = institutionalLeadStatusBadgeClass

const fetchLeads = async () => {
  loading.value = true
  error.value = null

  try {
    const { data, error: apiError } = await adminAPI.listInstitutionalLeads({
      search: search.value.trim() || undefined,
      status: statusFilter.value || undefined,
      category: categoryFilter.value || undefined,
      source: sourceFilter.value || undefined,
      hasContact: hasContactFilter.value ? hasContactFilter.value === 'yes' : undefined,
      sortBy: sortBy.value,
      sortAscending: false,
      limit: pageSize,
      offset: page.value * pageSize,
    })

    if (apiError) {
      error.value = apiError.message
      return
    }

    leads.value = data?.leads ?? []
    total.value = data?.total ?? leads.value.length

    for (const lead of leads.value) {
      drafts[lead.id] = lead.status as InstitutionalLeadStatus
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  page.value = 0
  await fetchLeads()
}

const goToPage = async (newPage: number) => {
  if (newPage < 0) return
  page.value = newPage
  await fetchLeads()
}

const handleStatusUpdate = async (lead: AdminInstitutionalLeadRow) => {
  const newStatus = drafts[lead.id]
  if (!newStatus || newStatus === lead.status) return

  mutatingId.value = lead.id
  rowError[lead.id] = ''

  try {
    const { data, error: apiError } = await adminAPI.updateInstitutionalLeadStatus(lead.id, newStatus)
    if (apiError) {
      rowError[lead.id] = apiError.message
      return
    }
    if (!data) return

    const idx = leads.value.findIndex((l) => l.id === lead.id)
    if (idx !== -1) {
      leads.value[idx] = { ...leads.value[idx], ...data }
    }
  } finally {
    mutatingId.value = null
  }
}

onMounted(fetchLeads)
</script>
