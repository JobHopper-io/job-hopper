<template>
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · System Announcements
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Write and send an update email to every subscribed, non-unsubscribed user. There's no audience
        picker yet and no undo once sent.
      </p>
    </header>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <!-- Step 1: compose -->
      <form
        v-if="step === 'compose'"
        class="space-y-6"
        @submit.prevent="onPreview"
      >
        <div>
          <label for="ann-title" class="block text-sm font-medium text-brand-charcoal mb-1">
            Title (internal reference)
          </label>
          <input
            id="ann-title"
            v-model="form.title"
            type="text"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
            placeholder="e.g. August product update"
          />
          <p class="text-xs text-neutral-body mt-1">Shown in send history. Not part of the email itself.</p>
        </div>

        <div>
          <label for="ann-subject" class="block text-sm font-medium text-brand-charcoal mb-1">
            Email subject
          </label>
          <input
            id="ann-subject"
            v-model="form.emailSubject"
            type="text"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
            placeholder="What subscribers see in their inbox"
          />
        </div>

        <div>
          <label for="ann-body" class="block text-sm font-medium text-brand-charcoal mb-1">
            Email body
          </label>
          <textarea
            id="ann-body"
            v-model="form.bodyMarkdown"
            rows="10"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
            placeholder="Write the announcement here."
          />
          <p class="text-xs text-neutral-body mt-1">
            Supports
            <a
              href="https://www.markdownguide.org/cheat-sheet/"
              class="text-brand-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              >Markdown</a
            >
            (headings, bold, links, lists) - not raw HTML.
          </p>
        </div>

        <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
        <p v-if="previewError" class="text-sm text-red-600">{{ previewError }}</p>

        <div class="flex flex-wrap gap-3">
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
            :disabled="isPreviewing"
          >
            {{ isPreviewing ? 'Loading preview…' : 'Preview' }}
          </button>
          <router-link
            to="/admin/dashboard"
            class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
          >
            Back to admin
          </router-link>
        </div>
      </form>

      <!-- Step 2: preview -->
      <div v-else-if="step === 'preview'" class="space-y-4">
        <p class="text-xs font-medium text-neutral-body">Preview - exactly what will be sent</p>
        <div class="rounded-lg border border-neutral-border overflow-hidden">
          <div class="px-4 py-2 border-b border-neutral-border bg-neutral-bg text-sm">
            <span class="text-neutral-body">Subject:</span>
            <span class="font-medium text-brand-charcoal">{{ form.emailSubject }}</span>
          </div>
          <iframe
            :srcdoc="previewHtml"
            sandbox=""
            class="w-full bg-white"
            style="height: 480px"
            title="Email preview"
          />
        </div>

        <div class="rounded-lg border border-neutral-border px-4 py-3">
          <label for="test-email" class="block text-xs font-medium text-neutral-body mb-1">
            Send a test to one address first
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="test-email"
              v-model="testEmail"
              type="email"
              class="flex-1 min-w-[16rem] rounded-lg border border-neutral-border px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg disabled:opacity-50"
              :disabled="isSendingTest || !testEmail.trim()"
              @click="onSendTest"
            >
              {{ isSendingTest ? 'Sending…' : 'Send test' }}
            </button>
          </div>
          <p v-if="testEmailStatus" class="text-xs mt-2" :class="testEmailStatus.ok ? 'text-green-700' : 'text-red-600'">
            {{ testEmailStatus.message }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
            @click="step = 'compose'"
          >
            Back to edit
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            @click="step = 'confirm'"
          >
            Looks good, continue
          </button>
        </div>
      </div>

      <!-- Step 3: send confirmation -->
      <div v-else-if="step === 'confirm'" class="space-y-4">
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
          <p class="text-sm font-medium text-red-800 mb-1">This cannot be undone</p>
          <p class="text-sm text-red-700">
            Sending fires the email "{{ form.emailSubject }}" to every subscribed, non-unsubscribed user
            right now. There's no way to recall it once it's sent.
          </p>
        </div>

        <p v-if="sendError" class="text-sm text-red-600">{{ sendError }}</p>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
            :disabled="isSending"
            @click="step = 'preview'"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
            :disabled="isSending"
            @click="onSend"
          >
            {{ isSending ? 'Sending…' : 'Yes, send to all subscribers now' }}
          </button>
        </div>
      </div>

      <!-- Step 4: result -->
      <div v-else-if="step === 'result'" class="space-y-4">
        <p class="text-sm text-green-700 font-medium">Announcement sent.</p>
        <p class="text-sm text-neutral-body">
          Sent to {{ sendResult?.sent }} of {{ sendResult?.total_eligible }} eligible recipients.
          <span v-if="sendResult && sendResult.failed > 0">{{ sendResult.failed }} failed to send.</span>
        </p>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          @click="resetForm"
        >
          New announcement
        </button>
      </div>
    </section>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">Send history</h2>
      <p v-if="historyLoading" class="text-sm text-neutral-body">Loading…</p>
      <p v-else-if="historyError" class="text-sm text-red-600">{{ historyError }}</p>
      <div v-else-if="history.length === 0" class="text-sm text-neutral-body">No announcements sent yet.</div>
      <div v-else class="-mx-4 sm:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Title</th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Sent</th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Sent by</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr v-for="row in history" :key="row.id">
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="font-medium text-brand-charcoal">{{ row.title }}</div>
                <div class="text-xs text-neutral-body">{{ row.email_subject }}</div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ new Date(row.published_at).toLocaleString() }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                {{ row.sent_by ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { markdownToSafeHtml } from '@/lib/markdown'
import { profileAPI } from '@/lib/profile'
import {
  systemAnnouncementsAPI,
  type AnnouncementHistoryRow,
  type SendAnnouncementResult,
} from '@/lib/systemAnnouncements'

type Step = 'compose' | 'preview' | 'confirm' | 'result'

const step = ref<Step>('compose')

const form = reactive({
  title: '',
  emailSubject: '',
  bodyMarkdown: '',
})

const formError = ref<string | null>(null)
const isPreviewing = ref(false)
const previewError = ref<string | null>(null)
const previewHtml = ref('')

const testEmail = ref('')
const isSendingTest = ref(false)
const testEmailStatus = ref<{ ok: boolean; message: string } | null>(null)

const isSending = ref(false)
const sendError = ref<string | null>(null)
const sendResult = ref<SendAnnouncementResult | null>(null)

const history = ref<AnnouncementHistoryRow[]>([])
const historyLoading = ref(true)
const historyError = ref<string | null>(null)

function validate(): boolean {
  formError.value = null
  if (!form.title.trim()) {
    formError.value = 'Title is required.'
    return false
  }
  if (!form.emailSubject.trim()) {
    formError.value = 'Email subject is required.'
    return false
  }
  if (!form.bodyMarkdown.trim()) {
    formError.value = 'Email body is required.'
    return false
  }
  return true
}

async function onPreview() {
  previewError.value = null
  if (!validate()) return

  isPreviewing.value = true
  const { data, error } = await systemAnnouncementsAPI.preview({
    title: form.title,
    emailSubject: form.emailSubject,
    emailBodyHtml: markdownToSafeHtml(form.bodyMarkdown),
  })
  isPreviewing.value = false

  if (error) {
    previewError.value = error.message
    return
  }
  previewHtml.value = data ?? ''
  step.value = 'preview'
}

async function onSendTest() {
  testEmailStatus.value = null
  isSendingTest.value = true
  const { data, error } = await systemAnnouncementsAPI.sendTest(
    {
      title: form.title,
      emailSubject: form.emailSubject,
      emailBodyHtml: markdownToSafeHtml(form.bodyMarkdown),
    },
    testEmail.value.trim(),
  )
  isSendingTest.value = false

  if (error) {
    testEmailStatus.value = { ok: false, message: error.message }
    return
  }
  if (!data?.testSent) {
    testEmailStatus.value = { ok: false, message: data?.error ?? 'Test send failed.' }
    return
  }
  testEmailStatus.value = { ok: true, message: `Test sent to ${testEmail.value.trim()}.` }
}

async function onSend() {
  sendError.value = null
  isSending.value = true
  const { data, error } = await systemAnnouncementsAPI.send({
    title: form.title,
    emailSubject: form.emailSubject,
    emailBodyHtml: markdownToSafeHtml(form.bodyMarkdown),
  })
  isSending.value = false

  if (error) {
    sendError.value = error.message
    return
  }
  sendResult.value = data
  step.value = 'result'
  void loadHistory()
}

function resetForm() {
  form.title = ''
  form.emailSubject = ''
  form.bodyMarkdown = ''
  previewHtml.value = ''
  sendResult.value = null
  testEmailStatus.value = null
  step.value = 'compose'
}

async function loadHistory() {
  historyLoading.value = true
  historyError.value = null
  const { data, error } = await systemAnnouncementsAPI.listHistory()
  historyLoading.value = false
  if (error) {
    historyError.value = error.message
    return
  }
  history.value = data ?? []
}

onMounted(async () => {
  void loadHistory()
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  if (profile?.email) testEmail.value = profile.email
})
</script>
