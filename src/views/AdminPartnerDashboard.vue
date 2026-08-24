<template>
  <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <router-link
      to="/admin/institutional-leads"
      class="text-sm text-brand-primary hover:underline"
    >
      ← Institutional Leads
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
        <p class="text-sm text-neutral-body">
          {{ data.lead.category }} · lead status: {{ data.lead.status }}
        </p>
      </header>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-4">
          Trial grants
        </h2>
        <p v-if="data.grants.length === 0" class="text-sm text-neutral-body">
          No trial grant exists for this org yet.
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
            </div>
            <div class="text-neutral-body">
              Expires {{ formatDate(grant.expires_at) }} · <span class="capitalize">{{ grant.status }}</span>
            </div>
          </div>
        </div>
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
            </div>
            <span class="capitalize text-neutral-body">{{ data.orgAccount.status }}</span>
          </div>

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
            No paid org account exists for this lead yet.
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
            <div class="sm:col-span-2 flex items-center gap-3">
              <button type="submit" class="btn-primary" :disabled="creatingOrgAccount">
                <font-awesome-icon v-if="creatingOrgAccount" :icon="['fas', 'spinner']" spin class="mr-2" />
                Create org account (real Stripe invoice subscription)
              </button>
              <span v-if="createError" class="text-sm text-red-600">{{ createError }}</span>
            </div>
          </form>
        </template>
      </section>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Activity
        </h2>
        <p class="text-sm text-neutral-body mb-4">
          Aggregated counts only across every account linked to this org via a trial grant or
          referral. Individual user activity is never shown here.
        </p>

        <p v-if="data.metrics.linkedUserCount === 0" class="text-sm text-neutral-body">
          No Job-Hopper accounts are linked to this org yet.
        </p>

        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.linkedUserCount }}
            </div>
            <div class="text-xs text-neutral-muted">Linked users</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.activeUserCount }}
            </div>
            <div class="text-xs text-neutral-muted">Active (last {{ data.activeWindowDays }}d)</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.resumeUploads }}
            </div>
            <div class="text-xs text-neutral-muted">Resume uploads</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.jobMatches }}
            </div>
            <div class="text-xs text-neutral-muted">Job matches</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.applications }}
            </div>
            <div class="text-xs text-neutral-muted">Applications</div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { adminAPI, type PartnerDashboardResult } from '@/lib/admin'

const route = useRoute()
const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<PartnerDashboardResult | null>(null)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

async function reload() {
  const leadId = route.params.leadId as string
  const { data: result, error: apiError } = await adminAPI.getPartnerDashboard(leadId)
  if (apiError) {
    error.value = apiError.message
    return
  }
  data.value = result
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
})
const creatingOrgAccount = ref(false)
const createError = ref<string | null>(null)

async function submitCreateOrgAccount() {
  creatingOrgAccount.value = true
  createError.value = null
  const { error: apiError } = await adminAPI.createOrgAccount({
    leadId: route.params.leadId as string,
    organizationName: data.value?.lead.organization_name ?? '',
    billingEmail: createForm.billingEmail.trim(),
    billingName: createForm.billingName.trim(),
    featureTier: createForm.featureTier,
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
