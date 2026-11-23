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
      <!-- Day 1 baseline: segments + outbound funnel -->
      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          User segments
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          Signed-up users, excluding partner staff, license billing contacts and admins. Segments
          overlap. Same definitions as the Day 1 audit (docs/growth/day1-audit.md).
        </p>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="row in segmentRows" :key="row.label" class="border-t border-neutral-border first:border-t-0">
              <th scope="row" class="py-2 pr-4 text-left font-normal text-brand-charcoal">{{ row.label }}</th>
              <td class="py-2 pr-4 text-right tabular-nums font-medium text-brand-charcoal">{{ row.value.toLocaleString() }}</td>
              <td class="py-2 text-xs text-neutral-muted">{{ row.hint }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Outbound funnel
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          Each step is an all-time count of its own, not a cohort followed through, so steps
          don't have to shrink in order.
        </p>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="row in funnelRows" :key="row.label" class="border-t border-neutral-border first:border-t-0">
              <th scope="row" class="py-2 pr-4 text-left font-normal text-brand-charcoal">{{ row.label }}</th>
              <td class="py-2 pr-4 text-right tabular-nums font-medium text-brand-charcoal">{{ row.value.toLocaleString() }}</td>
              <td class="py-2 text-xs text-neutral-muted">{{ row.hint }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Recovery emails
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          People per segment, counted from their first recovery email. Came back: active in the app after
          it. Paid: completed a checkout within 30 days of it.
        </p>
        <div class="-mx-4 sm:-mx-6 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-xs text-neutral-muted">
                <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium">Segment</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">Sent</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">Delivered</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">Came back</th>
                <th scope="col" class="px-4 sm:px-6 py-2 text-right font-medium">Paid in 30 days</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.recoveryFunnel" :key="row.segment" class="border-t border-neutral-border">
                <th scope="row" class="px-4 sm:px-6 py-2 text-left font-normal text-brand-charcoal">{{ row.label }}</th>
                <td class="px-2 py-2 text-right tabular-nums">{{ row.sent.toLocaleString() }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ row.delivered.toLocaleString() }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ row.cameBack.toLocaleString() }}</td>
                <td class="px-4 sm:px-6 py-2 text-right tabular-nums">{{ row.paid30d.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
          Cancellations
        </h2>
        <p class="text-sm text-neutral-body mb-5">
          From Stripe, recorded since 2026-11-23. {{ report.cancellations.churn30d.canceledNoDate.toLocaleString() }}
          earlier cancellations have no date or reason.
        </p>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="row in cancellationRows" :key="row.label" class="border-t border-neutral-border first:border-t-0">
              <th scope="row" class="py-2 pr-4 text-left font-normal text-brand-charcoal">{{ row.label }}</th>
              <td class="py-2 pr-4 text-right tabular-nums font-medium text-brand-charcoal">{{ row.value.toLocaleString() }}</td>
              <td class="py-2 text-xs text-neutral-muted">{{ row.hint }}</td>
            </tr>
          </tbody>
        </table>
      </section>

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
            hint="outbound send log, not failed or blocked"
          />
          <StatTile
            label="Replies"
            :value="report.funnel.replies"
            :hint="`${report.funnel.positiveReplies} positive`"
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
            hint="active paid ÷ confirmed registrations"
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
            hint="no revenue amounts; see Recovery emails for paid within 30 days"
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

const segmentRows = computed(() => {
  const s = report.value?.segments
  if (!s) return []
  return [
    { label: 'Registered', value: s.registered, hint: 'signed-up users' },
    { label: 'Email confirmed', value: s.confirmed, hint: '' },
    { label: 'Email not confirmed', value: s.unconfirmed, hint: '' },
    { label: 'Confirmed, not onboarded', value: s.confirmedNotOnboarded, hint: '' },
    { label: 'Resume uploaded', value: s.resumeUploaded, hint: '' },
    { label: 'Onboarded, no resume', value: s.onboardedNoResume, hint: '' },
    { label: 'Inactive 30 days', value: s.inactive30d, hint: 'onboarded; overstated before 2026-10-16 (no activity data)' },
    { label: 'Abandoned checkout', value: s.abandonedCheckoutProxy, hint: 'proxy: started checkout, no subscription; no date' },
    { label: 'Active paid', value: s.activePaid, hint: '' },
    { label: 'Trialing', value: s.trialing, hint: 'not yet paid' },
    { label: 'Past due', value: s.pastDue, hint: '' },
    { label: 'Cancelled', value: s.cancelled, hint: 'no active or trial subscription left' },
    { label: 'Sponsored seats', value: s.sponsoredSeats, hint: 'trial grant or university license' },
  ]
})

const funnelRows = computed(() => {
  const f = report.value?.funnel
  if (!f) return []
  return [
    { label: 'Leads discovered', value: f.leadsDiscovered, hint: `${f.institutionalLeads} organizations + ${f.prospects} people` },
    { label: 'Prospects reviewed', value: f.prospectsReviewed, hint: 'approved or rejected in /admin/prospects' },
    { label: 'Prospects approved', value: f.prospectsApproved, hint: '' },
    { label: 'Outbound sent', value: f.outboundSent, hint: 'handed to Mailtrap' },
    { label: 'Delivered', value: f.outboundDelivered, hint: 'Mailtrap delivery event' },
    { label: 'Replies', value: f.replies, hint: 'all inbound replies' },
    { label: 'Positive replies', value: f.positiveReplies, hint: 'Interested, Meeting requested, More information' },
    { label: 'Signups from outbound', value: f.outboundSignups, hint: 'utm_source email_outbound, or matched to a lead' },
    { label: 'Paid from outbound', value: f.outboundPaid, hint: 'active subscription' },
  ]
})

const cancellationRows = computed(() => {
  const c = report.value?.cancellations
  if (!c) return []
  return [
    { label: 'Canceled, last 30 days', value: c.churn30d.canceled, hint: 'cancellation requested in the last 30 days' },
    { label: 'Ended', value: c.churn30d.ended, hint: 'of those, subscription already ended' },
    { label: 'Ending at period end', value: c.churn30d.pendingPeriodEnd, hint: 'of those, still running until period end' },
    ...c.byFeedback.map((f) => ({
      label: `Reason: ${f.feedback === 'none' ? 'no feedback' : f.feedback.replace(/_/g, ' ')}`,
      value: f.count,
      hint: 'all time, Stripe portal feedback',
    })),
  ]
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
