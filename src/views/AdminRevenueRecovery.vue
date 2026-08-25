<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        B2C Revenue-Recovery Segments
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Only segments with a real, already-captured signal. Two of the originally planned segments
        aren't here: "trial expired" (indistinguishable from real churn with current data) and
        "checkout abandoned" (no webhook or client-side tracking exists for it today).
      </p>
    </header>

    <p v-if="loadError" class="mb-4 text-sm text-red-600">
      {{ loadError }}
    </p>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Segments
        </h2>
        <button type="button" class="btn-primary text-sm" :disabled="loading" @click="load">
          <font-awesome-icon v-if="loading" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="report" class="-mx-4 sm:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Segment</th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">Users</th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted" />
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="row in report.summary"
              :key="row.key"
              class="cursor-pointer hover:bg-neutral-bg/80"
              :class="{ 'bg-brand-primary/5': selectedSegment === row.key }"
              @click="selectedSegment = row.key"
            >
              <td class="px-4 sm:px-6 py-3 font-medium text-brand-charcoal">{{ row.label }}</td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-body tabular-nums">{{ row.count }}</td>
              <td class="px-4 sm:px-6 py-3 text-right text-neutral-muted text-xs">
                {{ selectedSegment === row.key ? 'selected' : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="selectedSegment && report" class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">
        {{ selectedLabel }} ({{ selectedMembers.length }})
      </h2>

      <div class="-mx-4 sm:-mx-6 overflow-x-auto max-h-96 overflow-y-auto mb-6">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg sticky top-0">
            <tr>
              <th class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Email</th>
              <th class="px-4 sm:px-6 py-2 text-left font-medium text-neutral-muted">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="m in selectedMembers" :key="m.profileId">
              <td class="px-4 sm:px-6 py-2 text-neutral-body">{{ m.email }}</td>
              <td class="px-4 sm:px-6 py-2 text-neutral-body">{{ m.detail }}</td>
            </tr>
            <tr v-if="selectedMembers.length === 0">
              <td colspan="2" class="px-4 sm:px-6 py-6 text-center text-neutral-body">No users in this segment right now.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
        <p class="text-sm text-amber-900 mb-3">
          Test the copy/send path against one address only — no real segment member is touched.
        </p>
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="submitTestSend">
          <div class="flex-1 min-w-48">
            <label class="block text-sm font-medium text-brand-charcoal mb-1">Test email address</label>
            <input v-model="testEmail" type="email" required class="input-field w-full">
          </div>
          <button type="submit" class="btn-secondary text-sm" :disabled="sending">
            <font-awesome-icon v-if="sending" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
            Send test
          </button>
        </form>
        <p v-if="testResult" class="text-sm mt-2" :class="testResult.success ? 'text-green-700' : 'text-red-600'">
          {{ testResult.success ? `Sent (messageId=${testResult.messageId})` : `Failed: ${testResult.error}` }}
        </p>
      </div>

      <p class="text-xs text-neutral-muted">
        Sending to the real segment (all {{ selectedMembers.length }} users, minus anyone unsubscribed) isn't
        wired up in this UI yet — confirm with the account owner before that's added.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  adminAPI,
  type RevenueRecoverySegmentKey,
  type RevenueRecoverySegmentsResult,
  type SendRevenueRecoverySegmentResult,
} from '@/lib/admin'

const loading = ref(false)
const loadError = ref<string | null>(null)
const report = ref<RevenueRecoverySegmentsResult | null>(null)
const selectedSegment = ref<RevenueRecoverySegmentKey | null>(null)
const testEmail = ref('')
const sending = ref(false)
const testResult = ref<SendRevenueRecoverySegmentResult | null>(null)

const selectedLabel = computed(() => report.value?.summary.find((r) => r.key === selectedSegment.value)?.label ?? '')
const selectedMembers = computed(() => (selectedSegment.value && report.value ? report.value.segments[selectedSegment.value] : []))

async function load() {
  loading.value = true
  loadError.value = null
  const { data, error } = await adminAPI.listRevenueRecoverySegments()
  loading.value = false
  if (error) {
    loadError.value = error.message
    return
  }
  report.value = data
}

async function submitTestSend() {
  if (!selectedSegment.value || !testEmail.value.trim()) return
  sending.value = true
  testResult.value = null
  const { data, error } = await adminAPI.sendRevenueRecoverySegmentEmail(selectedSegment.value, {
    testEmailOverride: testEmail.value.trim(),
  })
  sending.value = false
  if (error) {
    testResult.value = { mode: 'test', success: false, error: error.message }
    return
  }
  testResult.value = data
}

onMounted(load)
</script>
