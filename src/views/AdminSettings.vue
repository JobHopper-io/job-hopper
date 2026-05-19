<template>
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · System Settings
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Configure platform-wide limits for freemium features. Authenticated users read these values for UI; only
        admins can change them.
      </p>
    </header>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">Freemium limits</h2>
      <p class="text-sm text-neutral-body mb-6">
        Set to <span class="font-medium text-brand-charcoal">0</span> to disable that feature for everyone without a
        subscription (manual job search or free resume advice redemptions).
      </p>

      <p v-if="isLoading" class="text-sm text-neutral-body mb-4">Loading current settings…</p>
      <p v-else-if="loadError" class="text-sm text-red-600 mb-4">{{ loadError }}</p>

      <form
        class="space-y-6"
        :class="{ 'opacity-60 pointer-events-none': isLoading }"
        @submit.prevent="onSave"
      >
        <div>
          <label for="max-job-searches" class="block text-sm font-medium text-brand-charcoal mb-1">
            Max manual job searches (per profile)
          </label>
          <input
            id="max-job-searches"
            v-model.number="form.maxJobSearches"
            type="number"
            min="0"
            step="1"
            class="w-full max-w-xs rounded-lg border border-neutral-border px-3 py-2 text-sm"
            required
          />
          <p class="text-xs text-neutral-body mt-1">
            How many times a user without an active subscription can run the matching algorithm from the dashboard.
          </p>
        </div>

        <div>
          <label for="max-resume-advice" class="block text-sm font-medium text-brand-charcoal mb-1">
            Max free resume advice (per profile)
          </label>
          <input
            id="max-resume-advice"
            v-model.number="form.maxResumeAdvice"
            type="number"
            min="0"
            step="1"
            class="w-full max-w-xs rounded-lg border border-neutral-border px-3 py-2 text-sm"
            required
          />
          <p class="text-xs text-neutral-body mt-1">
            Free per-job resume advice redemptions before Stripe checkout is required.
          </p>
        </div>

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
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { freemiumSettingsAPI } from '@/lib/freemiumSettings'

const form = reactive({
  maxJobSearches: 3,
  maxResumeAdvice: 3,
})

const isLoading = ref(true)
const loadError = ref<string | null>(null)
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)
const formError = ref<string | null>(null)

function validate(): boolean {
  formError.value = null
  if (!Number.isInteger(form.maxJobSearches) || form.maxJobSearches < 0) {
    formError.value = 'Max manual job searches must be a whole number ≥ 0.'
    return false
  }
  if (!Number.isInteger(form.maxResumeAdvice) || form.maxResumeAdvice < 0) {
    formError.value = 'Max free resume advice must be a whole number ≥ 0.'
    return false
  }
  return true
}

async function load() {
  isLoading.value = true
  loadError.value = null
  const { data, error } = await freemiumSettingsAPI.get()
  isLoading.value = false
  if (error) {
    loadError.value = error
    return
  }
  if (data) {
    form.maxJobSearches = data.max_job_searches
    form.maxResumeAdvice = data.max_resume_advice
  }
}

async function onSave() {
  saveSuccess.value = false
  saveError.value = null
  if (!validate()) return

  isSaving.value = true
  const { error } = await freemiumSettingsAPI.update({
    max_job_searches: form.maxJobSearches,
    max_resume_advice: form.maxResumeAdvice,
  })
  isSaving.value = false
  if (error) {
    saveError.value = error
    return
  }
  saveSuccess.value = true
}

onMounted(() => {
  void load()
})
</script>
