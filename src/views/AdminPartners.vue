<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">Partners</h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Every institution with a pilot, a paid license, or student email domains set up. To start a new
        partnership, open the organization from
        <router-link to="/admin/institutional-leads" class="text-brand-primary hover:underline">Institutional Leads</router-link>.
      </p>
    </header>

    <p v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-neutral-body">
      <font-awesome-icon :icon="['fas', 'spinner']" spin class="mr-2" />Loading…
    </p>

    <template v-else>
      <section class="card p-6 mb-6">
        <dl class="grid grid-cols-2 lg:grid-cols-5 gap-6">
          <StatTile
            label="Licensed revenue"
            :icon="['fas', 'sack-dollar']"
            :value="`${formatMoney(totals.mrr)}/mo`"
            :hint="`${countStage('licensed')} licensed ${countStage('licensed') === 1 ? 'partner' : 'partners'}`"
          />
          <StatTile
            label="Pilot pipeline"
            :value="`${formatMoney(totals.pipeline)}/mo`"
            :hint="`if ${countStage('pilot')} running ${countStage('pilot') === 1 ? 'pilot converts' : 'pilots convert'} at list price`"
          />
          <StatTile
            label="Seats in use"
            :icon="['fas', 'users']"
            :value="`${totals.seatsUsed} / ${totals.seats}`"
            :meter-pct="totals.seats ? totals.seatsUsed / totals.seats : undefined"
            hint="across live pilots and licenses"
          />
          <StatTile
            label="Students active, 30 days"
            :value="pct(totals.active, totals.holders)"
            :hint="`${totals.active} of ${totals.holders} students`"
          />
          <StatTile
            label="Need attention"
            :value="rows.filter((r) => r.flags.some((f) => f.tone === 'warning')).length"
            :hint="`of ${rows.length} partners`"
          />
        </dl>
      </section>

      <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span class="text-neutral-muted">Show</span>
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="rounded-full border px-3 py-1"
          :class="filter === f.key ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-neutral-border text-neutral-body hover:bg-white'"
          @click="filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <p v-if="visibleRows.length === 0" class="card p-6 text-sm text-neutral-body">No partners here yet.</p>

      <section v-else class="card overflow-x-auto relative">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-neutral-muted border-b border-neutral-border">
              <th class="font-medium px-6 py-3">Institution</th>
              <th class="font-medium px-3 py-3">Stage</th>
              <th class="font-medium px-3 py-3">Seats</th>
              <th class="font-medium px-3 py-3 text-right">Activated</th>
              <th class="font-medium px-3 py-3 text-right">Active 30d</th>
              <th class="font-medium px-3 py-3 text-right">Applications 30d</th>
              <th class="font-medium px-3 py-3 text-right">Value / mo</th>
              <th class="font-medium px-3 py-3">Needs attention</th>
              <th class="px-6 py-3"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRows" :key="r.partner.id" class="border-b border-neutral-border last:border-0 hover:bg-neutral-bg align-top">
              <td class="px-6 py-3">
                <router-link :to="`/admin/partner-dashboard/${r.partner.id}`" class="font-medium text-brand-charcoal hover:text-brand-primary">
                  {{ r.partner.organization_name }}
                </router-link>
                <div class="text-xs text-neutral-muted">
                  {{ r.partner.email_domains.length ? r.partner.email_domains.map((d) => '@' + d).join(', ') : 'no domains set' }}<template v-if="r.partner.student_size"> · {{ r.partner.student_size.toLocaleString() }} enrolled</template>
                </div>
              </td>
              <td class="px-3 py-3 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" :class="STAGE_STYLE[r.program.stage].pill">
                  <span class="h-1.5 w-1.5 rounded-full" :class="STAGE_STYLE[r.program.stage].dot" aria-hidden="true" />
                  {{ r.program.label }}
                </span>
                <div v-if="r.program.stage === 'pilot'" class="text-xs text-neutral-muted mt-1">{{ r.program.daysLeftCaption }}</div>
              </td>
              <td class="px-3 py-3 w-36">
                <template v-if="r.program.seatTotal">
                  <div class="tabular-nums text-brand-charcoal">{{ r.program.seatsUsed }} / {{ r.program.seatTotal }}</div>
                  <div class="h-[5px] rounded-full bg-brand-primary/15 mt-1">
                    <div class="h-full rounded-full bg-brand-primary" :style="{ width: `${Math.min(100, (r.program.seatsUsed / r.program.seatTotal) * 100)}%` }" />
                  </div>
                </template>
                <span v-else class="text-neutral-muted">—</span>
              </td>
              <td class="px-3 py-3 text-right tabular-nums">{{ pct(r.partner.summary?.activated ?? 0, r.holders) }}</td>
              <td class="px-3 py-3 text-right tabular-nums">{{ pct(r.partner.summary?.active_30d ?? 0, r.holders) }}</td>
              <td class="px-3 py-3 text-right tabular-nums">{{ r.partner.summary?.applications_30d ?? 0 }}</td>
              <td class="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                <template v-if="r.program.stage === 'licensed' && r.partner.paid">
                  {{ formatMoney(r.mrr) }}
                  <div class="text-xs text-neutral-muted">
                    {{ r.partner.paid.billing_interval === 'year' ? 'annual' : 'monthly' }}<template v-if="r.partner.paid.discount_percent"> · {{ r.partner.paid.discount_percent }}% off</template>
                  </div>
                </template>
                <span v-else-if="r.program.stage === 'pilot'" class="text-neutral-muted" title="Value if converted at list price">{{ formatMoney(r.pipeline) }} pilot</span>
                <span v-else class="text-neutral-muted">—</span>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="f in r.flags"
                    :key="f.label"
                    class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs whitespace-nowrap"
                    :class="f.tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'"
                  >
                    <font-awesome-icon :icon="['fas', f.tone === 'warning' ? 'exclamation-triangle' : 'arrow-up-right-dots']" aria-hidden="true" />
                    {{ f.label }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-3 text-right whitespace-nowrap">
                <router-link :to="`/partner?lead=${r.partner.id}`" class="text-xs text-brand-primary hover:underline">
                  View as university
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <p class="mt-3 text-xs text-neutral-muted">
        Value is the monthly equivalent of what Stripe invoices: seats × per-seat price, less the partner
        discount (annual licenses are invoiced 12× this once a year). Pilot value assumes list price.
        "Active" is in-app activity or sign-in in the last 30 days.
      </p>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatTile from '@/components/GrowthStatTile.vue'
import {
  attentionFlags,
  describeProgram,
  formatMoney,
  monthlyValueCents,
  partnerPortalAPI,
  STAGE_STYLE,
  type PartnerListRow,
  type PartnerStage,
} from '@/lib/partnerPortal'

const loading = ref(true)
const error = ref<string | null>(null)
const partners = ref<PartnerListRow[]>([])
const prices = ref<Record<string, number> | null>(null)

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'pilot', label: 'Pilots' },
  { key: 'licensed', label: 'Licensed' },
] as const
const filter = ref<(typeof FILTERS)[number]['key']>('all')

const STAGE_ORDER: Record<PartnerStage, number> = { pilot: 0, licensed: 1, pilot_ended: 2, setup: 3 }
const rows = computed(() =>
  partners.value
    .map((partner) => {
      const program = describeProgram(partner.pilot, partner.paid)
      return {
        partner,
        program,
        holders: partner.summary?.seat_holders ?? 0,
        mrr: program.stage === 'licensed' ? monthlyValueCents(partner.paid, prices.value) : 0,
        pipeline: program.stage === 'pilot' ? monthlyValueCents(partner.pilot, prices.value) : 0,
        flags: attentionFlags(program, partner.pilot?.created_at ?? null, partner.summary, {
          waitlisted: partner.waitlisted,
          requestedSeats: partner.requestedSeats,
        }, partner.paid),
      }
    })
    .sort(
      (a, b) =>
        Number(b.flags.some((f) => f.tone === 'warning')) - Number(a.flags.some((f) => f.tone === 'warning')) ||
        STAGE_ORDER[a.program.stage] - STAGE_ORDER[b.program.stage] ||
        a.partner.organization_name.localeCompare(b.partner.organization_name),
    ),
)

const visibleRows = computed(() => {
  if (filter.value === 'attention') return rows.value.filter((r) => r.flags.some((f) => f.tone === 'warning'))
  if (filter.value === 'all') return rows.value
  return rows.value.filter((r) => r.program.stage === filter.value)
})

const countStage = (stage: PartnerStage) => rows.value.filter((r) => r.program.stage === stage).length

const totals = computed(() => {
  const live = rows.value.filter((r) => r.program.stage === 'pilot' || r.program.stage === 'licensed')
  return {
    mrr: rows.value.reduce((n, r) => n + r.mrr, 0),
    pipeline: rows.value.reduce((n, r) => n + r.pipeline, 0),
    seatsUsed: live.reduce((n, r) => n + r.program.seatsUsed, 0),
    seats: live.reduce((n, r) => n + r.program.seatTotal, 0),
    holders: rows.value.reduce((n, r) => n + r.holders, 0),
    active: rows.value.reduce((n, r) => n + (r.partner.summary?.active_30d ?? 0), 0),
  }
})

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'
}

onMounted(async () => {
  const { data, error: apiError } = await partnerPortalAPI.listPartners()
  if (apiError) error.value = apiError.message
  else {
    partners.value = data?.partners ?? []
    prices.value = data?.seatPriceCents ?? null
  }
  loading.value = false
})
</script>
