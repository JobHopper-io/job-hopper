<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  void router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-16 px-4 sm:px-6 lg:px-8">
    <div class="max-w-xl mx-auto text-center">
      <p class="text-sm font-semibold text-brand-primary tracking-wide uppercase mb-3">
        404
      </p>
      <h1 class="text-3xl sm:text-4xl font-heading font-bold text-brand-charcoal mb-3">
        We couldn’t find that page.
      </h1>
      <p class="text-neutral-body mb-8">
        The link you followed may be broken, or the page may have been moved.
        Head back to your dashboard to keep exploring your matches.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          class="btn-primary"
          @click="goHome"
        >
          Go to dashboard
        </button>
        <router-link
          to="/"
          class="btn-secondary inline-flex items-center justify-center"
        >
          Go to home
        </router-link>
      </div>
    </div>
  </div>
</template>

