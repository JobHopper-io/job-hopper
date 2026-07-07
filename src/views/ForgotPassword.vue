<script setup lang="ts">
import { ref } from 'vue'
import { authAPI } from '@/lib/auth'

const email = ref('')
const isLoading = ref(false)
const error = ref('')
const submitted = ref(false)

const handleSubmit = async () => {
  try {
    isLoading.value = true
    error.value = ''

    const { error: resetError } = await authAPI.requestPasswordReset(email.value)

    if (resetError) {
      const status = (resetError as { status?: number }).status
      const code = (resetError as { code?: string }).code
      // Network / connectivity issues: Supabase never got a valid HTTP response
      if (typeof status !== 'number' || status === 0) {
        error.value =
          'We couldn’t reach our servers. Please check your internet connection and try again in a moment.'
        return
      }
      // Rate limited: too many reset requests in a short window.
      if (status === 429 || code === 'over_email_send_rate_limit') {
        error.value =
          'Too many reset requests. Please wait a few minutes before trying again.'
        return
      }
      // Any other error is shown generically to avoid leaking whether the email exists.
      error.value = 'Something went wrong. Please try again in a moment.'
      return
    }

    // Neutral confirmation regardless of whether the email is registered.
    submitted.value = true
  } catch (err) {
    error.value = 'An unexpected error occurred'
    console.error('Password reset request error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <template v-if="!submitted">
        <div>
          <h2 class="text-center text-3xl font-heading font-bold text-brand-charcoal">
            Reset your password
          </h2>
          <p class="mt-2 text-center text-sm text-neutral-body">
            Enter the email address for your account and we'll send you a link to reset your password.
          </p>
        </div>

        <form class="mt-8 space-y-6" @submit.prevent="handleSubmit">
          <div>
            <label for="email" class="block text-sm font-medium text-brand-charcoal mb-2">Email address</label>
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              class="input"
              placeholder="Email address"
            />
          </div>

          <div v-if="error" class="text-red-600 text-sm text-center">
            {{ error }}
          </div>

          <div>
            <button
              type="submit"
              :disabled="isLoading || !email"
              class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isLoading" class="flex items-center justify-center">
                <font-awesome-icon
                  :icon="['fas', 'spinner']"
                  spin
                  class="h-5 w-5 mr-2"
                  aria-hidden="true"
                />
                Sending link...
              </span>
              <span v-else>Send reset link</span>
            </button>
          </div>

          <div class="text-center">
            <router-link to="/login" class="text-sm font-medium text-brand-primary hover:underline">
              Back to sign in
            </router-link>
          </div>
        </form>
      </template>

      <div v-else class="card p-8 text-center">
        <div class="w-14 h-14 mx-auto mb-6 rounded-full bg-brand-primary/10 flex items-center justify-center">
          <svg class="w-7 h-7 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
          Check your email
        </h1>
        <p class="text-neutral-body mb-6">
          If an account exists for that address, we've sent a link to reset your password. Click the link in that email to choose a new password.
        </p>
        <p class="text-sm text-neutral-body mb-6">
          Didn't get the email? Check your spam folder, or try again in a few minutes.
        </p>
        <router-link to="/login" class="btn-primary w-full inline-block text-center">
          Back to sign in
        </router-link>
      </div>
    </div>
  </div>
</template>
