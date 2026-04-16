<template>
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · Test emails
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Send real transactional emails to a specific user for QA. Uses the same templates and Mailtrap
        path as production. Eligible jobs must exist in <code class="text-xs bg-neutral-bg px-1 rounded">job_hopper_live</code>.
      </p>
    </header>

    <form class="space-y-6 rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6" @submit.prevent="onSubmit">
      <div>
        <span class="block text-sm font-medium text-brand-charcoal mb-2">Recipient</span>
        <div class="flex flex-wrap gap-4">
          <label class="inline-flex items-center gap-2 cursor-pointer">
            <input v-model="recipientMode" type="radio" value="email" class="rounded-full border-neutral-border text-brand-primary" />
            <span class="text-sm">Email address</span>
          </label>
          <label class="inline-flex items-center gap-2 cursor-pointer">
            <input v-model="recipientMode" type="radio" value="profile_id" class="rounded-full border-neutral-border text-brand-primary" />
            <span class="text-sm">Profile ID</span>
          </label>
        </div>
        <input
          v-if="recipientMode === 'email'"
          v-model="recipientEmail"
          type="email"
          autocomplete="off"
          placeholder="user@example.com"
          class="mt-2 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
        />
        <input
          v-else
          v-model="recipientProfileId"
          type="text"
          autocomplete="off"
          placeholder="UUID from profiles.id"
          class="mt-2 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
        />
      </div>

      <div>
        <label for="email-kind" class="block text-sm font-medium text-brand-charcoal mb-1">Email type</label>
        <select
          id="email-kind"
          v-model="kind"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm bg-white"
        >
          <option v-for="opt in kindOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div v-if="kind === 'job_match_digest'" class="space-y-1">
        <label for="job-ids" class="block text-sm font-medium text-brand-charcoal">Job IDs</label>
        <p class="text-xs text-neutral-body mb-1">
          One or more <code class="bg-neutral-bg px-1 rounded">job_hopper_live.id</code> values (comma or newline separated, max 15 used).
        </p>
        <textarea
          id="job-ids"
          v-model="jobIdsRaw"
          rows="4"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
          placeholder="uuid-one, uuid-two"
        />
      </div>

      <div v-if="kind === 'subscription_updated'" class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="plan-name" class="block text-sm font-medium text-brand-charcoal mb-1">Plan name (optional)</label>
          <input
            id="plan-name"
            v-model="planName"
            type="text"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
            placeholder="e.g. Pro"
          />
        </div>
        <div>
          <label for="next-billing" class="block text-sm font-medium text-brand-charcoal mb-1">Next billing (optional)</label>
          <input
            id="next-billing"
            v-model="nextBillingDate"
            type="text"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
            placeholder="e.g. 4/20/2026"
          />
        </div>
      </div>

      <div v-if="kind === 'subscription_cancel_scheduled'">
        <label for="cancel-at" class="block text-sm font-medium text-brand-charcoal mb-1">Cancel at (optional)</label>
        <input
          id="cancel-at"
          v-model="cancelAtDate"
          type="text"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          placeholder="Shown in the body copy"
        />
      </div>

      <div v-if="kind === 'system_announcement'">
        <label for="announcement-id" class="block text-sm font-medium text-brand-charcoal mb-1">Announcement ID</label>
        <input
          id="announcement-id"
          v-model="announcementId"
          type="text"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
          placeholder="system_announcements.id"
        />
      </div>

      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
      <p v-if="resultMessage" class="text-sm text-green-700">{{ resultMessage }}</p>
      <p v-if="resultDetail" class="text-xs text-neutral-body font-mono break-all">{{ resultDetail }}</p>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="isSending"
          class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
        >
          {{ isSending ? 'Sending…' : 'Send test email' }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  adminAPI,
  type AdminTestEmailKind,
} from '@/lib/admin'

const recipientMode = ref<'email' | 'profile_id'>('email')
const recipientEmail = ref('')
const recipientProfileId = ref('')

const kind = ref<AdminTestEmailKind>('job_match_digest')

const kindOptions: { value: AdminTestEmailKind; label: string }[] = [
  { value: 'job_match_digest', label: 'Job match digest' },
  { value: 'subscription_started', label: 'Subscription — welcome / started' },
  { value: 'subscription_updated', label: 'Subscription — updated' },
  { value: 'subscription_cancel_scheduled', label: 'Subscription — cancel scheduled' },
  { value: 'subscription_canceled', label: 'Subscription — canceled' },
  { value: 'system_announcement', label: 'System announcement' },
]

const jobIdsRaw = ref('')
const planName = ref('')
const nextBillingDate = ref('')
const cancelAtDate = ref('')
const announcementId = ref('')

const isSending = ref(false)
const formError = ref<string | null>(null)
const resultMessage = ref<string | null>(null)
const resultDetail = ref<string | null>(null)

function parseJobIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const canSubmit = computed(() => {
  if (recipientMode.value === 'email') {
    return recipientEmail.value.trim().length > 0
  }
  return recipientProfileId.value.trim().length > 0
})

async function onSubmit() {
  formError.value = null
  resultMessage.value = null
  resultDetail.value = null

  if (!canSubmit.value) {
    formError.value = recipientMode.value === 'email' ? 'Enter an email address.' : 'Enter a profile ID.'
    return
  }

  const base =
    recipientMode.value === 'email'
      ? { email: recipientEmail.value.trim().toLowerCase() }
      : { profile_id: recipientProfileId.value.trim() }

  const payload: Parameters<typeof adminAPI.sendTestEmail>[0] = {
    ...base,
    kind: kind.value,
  }

  if (kind.value === 'job_match_digest') {
    const job_ids = parseJobIds(jobIdsRaw.value)
    if (job_ids.length === 0) {
      formError.value = 'Add at least one job ID for the job match digest.'
      return
    }
    payload.job_ids = job_ids
  }

  if (kind.value === 'subscription_updated') {
    if (planName.value.trim()) payload.plan_name = planName.value.trim()
    if (nextBillingDate.value.trim()) payload.next_billing_date = nextBillingDate.value.trim()
  }

  if (kind.value === 'subscription_cancel_scheduled' && cancelAtDate.value.trim()) {
    payload.cancel_at_date = cancelAtDate.value.trim()
  }

  if (kind.value === 'system_announcement') {
    if (!announcementId.value.trim()) {
      formError.value = 'Enter a system announcement ID.'
      return
    }
    payload.announcement_id = announcementId.value.trim()
  }

  isSending.value = true
  try {
    const { data, error } = await adminAPI.sendTestEmail(payload)
    if (error) {
      formError.value = error.message
      return
    }
    if (!data) {
      formError.value = 'No response from server.'
      return
    }
    if (data.success) {
      resultMessage.value = 'Email send completed (check Mailtrap and email_events).'
      resultDetail.value = `profile_id=${data.profile_id} message_id=${data.message_id ?? 'null'}`
    } else {
      formError.value = data.error ?? 'Send failed (provider or logging).'
      resultDetail.value = `profile_id=${data.profile_id}`
    }
  } finally {
    isSending.value = false
  }
}
</script>
