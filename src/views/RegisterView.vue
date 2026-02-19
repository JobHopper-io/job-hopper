<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import type { AuthError } from '@supabase/supabase-js'
import { authAPI, DEFAULT_PHONE_COUNTRY, getPhoneCountryOptions, validatePhoneNumber } from '@/lib/auth'
import type { CountryCode } from 'libphonenumber-js'

const router = useRouter()

const phoneCountryOptions = getPhoneCountryOptions()
const email = ref('')
const phone = ref('')
const phoneCountry = ref<CountryCode>(DEFAULT_PHONE_COUNTRY)
const phoneCountryOpen = ref(false)
const phoneCountryDropdownRef = ref<HTMLElement | null>(null)

const selectedPhoneCountryOption = computed(
  () => phoneCountryOptions.find((o) => o.value === phoneCountry.value) ?? phoneCountryOptions[0],
)
const selectedCountryCodeDisplay = computed(() => `+${selectedPhoneCountryOption.value.callingCode}`)

onClickOutside(phoneCountryDropdownRef, () => {
  phoneCountryOpen.value = false
})
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const isLoading = ref(false)
const error = ref('')
const emailAlreadyUsed = ref(false)
const phoneAlreadyUsed = ref(false)

const validateEmail = (value: string) => {
  if (!value.trim()) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(value.trim())) {
    return 'Please enter a valid email address'
  }
  return null
}

const validatePhone = (value: string) => {
  const result = validatePhoneNumber(value, phoneCountry.value)
  return result.valid ? null : result.error ?? 'Please enter a valid phone number'
}

const validatePassword = (password: string) => {
  const minLength = 8
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  return null
}

// Only show validation errors when the user has entered something (not on mount / empty)
const emailValidationError = computed(() =>
  email.value.trim() ? validateEmail(email.value) : null,
)
const phoneValidationError = computed(() =>
  phone.value.trim() ? validatePhone(phone.value) : null,
)
const passwordValidationError = computed(() =>
  password.value ? validatePassword(password.value) : null,
)
const passwordsMatch = computed(() => password.value === confirmPassword.value)

const canProceedStep1 = computed(() => {
  return (
    email.value &&
    !emailValidationError.value &&
    !emailAlreadyUsed.value &&
    phone.value &&
    !phoneValidationError.value &&
    !phoneAlreadyUsed.value &&
    password.value &&
    !passwordValidationError.value &&
    confirmPassword.value &&
    passwordsMatch.value
  )
})

function clearEmailAlreadyUsed() {
  if (emailAlreadyUsed.value) {
    emailAlreadyUsed.value = false
    error.value = ''
  }
}

function clearPhoneAlreadyUsed() {
  if (phoneAlreadyUsed.value) {
    phoneAlreadyUsed.value = false
    error.value = ''
  }
}


const handleCreateAccount = async () => {
  if (!canProceedStep1.value) return
  try {
    isLoading.value = true
    error.value = ''
    const phoneValidation = validatePhoneNumber(phone.value, phoneCountry.value)
    if (!phoneValidation.valid || !phoneValidation.normalized) {
      error.value = phoneValidation.error ?? 'Please enter a valid phone number'
      return
    }
    const normalizedPhone = phoneValidation.normalized

    const { available, error: checkError } = await authAPI.checkPhoneAvailable(normalizedPhone)
    if (checkError) {
      error.value = 'We couldn’t check phone availability. Please try again.'
      return
    }
    if (!available) {
      phoneAlreadyUsed.value = true
      error.value =
        'This phone number is already registered. Please sign in or use a different phone number.'
      return
    }

    const redirectTo = `${window.location.origin}/onboarding`
    const { data: signUpData, error: signUpError } = await authAPI.signUp(
      email.value,
      password.value,
      '',
      '',
      normalizedPhone,
      redirectTo
    )
    if (signUpError) {
      const authErr = signUpError as AuthError & {
        details?: string
        error_description?: string
        code?: string
      }
      const status = authErr.status
      const msg = authErr.message || ''
      const details = authErr.details ?? authErr.error_description

      // Network / connectivity issues: no real HTTP status
      if (typeof status !== 'number' || status === 0) {
        error.value =
          'We couldn’t reach our servers. Please check your internet connection and try again in a moment.'
        return
      }

      // Email already registered: show friendly message and block continue until email is changed
      const isAlreadyRegistered =
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already been registered') ||
        (typeof authErr.code === 'string' && authErr.code.toLowerCase().includes('already'))
      if (isAlreadyRegistered || status === 422) {
        emailAlreadyUsed.value = true
        error.value =
          'This email is already registered. Please sign in or use a different email address.'
        return
      }

      // Other auth/validation cases (e.g. 400)
      if (status === 400) {
        error.value =
          details ||
          msg ||
          'There was a problem creating your account. Please check your details and try again.'
        return
      }

      // Fallback for everything else
      error.value =
        details ||
        msg ||
        'We couldn’t create your account right now. Please try again, or contact support if this continues.'
      return
    }
    if (!signUpData.user) {
      error.value = 'Account creation failed. Please try again.'
      return
    }
    // Supabase often returns success for duplicate email but with empty identities
    const identities = signUpData.user.identities ?? []
    if (identities.length === 0) {
      emailAlreadyUsed.value = true
      error.value =
        'This email is already registered. Please sign in or use a different email address.'
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
              @input="clearEmailAlreadyUsed"
            />
            <div v-if="emailValidationError" class="text-red-600 text-sm mt-1">
              {{ emailValidationError }}
            </div>
          </div>

          <div>
            <label for="phone" class="block text-sm font-medium text-brand-charcoal mb-2">Phone number</label>
            <div class="flex gap-2" ref="phoneCountryDropdownRef">
              <div class="relative shrink-0">
                <button
                  type="button"
                  :aria-label="`Country code: ${selectedCountryCodeDisplay}`"
                  aria-haspopup="listbox"
                  :aria-expanded="phoneCountryOpen"
                  aria-controls="phone-country-listbox"
                  id="phone-country"
                  class="input flex items-center gap-1 min-w-[4.5rem] pr-8"
                  @click="phoneCountryOpen = !phoneCountryOpen"
                >
                  <span>{{ selectedCountryCodeDisplay }}</span>
                  <svg class="absolute right-2.5 h-4 w-4 text-neutral-body pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <ul
                  v-show="phoneCountryOpen"
                  id="phone-country-listbox"
                  role="listbox"
                  aria-label="Country"
                  class="absolute left-0 top-full z-10 mt-1 max-h-60 w-56 overflow-auto rounded-[12px] border border-neutral-border bg-white py-1 shadow-lg"
                >
                  <li
                    v-for="opt in phoneCountryOptions"
                    :key="opt.value"
                    role="option"
                    :aria-selected="opt.value === phoneCountry"
                    class="cursor-pointer px-3 py-2 text-sm text-brand-charcoal hover:bg-neutral-100"
                    :class="{ 'bg-neutral-100': opt.value === phoneCountry }"
                    @click="phoneCountry = opt.value; phoneCountryOpen = false; clearPhoneAlreadyUsed()"
                  >
                    {{ opt.label }}
                  </li>
                </ul>
              </div>
              <input
                id="phone"
                v-model="phone"
                type="tel"
                required
                class="input flex-1 min-w-0"
                :placeholder="phoneCountry === 'US' ? 'e.g. (555) 123-4567' : 'e.g. 20 7946 0958'"
                @input="clearPhoneAlreadyUsed"
              />
            </div>
            <div v-if="phoneValidationError" class="text-red-600 text-sm mt-1">
              {{ phoneValidationError }}
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
