<template>
  <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <router-link
      to="/admin/institutional-leads"
      class="text-sm text-brand-primary hover:underline"
    >
      ← Institutional Leads
    </router-link>

    <div v-if="loading" class="mt-6 text-sm text-neutral-body">
      Loading…
    </div>

    <div v-else-if="error" class="mt-6 text-sm text-red-600">
      {{ error }}
    </div>

    <template v-else-if="data">
      <header class="mt-4 mb-8">
        <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
          {{ data.lead.organization_name }}
        </h1>
        <p class="text-sm text-neutral-body">
          {{ data.lead.category }} · lead status: {{ data.lead.status }}
        </p>
      </header>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-4">
          Trial grants
        </h2>
        <p v-if="data.grants.length === 0" class="text-sm text-neutral-body">
          No trial grant exists for this org yet.
        </p>
        <div v-else class="space-y-3">
          <div
            v-for="grant in data.grants"
            :key="grant.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-border px-4 py-3 text-sm"
          >
            <div>
              <span class="font-medium text-brand-charcoal">{{ grant.seats_used }} / {{ grant.seat_count }} seats</span>
              <span class="text-neutral-body"> · {{ grant.feature_tier }} tier</span>
            </div>
            <div class="text-neutral-body">
              Expires {{ formatDate(grant.expires_at) }} · <span class="capitalize">{{ grant.status }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6">
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Activity
        </h2>
        <p class="text-sm text-neutral-body mb-4">
          Aggregated counts only across every account linked to this org via a trial grant or
          referral. Individual user activity is never shown here.
        </p>

        <p v-if="data.metrics.linkedUserCount === 0" class="text-sm text-neutral-body">
          No Job-Hopper accounts are linked to this org yet.
        </p>

        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.linkedUserCount }}
            </div>
            <div class="text-xs text-neutral-muted">Linked users</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.activeUserCount }}
            </div>
            <div class="text-xs text-neutral-muted">Active (last {{ data.activeWindowDays }}d)</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.resumeUploads }}
            </div>
            <div class="text-xs text-neutral-muted">Resume uploads</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.jobMatches }}
            </div>
            <div class="text-xs text-neutral-muted">Job matches</div>
          </div>
          <div class="rounded-lg border border-neutral-border px-4 py-3">
            <div class="text-2xl font-heading font-semibold text-brand-charcoal">
              {{ data.metrics.applications }}
            </div>
            <div class="text-xs text-neutral-muted">Applications</div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { adminAPI, type PartnerDashboardResult } from '@/lib/admin'

const route = useRoute()
const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<PartnerDashboardResult | null>(null)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

onMounted(async () => {
  const leadId = route.params.leadId as string
  const { data: result, error: apiError } = await adminAPI.getPartnerDashboard(leadId)
  loading.value = false
  if (apiError) {
    error.value = apiError.message
    return
  }
  data.value = result
})
</script>
