<template>
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin · System Settings
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Configure platform-wide limits for freemium features and Apollo API credit budgets. Authenticated users read
        these values for UI; only admins can change them.
      </p>
    </header>

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6 mb-8">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">Freemium limits</h2>
      <p class="text-sm text-neutral-body mb-6">
        Set to <span class="font-medium text-brand-charcoal">0</span> to disable that feature for everyone without a
        subscription (manual job search, free resume advice, or free Premium Insights redemptions).
      </p>

      <p v-if="isLoading" class="text-sm text-neutral-body mb-4">Loading current settings…</p>
      <p v-else-if="loadError" class="text-sm text-red-600 mb-4">{{ loadError }}</p>

      <form
        class="space-y-6"
        :class="{ 'opacity-60 pointer-events-none': isLoading }"
        @submit.prevent="onSaveFreemium"
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

        <div>
          <label for="max-premium-insights" class="block text-sm font-medium text-brand-charcoal mb-1">
            Max free Premium Insights (per profile)
          </label>
          <input
            id="max-premium-insights"
            v-model.number="form.maxPremiumInsights"
            type="number"
            min="0"
            step="1"
            class="w-full max-w-xs rounded-lg border border-neutral-border px-3 py-2 text-sm"
            required
          />
          <p class="text-xs text-neutral-body mt-1">
            Free hiring-contact lookups per profile for users without the Premium Insights subscription add-on.
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
            {{ isSaving ? 'Saving…' : 'Save freemium limits' }}
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

    <section class="rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-6">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-1">Apollo limits</h2>
      <p class="text-sm text-neutral-body mb-4">
        Per-process monthly credit caps for paid Apollo calls. Usage resets on a schedule; see
        <span class="font-medium text-brand-charcoal">docs/apollo-limits.md</span> in the repo. Set
        <span class="font-medium text-brand-charcoal">0</span> to disable that process.
      </p>
      <p v-if="apolloLoading" class="text-sm text-neutral-body mb-4">Loading Apollo limits…</p>
      <p v-else-if="apolloLoadError" class="text-sm text-red-600 mb-4">{{ apolloLoadError }}</p>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-neutral-border text-left text-neutral-body">
              <th class="py-2 pr-4 font-medium">Process</th>
              <th class="py-2 pr-4 font-medium">Usage (period)</th>
              <th class="py-2 pr-4 font-medium">Limit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in apolloRows" :key="row.id" class="border-b border-neutral-border/80">
              <td class="py-2 pr-4 font-mono text-brand-charcoal">{{ row.name }}</td>
              <td class="py-2 pr-4 text-neutral-body">{{ row.usage }}</td>
              <td class="py-2 pr-4">
                <input
                  v-model.number="apolloDraft[row.id]"
                  type="number"
                  min="0"
                  step="1"
                  class="w-28 rounded-lg border border-neutral-border px-2 py-1 text-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="apolloFormError" class="text-sm text-red-600 mt-3">{{ apolloFormError }}</p>
      <p v-if="apolloSaveError" class="text-sm text-red-600 mt-1">{{ apolloSaveError }}</p>
      <p v-if="apolloSaveSuccess" class="text-sm text-green-700 mt-1">Apollo limits saved.</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
          :disabled="apolloSaving || apolloLoading"
          @click="onSaveApolloLimits"
        >
          {{ apolloSaving ? 'Saving…' : 'Save Apollo limits' }}
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { freemiumSettingsAPI } from '@/lib/freemiumSettings'
import { apolloLimitsAPI } from '@/lib/apolloLimits'
import type { ApolloLimitsRow } from '@/types/database'

const form = reactive({
  maxJobSearches: 3,
  maxResumeAdvice: 3,
  maxPremiumInsights: 3,
})

const isLoading = ref(true)
const loadError = ref<string | null>(null)
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)
const formError = ref<string | null>(null)

const apolloRows = ref<ApolloLimitsRow[]>([])
const apolloDraft = reactive<Record<string, number>>({})
const apolloLoading = ref(true)
const apolloLoadError = ref<string | null>(null)
const apolloSaving = ref(false)
const apolloSaveError = ref<string | null>(null)
const apolloSaveSuccess = ref(false)
const apolloFormError = ref<string | null>(null)

function validateFreemium(): boolean {
  formError.value = null
  if (!Number.isInteger(form.maxJobSearches) || form.maxJobSearches < 0) {
    formError.value = 'Max manual job searches must be a whole number ≥ 0.'
    return false
  }
  if (!Number.isInteger(form.maxResumeAdvice) || form.maxResumeAdvice < 0) {
    formError.value = 'Max free resume advice must be a whole number ≥ 0.'
    return false
  }
  if (!Number.isInteger(form.maxPremiumInsights) || form.maxPremiumInsights < 0) {
    formError.value = 'Max free Premium Insights must be a whole number ≥ 0.'
    return false
  }
  return true
}

async function loadFreemium() {
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
    form.maxPremiumInsights = data.max_premium_insights
  }
}

async function loadApollo() {
  apolloLoading.value = true
  apolloLoadError.value = null
  const { data, error } = await apolloLimitsAPI.list()
  apolloLoading.value = false
  if (error) {
    apolloLoadError.value = error.message
    apolloRows.value = []
    return
  }
  apolloRows.value = data
  for (const row of data) {
    apolloDraft[row.id] = row.credit_limit
  }
}

async function onSaveFreemium() {
  saveSuccess.value = false
  saveError.value = null
  if (!validateFreemium()) return

  isSaving.value = true
  const { error } = await freemiumSettingsAPI.update({
    max_job_searches: form.maxJobSearches,
    max_resume_advice: form.maxResumeAdvice,
    max_premium_insights: form.maxPremiumInsights,
  })
  isSaving.value = false
  if (error) {
    saveError.value = error
    return
  }
  saveSuccess.value = true
}

async function onSaveApolloLimits() {
  apolloSaveSuccess.value = false
  apolloSaveError.value = null
  apolloFormError.value = null
  for (const row of apolloRows.value) {
    const v = apolloDraft[row.id]
    if (!Number.isInteger(v) || v < 0) {
      apolloFormError.value = `Limit for “${row.name}” must be a whole number ≥ 0.`
      return
    }
  }
  apolloSaving.value = true
  try {
    for (const row of apolloRows.value) {
      const next = apolloDraft[row.id]
      if (next === row.credit_limit) continue
      const { error } = await apolloLimitsAPI.updateCreditLimit(row.id, next)
      if (error) {
        apolloSaveError.value = error.message
        return
      }
    }
    apolloSaveSuccess.value = true
    await loadApollo()
  } finally {
    apolloSaving.value = false
  }
}

onMounted(() => {
  void loadFreemium()
  void loadApollo()
})
</script>
