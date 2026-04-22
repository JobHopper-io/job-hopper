<template>
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · Dashboard banner
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Set a short message and optional start and end times. Everyone with dashboard access sees it
        while the message is non-empty and the current time is within the window.
      </p>
    </header>

    <p v-if="isLoading" class="text-sm text-neutral-body mb-4">Loading current settings…</p>
    <p v-else-if="loadError" class="text-sm text-red-600 mb-4">{{ loadError }}</p>

    <form
      class="space-y-6 rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6"
      :class="{ 'opacity-60 pointer-events-none': isLoading }"
      @submit.prevent="onSave"
    >
      <div>
        <label for="banner-message" class="block text-sm font-medium text-brand-charcoal mb-1">Message</label>
        <textarea
          id="banner-message"
          v-model="form.message"
          rows="4"
          class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          placeholder="Leave empty to hide the banner."
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
          (headings, bold, links, lists). Clear the message to hide the banner.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="banner-start" class="block text-sm font-medium text-brand-charcoal mb-1">Start time</label>
          <input
            id="banner-start"
            v-model="form.startsAtLocal"
            type="datetime-local"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          />
          <p class="text-xs text-neutral-body mt-1">Optional. Uses your browser’s local timezone.</p>
        </div>
        <div>
          <label for="banner-end" class="block text-sm font-medium text-brand-charcoal mb-1">End time</label>
          <input
            id="banner-end"
            v-model="form.endsAtLocal"
            type="datetime-local"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          />
          <p class="text-xs text-neutral-body mt-1">Optional. Banner hides at this instant.</p>
        </div>
      </div>

      <div v-if="previewActive && previewMessage">
        <p class="text-xs font-medium text-neutral-body mb-2">Preview (matches dashboard)</p>
        <div
          class="rounded-2xl bg-brand-primary shadow-lg ring-1 ring-black/5"
          role="presentation"
        >
          <div
            class="px-5 py-4 sm:px-8 sm:py-5 text-center font-heading [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-white/70 hover:[&_a]:decoration-white"
          >
            <div
              class="prose prose-invert prose-sm sm:prose-base max-w-none mx-auto text-center text-white [text-wrap:balance] prose-headings:font-heading prose-headings:font-semibold prose-headings:text-white prose-p:text-white prose-p:leading-snug prose-p:my-2 prose-li:text-white prose-li:marker:text-white prose-strong:text-white prose-em:text-white prose-a:text-white prose-blockquote:text-white prose-code:text-white prose-pre:text-white first:prose-p:mt-0 last:prose-p:mb-0"
              v-html="previewMessageHtml"
            />
          </div>
        </div>
      </div>
      <p v-else-if="form.message.trim()" class="text-sm text-neutral-body">
        With the current fields, the banner would not show yet (outside the time window or invalid times).
      </p>

      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
      <p v-if="saveError" class="text-sm text-red-600">{{ saveError }}</p>
      <p v-if="saveSuccess" class="text-sm text-green-700">Saved.</p>

      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
          :disabled="isSaving"
        >
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
        <router-link
          to="/admin/dashboard"
          class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
        >
          Back to admin
        </router-link>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { dashboardBannerAPI, isDashboardBannerActive } from '@/lib/dashboardBanner'
import { markdownToSafeHtml } from '@/lib/markdown'
import type { DashboardBanner } from '@/types/database'

const form = reactive({
  message: '',
  startsAtLocal: '',
  endsAtLocal: '',
})

const isLoading = ref(true)
const loadError = ref<string | null>(null)
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)
const formError = ref<string | null>(null)

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIsoOrNull(local: string): string | null {
  const t = local.trim()
  if (!t) return null
  const ms = new Date(t).getTime()
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

const previewRow = computed<DashboardBanner | null>(() => {
  const starts = datetimeLocalToIsoOrNull(form.startsAtLocal)
  const ends = datetimeLocalToIsoOrNull(form.endsAtLocal)
  return {
    id: 1,
    message: form.message,
    starts_at: starts,
    ends_at: ends,
    updated_at: new Date().toISOString(),
  }
})

const previewActive = computed(() => isDashboardBannerActive(previewRow.value))
const previewMessage = computed(() => form.message.trim())
const previewMessageHtml = computed(() => markdownToSafeHtml(form.message))

function validate(): boolean {
  formError.value = null
  const starts = datetimeLocalToIsoOrNull(form.startsAtLocal)
  const ends = datetimeLocalToIsoOrNull(form.endsAtLocal)
  if (form.startsAtLocal.trim() && starts === null) {
    formError.value = 'Start time is not a valid date.'
    return false
  }
  if (form.endsAtLocal.trim() && ends === null) {
    formError.value = 'End time is not a valid date.'
    return false
  }
  if (starts != null && ends != null && new Date(ends).getTime() <= new Date(starts).getTime()) {
    formError.value = 'End time must be after start time.'
    return false
  }
  return true
}

async function load() {
  isLoading.value = true
  loadError.value = null
  const { data, error } = await dashboardBannerAPI.get()
  isLoading.value = false
  if (error) {
    loadError.value = error
    return
  }
  if (data) {
    form.message = data.message ?? ''
    form.startsAtLocal = isoToDatetimeLocal(data.starts_at)
    form.endsAtLocal = isoToDatetimeLocal(data.ends_at)
  }
}

async function onSave() {
  saveSuccess.value = false
  saveError.value = null
  if (!validate()) return

  isSaving.value = true
  const payload = {
    message: form.message,
    starts_at: datetimeLocalToIsoOrNull(form.startsAtLocal),
    ends_at: datetimeLocalToIsoOrNull(form.endsAtLocal),
  }
  const { error } = await dashboardBannerAPI.update(payload)
  isSaving.value = false
  if (error) {
    saveError.value = error
    return
  }
  saveSuccess.value = true
  void load()
}

onMounted(() => {
  void load()
})
</script>
