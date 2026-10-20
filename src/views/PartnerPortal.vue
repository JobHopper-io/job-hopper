<template>
  <div class="app-warm-bg min-h-screen">
    <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p v-if="loading" class="text-sm text-neutral-body py-20 text-center">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="mr-2" />Loading your dashboard…
      </p>

      <p v-else-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        {{ error }}
      </p>

      <section v-else-if="!leadId" class="pp-card max-w-xl mx-auto text-center py-12 mt-10">
        <span class="pp-chip !w-14 !h-14 text-xl mx-auto mb-5"><font-awesome-icon :icon="['fas', 'graduation-cap']" aria-hidden="true" /></span>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">No partner dashboard yet</h1>
        <p class="text-sm text-neutral-body leading-relaxed">
          This account isn't linked to a partner institution. If your university works with
          Job-Hopper, ask us to add <strong>{{ userEmail }}</strong> as a staff member at
          <a href="mailto:support@job-hopper.io" class="text-brand-primary font-medium hover:underline">support@job-hopper.io</a>.
        </p>
      </section>

      <template v-else-if="data">
        <!-- Hero -->
        <header class="relative mb-10">
          <div class="pointer-events-none absolute -top-16 right-0 w-80 h-64 rounded-full blur-3xl opacity-20 bg-brand-rabbit-end print:hidden" aria-hidden="true" />
          <div class="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div class="w-10 h-1 rounded-full mb-5 bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end" />
              <p class="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">Career services partner dashboard</p>
              <h1 class="font-heading font-bold text-brand-charcoal text-3xl sm:text-4xl leading-tight">
                {{ data.lead.organization_name }}
              </h1>
              <p class="text-neutral-body mt-2">
                How your students are using Job-Hopper{{ program.stage === 'pilot' ? ` during your ${program.title}` : '' }}.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <select
                v-if="partners.length > 1"
                :value="leadId"
                class="rounded-full border border-neutral-border bg-white px-4 py-2 text-sm shadow-sm"
                aria-label="Switch institution"
                @change="switchPartner(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.organization_name }}</option>
              </select>
              <span class="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold" :class="STAGE_STYLE[program.stage].pill">
                <span class="h-2 w-2 rounded-full" :class="STAGE_STYLE[program.stage].dot" aria-hidden="true" />
                {{ program.label }}
              </span>
              <router-link
                :to="{ path: '/partner/report', query: { lead: leadId, ...periodQuery } }"
                target="_blank"
                class="btn-primary !py-2.5 !px-5 text-sm !rounded-full inline-flex items-center"
              >
                <font-awesome-icon :icon="['fas', 'file-lines']" class="mr-2" aria-hidden="true" />
                Summary report
              </router-link>
            </div>
          </div>
        </header>

        <div v-if="data.isAdmin && !isStaffView" class="mb-6 flex flex-wrap items-center gap-2 text-sm rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-brand-charcoal">
          <font-awesome-icon :icon="['fas', 'eye']" class="text-brand-primary" aria-hidden="true" />
          Admin preview: this is exactly what {{ data.lead.organization_name }} staff see.
          <router-link :to="`/admin/partner-dashboard/${leadId}`" class="text-brand-primary font-medium hover:underline">Manage partner →</router-link>
        </div>

        <div
          v-if="pilotBanner"
          class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4"
          :class="pilotBanner.ended ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'"
          role="status"
        >
          <div class="flex items-start gap-3">
            <span
              class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
              :class="pilotBanner.ended ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'"
            >
              <font-awesome-icon :icon="['fas', 'hourglass-half']" aria-hidden="true" />
            </span>
            <div>
              <p class="font-heading font-semibold text-brand-charcoal">{{ pilotBanner.title }}</p>
              <p class="text-sm text-neutral-body">{{ pilotBanner.body }}</p>
            </div>
          </div>
          <a
            :href="`mailto:support@job-hopper.io?subject=${encodeURIComponent(`Continuing Job-Hopper at ${data.lead.organization_name}`)}`"
            class="btn-primary !py-2 !px-5 text-sm !rounded-full whitespace-nowrap"
          >
            Talk to us about continuing
          </a>
        </div>

        <div class="grid gap-6 lg:grid-cols-3 mb-8">
          <!-- Program -->
          <section class="pp-card flex flex-col">
            <header class="pp-head">
              <span class="pp-chip"><font-awesome-icon :icon="['fas', 'graduation-cap']" aria-hidden="true" /></span>
              <h2 class="pp-title">Your program</h2>
            </header>
            <p class="text-xl font-heading font-bold text-brand-charcoal">{{ program.title }}</p>
            <p class="text-sm text-neutral-body mt-1">{{ program.detail }}</p>
            <div v-if="program.daysLeftPct !== null" class="mt-4">
              <div class="h-2 rounded-full bg-[#fff1e0] overflow-hidden">
                <div class="h-full rounded-full bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end" :style="{ width: `${program.daysLeftPct}%` }" />
              </div>
              <p class="text-xs text-neutral-muted mt-1.5">{{ program.daysLeftCaption }}</p>
            </div>

            <!-- Billing (paid license) -->
            <dl v-if="(program.stage === 'licensed' || program.stage === 'awaiting_payment') && data.paid" class="mt-5 space-y-2 text-sm border-t border-neutral-border pt-4">
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-muted">Billing</dt>
                <dd class="font-medium text-brand-charcoal">{{ data.paid.billing_interval === 'year' ? 'Annual' : 'Monthly' }}</dd>
              </div>
              <div v-if="data.paid.discount_percent" class="flex justify-between gap-3">
                <dt class="text-neutral-muted">Partner discount</dt>
                <dd class="font-medium text-brand-charcoal">{{ data.paid.discount_percent }}%</dd>
              </div>
              <div v-if="data.billing?.renewsAt" class="flex justify-between gap-3">
                <dt class="text-neutral-muted">Renews</dt>
                <dd class="font-medium text-brand-charcoal">{{ longDate(data.billing.renewsAt) }}</dd>
              </div>
              <div v-if="invoice" class="flex justify-between gap-3 items-baseline">
                <dt class="text-neutral-muted">Latest invoice</dt>
                <dd class="text-right">
                  <span v-if="invoice.status === 'paid'" class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    <font-awesome-icon :icon="['fas', 'circle-check']" aria-hidden="true" />Paid
                  </span>
                  <template v-else-if="invoice.status === 'open'">
                    <span class="font-medium text-brand-charcoal">{{ formatMoney(invoice.amountDueCents) }} due {{ invoice.dueDate ? longDate(invoice.dueDate) : '' }}</span>
                    <a v-if="invoice.url" :href="invoice.url" target="_blank" rel="noopener" class="block text-brand-primary font-medium hover:underline">
                      View &amp; pay invoice →
                    </a>
                  </template>
                  <span v-else class="capitalize text-neutral-body">{{ invoice.status }}</span>
                </dd>
              </div>
            </dl>
            <p
              v-if="data.billing?.accessPaused"
              class="mt-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 leading-relaxed"
              role="alert"
            >
              <strong>Students' access is paused</strong> because the invoice is unpaid. It's restored automatically
              as soon as it's paid.
            </p>
            <p
              v-else-if="data.billing?.graceEndsAt"
              class="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed"
              role="status"
            >
              <strong>Your invoice is overdue.</strong> Students keep full access until
              {{ longDate(data.billing.graceEndsAt) }}; please pay before then to avoid any interruption.
            </p>
            <p v-else-if="program.stage === 'pilot'" class="mt-auto pt-5 self-start">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
                <font-awesome-icon :icon="['fas', 'check']" aria-hidden="true" />No charge during the pilot
              </span>
            </p>
          </section>

          <!-- Seats -->
          <section class="pp-card flex flex-col">
            <header class="pp-head">
              <span class="pp-chip"><font-awesome-icon :icon="['fas', 'users']" aria-hidden="true" /></span>
              <h2 class="pp-title">Seats</h2>
            </header>
            <p class="font-heading font-bold text-brand-charcoal tabular-nums">
              <span class="text-4xl">{{ program.seatsUsed }}</span>
              <span class="text-neutral-muted font-normal text-base ml-1">of {{ program.seatTotal }} in use</span>
            </p>
            <div v-if="program.seatTotal" class="h-2 rounded-full bg-brand-primary/10 mt-3 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="seatsFull ? 'bg-amber-500' : 'bg-brand-primary'"
                :style="{ width: `${Math.min(100, (program.seatsUsed / program.seatTotal) * 100)}%` }"
              />
            </div>
            <p v-if="program.seatTotal" class="text-xs text-neutral-muted mt-1.5">
              {{ Math.max(0, program.seatTotal - program.seatsUsed) }} available
            </p>
            <p v-if="data.insights.waitlisted > 0" class="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
              <strong>{{ data.insights.waitlisted }} {{ data.insights.waitlisted === 1 ? 'student is' : 'students are' }} waiting</strong>
              for a seat. They get one automatically when seats are added or freed.
            </p>
            <p v-for="r in data.seatRequests" :key="r.id" class="mt-3 text-xs text-neutral-body leading-relaxed">
              <font-awesome-icon :icon="['fas', 'hourglass-half']" class="mr-1 text-brand-primary" aria-hidden="true" />
              {{ r.requested_by }} requested <strong>+{{ r.seats }} seats</strong> on {{ longDate(r.created_at) }}. We'll be in touch.
            </p>

            <form v-if="showRequestForm" class="mt-4 space-y-3" @submit.prevent="submitSeatRequest">
              <label class="block text-sm">
                <span class="font-medium text-brand-charcoal">How many more seats?</span>
                <input v-model.number="requestSeats" type="number" min="1" required class="input-field w-full mt-1 py-2" />
              </label>
              <label class="block text-sm">
                <span class="font-medium text-brand-charcoal">Note <span class="font-normal text-neutral-muted">(optional)</span></span>
                <input v-model="requestNote" type="text" maxlength="1000" class="input-field w-full mt-1 py-2" placeholder="e.g. adding the spring cohort" />
              </label>
              <div class="flex items-center gap-3">
                <button type="submit" class="btn-primary !py-2 !px-5 text-sm !rounded-full" :disabled="requesting">
                  <font-awesome-icon v-if="requesting" :icon="['fas', 'spinner']" spin class="mr-1.5" />Send request
                </button>
                <button type="button" class="text-sm text-neutral-muted hover:underline" @click="showRequestForm = false">Cancel</button>
              </div>
              <p v-if="requestError" class="text-xs text-red-600">{{ requestError }}</p>
            </form>
            <div v-else class="mt-auto pt-5">
              <button type="button" class="btn-secondary !py-2 !px-5 text-sm !rounded-full" @click="showRequestForm = true">
                <font-awesome-icon :icon="['fas', 'plus']" class="mr-1.5" aria-hidden="true" />Request more seats
              </button>
            </div>
            <p v-if="requestSent" class="mt-2 text-xs text-green-700">Request sent. Our team will follow up shortly.</p>
          </section>

          <!-- How students join -->
          <section class="pp-card">
            <header class="pp-head">
              <span class="pp-chip"><font-awesome-icon :icon="['fas', 'paper-plane']" aria-hidden="true" /></span>
              <h2 class="pp-title">Invite your students</h2>
            </header>
            <ul class="space-y-2.5 mb-5">
              <li v-for="i in 3" :key="i" class="flex items-start gap-2.5 text-sm text-neutral-body">
                <span class="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                  <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success text-[10px]" aria-hidden="true" />
                </span>
                <span v-if="i === 1">Share the sign-up link in newsletters, your LMS, or at career fairs.</span>
                <span v-else-if="i === 2 && data.lead.email_domains.length">
                  Students sign up with their
                  <template v-for="(d, j) in data.lead.email_domains" :key="d">
                    <strong class="text-brand-charcoal">@{{ d }}</strong><template v-if="j < data.lead.email_domains.length - 1"> or </template>
                  </template>
                  email.
                </span>
                <span v-else-if="i === 2">Students sign up with their university email (we're finishing your domain setup).</span>
                <span v-else>A seat is assigned automatically once they verify it. No roster upload needed.</span>
              </li>
            </ul>
            <div class="space-y-3">
              <CopyRow label="Sign-up link to share" :value="`${siteUrl}/register`" />
              <CopyRow
                v-if="data.pilot && pilotActive"
                label="Invite link (any email address)"
                :value="`${siteUrl}/trial/${data.pilot.invite_code}`"
              />
            </div>
          </section>
        </div>

        <PartnerAnalytics
          :insights="data.insights"
          :seats-used="program.seatsUsed"
          :seat-total="program.seatTotal"
          :organization-name="data.lead.organization_name"
          can-release
          :releasing="releasing"
          v-model:period="period"
          v-model:custom-since="customSince"
          :period-label="periodLabelText"
          :loading="refreshing"
          @release="release"
        />
        <p v-if="releaseError" class="mt-3 text-sm text-red-600">{{ releaseError }}</p>

        <footer class="mt-10 pp-card !py-5 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="pp-chip"><font-awesome-icon :icon="['fas', 'comments']" aria-hidden="true" /></span>
            <div>
              <p class="font-heading font-semibold text-brand-charcoal">Questions, more seats, or adding a colleague?</p>
              <p class="text-sm text-neutral-body">
                Your Job-Hopper team is at
                <a href="mailto:support@job-hopper.io" class="text-brand-primary font-medium hover:underline">support@job-hopper.io</a>
              </p>
            </div>
          </div>
          <p class="text-xs text-neutral-muted">
            Dashboard access: {{ data.staff.map((s) => s.email).join(', ') || '—' }}
          </p>
        </footer>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch, type FunctionalComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PartnerAnalytics from '@/components/PartnerAnalytics.vue'
import { describeProgram, formatMoney, partnerPortalAPI, STAGE_STYLE, type PartnerOverview } from '@/lib/partnerPortal'
import { getSessionUser } from '@/lib/supabase'
import { usePartnerPeriod } from '@/composables/usePartnerPeriod'

const route = useRoute()
const router = useRouter()
const siteUrl = window.location.origin

const loading = ref(true)
const error = ref<string | null>(null)
const partners = ref<{ id: string; organization_name: string }[]>([])
const leadId = ref<string | null>(null)
const data = ref<PartnerOverview | null>(null)
const userEmail = ref('')
// True when the viewer is staff of this partner (vs. an admin previewing it).
const isStaffView = computed(() => partners.value.some((p) => p.id === leadId.value))

const program = computed(() => describeProgram(data.value?.pilot ?? null, data.value?.paid ?? null))
const invoice = computed(() => data.value?.billing?.latestInvoice ?? null)
// Pilot ending soon (last 14 days, matching the reminder emails) or already ended.
const pilotBanner = computed(() => {
  const p = program.value
  const end = data.value?.pilot?.expires_at
  if (p.stage === 'pilot_ended' && end) {
    return {
      ended: true,
      title: 'Your pilot has ended',
      body: `Students' university-provided access paused on ${longDate(end)}. Let us know when you'd like to continue and we'll restore it.`,
    }
  }
  if (p.stage === 'pilot' && p.daysLeft !== null && p.daysLeft <= 14 && end) {
    return {
      ended: false,
      title: `Your pilot ends in ${p.daysLeftCaption.replace(' left', '')}`,
      body: `${p.seatsUsed} students lose university-provided access on ${longDate(end)}. Set up your license now to keep it uninterrupted.`,
    }
  }
  return null
})

const seatsFull = computed(() => program.value.seatTotal > 0 && program.value.seatsUsed >= program.value.seatTotal)

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const showRequestForm = ref(false)
const requestSeats = ref(25)
const requestNote = ref('')
const requesting = ref(false)
const requestError = ref<string | null>(null)
const requestSent = ref(false)

async function submitSeatRequest() {
  if (!leadId.value) return
  requesting.value = true
  requestError.value = null
  const { error: apiError } = await partnerPortalAPI.requestSeats(leadId.value, requestSeats.value, requestNote.value)
  requesting.value = false
  if (apiError) {
    requestError.value = apiError.message
    return
  }
  showRequestForm.value = false
  requestSent.value = true
  requestNote.value = ''
  await load()
}
const pilotActive = computed(() => program.value.stage === 'pilot')

const { period, customSince, since, label: periodLabelText, query: periodQuery } = usePartnerPeriod()
const refreshing = ref(false)

async function load() {
  if (!leadId.value) return
  refreshing.value = true
  const { data: overview, error: apiError } = await partnerPortalAPI.overview(leadId.value, since.value)
  refreshing.value = false
  if (apiError) error.value = apiError.message
  else data.value = overview
}

watch(since, load)

async function switchPartner(id: string) {
  await router.replace({ query: { ...route.query, lead: id } })
  leadId.value = id
  await load()
}

onMounted(async () => {
  const user = await getSessionUser()
  userEmail.value = user?.email ?? ''
  const { data: mine, error: apiError } = await partnerPortalAPI.myPartners()
  if (apiError) {
    error.value = apiError.message
  } else {
    partners.value = mine?.partners ?? []
    // ?lead= lets an admin preview any partner; staff default to their (first) partner.
    const requested = route.query.lead as string | undefined
    leadId.value = (requested && (mine?.isAdmin || partners.value.some((p) => p.id === requested)) ? requested : null)
      ?? partners.value[0]?.id ?? null
    await load()
  }
  loading.value = false
})

const releasing = ref(false)
const releaseError = ref<string | null>(null)
async function release(profileId: string) {
  if (!leadId.value) return
  releasing.value = true
  releaseError.value = null
  const { error: apiError } = await partnerPortalAPI.releaseSeat(leadId.value, profileId)
  if (apiError) releaseError.value = apiError.message
  else await load()
  releasing.value = false
}

const copied = ref<string | null>(null)
const CopyRow: FunctionalComponent<{ label: string; value: string }> = ({ label, value }) =>
  h('div', { class: 'text-sm' }, [
    h('span', { class: 'block text-xs font-medium text-neutral-muted mb-1' }, label),
    h('div', { class: 'flex items-center gap-2 rounded-full border border-neutral-border bg-[#fffaf4] pl-4 pr-1 py-1' }, [
      h('code', { class: 'flex-1 min-w-0 truncate text-xs text-brand-charcoal' }, value),
      h(
        'button',
        {
          type: 'button',
          class: 'shrink-0 rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90',
        onClick: async () => {
          await navigator.clipboard.writeText(value)
          copied.value = value
          setTimeout(() => (copied.value = null), 1500)
        },
      },
        copied.value === value ? 'Copied' : 'Copy',
      ),
    ]),
  ])
</script>

<style scoped>
.pp-card {
  @apply rounded-2xl bg-white border border-neutral-border/80 shadow-sm p-6 min-w-0;
}
.pp-head {
  @apply flex items-center gap-3 mb-4;
}
.pp-chip {
  @apply w-10 h-10 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center;
}
.pp-title {
  @apply text-base font-heading font-semibold text-brand-charcoal;
}
</style>
