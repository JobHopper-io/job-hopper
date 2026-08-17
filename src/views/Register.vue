<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import type { AuthError } from '@supabase/supabase-js'
import { authAPI, DEFAULT_PHONE_COUNTRY, getPhoneCountryOptions, validatePhoneNumber } from '@/lib/auth'
import type { CountryCode } from 'libphonenumber-js'
import AuthSplitPanel from '@/components/auth/AuthSplitPanel.vue'
import FormField from '@/components/auth/FormField.vue'
import PasswordField from '@/components/auth/PasswordField.vue'

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

const isLoading = ref(false)
const error = ref('')
const emailAlreadyUsed = ref(false)
const phoneAlreadyUsed = ref(false)

const emailConsent = ref(false)

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
const confirmPasswordError = computed(() =>
  confirmPassword.value && confirmPassword.value !== password.value ? 'Passwords do not match' : null,
)
const passwordsMatch = computed(() => password.value === confirmPassword.value)

// Purely visual strength feedback — does not affect validation/submit gating.
const passwordStrength = computed(() => {
  const p = password.value
  if (!p) return null
  let s = 0
  if (p.length >= 8) s++
  if (/[A-Z]/.test(p)) s++
  if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  const score = s <= 1 ? 1 : s <= 2 ? 2 : 3
  const meta = [
    { label: 'Weak', className: 'bg-red-600 text-red-600' },
    { label: 'Fair', className: 'bg-amber-600 text-amber-600' },
    { label: 'Strong', className: 'bg-green-600 text-green-600' },
  ][score - 1]
  return { score, ...meta }
})

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
    passwordsMatch.value &&
    emailConsent.value
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

    const redirectTo = `${window.location.origin}/email-verified`
    let landingPath: string | undefined
    let utmSource: string | undefined
    let referrerHost: string | undefined
    let utmCampaign: string | undefined
    let utmMedium: string | undefined
    try {
      landingPath = sessionStorage.getItem('landing_path') ?? undefined
      utmSource = sessionStorage.getItem('utm_source') ?? undefined
      referrerHost = sessionStorage.getItem('referrer_host') ?? undefined
      utmCampaign = sessionStorage.getItem('utm_campaign') ?? undefined
      utmMedium = sessionStorage.getItem('utm_medium') ?? undefined
    } catch {
      landingPath = undefined
      utmSource = undefined
      referrerHost = undefined
      utmCampaign = undefined
      utmMedium = undefined
    }
    const { data: signUpData, error: signUpError } = await authAPI.signUp(
      email.value,
      password.value,
      '',
      '',
      normalizedPhone,
      redirectTo,
      landingPath,
      utmSource,
      referrerHost,
      utmCampaign,
      utmMedium,
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
  <AuthSplitPanel
    headline="Join the search. Get matched faster."
    sub="Apply smarter, see real sponsorship data, and track your pipeline."
    :stats="[
      { value: 'Mock Interviews', label: 'AI-powered practice, on demand' },
      { value: 'Skill Gap Finder', label: 'Know exactly what to learn' },
      { value: 'Hiring Contacts', label: 'Reach recruiters directly' },
    ]"
    hide-register-link
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="handleCreateAccount">
      <div>
        <h2 class="text-2xl font-heading font-bold text-brand-charcoal">Create your account</h2>
        <p class="mt-1 text-sm text-neutral-body">Start finding visa-friendly roles today</p>
      </div>

      <!-- Contact -->
      <div class="flex flex-col gap-3">
        <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-body/70">Contact</p>

        <FormField
          id="email"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          placeholder="you@company.com"
          :error="emailValidationError"
          @update:model-value="clearEmailAlreadyUsed"
        />

        <div class="flex flex-col gap-1.5">
          <label for="phone" class="text-[11px] font-bold uppercase tracking-wider text-neutral-body">Phone</label>
          <div ref="phoneCountryDropdownRef" class="flex gap-2">
            <div class="relative shrink-0">
              <button
                type="button"
                :aria-label="`Country code: ${selectedCountryCodeDisplay}`"
                aria-haspopup="listbox"
                :aria-expanded="phoneCountryOpen"
                aria-controls="phone-country-listbox"
                id="phone-country"
                class="flex h-12 w-20 items-center gap-1 rounded-[12px] border border-neutral-border bg-neutral-bg pl-3 pr-6 text-sm"
                @click="phoneCountryOpen = !phoneCountryOpen"
              >
                <span>{{ selectedCountryCodeDisplay }}</span>
                <font-awesome-icon
                  :icon="['fas', 'chevron-down']"
                  class="pointer-events-none absolute right-2 text-[10px] text-neutral-body"
                  aria-hidden="true"
                />
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
              name="tel-national"
              type="tel"
              autocomplete="tel-national"
              required
              class="h-12 min-w-0 flex-1 rounded-[12px] border border-neutral-border bg-neutral-bg px-4 text-sm outline-none focus:border-brand-primary focus:bg-white focus:ring-4 focus:ring-brand-primary/10"
              :placeholder="phoneCountry === 'US' ? 'e.g. (555) 123-4567' : 'e.g. 20 7946 0958'"
              @input="clearPhoneAlreadyUsed"
            />
          </div>
          <p v-if="phoneValidationError" class="text-xs text-red-600">{{ phoneValidationError }}</p>
        </div>
      </div>

      <!-- Security -->
      <div class="flex flex-col gap-3">
        <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-body/70">Security</p>

        <div>
          <PasswordField
            id="password"
            v-model="password"
            label="Password"
            autocomplete="new-password"
            required
            placeholder="Min. 8 characters"
            :error="passwordValidationError"
          />
          <div v-if="passwordStrength" class="mt-1.5 flex flex-col gap-1">
            <div class="flex gap-1">
              <div v-for="i in 3" :key="i" class="h-1 flex-1 overflow-hidden rounded-full bg-neutral-border">
                <div
                  v-if="passwordStrength.score >= i"
                  class="h-full rounded-full"
                  :class="passwordStrength.className.split(' ')[0]"
                />
              </div>
            </div>
            <p class="text-[11px] font-semibold" :class="passwordStrength.className.split(' ')[1]">
              {{ passwordStrength.label }}
            </p>
          </div>
        </div>

        <PasswordField
          id="confirmPassword"
          v-model="confirmPassword"
          label="Confirm password"
          autocomplete="new-password"
          required
          placeholder="Repeat your password"
          :error="confirmPasswordError"
        />
      </div>

      <label class="flex items-start gap-2.5" for="email-consent">
        <input
          id="email-consent"
          v-model="emailConsent"
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-border accent-brand-primary"
        />
        <span class="text-[13px] leading-snug text-neutral-body">
          I agree to receive account and marketing emails from Job-Hopper. Unsubscribe anytime.
        </span>
      </label>

      <div v-if="error" class="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {{ error }}
      </div>

      <div class="flex flex-col gap-3">
        <button
          type="submit"
          :disabled="!canProceedStep1 || isLoading"
          class="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <font-awesome-icon v-if="isLoading" :icon="['fas', 'spinner']" spin aria-hidden="true" />
          <span>{{ isLoading ? 'Creating account…' : 'Create account' }}</span>
          <font-awesome-icon v-if="!isLoading" :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
        </button>
        <p class="text-center text-[13px] text-neutral-body">
          Already have an account?
          <router-link to="/login" class="font-bold text-brand-primary hover:underline">Sign in</router-link>
        </p>
      </div>
    </form>
  </AuthSplitPanel>
</template>
