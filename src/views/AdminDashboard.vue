<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin Dashboard
      </h1>
    </header>

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
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { profileAPI } from '@/lib/profile'

const isSuperAdmin = ref(false)

onMounted(async () => {
  try {
    isSuperAdmin.value = await profileAPI.hasRole('super_admin')
  } catch (error) {
    console.error('Error checking super_admin role in AdminDashboard:', error)
    isSuperAdmin.value = false
  }
})
</script>

