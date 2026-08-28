<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
          Growth Command Center
        </h1>
        <p class="text-sm text-neutral-body max-w-3xl">
          Real numbers only: every figure below is a live query. Where there's no data source yet
          (visitors, reply rate, calls booked, bulk-license/recovered revenue), it says so instead
          of showing a fabricated placeholder.
        </p>
      </div>
      <button
        type="button"
        class="btn-primary text-sm whitespace-nowrap"
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
    </header>

    <p v-if="loadError" class="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      {{ loadError }}
    </p>

    <p v-else-if="loading && !report" class="text-sm text-neutral-body">
      Loading…
    </p>

    <div v-else-if="report" class="space-y-8">
      <!-- Acquisition (institutional outbound) -->
      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Acquisition (institutional)
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          Outbound B2B lead generation — discovery volume, not work-in-progress. Full pipeline on
          <router-link to="/admin/institutional-leads" class="text-brand-primary hover:underline">
            Institutional Leads
          </router-link>.
        </p>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatTile
            label="Leads discovered"
            :value="report.acquisition.totalLeads"
            hint="all sources, any status"
          />
          <StatTile
            label="Qualified organizations"
            :value="report.acquisition.qualifiedOrganizations"
            hint="opportunity score ≥ 50"
          />
          <StatTile
            label="Emails sent"
            :value="report.acquisition.emailsSent"
            hint="status = contacted"
          />
          <StatTile
            label="Reply rate"
            not-tracked
            hint="reply classification not built yet"
          />
        </dl>

        <p class="text-xs font-medium text-neutral-muted mb-3">
          Leads discovered by source
        </p>
        <HorizontalBarChart
          v-if="leadsBySourceRows.length > 0"
          :rows="leadsBySourceRows"
        />
        <ChartEmptyState v-else message="No leads discovered yet." />

        <p class="text-xs text-neutral-muted mt-5 pt-4 border-t border-neutral-border">
          {{ report.acquisition.emailsSent.toLocaleString() }} of
          {{ report.acquisition.totalLeads.toLocaleString() }} discovered leads have been emailed so far
          ({{ formatPct(emailSendRate) }}) — the rest are undiscovered work, not yet contacted. Calls booked:
          not tracked anywhere.
        </p>
      </section>

      <!-- B2C -->
      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          B2C
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          Consumer signups and conversion. Per-channel breakdown on
          <router-link to="/admin/acquisition-channels" class="text-brand-primary hover:underline">
            Acquisition Channels
          </router-link>; per-user detail on
          <router-link to="/admin/user-lifecycle" class="text-brand-primary hover:underline">
            User Report
          </router-link>.
        </p>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatTile
            label="New — last 24h"
            :value="report.b2c.newSignups.last24h"
            hint="registrations by created_at"
          />
          <StatTile
            label="New — last 7d"
            :value="report.b2c.newSignups.last7d"
            hint="registrations by created_at"
          />
          <StatTile
            label="Conversion rate"
            :value="formatPct(report.b2c.conversionRate)"
            hint="paid ÷ registrations"
          />
          <StatTile
            label="New paid (by date)"
            not-tracked
            hint="no subscription start timestamp"
          />
        </dl>
        <p class="text-xs text-neutral-muted mb-6 -mt-3">
          Visitors / pre-signup analytics: not captured.
        </p>

        <p class="text-xs font-medium text-neutral-muted mb-3">
          Conversion pipeline: registrations → activated → paid
        </p>
        <HorizontalBarChart :rows="b2cFunnelRows" :max-value="report.b2c.totalSignups" />
      </section>

      <!-- Institutional -->
      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Institutional
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          Pipeline health and conversion from lead to paying org.
        </p>
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <StatTile
            label="Active opportunities"
            :value="report.institutional.activeOpportunities"
            hint="discovered, not dead/bounced — not the same as worked (see Acquisition above)"
          />
          <StatTile
            label="Trial organizations"
            :value="report.institutional.trialOrganizations"
            hint="active trial grant, not expired"
          />
          <StatTile
            label="Closed accounts"
            :value="report.institutional.closedAccounts"
            hint="paid subscriber referred by a lead"
          />
        </dl>

        <p class="text-xs font-medium text-neutral-muted mb-3">
          Proposed seats by recommended package (active leads) — scope estimate, not a dollar pipeline
          value: no per-seat pricing exists yet
        </p>
        <HorizontalBarChart
          v-if="seatPipelineRows.length > 0"
          :rows="seatPipelineRows"
        />
        <ChartEmptyState v-else message="No recommended-package data on active leads yet." />
      </section>

      <!-- Revenue -->
      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Revenue
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          From real subscriptions/subscription_product — active (paying) subscriptions only.
        </p>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <StatTile label="New MRR" :value="formatCents(report.revenue.mrrCents)" />
          <StatTile
            label="Annual revenue"
            :value="formatCents(report.revenue.annualizedRevenueCents)"
            hint="annualized MRR, not invoiced total"
          />
          <StatTile
            label="Bulk-license revenue"
            not-tracked
            hint="no bulk licensing built yet"
          />
          <StatTile
            label="Recovered revenue"
            not-tracked
            hint="no revenue-recovery segments built yet"
          />
        </dl>
        <p class="text-xs text-neutral-muted pt-4 border-t border-neutral-border">
          Churn: {{ report.revenue.churnedCount }} churned users ({{ formatPct(report.revenue.churnRate) }} of all
          signups) — canceled-only subscription, same definition as the "Churned" category on
          <router-link to="/admin/user-lifecycle" class="text-brand-primary hover:underline">
            User Report
          </router-link>.
        </p>
      </section>
    </div>

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
import { adminAPI, b2cFunnelChartRows, leadsBySourceChartRows, type GrowthDashboardReport } from '@/lib/admin'
import StatTile from '@/components/GrowthStatTile.vue'
import HorizontalBarChart from '@/components/HorizontalBarChart.vue'
import ChartEmptyState from '@/components/ChartEmptyState.vue'

// Ordinal ramp, light -> dark, single hue (brand.primary #2F6ECC) - validated with
// scripts/validate_palette.js --ordinal (dataviz skill): monotone lightness, all
// adjacent steps clear the CVD floor, light end clears the surface-contrast floor.
const ORDINAL_RAMP = ['#8FB8E8', '#5B8FDB', '#2F6ECC', '#1F4E99']
// Matches OPPORTUNITY_BUCKETS in scripts/college-scorecard-connector.mjs / warn-connector.mjs.
const SEAT_PACKAGE_ORDER = ['25 seats', '25-100 seats', '100-500 seats', '500-1000 seats']

const loading = ref(false)
const loadError = ref<string | null>(null)
const report = ref<GrowthDashboardReport | null>(null)

const emailSendRate = computed(() => {
  if (!report.value || report.value.acquisition.totalLeads === 0) return 0
  return report.value.acquisition.emailsSent / report.value.acquisition.totalLeads
})

const leadsBySourceRows = computed(() => (report.value ? leadsBySourceChartRows(report.value) : []))

const b2cFunnelRows = computed(() => (report.value ? b2cFunnelChartRows(report.value) : []))

const seatPipelineRows = computed(() => {
  if (!report.value) return []
  const byPackage = new Map(report.value.institutional.seatPipelineByPackage.map((r) => [r.recommendedPackage, r.leadCount]))
  const rows = SEAT_PACKAGE_ORDER.filter((pkg) => byPackage.has(pkg)).map((pkg, i) => ({
    label: pkg,
    value: byPackage.get(pkg) ?? 0,
    colorHex: ORDINAL_RAMP[i] ?? ORDINAL_RAMP[ORDINAL_RAMP.length - 1],
  }))
  // Defensive: any package label outside the known tier order (shouldn't happen given
  // the connectors' fixed bucket list) still shows, just without the ordinal color story.
  const known = new Set(SEAT_PACKAGE_ORDER)
  for (const [pkg, count] of byPackage) {
    if (!known.has(pkg)) rows.push({ label: pkg, value: count, colorHex: '#9CA3AF' })
  }
  return rows
})

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

async function loadReport() {
  loading.value = true
  loadError.value = null
  try {
    const { data, error } = await adminAPI.getGrowthDashboardReport()
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
