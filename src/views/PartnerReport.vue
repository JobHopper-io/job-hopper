<template>
  <!-- print-color-adjust: keep the bars/meters when saved as PDF (browsers drop backgrounds by default) -->
  <div class="app-warm-bg min-h-screen print:bg-none print:bg-white [print-color-adjust:exact]">
    <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 print:px-0 print:py-0">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <router-link :to="{ path: '/partner', query: route.query }" class="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline">
          <font-awesome-icon :icon="['fas', 'chevron-left']" class="text-xs" aria-hidden="true" />Back to dashboard
        </router-link>
        <button type="button" class="btn-primary !py-2.5 !px-5 text-sm !rounded-full inline-flex items-center" :disabled="!data" @click="print">
          <font-awesome-icon :icon="['fas', 'download']" class="mr-2" aria-hidden="true" />
          Print / save as PDF
        </button>
      </div>

      <p v-if="loading" class="text-sm text-neutral-body py-20 text-center">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="mr-2" />Preparing report…
      </p>
      <p v-else-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{{ error }}</p>

      <template v-else-if="data">
        <!-- Cover -->
        <header class="relative overflow-hidden rounded-2xl bg-white border border-neutral-border/80 shadow-sm print:shadow-none p-8 sm:p-10 print:p-6 mb-6 break-inside-avoid">
          <div class="pointer-events-none absolute -top-24 -right-16 w-80 h-72 rounded-full blur-3xl opacity-20 bg-brand-rabbit-end print:hidden" aria-hidden="true" />
          <div class="relative">
            <div class="flex items-center justify-between gap-4 mb-8">
              <img :src="logo" alt="Job-Hopper" class="h-8 w-auto" />
              <span class="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold" :class="STAGE_STYLE[program.stage].pill">
                <span class="h-2 w-2 rounded-full" :class="STAGE_STYLE[program.stage].dot" aria-hidden="true" />
                {{ program.label }}
              </span>
            </div>
            <div class="w-10 h-1 rounded-full mb-5 bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end" />
            <p class="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">Partner report</p>
            <h1 class="font-heading font-bold text-brand-charcoal text-3xl sm:text-4xl leading-tight">
              {{ data.lead.organization_name }}
            </h1>
            <p class="text-neutral-body mt-2">Student engagement summary, {{ periodLabelText.toLowerCase() }}.</p>

            <dl class="mt-8 grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3">
              <div v-for="m in meta" :key="m.label" class="rounded-xl bg-[#fff7ed] px-4 py-3">
                <dt class="text-[11px] font-semibold uppercase tracking-wide text-neutral-muted">{{ m.label }}</dt>
                <dd class="mt-1 text-sm font-semibold text-brand-charcoal">{{ m.value }}</dd>
              </div>
            </dl>
          </div>
        </header>

        <PartnerAnalytics
          :insights="data.insights"
          :seats-used="program.seatsUsed"
          :seat-total="program.seatTotal"
          :organization-name="data.lead.organization_name"
          :period-label="periodLabelText"
          summary-only
        />

        <footer class="mt-6 rounded-2xl bg-white border border-neutral-border/80 shadow-sm print:shadow-none px-6 py-5 flex flex-wrap items-center justify-between gap-4 break-inside-avoid">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <font-awesome-icon :icon="['fas', 'shield-halved']" aria-hidden="true" />
            </span>
            <p class="text-xs text-neutral-body leading-relaxed max-w-2xl">
              Aggregated figures only. No individual student's job search or application activity is included.
              "Active" means the student used Job-Hopper in the last 30 days.
            </p>
          </div>
          <p class="text-xs text-neutral-muted">Questions: <span class="font-medium text-brand-primary">support@job-hopper.io</span></p>
        </footer>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PartnerAnalytics from '@/components/PartnerAnalytics.vue'
import { describeProgram, partnerPortalAPI, STAGE_STYLE, type PartnerOverview } from '@/lib/partnerPortal'
import logo from '@/assets/job-hopper-logo.png'
import { usePartnerPeriod } from '@/composables/usePartnerPeriod'

const route = useRoute()
const { since, label: periodLabelText } = usePartnerPeriod()

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<PartnerOverview | null>(null)
const program = computed(() => describeProgram(data.value?.pilot ?? null, data.value?.paid ?? null))
const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const meta = computed(() => [
  { label: 'Period', value: periodLabelText.value },
  { label: 'Program', value: program.value.title },
  {
    label: program.value.stage === 'pilot' ? 'Pilot ends' : 'Seats',
    value:
      program.value.stage === 'pilot'
        ? `${new Date(data.value!.pilot!.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${program.value.daysLeftCaption})`
        : `${program.value.seatsUsed} of ${program.value.seatTotal} in use`,
  },
  { label: 'Generated', value: generatedAt },
])

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

<style>
/* Printed report: plain white page. The app shell's warm gradient and card shadows render
   as grey smudges in PDF output once print-color-adjust keeps backgrounds. */
@media print {
  html,
  body,
  #app {
    background: #fff !important;
  }
}
</style>
