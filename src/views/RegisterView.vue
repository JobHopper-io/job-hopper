<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI, userAPI } from '@/lib/supabase'

const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const isLoading = ref(false)
const error = ref('')

const validateEmail = (value: string) => {
  if (!value.trim()) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(value.trim())) {
    return 'Please enter a valid email address'
  }
  return null
}

const validatePassword = (password: string) => {
  const minLength = 8
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  return null
}

const emailValidationError = computed(() => validateEmail(email.value))
const passwordValidationError = computed(() => validatePassword(password.value))
const passwordsMatch = computed(() => password.value === confirmPassword.value)

const canProceedStep1 = computed(() => {
  return (
    email.value &&
    !emailValidationError.value &&
    password.value &&
    !passwordValidationError.value &&
    confirmPassword.value &&
    passwordsMatch.value
  )
})

onMounted(async () => {
  const { user } = await authAPI.getCurrentUser()
  if (user) {
    const { data: profile } = await userAPI.getCurrentUserProfile()
    if (profile?.onboarding_completed) {
      router.push('/dashboard')
    } else {
      router.push('/onboarding')
    }
  }
})

const handleCreateAccount = async () => {
  if (!canProceedStep1.value) return
  try {
    isLoading.value = true
    error.value = ''
    const redirectTo = `${window.location.origin}/onboarding`
    const { data: signUpData, error: signUpError } = await authAPI.signUp(
      email.value,
      password.value,
      '',
      '',
      undefined,
      redirectTo
    )
    if (signUpError) {
      const msg = signUpError.message
      const details = (signUpError as { details?: string; code?: string }).details ?? (signUpError as { error_description?: string }).error_description
      error.value = details ? `${msg} (${details})` : msg
      return
    }
    if (!signUpData.user) {
      error.value = 'Account creation failed. Please try again.'
      return
    }
    if (!signUpData.session && signUpData.user) {
      router.push('/confirm-email')
    } else {
      router.push('/onboarding')
    }
  } catch (err) {
    error.value = (err as Error).message || 'Something went wrong.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <div class="card p-8">
        <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
          Create your Job-Hopper account
        </h2>
        <p class="text-neutral-body mb-6">
          You'll be done in under a minute.
        </p>

        <div class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-brand-charcoal mb-2">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              class="input"
              placeholder="your.email@example.com"
            />
            <div v-if="emailValidationError" class="text-red-600 text-sm mt-1">
              {{ emailValidationError }}
            </div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-brand-charcoal mb-2">Password</label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                class="input pr-10"
                placeholder="Password (min 8 characters)"
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
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-brand-charcoal mb-2">Confirm password</label>
            <div class="relative">
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                required
                class="input pr-10"
                placeholder="Confirm password"
              />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <svg v-if="showConfirmPassword" class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                </svg>
                <svg v-else class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </button>
            </div>
          </div>

          <div v-if="passwordValidationError" class="text-red-600 text-sm">
            {{ passwordValidationError }}
          </div>
          <div v-else-if="password && confirmPassword && password !== confirmPassword" class="text-red-600 text-sm">
            Passwords do not match
          </div>
        </div>

        <div v-if="error" class="mt-6 p-4 bg-red-50 border border-red-200 rounded-[12px]">
          <p class="text-red-800 text-sm">{{ error }}</p>
        </div>

        <div class="mt-8">
          <button
            @click="handleCreateAccount"
            type="button"
            :disabled="!canProceedStep1 || isLoading"
            class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Creating account...</span>
            <span v-else>Continue</span>
          </button>
        </div>

        <p class="mt-6 text-center text-sm text-neutral-body">
          Already have an account?
          <router-link to="/login" class="font-medium text-brand-primary hover:underline">Sign in</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
