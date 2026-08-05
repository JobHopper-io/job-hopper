<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { AuthError } from '@supabase/supabase-js'
import { authAPI } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import AuthSplitPanel from '@/components/auth/AuthSplitPanel.vue'
import FormField from '@/components/auth/FormField.vue'
import PasswordField from '@/components/auth/PasswordField.vue'

const router = useRouter()
const route = useRoute()

// Only honor a redirect back to a same-app path (e.g. an emailed deep link like
// /reveal-requests) - reject anything that isn't a plain internal path to avoid an open redirect.
function safeRedirectTarget(): string | null {
  const redirect = route.query.redirect
  const target = Array.isArray(redirect) ? redirect[0] : redirect
  if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')) {
    return target
  }
  return null
}

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

const handleLogin = async () => {
  try {
    isLoading.value = true
    error.value = ''

    const { error: authError } = await authAPI.signIn(email.value, password.value)

    if (authError) {
      const authErr = authError as AuthError & { code?: string }
      const status = authErr.status
      const code = authErr.code
      const message = authErr.message || ''

      // Unconfirmed email: prefer structured code over message text
      if (code === 'email_not_confirmed' || message.toLowerCase().includes('email not confirmed')) {
        router.push('/confirm-email')
        return
      }

      // Network / connectivity issues: Supabase never got a valid HTTP response
      if (typeof status !== 'number' || status === 0) {
        error.value =
          'We couldn’t reach our servers. Please check your internet connection and try again in a moment.'
        return
      }

      // Invalid credentials / bad input
      if (status === 400 || status === 401) {
        error.value = 'The email or password you entered is incorrect.'
        return
      }

      // Fallback for other cases
      error.value = message || 'Unable to sign in right now. Please try again, or contact support if this continues.'
      return
    }

    // Immediately redirect based on onboarding status to avoid dashboard flash. Incomplete
    // onboarding always wins - the router guard would bounce a redirect target back to
    // /onboarding anyway.
    const { data: profile } = await profileAPI.getCurrentUserProfile()
    if (!profile?.onboarding_completed) {
      router.push('/onboarding')
      return
    }
    router.push(safeRedirectTarget() ?? '/dashboard')
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
  <AuthSplitPanel
    headline="Your next role is out there. Let's find it."
    sub="Visa-sponsored positions matched to your status — updated every day."
    :stats="[
      { value: 'Daily Matches', label: 'AI-curated to your role & pay' },
      { value: 'Sponsorship Signal', label: 'See who\'s likely to sponsor' },
      { value: 'Application Tracker', label: 'Every application, one place' },
    ]"
    hide-login-link
  >
    <form class="flex flex-col gap-7" novalidate @submit.prevent="handleLogin">
      <div>
        <h2 class="text-[26px] font-heading font-bold text-brand-charcoal">Welcome back</h2>
        <p class="mt-1 text-sm text-neutral-body">Sign in to continue your search</p>
      </div>

      <div class="flex flex-col gap-4">
        <FormField
          id="email"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          placeholder="you@company.com"
        />
        <div class="flex flex-col gap-1">
          <PasswordField
            id="password"
            v-model="password"
            label="Password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
          />
          <div class="mt-1 flex justify-end">
            <router-link to="/forgot-password" class="text-[13px] font-bold text-brand-primary hover:underline">
              Forgot password?
            </router-link>
          </div>
        </div>
      </div>

      <div v-if="error" class="text-center text-sm text-red-600">
        {{ error }}
      </div>

      <div class="flex flex-col gap-4">
        <button
          type="submit"
          :disabled="isLoading || !email || !password"
          class="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <font-awesome-icon v-if="isLoading" :icon="['fas', 'spinner']" spin aria-hidden="true" />
          <span>{{ isLoading ? 'Signing in…' : 'Sign in' }}</span>
          <font-awesome-icon v-if="!isLoading" :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
        </button>
        <p class="text-center text-[13px] text-neutral-body">
          Don't have an account?
          <button type="button" class="font-bold text-brand-primary hover:underline" @click="goToRegister">
            Sign up free
          </button>
        </p>
      </div>
    </form>
  </AuthSplitPanel>
</template>
