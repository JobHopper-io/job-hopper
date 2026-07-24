<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Acquisition Channels
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Signups and paying conversions by first-touch channel (SEO, paid/campaign, or
        unattributed direct). Referral and outbound-BD channels aren't tracked here yet.
      </p>
    </header>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Channels
          <span class="text-sm font-normal text-neutral-body">
            ({{ report?.totalSignups ?? 0 }} total signups)
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

      <div v-else-if="report" class="-mx-4 sm:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Channel</th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">Signups</th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">Paying</th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">Conversion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="row in report.rows" :key="row.channel">
              <td class="px-4 sm:px-6 py-3 align-top capitalize">
                {{ row.channel }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.signups }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ row.payingConversions }}
              </td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">
                {{ (row.conversionRate * 100).toFixed(1) }}%
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
import { onMounted, ref } from 'vue'
import { adminAPI, type AcquisitionChannelReport } from '@/lib/admin'

const loading = ref(false)
const loadError = ref<string | null>(null)
const report = ref<AcquisitionChannelReport | null>(null)

async function loadReport() {
  loading.value = true
  loadError.value = null
  try {
    const { data, error } = await adminAPI.getAcquisitionChannelReport()
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
