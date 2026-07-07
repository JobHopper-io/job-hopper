<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        User Report
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Counts and per-user categories are mutually exclusive: incomplete onboarding, Stripe free trial,
        freemium (onboarded, no subscription rows), active paid subscription, or churned (canceled only).
      </p>
    </header>

    <p
      v-if="truncated"
      class="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3"
    >
      Report is limited to the first 10,000 profiles. Totals may be incomplete for larger databases.
    </p>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Summary
        </h2>
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="loading"
          @click="loadReport"
        >
          <font-awesome-icon
            v-if="loading"
            :icon="['fas', 'spinner']"
            spin
            class="mr-2"
            aria-hidden="true"
          />
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <p v-if="loadError" class="text-sm text-red-600 mb-4">
        {{ loadError }}
      </p>

      <p v-else-if="loading && !report" class="text-sm text-neutral-body">
        Loading report…
      </p>

      <div v-else-if="report" class="-mx-4 sm:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Category
              </th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">
                Users
              </th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">
                % of total
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="row in visibleSummary"
              :key="row.category"
              class="cursor-pointer hover:bg-neutral-bg/80"
              :class="{ 'bg-brand-primary/5': categoryFilter === row.category }"
              @click="categoryFilter = row.category"
            >
              <td class="px-4 sm:px-6 py-3 font-medium text-brand-charcoal">
                {{ categoryLabel(row.category) }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.count }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.pct }}%
              </td>
            </tr>
            <tr class="bg-neutral-bg/50 font-medium">
              <td class="px-4 sm:px-6 py-3 text-brand-charcoal">
                Total
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-brand-charcoal tabular-nums">
                {{ report.totalProfiles }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-brand-charcoal tabular-nums">
                100%
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-neutral-body px-4 sm:px-6">
          Click a summary row to filter the user list below.
        </p>
      </div>
    </section>

    <section
      v-if="report"
      class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Users
          <span class="text-sm font-normal text-neutral-body">
            ({{ filteredUsers.length }}{{ categoryFilter ? ' filtered' : '' }})
          </span>
        </h2>
        <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
          <button
            type="button"
            class="btn-secondary text-sm whitespace-nowrap"
            @click="downloadCsv"
          >
            <font-awesome-icon :icon="['fas', 'download']" class="mr-2" aria-hidden="true" />
            Download all users (CSV)
          </button>
          <div class="w-full sm:max-w-xs">
            <label
              for="lifecycle-category-filter"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Category
            </label>
            <select
              id="lifecycle-category-filter"
              v-model="categoryFilter"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">
                All categories
              </option>
              <option
                v-for="cat in categoryOptions"
                :key="cat"
                :value="cat"
              >
                {{ categoryLabel(cat) }}
              </option>
            </select>
          </div>
          <div class="w-full sm:max-w-xs">
            <label
              for="lifecycle-search"
              class="block text-sm font-medium text-brand-charcoal mb-1"
            >
              Search email
            </label>
            <input
              id="lifecycle-search"
              v-model="searchQuery"
              type="search"
              class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
              placeholder="user@example.com"
            >
          </div>
          <button
            v-if="categoryFilter || searchQuery"
            type="button"
            class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div class="-mx-4 sm:-mx-6 overflow-x-auto max-h-[32rem] overflow-y-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg sticky top-0 z-10">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Name
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Email
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Category
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
            >
              <td class="px-4 sm:px-6 py-3 align-top font-medium text-brand-charcoal">
                {{ user.firstName }} {{ user.lastName }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ user.email }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ categoryLabel(user.category) }}
              </td>
            </tr>
            <tr v-if="filteredUsers.length === 0">
              <td
                colspan="3"
                class="px-4 sm:px-6 py-6 text-center text-neutral-body"
              >
                No users match the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="mt-8">
      <router-link
        to="/admin/dashboard"
        class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
      >
        Back to admin
      </router-link>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminAPI } from '@/lib/admin'
import {
  isUserLifecycleSummaryRowVisible,
  USER_LIFECYCLE_CATEGORY_LABELS,
  USER_LIFECYCLE_CATEGORY_ORDER,
  type UserLifecycleCategory,
  type UserLifecycleReport,
} from '@/lib/user-lifecycle'

const loading = ref(false)
const loadError = ref<string | null>(null)
const report = ref<UserLifecycleReport | null>(null)
const truncated = ref(false)
const categoryFilter = ref<UserLifecycleCategory | ''>('')
const searchQuery = ref('')

function categoryLabel(category: UserLifecycleCategory): string {
  return USER_LIFECYCLE_CATEGORY_LABELS[category]
}

const visibleSummary = computed(() => {
  if (!report.value) return []
  return report.value.summary.filter(isUserLifecycleSummaryRowVisible)
})

const categoryOptions = computed(() => {
  if (!report.value) return USER_LIFECYCLE_CATEGORY_ORDER.filter((c) => c !== 'unclassified')
  const withUsers = new Set(
    report.value.users.map((u) => u.category),
  )
  return USER_LIFECYCLE_CATEGORY_ORDER.filter(
    (c) => c !== 'unclassified' || withUsers.has('unclassified'),
  )
})

const filteredUsers = computed(() => {
  if (!report.value) return []
  const q = searchQuery.value.trim().toLowerCase()
  return report.value.users.filter((user) => {
    if (categoryFilter.value && user.category !== categoryFilter.value) {
      return false
    }
    if (q && !user.email.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
})

function clearFilters() {
  categoryFilter.value = ''
  searchQuery.value = ''
}

/** Wrap in quotes and escape internal quotes if the field needs it (comma, quote, or newline). */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadCsv() {
  if (!report.value) return

  const header = ['Name', 'Email', 'Category']
  const rows = report.value.users.map((user) => [
    `${user.firstName} ${user.lastName}`.trim(),
    user.email,
    categoryLabel(user.category),
  ])

  const csv = [header, ...rows]
    .map((row) => row.map(csvField).join(','))
    .join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)

  const link = document.createElement('a')
  link.href = url
  link.download = `job-hopper-user-report-${date}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function loadReport() {
  loading.value = true
  loadError.value = null
  try {
    const { data, error } = await adminAPI.getUserLifecycleReport()
    if (error) {
      loadError.value = error.message
      return
    }
    if (!data) {
      loadError.value = 'No data returned from server.'
      return
    }
    report.value = data
    truncated.value = data.truncated
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load report'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadReport()
})
</script>
