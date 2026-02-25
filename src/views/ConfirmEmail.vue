<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'

const router = useRouter()

onMounted(async () => {
  const { user } = await authAPI.getCurrentUser()
  if (user) {
    const { data: profile } = await profileAPI.getCurrentUserProfile()
    if (profile?.onboarding_completed) {
      router.push('/dashboard')
    } else {
      router.push('/onboarding')
    }
  }
})
</script>

<template>
  <div class="bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto">
      <div class="card p-8 text-center">
        <div class="w-14 h-14 mx-auto mb-6 rounded-full bg-brand-primary/10 flex items-center justify-center">
          <svg class="w-7 h-7 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
          Check your email
        </h1>
        <p class="text-neutral-body mb-6">
          We've sent you a confirmation link. Click the link in that email to verify your address and continue to set up your profile.
        </p>
        <ul class="text-left text-sm text-neutral-body space-y-2 mb-8 bg-neutral-bg/50 rounded-[12px] p-4">
          <li class="flex items-start gap-2">
            <span class="text-brand-primary mt-0.5">•</span>
            <span>Check your inbox (and spam folder) for an email from us.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-brand-primary mt-0.5">•</span>
            <span>Click the confirmation link in that email.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-brand-primary mt-0.5">•</span>
            <span>You'll be taken to finish your profile and choose your plan.</span>
          </li>
        </ul>
        <p class="text-sm text-neutral-body mb-6">
          Didn't get the email? Wait a few minutes and check again, or contact support if the problem continues.
        </p>
        <router-link to="/login" class="btn-primary w-full inline-block text-center">
          Back to sign in
        </router-link>
      </div>
    </div>
  </div>
</template>
