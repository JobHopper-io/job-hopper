<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · Trial grants
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Grant an org's people Free/Core/Premium-equivalent access via a shared invite link, without a
        Stripe subscription. Seats are claimed atomically at signup and stop once the seat cap or
        expiration is reached — existing signups keep their access until expiration regardless.
      </p>
    </header>

    <form
      class="space-y-5 rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-10"
      @submit.prevent="onCreate"
    >
      <div>
        <label for="lead-picker" class="block text-sm font-medium text-brand-charcoal mb-1">
          Organization (from institutional leads)
        </label>
        <select
          id="lead-picker"
          v-model="selectedLeadId"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          @change="onLeadSelected"
        >
          <option value="">— One-off / type a name below —</option>
          <option v-for="lead in leads" :key="lead.id" :value="lead.id">
            {{ lead.organization_name }} ({{ lead.category }})
          </option>
        </select>
      </div>

      <div>
        <label for="org-name" class="block text-sm font-medium text-brand-charcoal mb-1">
          Organization name
        </label>
        <input
          id="org-name"
          v-model="form.organizationName"
          type="text"
          class="input w-full"
          :disabled="!!selectedLeadId"
          placeholder="Acme University"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="seat-count" class="block text-sm font-medium text-brand-charcoal mb-1">Seats</label>
          <input
            id="seat-count"
            v-model.number="form.seatCount"
            type="number"
            min="1"
            class="input w-full"
          />
        </div>
        <div>
          <label for="tier" class="block text-sm font-medium text-brand-charcoal mb-1">Feature tier</label>
          <select id="tier" v-model="form.featureTier" class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm">
            <option value="free">Free</option>
            <option value="core">Core</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label for="expires" class="block text-sm font-medium text-brand-charcoal mb-1">Expires</label>
          <input
            id="expires"
            v-model="form.expiresAtLocal"
            type="datetime-local"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label for="invite-code" class="block text-sm font-medium text-brand-charcoal mb-1">
          Invite code (optional)
        </label>
        <input
          id="invite-code"
          v-model="form.inviteCode"
          type="text"
          class="input w-full"
          placeholder="Leave blank to generate one"
        />
      </div>

      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

      <button type="submit" class="btn-primary" :disabled="isCreating">
        <font-awesome-icon v-if="isCreating" :icon="['fas', 'spinner']" spin class="mr-2" />
        {{ isCreating ? 'Creating…' : 'Create trial grant' }}
      </button>
    </form>

    <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">Existing grants</h2>
    <p v-if="isLoadingGrants" class="text-sm text-neutral-body">Loading…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!grants.length" class="text-sm text-neutral-body">No trial grants yet.</p>

    <div v-else class="overflow-x-auto rounded-2xl border border-neutral-border">
      <table class="min-w-full text-sm">
        <thead class="bg-neutral-bg text-left text-xs uppercase text-neutral-body">
          <tr>
            <th class="px-4 py-2">Organization</th>
            <th class="px-4 py-2">Tier</th>
            <th class="px-4 py-2">Seats</th>
            <th class="px-4 py-2">Expires</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Invite link</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grant in grants" :key="grant.id" class="border-t border-neutral-border">
            <td class="px-4 py-2">{{ grant.organization_name }}</td>
            <td class="px-4 py-2 capitalize">{{ grant.feature_tier }}</td>
            <td class="px-4 py-2">{{ grant.seats_used }} / {{ grant.seat_count }}</td>
            <td class="px-4 py-2">{{ formatDate(grant.expires_at) }}</td>
            <td class="px-4 py-2 capitalize">{{ grant.status }}</td>
            <td class="px-4 py-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-brand-primary hover:underline"
                @click="copyLink(grant.invite_code)"
              >
                <font-awesome-icon :icon="['fas', 'copy']" />
                {{ copiedCode === grant.invite_code ? 'Copied!' : 'Copy link' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { adminAPI, type AdminTrialGrantLeadRow } from '@/lib/admin'
import type { TrialGrant } from '@/types/database'

const leads = ref<AdminTrialGrantLeadRow[]>([])
const grants = ref<TrialGrant[]>([])
const selectedLeadId = ref('')
const isLoadingGrants = ref(true)
const loadError = ref<string | null>(null)
const isCreating = ref(false)
const formError = ref<string | null>(null)
const copiedCode = ref<string | null>(null)

const form = reactive({
  organizationName: '',
  seatCount: 10,
  featureTier: 'core' as 'free' | 'core' | 'premium',
  expiresAtLocal: '',
  inviteCode: '',
})

function onLeadSelected() {
  const lead = leads.value.find((l) => l.id === selectedLeadId.value)
  form.organizationName = lead?.organization_name ?? ''
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

async function copyLink(code: string) {
  const url = `${window.location.origin}/trial/${code}`
  try {
    await navigator.clipboard.writeText(url)
    copiedCode.value = code
    setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = null
    }, 2000)
  } catch {
    // Clipboard API unavailable (permissions, non-secure context) - nothing to fall back
    // to here; the link is also visible via each grant's invite_code in the table.
  }
}

async function loadGrants() {
  isLoadingGrants.value = true
  loadError.value = null
  const { data, error } = await adminAPI.listTrialGrants()
  isLoadingGrants.value = false
  if (error) {
    loadError.value = error.message
    return
  }
  grants.value = data ?? []
}

async function loadLeads() {
  const { data } = await adminAPI.listInstitutionalLeadsForTrialGrants()
  leads.value = data ?? []
}

async function onCreate() {
  formError.value = null

  if (!form.organizationName.trim()) {
    formError.value = 'An organization name is required.'
    return
  }
  if (!Number.isInteger(form.seatCount) || form.seatCount < 1) {
    formError.value = 'Seat count must be a positive integer.'
    return
  }
  if (!form.expiresAtLocal) {
    formError.value = 'An expiration date/time is required.'
    return
  }
  const expiresAtIso = new Date(form.expiresAtLocal).toISOString()

  isCreating.value = true
  const { error } = await adminAPI.createTrialGrant({
    organizationName: form.organizationName.trim(),
    institutionalLeadId: selectedLeadId.value || null,
    seatCount: form.seatCount,
    expiresAt: expiresAtIso,
    featureTier: form.featureTier,
    inviteCode: form.inviteCode.trim() || undefined,
  })
  isCreating.value = false

  if (error) {
    formError.value = error.message
    return
  }

  selectedLeadId.value = ''
  form.organizationName = ''
  form.seatCount = 10
  form.featureTier = 'core'
  form.expiresAtLocal = ''
  form.inviteCode = ''
  void loadGrants()
}

onMounted(() => {
  void loadGrants()
  void loadLeads()
})
</script>
