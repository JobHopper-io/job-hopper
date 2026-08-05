<script setup lang="ts">
import { ref, computed } from 'vue'
import type { AuthError } from '@supabase/supabase-js'
import { employerAPI } from '@/lib/employer'
import AuthSplitPanel from '@/components/auth/AuthSplitPanel.vue'
import FormField from '@/components/auth/FormField.vue'
import PasswordField from '@/components/auth/PasswordField.vue'

const companyName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const isLoading = ref(false)
const error = ref('')
const emailAlreadyUsed = ref(false)
const submitted = ref(false)

const validateEmail = (value: string) => {
  if (!value.trim()) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(value.trim()) ? null : 'Please enter a valid email address'
}

const emailValidationError = computed(() => (email.value.trim() ? validateEmail(email.value) : null))
const passwordValidationError = computed(() =>
  password.value && password.value.length < 8 ? 'Password must be at least 8 characters long' : null,
)
const confirmPasswordError = computed(() =>
  confirmPassword.value && confirmPassword.value !== password.value ? 'Passwords do not match' : null,
)

const canSubmit = computed(() => {
  return (
    companyName.value.trim() &&
    email.value &&
    !emailValidationError.value &&
    !emailAlreadyUsed.value &&
    password.value &&
    !passwordValidationError.value &&
    confirmPassword.value &&
    !confirmPasswordError.value
  )
})

function clearEmailAlreadyUsed() {
  if (emailAlreadyUsed.value) {
    emailAlreadyUsed.value = false
    error.value = ''
  }
}

const handleCreateAccount = async () => {
  if (!canSubmit.value) return
  try {
    isLoading.value = true
    error.value = ''

    const { data, error: signUpError } = await employerAPI.signUp(
      email.value,
      password.value,
      companyName.value.trim(),
    )
    if (signUpError) {
      const authErr = signUpError as AuthError
      const msg = authErr.message || ''
      if (msg.toLowerCase().includes('already registered') || authErr.status === 422) {
        emailAlreadyUsed.value = true
        error.value = 'This email is already registered. Please sign in or use a different email address.'
        return
      }
      error.value = msg || 'We couldn’t create your account right now. Please try again.'
      return
    }
    const identities = data?.user?.identities ?? []
    if (identities.length === 0) {
      emailAlreadyUsed.value = true
      error.value = 'This email is already registered. Please sign in or use a different email address.'
      return
    }
    submitted.value = true
  } catch (err) {
    error.value = (err as Error).message || 'Something went wrong.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <AuthSplitPanel
    headline="Get your company in front of the right candidates."
    sub="Verify your company, search anonymized profiles, and request intros — no cold résumés, no forced reveals."
    :stats="[
      { value: 'Quick Verification', label: 'Apollo-backed check, most approved instantly' },
      { value: 'Anonymized Search', label: 'Browse candidates without exposing anyone' },
      { value: 'Consent-Based Reveal', label: 'Contact info shared only after they approve' },
    ]"
    hide-login-link
    hide-register-link
  >
    <div v-if="submitted" class="text-center">
      <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10">
        <font-awesome-icon :icon="['fas', 'envelope']" class="text-2xl text-brand-primary" aria-hidden="true" />
      </div>
      <h1 class="text-2xl font-heading font-bold text-brand-charcoal">Check your email</h1>
      <p class="mt-2 text-neutral-body">
        We sent a confirmation link to {{ email }}. Confirm your email to activate your employer account.
      </p>
    </div>

    <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="handleCreateAccount">
      <div>
        <h2 class="text-2xl font-heading font-bold text-brand-charcoal">Create an employer account</h2>
        <p class="mt-1 text-sm text-neutral-body">Find candidates on Job Hopper.</p>
      </div>

      <FormField
        id="company-name"
        v-model="companyName"
        label="Company name"
        required
        placeholder="Acme Inc."
      />

      <FormField
        id="work-email"
        v-model="email"
        label="Work email"
        type="email"
        autocomplete="email"
        required
        placeholder="you@company.com"
        :error="emailValidationError"
        @update:model-value="clearEmailAlreadyUsed"
      />

      <PasswordField
        id="password"
        v-model="password"
        label="Password"
        autocomplete="new-password"
        required
        placeholder="Min. 8 characters"
        :error="passwordValidationError"
      />

      <PasswordField
        id="confirmPassword"
        v-model="confirmPassword"
        label="Confirm password"
        autocomplete="new-password"
        required
        placeholder="Repeat your password"
        :error="confirmPasswordError"
      />

      <div v-if="error" class="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {{ error }}
      </div>

      <div class="flex flex-col gap-3">
        <button
          type="submit"
          :disabled="!canSubmit || isLoading"
          class="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <font-awesome-icon v-if="isLoading" :icon="['fas', 'spinner']" spin aria-hidden="true" />
          <span>{{ isLoading ? 'Creating account…' : 'Create account' }}</span>
          <font-awesome-icon v-if="!isLoading" :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
        </button>
        <p class="text-center text-[13px] text-neutral-body">
          Already have an employer account?
          <router-link to="/employer/login" class="font-bold text-brand-primary hover:underline">Sign in</router-link>
        </p>
      </div>
    </form>
  </AuthSplitPanel>
</template>
