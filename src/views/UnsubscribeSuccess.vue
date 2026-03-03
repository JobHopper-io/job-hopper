<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto">
      <div class="card p-8 text-center">
        <div
          class="w-14 h-14 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center border border-green-200"
        >
          <svg class="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">
          You’re unsubscribed
        </h1>
        <p class="text-neutral-body mb-6">
          You’ve been unsubscribed from all Job-Hopper email notifications. You can always come
          back later and update your preferences from your profile.
        </p>
        <router-link to="/" class="btn-primary w-full inline-block text-center">
          Back to home
        </router-link>
      </div>
    </div>
  </div>
</template>

