<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authAPI } from '@/lib/auth'

const isVerified = ref(false)
const isChecking = ref(true)

onMounted(async () => {
  const { user } = await authAPI.getCurrentUser()
  isVerified.value = !!user
  isChecking.value = false
})

function handleDone() {
  // Best-effort: only works if this tab was opened by script. Most mail clients open
  // the confirmation link in a plain new tab, which browsers won't let us close.
  window.close()
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8 flex items-center">
    <div class="max-w-md mx-auto w-full">
      <div class="card p-8 text-center">
        <template v-if="isChecking">
          <p class="text-neutral-body">Verifying…</p>
        </template>

        <template v-else-if="isVerified">
          <div class="w-14 h-14 mx-auto mb-6 rounded-full bg-brand-primary/10 flex items-center justify-center">
            <svg class="w-7 h-7 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            You're verified!
          </h1>
          <p class="text-neutral-body mb-6">
            Go back to the tab where you signed up — it'll pick this up automatically and take you into setting up your profile.
          </p>
          <button type="button" class="btn-primary w-full" @click="handleDone">
            Done
          </button>
          <p class="mt-3 text-xs text-neutral-body">
            If this tab doesn't close on its own, you can close it yourself.
          </p>
        </template>

        <template v-else>
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            This link isn't valid
          </h1>
          <p class="text-neutral-body mb-6">
            This confirmation link may have expired or already been used. Please sign in, or sign up again to get a new one.
          </p>
          <router-link to="/login" class="btn-primary w-full inline-block text-center">
            Back to sign in
          </router-link>
        </template>
      </div>
    </div>
  </div>
</template>
