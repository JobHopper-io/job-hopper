<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin Dashboard
      </h1>
    </header>

    <section class="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
      <router-link
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
        to="/admin/job-matching"
        class="group rounded-2xl border border-neutral-border bg-white/40 hover:bg-white shadow-sm hover:shadow-md transition-all duration-150 px-6 py-5 block"
      >
        <h2 class="text-base font-heading font-semibold text-brand-charcoal mb-1">
          Job Matching
        </h2>
        <p class="text-sm text-neutral-body">
          Configure and monitor matching behavior.
          <span class="font-medium text-amber-600">Coming soon</span>.
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
          Global configuration and toggles.
          <span class="font-medium text-amber-600">Coming soon</span>.
        </p>
      </router-link>
    </section>
  </main>
</template>

<script setup lang="ts"></script>

