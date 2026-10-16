<template>
  <!-- print-color-adjust: keep the bars/meters when saved as PDF (browsers drop backgrounds by default) -->
  <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 [print-color-adjust:exact] print:px-0 print:py-0">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <router-link :to="{ path: '/partner', query: route.query }" class="text-sm text-brand-primary hover:underline">
        ← Back to dashboard
      </router-link>
      <button type="button" class="btn-primary py-2 px-4 text-sm" :disabled="!data" @click="print">
        <font-awesome-icon :icon="['fas', 'download']" class="mr-1.5" aria-hidden="true" />
        Print / save as PDF
      </button>
    </div>

    <p v-if="loading" class="text-sm text-neutral-body">
      <font-awesome-icon :icon="['fas', 'spinner']" spin class="mr-2" />Preparing report…
    </p>
    <p v-else-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{{ error }}</p>

    <template v-else-if="data">
      <header class="mb-6 border-b border-neutral-border pb-6">
        <p class="text-sm font-semibold uppercase tracking-wide text-brand-primary mb-1">Job-Hopper partner report</p>
        <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal">
          {{ data.lead.organization_name }}
        </h1>
        <dl class="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div><dt class="inline text-neutral-muted">Period: </dt><dd class="inline text-brand-charcoal font-medium">{{ periodLabelText }}</dd></div>
          <div><dt class="inline text-neutral-muted">Program: </dt><dd class="inline text-brand-charcoal font-medium">{{ program.title }}</dd></div>
          <div v-if="program.stage === 'pilot'"><dt class="inline text-neutral-muted">Pilot: </dt><dd class="inline text-brand-charcoal font-medium">{{ program.detail }} ({{ program.daysLeftCaption }})</dd></div>
          <div><dt class="inline text-neutral-muted">Generated: </dt><dd class="inline text-brand-charcoal font-medium">{{ generatedAt }}</dd></div>
        </dl>
      </header>

      <PartnerAnalytics
        :insights="data.insights"
        :seats-used="program.seatsUsed"
        :seat-total="program.seatTotal"
        :organization-name="data.lead.organization_name"
        :period-label="periodLabelText"
        summary-only
      />

      <p class="mt-8 text-xs text-neutral-muted">
        Aggregated figures only; no individual student's job search or application activity is
        included. "Active" means the student used Job-Hopper in the last 30 days. Questions:
        support@job-hopper.io
      </p>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PartnerAnalytics from '@/components/PartnerAnalytics.vue'
import { describeProgram, partnerPortalAPI, type PartnerOverview } from '@/lib/partnerPortal'
import { usePartnerPeriod } from '@/composables/usePartnerPeriod'

const route = useRoute()
const { since, label: periodLabelText } = usePartnerPeriod()

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<PartnerOverview | null>(null)
const program = computed(() => describeProgram(data.value?.pilot ?? null, data.value?.paid ?? null))
const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

function print() {
  window.print()
}

onMounted(async () => {
  let leadId = route.query.lead as string | undefined
  if (!leadId) {
    const { data: mine } = await partnerPortalAPI.myPartners()
    leadId = mine?.partners[0]?.id
  }
  if (!leadId) {
    error.value = "This account isn't linked to a partner institution."
  } else {
    const { data: overview, error: apiError } = await partnerPortalAPI.overview(leadId, since.value)
    if (apiError) error.value = apiError.message
    else data.value = overview
  }
  loading.value = false
})
</script>
