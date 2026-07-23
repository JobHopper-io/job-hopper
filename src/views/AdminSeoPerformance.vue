<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        SEO Page Performance
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Pageviews, signups, and paying conversions attributed to each static SEO page's
        <code>url_path</code>. Expect mostly-zero numbers while pages are still getting indexed.
      </p>
    </header>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Pages
          <span class="text-sm font-normal text-neutral-body">
            ({{ report?.totalRows ?? 0 }})
          </span>
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

      <div v-else-if="report" class="-mx-4 sm:-mx-6 overflow-x-auto max-h-[40rem] overflow-y-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg sticky top-0 z-10">
            <tr>
              <th
                v-for="col in columns"
                :key="col.key"
                class="px-4 sm:px-6 py-3 font-medium text-neutral-muted cursor-pointer select-none whitespace-nowrap"
                :class="col.align === 'right' ? 'text-right' : 'text-left'"
                @click="setSort(col.key)"
              >
                {{ col.label }}
                <font-awesome-icon
                  v-if="sortKey === col.key"
                  :icon="['fas', 'chevron-down']"
                  class="ml-1 transition-transform"
                  :class="{ 'rotate-180': sortDir === 'asc' }"
                  aria-hidden="true"
                />
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="row in sortedRows" :key="row.urlPath">
              <td class="px-4 sm:px-6 py-3 align-top">
                <a
                  :href="row.urlPath"
                  target="_blank"
                  rel="noopener"
                  class="text-brand-primary hover:underline"
                >{{ row.urlPath }}</a>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ row.pageType }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.views }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.signups }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.payingConversions }}
              </td>
            </tr>
            <tr v-if="sortedRows.length === 0">
              <td colspan="5" class="px-4 sm:px-6 py-6 text-center text-neutral-body">
                No pages to show.
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
import { adminAPI, type SeoPerformanceReport, type SeoPerformanceRow } from '@/lib/admin'

type SortKey = 'urlPath' | 'pageType' | 'views' | 'signups' | 'payingConversions'

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'urlPath', label: 'URL Path' },
  { key: 'pageType', label: 'Type' },
  { key: 'views', label: 'Views', align: 'right' },
  { key: 'signups', label: 'Signups', align: 'right' },
  { key: 'payingConversions', label: 'Paying', align: 'right' },
]

const loading = ref(false)
const loadError = ref<string | null>(null)
const report = ref<SeoPerformanceReport | null>(null)
const sortKey = ref<SortKey>('views')
const sortDir = ref<'asc' | 'desc'>('desc')

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'urlPath' || key === 'pageType' ? 'asc' : 'desc'
  }
}

const sortedRows = computed<SeoPerformanceRow[]>(() => {
  if (!report.value) return []
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...report.value.rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * dir
    }
    return ((av as number) - (bv as number)) * dir
  })
})

async function loadReport() {
  loading.value = true
  loadError.value = null
  try {
    const { data, error } = await adminAPI.getSeoPerformanceReport()
    if (error) {
      loadError.value = error.message
      return
    }
    if (!data) {
      loadError.value = 'No data returned from server.'
      return
    }
    report.value = data
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
