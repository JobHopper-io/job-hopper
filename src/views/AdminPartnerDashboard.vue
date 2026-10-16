<template>
  <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <router-link to="/admin/partners" class="text-sm text-brand-primary hover:underline">
      ← Partners
    </router-link>

    <div v-if="loading" class="mt-6 text-sm text-neutral-body">
      Loading…
    </div>

    <div v-else-if="error" class="mt-6 text-sm text-red-600">
      {{ error }}
    </div>

    <template v-else-if="data">
      <header class="mt-4 mb-8">
        <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
          {{ data.lead.organization_name }}
        </h1>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-body">
          <span>{{ data.lead.category }} · lead status: {{ data.lead.status }}</span>
          <router-link :to="`/partner?lead=${data.lead.id}`" class="text-brand-primary hover:underline">
            View as university →
          </router-link>
        </div>
      </header>

      <section v-if="overview" class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">Partner setup</h2>
        <p class="text-sm text-neutral-body mb-4">
          Students whose verified email is on one of these domains get a seat automatically (paid seats first,
          then the running pilot). Staff below can sign in at /partner to see their dashboard.
        </p>
        <form class="flex flex-wrap items-end gap-3 mb-6" @submit.prevent="saveDomains">
          <label class="flex-1 min-w-64">
            <span class="block text-sm font-medium text-brand-charcoal mb-1">Student email domains</span>
            <input v-model="domainsRaw" type="text" class="input-field w-full" placeholder="stateu.edu, mail.stateu.edu" />
          </label>
          <button type="submit" class="btn-primary" :disabled="savingDomains">
            <font-awesome-icon v-if="savingDomains" :icon="['fas', 'spinner']" spin class="mr-2" />
            Save domains
          </button>
          <span v-if="setupMessage" class="text-sm" :class="setupError ? 'text-red-600' : 'text-green-700'">{{ setupMessage }}</span>
        </form>

        <h3 class="text-sm font-medium text-brand-charcoal mb-2">University staff with dashboard access</h3>
        <ul v-if="overview.staff.length" class="space-y-2 mb-3">
          <li v-for="s in overview.staff" :key="s.email" class="flex items-center justify-between rounded-lg border border-neutral-border px-4 py-2 text-sm">
            <span class="text-brand-charcoal">{{ s.email }}</span>
            <button type="button" class="text-sm text-red-600 hover:underline" @click="removeStaff(s.email)">Remove</button>
          </li>
        </ul>
        <form class="flex flex-wrap items-center gap-3" @submit.prevent="addStaff">
          <input v-model="staffEmail" type="email" required class="input-field flex-1 min-w-64" placeholder="careerservices@stateu.edu" />
          <button type="submit" class="btn-secondary" :disabled="addingStaff">
            <font-awesome-icon v-if="addingStaff" :icon="['fas', 'spinner']" spin class="mr-2" />
            Add &amp; email invite
          </button>
        </form>
      </section>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-4">
          Trial grants
        </h2>
        <p v-if="data.grants.length === 0" class="text-sm text-neutral-body mb-4">
          No pilot yet. Start one below; students claim seats by email domain or the invite link.
        </p>
        <div v-else class="space-y-3">
          <div
            v-for="grant in data.grants"
            :key="grant.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-border px-4 py-3 text-sm"
          >
            <div>
              <span class="font-medium text-brand-charcoal">{{ grant.seats_used }} / {{ grant.seat_count }} seats</span>
              <span class="text-neutral-body"> · {{ grant.feature_tier }} tier</span>
              <span v-if="prices" class="text-neutral-muted"> · converts to {{ formatMoney(monthlyValueCents(grant, prices)) }}/mo at list price</span>
            </div>
            <div class="text-neutral-body">
              Expires {{ formatDate(grant.expires_at) }} · <span class="capitalize">{{ grant.status }}</span>
              · invite <code class="text-xs">/trial/{{ grant.invite_code }}</code>
            </div>
          </div>
        </div>
        <form v-if="!hasRunningPilot" class="grid gap-3 sm:grid-cols-4 items-end mt-4" @submit.prevent="startPilot">
          <label>
            <span class="block text-sm font-medium text-brand-charcoal mb-1">Seats</span>
            <input v-model.number="pilotForm.seatCount" type="number" min="1" required class="input-field w-full" />
          </label>
          <label>
            <span class="block text-sm font-medium text-brand-charcoal mb-1">Length (days)</span>
            <input v-model.number="pilotForm.days" type="number" min="1" required class="input-field w-full" />
          </label>
          <label>
            <span class="block text-sm font-medium text-brand-charcoal mb-1">Tier</span>
            <select v-model="pilotForm.featureTier" class="input-field w-full">
              <option value="core">Core</option>
              <option value="premium">Premium</option>
            </select>
          </label>
          <button type="submit" class="btn-primary" :disabled="startingPilot">
            <font-awesome-icon v-if="startingPilot" :icon="['fas', 'spinner']" spin class="mr-2" />
            Start pilot
          </button>
          <p v-if="pilotError" class="sm:col-span-4 text-sm text-red-600">{{ pilotError }}</p>
        </form>
      </section>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-4">
          Org account (paid seats)
        </h2>

        <template v-if="data.orgAccount">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-border px-4 py-3 text-sm mb-4">
            <div>
              <span class="font-medium text-brand-charcoal">{{ data.orgAccount.seats_used }} / {{ data.orgAccount.seat_count }} seats</span>
              <span class="text-neutral-body"> · {{ data.orgAccount.feature_tier }} tier</span>
              <template v-if="paidTerms">
                · {{ paidTerms.billing_interval === 'year' ? 'annual' : 'monthly' }}
                <template v-if="paidTerms.discount_percent"> · {{ paidTerms.discount_percent }}% discount</template>
                · <strong class="text-brand-charcoal">{{ invoiceLabel(monthlyValueCents(paidTerms, prices), paidTerms.billing_interval) }}</strong>
              </template>
            </div>
            <span class="capitalize text-neutral-body">
              {{ overview?.billing?.subscriptionStatus ?? data.orgAccount.status }}
            </span>
          </div>

          <p v-if="overview?.billing" class="text-sm text-neutral-body mb-4">
            <template v-if="overview.billing.renewsAt">Renews {{ formatDate(overview.billing.renewsAt) }}. </template>
            <template v-if="overview.billing.latestInvoice">
              Latest invoice {{ overview.billing.latestInvoice.number ?? '' }}:
              <strong class="capitalize text-brand-charcoal">{{ overview.billing.latestInvoice.status }}</strong>
              ({{ formatMoney(overview.billing.latestInvoice.totalCents) }}<template v-if="overview.billing.latestInvoice.status === 'open'">, {{ formatMoney(overview.billing.latestInvoice.amountDueCents) }} due {{ overview.billing.latestInvoice.dueDate ? formatDate(overview.billing.latestInvoice.dueDate) : '' }}</template>)
              <a v-if="overview.billing.latestInvoice.url" :href="overview.billing.latestInvoice.url" target="_blank" rel="noopener" class="text-brand-primary hover:underline ml-1">Open in Stripe →</a>
            </template>
          </p>

          <div v-if="overview && (overview.seatRequests.length || overview.insights.waitlisted)" class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
            <p v-if="overview.insights.waitlisted"><strong>{{ overview.insights.waitlisted }}</strong> students are waiting for a seat.</p>
            <p v-for="r in overview.seatRequests" :key="r.id" class="flex flex-wrap items-center justify-between gap-2">
              <span>{{ r.requested_by }} requested <strong>+{{ r.seats }}</strong> seats on {{ formatDate(r.created_at) }}<template v-if="r.note">: “{{ r.note }}”</template></span>
              <button type="button" class="text-xs underline" @click="resolveRequest(r.id)">Mark handled</button>
            </p>
          </div>

          <form class="flex flex-wrap items-end gap-3 mb-6" @submit.prevent="submitAddSeats">
            <label>
              <span class="block text-sm font-medium text-brand-charcoal mb-1">Add seats</span>
              <input v-model.number="addSeatsCount" type="number" min="1" required class="input-field w-32" />
            </label>
            <button type="submit" class="btn-secondary" :disabled="addingSeats">
              <font-awesome-icon v-if="addingSeats" :icon="['fas', 'spinner']" spin class="mr-2" />
              Add to license
            </button>
            <span v-if="paidTerms && addSeatsCount > 0" class="text-sm text-neutral-body">
              +{{ invoiceLabel(monthlyValueCents({ ...paidTerms, seat_count: addSeatsCount }, prices), paidTerms.billing_interval) }}; Stripe invoices the prorated amount now.
            </span>
            <span v-if="addSeatsError" class="text-sm text-red-600">{{ addSeatsError }}</span>
          </form>

          <form @submit.prevent="submitImportSeats" class="mb-4">
            <label class="block text-sm font-medium text-brand-charcoal mb-1">
              Import seats (comma or newline-separated emails)
            </label>
            <textarea
              v-model="importEmailsRaw"
              rows="3"
              class="input-field w-full"
              placeholder="jane@org.edu, john@org.edu"
            />
            <div class="flex items-center gap-3 mt-2">
              <button type="submit" class="btn-primary" :disabled="importingSeats || !importEmailsRaw.trim()">
                <font-awesome-icon v-if="importingSeats" :icon="['fas', 'spinner']" spin class="mr-2" />
                Import seats
              </button>
              <span v-if="importError" class="text-sm text-red-600">{{ importError }}</span>
              <span v-if="importSuccess" class="text-sm text-green-700">{{ importSuccess }}</span>
            </div>
          </form>

          <p v-if="data.seatInvites.length === 0" class="text-sm text-neutral-body">
            No seats imported yet.
          </p>
          <div v-else class="space-y-2">
            <div
              v-for="invite in data.seatInvites"
              :key="invite.email"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-border px-4 py-2 text-sm"
            >
              <div>
                <span class="font-medium text-brand-charcoal">{{ invite.email }}</span>
                <span class="text-neutral-body">
                  · {{ invite.revoked_at ? 'revoked' : invite.claimed ? 'claimed' : 'invited' }}
                </span>
              </div>
              <button
                v-if="!invite.revoked_at"
                type="button"
                class="text-sm text-red-600 hover:underline"
                :disabled="revokingEmail === invite.email"
                @click="submitRevokeSeat(invite.email)"
              >
                Revoke
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="text-sm text-neutral-body mb-4">
            No paid org account exists for this lead yet. Creating one moves every student on the pilot
            onto a paid seat, so the seat count must cover them.
          </p>
          <form @submit.prevent="submitCreateOrgAccount" class="grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Billing contact email</label>
              <input v-model="createForm.billingEmail" type="email" required class="input-field w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Billing contact name</label>
              <input v-model="createForm.billingName" type="text" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Feature tier</label>
              <select v-model="createForm.featureTier" class="input-field w-full">
                <option value="core">Core</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Seat count</label>
              <input v-model.number="createForm.seatCount" type="number" min="1" required class="input-field w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Billing</label>
              <select v-model="createForm.billingInterval" class="input-field w-full">
                <option value="month">Monthly</option>
                <option value="year">Annual</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-1">Partner discount</label>
              <select v-model.number="createForm.discountPercent" class="input-field w-full">
                <option v-for="d in DISCOUNT_OPTIONS" :key="d" :value="d">{{ d ? `${d}% off` : 'No discount' }}</option>
              </select>
            </div>
            <div class="sm:col-span-2 flex items-center gap-3">
              <button type="submit" class="btn-primary" :disabled="creatingOrgAccount">
                <font-awesome-icon v-if="creatingOrgAccount" :icon="['fas', 'spinner']" spin class="mr-2" />
                Create org account (real Stripe invoice subscription)
              </button>
              <span v-if="prices" class="text-sm text-neutral-body">
                Invoices <strong class="text-brand-charcoal">{{ invoiceLabel(createEstimate, createForm.billingInterval) }}</strong>
                <template v-if="createForm.discountPercent"> after {{ createForm.discountPercent }}% off</template>
                <template v-if="createForm.billingInterval === 'year'"> ({{ formatMoney(createEstimate) }}/mo equivalent)</template>
              </span>
              <span v-if="createError" class="text-sm text-red-600">{{ createError }}</span>
            </div>
          </form>
        </template>
      </section>

      <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-3">Student activity</h2>
      <PartnerAnalytics
        v-if="overview"
        :insights="overview.insights"
        :seats-used="program.seatsUsed"
        :seat-total="program.seatTotal"
        :organization-name="overview.lead.organization_name"
        can-release
        :releasing="releasing"
        v-model:period="period"
        v-model:custom-since="customSince"
        :period-label="periodLabelText"
        :loading="refreshing"
        @release="releaseSeat"
      >
        <template #actions>
          <router-link
            :to="{ path: '/partner/report', query: { lead: leadId, ...periodQuery } }"
            target="_blank"
            class="btn-secondary py-2 px-4 text-sm"
          >
            <font-awesome-icon :icon="['fas', 'file-lines']" class="mr-1.5" aria-hidden="true" />
            Summary report
          </router-link>
        </template>
      </PartnerAnalytics>
      <p v-if="overviewError" class="text-sm text-red-600">{{ overviewError }}</p>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { adminAPI, type PartnerDashboardResult } from '@/lib/admin'
import {
  describeProgram,
  DISCOUNT_OPTIONS,
  formatMoney,
  invoiceLabel,
  monthlyValueCents,
  partnerPortalAPI,
  type DiscountPercent,
  type PartnerOverview,
} from '@/lib/partnerPortal'
import { usePartnerPeriod } from '@/composables/usePartnerPeriod'
import PartnerAnalytics from '@/components/PartnerAnalytics.vue'

const route = useRoute()
const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<PartnerDashboardResult | null>(null)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

const leadId = route.params.leadId as string
const overview = ref<PartnerOverview | null>(null)
const overviewError = ref<string | null>(null)
const program = computed(() => describeProgram(overview.value?.pilot ?? null, overview.value?.paid ?? null))
const hasRunningPilot = computed(() => program.value.stage === 'pilot')
const prices = computed(() => overview.value?.seatPriceCents ?? null)
// Contract terms (interval, discount, snapshotted price) live on the overview's paid pool.
const paidTerms = computed(() => (overview.value?.paid?.status === 'active' ? overview.value.paid : null))

const addSeatsCount = ref(25)
const addingSeats = ref(false)
const addSeatsError = ref<string | null>(null)
async function submitAddSeats() {
  if (!data.value?.orgAccount) return
  addingSeats.value = true
  addSeatsError.value = null
  const { error: apiError } = await adminAPI.addOrgSeats(data.value.orgAccount.id, addSeatsCount.value)
  addingSeats.value = false
  if (apiError) addSeatsError.value = apiError.message
  else await reload()
}

async function resolveRequest(requestId: string) {
  const { error: apiError } = await partnerPortalAPI.resolveSeatRequest(leadId, requestId)
  if (apiError) overviewError.value = apiError.message
  else await reloadAnalytics()
}
const { period, customSince, since, label: periodLabelText, query: periodQuery } = usePartnerPeriod()
const refreshing = ref(false)

async function reloadAnalytics() {
  refreshing.value = true
  const { data: ov, error: apiError } = await partnerPortalAPI.overview(leadId, since.value)
  refreshing.value = false
  overviewError.value = apiError?.message ?? null
  if (ov) overview.value = ov
}
watch(since, reloadAnalytics)

async function reload() {
  const [records, ov] = await Promise.all([adminAPI.getPartnerDashboard(leadId), partnerPortalAPI.overview(leadId, since.value)])
  if (records.error) {
    error.value = records.error.message
    return
  }
  data.value = records.data
  overviewError.value = ov.error?.message ?? null
  overview.value = ov.data
  if (ov.data) domainsRaw.value = ov.data.lead.email_domains.join(', ')
}

const domainsRaw = ref('')
const savingDomains = ref(false)
const setupMessage = ref<string | null>(null)
const setupError = ref(false)

function showSetupResult(err: Error | null, ok: string) {
  setupError.value = !!err
  setupMessage.value = err ? err.message : ok
}

async function saveDomains() {
  savingDomains.value = true
  const domains = domainsRaw.value.split(/[,\s]+/).filter(Boolean)
  const { error: apiError } = await partnerPortalAPI.updateDomains(leadId, domains)
  savingDomains.value = false
  showSetupResult(apiError, 'Domains saved.')
  if (!apiError) await reload()
}

const staffEmail = ref('')
const addingStaff = ref(false)
async function addStaff() {
  addingStaff.value = true
  const { data: result, error: apiError } = await partnerPortalAPI.addStaff(leadId, staffEmail.value.trim())
  addingStaff.value = false
  showSetupResult(apiError, result?.emailSent ? 'Staff added and invite emailed.' : 'Staff added (invite email not sent).')
  if (!apiError) {
    staffEmail.value = ''
    await reload()
  }
}

async function removeStaff(email: string) {
  const { error: apiError } = await partnerPortalAPI.removeStaff(leadId, email)
  showSetupResult(apiError, `Removed ${email}.`)
  if (!apiError) await reload()
}

const pilotForm = reactive({ seatCount: 50, days: 60, featureTier: 'core' as 'core' | 'premium' })
const startingPilot = ref(false)
const pilotError = ref<string | null>(null)
async function startPilot() {
  startingPilot.value = true
  pilotError.value = null
  const { error: apiError } = await adminAPI.createTrialGrant({
    organizationName: data.value?.lead.organization_name ?? '',
    institutionalLeadId: leadId,
    seatCount: pilotForm.seatCount,
    featureTier: pilotForm.featureTier,
    expiresAt: new Date(Date.now() + pilotForm.days * 86_400_000).toISOString(),
  })
  startingPilot.value = false
  if (apiError) pilotError.value = apiError.message
  else await reload()
}

const releasing = ref(false)
async function releaseSeat(profileId: string) {
  releasing.value = true
  const { error: apiError } = await partnerPortalAPI.releaseSeat(leadId, profileId)
  releasing.value = false
  overviewError.value = apiError?.message ?? null
  if (!apiError) await reload()
}

onMounted(async () => {
  await reload()
  loading.value = false
})

const createForm = reactive({
  billingEmail: '',
  billingName: '',
  featureTier: 'core' as 'core' | 'premium',
  seatCount: 5,
  billingInterval: 'month' as 'month' | 'year',
  discountPercent: 0 as DiscountPercent,
})
// Annual deals default to the 20% partner discount; still editable per deal.
watch(
  () => createForm.billingInterval,
  (interval) => (createForm.discountPercent = interval === 'year' ? 20 : 0),
)
const createEstimate = computed(() =>
  monthlyValueCents(
    { seat_count: createForm.seatCount || 0, feature_tier: createForm.featureTier, discount_percent: createForm.discountPercent },
    prices.value,
  ),
)
const creatingOrgAccount = ref(false)
const createError = ref<string | null>(null)

async function submitCreateOrgAccount() {
  creatingOrgAccount.value = true
  createError.value = null
  const { error: apiError } = await adminAPI.createOrgAccount({
    leadId,
    organizationName: data.value?.lead.organization_name ?? '',
    billingEmail: createForm.billingEmail.trim(),
    billingName: createForm.billingName.trim(),
    featureTier: createForm.featureTier,
    billingInterval: createForm.billingInterval,
    discountPercent: createForm.discountPercent,
    seatCount: createForm.seatCount,
  })
  creatingOrgAccount.value = false
  if (apiError) {
    createError.value = apiError.message
    return
  }
  await reload()
}

const importEmailsRaw = ref('')
const importingSeats = ref(false)
const importError = ref<string | null>(null)
const importSuccess = ref<string | null>(null)

async function submitImportSeats() {
  if (!data.value?.orgAccount) return
  importingSeats.value = true
  importError.value = null
  importSuccess.value = null
  const emails = importEmailsRaw.value
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter(Boolean)
  const { data: result, error: apiError } = await adminAPI.importOrgSeats(data.value.orgAccount.id, emails)
  importingSeats.value = false
  if (apiError) {
    importError.value = apiError.message
    return
  }
  importSuccess.value = `Invited ${result?.invited ?? 0} new seat(s) (${result?.emailsSent ?? 0} email(s) sent).`
  importEmailsRaw.value = ''
  await reload()
}

const revokingEmail = ref<string | null>(null)

async function submitRevokeSeat(email: string) {
  if (!data.value?.orgAccount) return
  revokingEmail.value = email
  const { error: apiError } = await adminAPI.revokeOrgSeat(data.value.orgAccount.id, email)
  revokingEmail.value = null
  if (apiError) {
    importError.value = apiError.message
    return
  }
  await reload()
}
</script>
