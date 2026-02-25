<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { profileAPI } from '@/lib/profile'

const router = useRouter()

onMounted(async () => {
  try {
    await profileAPI.markOnboardingComplete()
    router.push('/dashboard')
  } catch (err) {
    console.error('Error completing onboarding:', err)
    router.push('/dashboard')
  }
})
</script>

<template>
  <div class="min-h-screen bg-neutral-bg flex items-center justify-center px-4">
    <div class="text-center">
      <svg
        class="animate-spin h-10 w-10 text-brand-primary mx-auto mb-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p class="text-brand-charcoal font-medium">Setting up your account...</p>
    </div>
  </div>
</template>
