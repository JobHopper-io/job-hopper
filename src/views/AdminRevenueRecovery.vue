<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        B2C Recovery Emails
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Two-email sequences per segment: the first when someone enters a segment, the second at least five
        days later if they still haven't converted. At most one recovery email per person per 7 days. Anyone
        with live access, a past-due payment, no marketing consent, an unsubscribe, a bounce or a complaint is
        never emailed; each is re-checked right before every send.
      </p>
    </header>

    <p v-if="loadError" class="mb-4 text-sm text-red-600">
      {{ loadError }}
    </p>

    <section v-if="data" class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Settings
        </h2>
        <button type="button" class="btn-secondary text-sm" :disabled="loading" @click="load">
          <font-awesome-icon v-if="loading" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          {{ loading ? 'Refreshing…' : 'Refresh preview' }}
        </button>
      </div>
      <dl class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <dt class="text-neutral-muted">Daily automatic send</dt>
          <dd class="font-medium text-brand-charcoal">
            {{ data.settings.autoSend ? 'On' : 'Off (the daily run only logs a preview)' }}
          </dd>
        </div>
        <div>
          <dt class="text-neutral-muted">Max sends per run</dt>
          <dd class="font-medium text-brand-charcoal tabular-nums">{{ data.settings.maxSendsPerRun }}</dd>
        </div>
        <div>
          <dt class="text-neutral-muted">Offers configured</dt>
          <dd class="font-medium text-brand-charcoal">
            {{ data.settings.offerSegments.length ? data.settings.offerSegments.join(', ') : 'None' }}
          </dd>
        </div>
      </dl>
      <p class="text-xs text-neutral-muted mt-3">
        Settings live in the growth_settings table.
      </p>
    </section>

    <section v-if="data" class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
        Segments
      </h2>
      <p class="text-sm text-neutral-body mb-4">
        In priority order: someone in several segments only gets the first. {{ data.result.candidates.toLocaleString() }}
        people are eligible for recovery emails at all.
      </p>
      <div class="-mx-4 sm:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Segment</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">People</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">Due an email now</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="s in data.segments" :key="s.key">
              <th scope="row" class="px-4 sm:px-6 py-3 text-left font-medium text-brand-charcoal">{{ s.label }}</th>
              <td class="px-4 sm:px-6 py-3 text-right tabular-nums">{{ data.result.bySegment[s.key]?.members ?? 0 }}</td>
              <td class="px-4 sm:px-6 py-3 text-right tabular-nums">{{ data.result.bySegment[s.key]?.due ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="skippedSummary" class="text-xs text-neutral-muted mt-3">
        Not due: {{ skippedSummary }}
      </p>
    </section>

    <section v-if="data" class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
        Next emails ({{ preview.length }})
      </h2>
      <p class="text-sm text-neutral-body mb-4">
        Who would get which email on the next run, highest priority first. A run sends at most
        {{ data.settings.maxSendsPerRun }}, and re-checks each person right before sending.
      </p>
      <div class="-mx-4 sm:-mx-6 overflow-x-auto max-h-96 overflow-y-auto mb-6">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg sticky top-0">
            <tr>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Email</th>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Segment</th>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Email #</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="p in preview" :key="p.profileId">
              <td class="px-4 sm:px-6 py-2 text-neutral-body">{{ p.emailMasked }}</td>
              <td class="px-4 sm:px-6 py-2 text-neutral-body">{{ labelFor(p.segment) }}</td>
              <td class="px-4 sm:px-6 py-2 text-neutral-body tabular-nums">{{ p.stage }}</td>
            </tr>
            <tr v-if="preview.length === 0">
              <td colspan="3" class="px-4 sm:px-6 py-6 text-center text-neutral-body">Nobody is due a recovery email right now.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p class="text-sm text-red-900 mb-3">
          Send the next batch now: real emails to up to {{ data.settings.maxSendsPerRun }} people, with the same
          rules as the daily run.
        </p>
        <button type="button" class="btn-primary text-sm" :disabled="sendingBatch || preview.length === 0" @click="sendBatch">
          <font-awesome-icon v-if="sendingBatch" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          Send next batch
        </button>
        <p v-if="batchMessage" class="text-sm mt-2 text-red-900">
          {{ batchMessage }}
        </p>
      </div>
    </section>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
        Outreach sequences
      </h2>
      <p class="text-sm text-neutral-body mb-4">
        Cold outreach to institutional leads and job-seeker prospects: 4 emails on day 0, 2, 4 and 6,
        enrolled by scripts/outbound-live-send.mjs.
        <template v-if="outreach">
          Daily automatic send: {{ outreach.settings.autoSend ? 'on' : 'off (preview only)' }}, up to
          {{ outreach.settings.maxPerRun }} per run.
        </template>
      </p>
      <p v-if="outreachError" class="mb-3 text-sm text-red-600">{{ outreachError }}</p>
      <div class="-mx-4 sm:-mx-6 overflow-x-auto max-h-96 overflow-y-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg sticky top-0">
            <tr>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Who</th>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Campaign</th>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Emails sent</th>
              <th scope="col" class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="o in outreach?.sequences ?? []" :key="`${o.sequenceKey}:${o.kind}:${o.name}:${o.emailMasked}`">
              <td class="px-4 sm:px-6 py-2 text-neutral-body">
                <div class="text-brand-charcoal">{{ o.name }}</div>
                <div class="text-xs text-neutral-muted">{{ o.kind === 'lead' ? 'Institutional lead' : 'Job seeker' }} · {{ o.emailMasked }}</div>
              </td>
              <td class="px-4 sm:px-6 py-2 text-neutral-body">{{ o.campaign }}</td>
              <td class="px-4 sm:px-6 py-2 text-neutral-body tabular-nums">{{ o.stagesSent }} of 4</td>
              <td class="px-4 sm:px-6 py-2">
                <span v-if="o.status === 'stopped'" class="text-red-700">Stopped: {{ (o.stopReason ?? '').replace(/_/g, ' ') }}</span>
                <span v-else-if="o.status === 'complete'" class="text-neutral-muted">Finished</span>
                <span v-else class="text-neutral-body">
                  Email {{ o.nextStage }} due {{ o.nextDue ? new Date(o.nextDue).toLocaleString() : '' }}
                </span>
              </td>
            </tr>
            <tr v-if="outreach && outreach.sequences.length === 0">
              <td colspan="4" class="px-4 sm:px-6 py-6 text-center text-neutral-body">Nobody is enrolled in an outreach sequence.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="data" class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">
        Test an email
      </h2>
      <p class="text-sm text-neutral-body mb-4">
        Sends one segment's email to a single address only. No real user is touched and nothing is logged.
      </p>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="submitTestSend">
        <div>
          <label for="test-segment" class="block text-sm font-medium text-brand-charcoal mb-1">Segment</label>
          <select id="test-segment" v-model="testSegment" class="input-field">
            <option v-for="s in data.segments" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </div>
        <div>
          <label for="test-stage" class="block text-sm font-medium text-brand-charcoal mb-1">Email #</label>
          <select id="test-stage" v-model.number="testStage" class="input-field">
            <option :value="1">1</option>
            <option :value="2">2 (draft copy)</option>
          </select>
        </div>
        <div class="flex-1 min-w-48">
          <label for="test-email" class="block text-sm font-medium text-brand-charcoal mb-1">Test email address</label>
          <input id="test-email" v-model="testEmail" type="email" required class="input-field w-full">
        </div>
        <button type="submit" class="btn-secondary text-sm" :disabled="sendingTest">
          <font-awesome-icon v-if="sendingTest" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          Send test
        </button>
      </form>
      <p v-if="testMessage" class="text-sm mt-2 text-neutral-body">
        {{ testMessage }}
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminAPI, type OutreachAdminResult, type RecoveryAdminResult, type RevenueRecoverySegmentKey } from '@/lib/admin'

const loading = ref(false)
const loadError = ref<string | null>(null)
const data = ref<RecoveryAdminResult | null>(null)
const sendingBatch = ref(false)
const batchMessage = ref<string | null>(null)
const testSegment = ref<RevenueRecoverySegmentKey>('abandoned_checkout')
const testStage = ref<1 | 2>(1)
const testEmail = ref('')
const sendingTest = ref(false)
const testMessage = ref<string | null>(null)

const outreach = ref<OutreachAdminResult | null>(null)
const outreachError = ref<string | null>(null)

async function loadOutreach() {
  const { data: result, error } = await adminAPI.listOutreachSequences()
  outreachError.value = error ? error.message : null
  outreach.value = result
}

const preview = computed(() => data.value?.result.planned ?? [])
const labelFor = (key: RevenueRecoverySegmentKey) => data.value?.segments.find((s) => s.key === key)?.label ?? key
const countsText = (counts: Record<string, number>) =>
  Object.entries(counts).map(([reason, n]) => `${reason.replace(/_/g, ' ')} ${n}`).join(', ')
const skippedSummary = computed(() => (data.value ? countsText(data.value.result.skipped) : ''))

async function load() {
  loading.value = true
  loadError.value = null
  const { data: result, error } = await adminAPI.previewRecovery()
  loading.value = false
  if (error) {
    loadError.value = error.message
    return
  }
  data.value = result
}

async function sendBatch() {
  if (!data.value) return
  const n = Math.min(preview.value.length, data.value.settings.maxSendsPerRun)
  if (!window.confirm(`Send real recovery emails to up to ${n} people now?`)) return
  sendingBatch.value = true
  batchMessage.value = null
  const { data: result, error } = await adminAPI.sendRecoveryBatch()
  sendingBatch.value = false
  if (error || !result) {
    batchMessage.value = `Failed: ${error?.message ?? 'no response'}`
    return
  }
  const r = result.result
  batchMessage.value = `Sent ${r.sent}, failed ${r.failed}.`
    + (Object.keys(r.stopped).length ? ` Sequences stopped: ${countsText(r.stopped)}.` : '')
  await load()
}

async function submitTestSend() {
  if (!testEmail.value.trim()) return
  sendingTest.value = true
  testMessage.value = null
  const { data: result, error } = await adminAPI.sendRecoveryTest(testSegment.value, testStage.value, testEmail.value.trim())
  sendingTest.value = false
  testMessage.value = error || !result?.success
    ? `Failed: ${error?.message ?? result?.error ?? 'unknown error'}`
    : `Sent (messageId=${result.messageId})`
}

onMounted(() => {
  load()
  loadOutreach()
})
</script>
