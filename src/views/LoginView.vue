<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI, userAPI } from '@/lib/supabase'

const router = useRouter()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')
const showPassword = ref(false)

// Password validation function
const validatePassword = (password: string) => {
  const minLength = 8
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  return null
}

// Check if user is already authenticated on mount
onMounted(async () => {
  const { user } = await authAPI.getCurrentUser()
  if (user) {
    const { data: profile } = await userAPI.getCurrentUserProfile()
    router.push(profile?.onboarding_completed ? '/dashboard' : '/onboarding')
  }
})

const handleLogin = async () => {
  try {
    isLoading.value = true
    error.value = ''

    // Validate password format
    const passwordError = validatePassword(password.value)
    if (passwordError) {
      error.value = passwordError
      return
    }

    const { error: authError } = await authAPI.signIn(email.value, password.value)

    if (authError) {
      if (authError.message?.toLowerCase().includes('email not confirmed')) {
        router.push('/confirm-email')
        return
      }
      error.value = authError.message
      return
    }

    const { data: profile } = await userAPI.getCurrentUserProfile()
    router.push(profile?.onboarding_completed ? '/dashboard' : '/onboarding')
  } catch (err) {
    error.value = 'An unexpected error occurred'
    console.error('Login error:', err)
  } finally {
    isLoading.value = false
  }
}

const goToRegister = () => {
  router.push('/register')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="text-center text-3xl font-heading font-bold text-brand-charcoal">
          Sign in to your account
        </h2>
        <p class="mt-2 text-center text-sm text-neutral-body">
          Or
          <button @click="goToRegister" class="font-medium text-brand-primary hover:underline">
            create a new account
          </button>
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div class="space-y-4">
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
          <div>
            <label for="password" class="block text-sm font-medium text-brand-charcoal mb-2">Password</label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                class="input pr-10"
                placeholder="Password"
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
        </div>

        <div v-if="error" class="text-red-600 text-sm text-center">
          {{ error }}
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading || !email || !password"
            class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading" class="flex items-center justify-center">
              <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            </span>
            <span v-else>Sign in</span>
          </button>
        </div>

        <div class="text-center">
          <p class="text-sm text-neutral-body">
            Don't have an account yet?
            <button @click="goToRegister" class="font-medium text-brand-primary hover:underline">
              Create one here
            </button>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>
