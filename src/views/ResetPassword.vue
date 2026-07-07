<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Subscription } from '@supabase/supabase-js'
import { authAPI, onAuthStateChange } from '@/lib/auth'

const router = useRouter()

const MIN_PASSWORD_LENGTH = 8

const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const error = ref('')

// Session state: a valid recovery session must exist before we allow a reset.
const checkingSession = ref(true)
const hasRecoverySession = ref(false)

let authSubscription: Subscription | null = null
let resolveTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  // A recovery link fires PASSWORD_RECOVERY once Supabase consumes the token from the URL.
  const {
    data: { subscription },
  } = onAuthStateChange(async (event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
      hasRecoverySession.value = true
      checkingSession.value = false
    }
  })
  authSubscription = subscription

  // The session may already be established by the time we mount (detectSessionInUrl).
  const { user } = await authAPI.getCurrentUser()
  if (user) {
    hasRecoverySession.value = true
    checkingSession.value = false
    return
  }

  // Give the URL-token detection a brief window before declaring the link invalid.
  resolveTimeout = setTimeout(() => {
    checkingSession.value = false
  }, 3000)
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  if (resolveTimeout) clearTimeout(resolveTimeout)
})

const handleSubmit = async () => {
  error.value = ''

  if (password.value.length < MIN_PASSWORD_LENGTH) {
    error.value = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.'
    return
  }

  try {
    isLoading.value = true

    const { error: updateError } = await authAPI.updatePassword(password.value)

    if (updateError) {
      const status = (updateError as { status?: number }).status
      if (typeof status !== 'number' || status === 0) {
        error.value =
          'We couldn’t reach our servers. Please check your internet connection and try again in a moment.'
        return
      }
      error.value =
        updateError.message ||
        'We couldn’t update your password. The reset link may have expired — please request a new one.'
      return
    }

    // The recovery session is now a full session; send the user into the app.
    router.push('/dashboard')
  } catch (err) {
    error.value = 'An unexpected error occurred'
    console.error('Password reset error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Verifying the recovery link -->
      <div v-if="checkingSession" class="card p-8 text-center">
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mb-4"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Verifying your reset link...</p>
      </div>

      <!-- Invalid or expired link -->
      <div v-else-if="!hasRecoverySession" class="card p-8 text-center">
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
          This link has expired
        </h1>
        <p class="text-neutral-body mb-6">
          Your password reset link is invalid or has expired. Request a new one to continue.
        </p>
        <router-link to="/forgot-password" class="btn-primary w-full inline-block text-center">
          Request a new link
        </router-link>
      </div>

      <!-- Reset form -->
      <template v-else>
        <div>
          <h2 class="text-center text-3xl font-heading font-bold text-brand-charcoal">
            Choose a new password
          </h2>
          <p class="mt-2 text-center text-sm text-neutral-body">
            Enter a new password for your account.
          </p>
        </div>

        <form class="mt-8 space-y-6" @submit.prevent="handleSubmit">
          <div class="space-y-4">
            <div>
              <label for="password" class="block text-sm font-medium text-brand-charcoal mb-2">New password</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  class="input pr-10"
                  placeholder="New password"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg v-if="showPassword" class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                  </svg>
                  <svg v-else class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </button>
              </div>
              <p class="mt-1 text-xs text-neutral-body">Must be at least {{ MIN_PASSWORD_LENGTH }} characters.</p>
            </div>
            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-brand-charcoal mb-2">Confirm new password</label>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                name="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                required
                class="input"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <div v-if="error" class="text-red-600 text-sm text-center">
            {{ error }}
          </div>

          <div>
            <button
              type="submit"
              :disabled="isLoading || !password || !confirmPassword"
              class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isLoading" class="flex items-center justify-center">
                <font-awesome-icon
                  :icon="['fas', 'spinner']"
                  spin
                  class="h-5 w-5 mr-2"
                  aria-hidden="true"
                />
                Updating...
              </span>
              <span v-else>Update password</span>
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
