<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin Dashboard
      </h1>
    </header>

    <section
      v-if="glance"
      class="mb-8 rounded-2xl border border-neutral-border bg-white/60 shadow-sm px-6 py-5"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-neutral-muted">
          At a glance
        </h2>
        <router-link
          to="/admin/growth-dashboard"
          class="text-xs text-brand-primary hover:underline whitespace-nowrap"
        >
          Full detail →
        </router-link>
      </div>
      <dl class="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <GrowthStatTile
          label="Leads discovered"
          :value="glance.acquisition.totalLeads.toLocaleString()"
          :icon="['fas', 'arrow-up-right-dots']"
          :meter-pct="qualifiedRate"
          :meter-caption="qualifiedCaption"
        />
        <GrowthStatTile
          label="Emails sent"
          :value="glance.acquisition.emailsSent.toLocaleString()"
          :icon="['fas', 'paper-plane']"
          :meter-pct="contactRate"
          :meter-caption="contactCaption"
        />
        <GrowthStatTile
          label="Registrations"
          :value="glance.b2c.totalSignups.toLocaleString()"
          :icon="['fas', 'user']"
        />
        <GrowthStatTile
          label="Paid subscribers"
          :value="glance.b2c.paidSubscribers.toLocaleString()"
          :icon="['fas', 'crown']"
          :meter-pct="conversionRate"
          :meter-caption="conversionCaption"
        />
        <GrowthStatTile
          label="New MRR"
          :value="formatCents(glance.revenue.mrrCents)"
          :icon="['fas', 'sack-dollar']"
        />
      </dl>
    </section>
    <p
      v-else-if="glanceError"
      class="mb-8 text-xs text-neutral-muted"
    >
      Growth summary unavailable right now.
    </p>

    <section class="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
      <router-link
        v-if="isSuperAdmin"
        to="/admin/admin-management"
        class="group rounded-2xl border border-neutral-border bg-white/60 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Admin Management
        </h2>
        <p class="text-sm text-neutral-body">
          View users and manage who has admin access.
        </p>
      </router-link>

      <router-link
        to="/admin/employer-review"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Employer Review
        </h2>
        <p class="text-sm text-neutral-body">
          Approve, reject, or suspend employer accounts for Recruiter-Visible Mode.
        </p>
      </router-link>

      <router-link
        to="/admin/dashboard-banner"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Dashboard banner
        </h2>
        <p class="text-sm text-neutral-body">
          Schedule a temporary message on the user dashboard (maintenance, releases, etc.).
        </p>
      </router-link>

      <router-link
        to="/admin/announcements"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          System Announcements
        </h2>
        <p class="text-sm text-neutral-body">
          Write and send an update email to every subscribed user.
        </p>
      </router-link>

      <router-link
        to="/admin/job-matching-algorithm"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Job Matching Algorithm
        </h2>
        <p class="text-sm text-neutral-body">
          Configure and monitor the algorithm that powers job matches.
        </p>
      </router-link>

      <router-link
        to="/admin/test-emails"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Test emails
        </h2>
        <p class="text-sm text-neutral-body">
          Send sample transactional emails to a user for QA (job digests, subscription, announcements).
        </p>
      </router-link>

      <router-link
        to="/admin/settings"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          System Settings
        </h2>
        <p class="text-sm text-neutral-body">
          Global configuration: freemium usage counters and related toggles.
        </p>
      </router-link>

      <router-link
        to="/admin/user-lifecycle"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          User Report
        </h2>
        <p class="text-sm text-neutral-body">
          Onboarding, freemium, trials, active subscriptions, and churned users.
        </p>
      </router-link>

      <router-link
        to="/admin/seo-performance"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          SEO Page Performance
        </h2>
        <p class="text-sm text-neutral-body">
          Views, signups, and paying conversions for each static SEO page.
        </p>
      </router-link>

      <router-link
        to="/admin/institutional-leads"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Institutional Leads
        </h2>
        <p class="text-sm text-neutral-body">
          View, filter, and manage the B2B/institutional sales pipeline.
        </p>
      </router-link>

      <router-link
        to="/admin/acquisition-channels"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Acquisition Channels
        </h2>
        <p class="text-sm text-neutral-body">
          Signups and paying conversions by first-touch channel (SEO, paid, direct).
        </p>
      </router-link>

      <router-link
        to="/admin/growth-dashboard"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Growth Command Center
        </h2>
        <p class="text-sm text-neutral-body">
          Acquisition, B2C, institutional, and revenue metrics in one view — real numbers only.
        </p>
      </router-link>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { profileAPI } from '@/lib/profile'
import { adminAPI, type GrowthDashboardReport } from '@/lib/admin'
import GrowthStatTile from '@/components/GrowthStatTile.vue'

const isSuperAdmin = ref(false)
const glance = ref<GrowthDashboardReport | null>(null)
const glanceError = ref(false)

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

// Real proportions of a whole already in the report - never a fabricated trend
// (there's no historical/snapshot table to derive one from).
const qualifiedRate = computed(() => {
  if (!glance.value || glance.value.acquisition.totalLeads === 0) return 0
  return glance.value.acquisition.qualifiedOrganizations / glance.value.acquisition.totalLeads
})
const qualifiedCaption = computed(() => {
  if (!glance.value) return ''
  return `${formatPct(qualifiedRate.value)} qualified (score ≥ 50)`
})

const contactRate = computed(() => {
  if (!glance.value || glance.value.acquisition.totalLeads === 0) return 0
  return glance.value.acquisition.emailsSent / glance.value.acquisition.totalLeads
})
const contactCaption = computed(() => {
  if (!glance.value) return ''
  return `${formatPct(contactRate.value)} of discovered leads contacted`
})

const conversionRate = computed(() => glance.value?.b2c.conversionRate ?? 0)
const conversionCaption = computed(() => {
  if (!glance.value) return ''
  return `${formatPct(conversionRate.value)} of registrations converted`
})

onMounted(async () => {
  try {
    isSuperAdmin.value = await profileAPI.hasRole('super_admin')
  } catch (error) {
    console.error('Error checking super_admin role in AdminDashboard:', error)
    isSuperAdmin.value = false
  }

  const { data, error } = await adminAPI.getGrowthDashboardReport()
  if (error || !data) {
    glanceError.value = true
    return
  }
  glance.value = data
})
</script>

