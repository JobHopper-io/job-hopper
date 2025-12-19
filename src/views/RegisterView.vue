<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/lib/supabase'
import { isAppDomain, isOrganizationSubdomain, getOrganizationUrl, isLocalEnvironment } from '@/utils/domain'

const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const firstName = ref('')
const lastName = ref('')
const phoneNumber = ref('')
const organizationName = ref('')
const organizationDomain = ref('')
const isLoading = ref(false)
const error = ref('')
const isSignupSuccess = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const isOnAppDomain = computed(() => isAppDomain())
const isOnOrgSubdomain = computed(() => isOrganizationSubdomain())

// Password validation function
const validatePassword = (password: string) => {
  const minLength = 8
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  return null
}

// Phone number formatting function
const formatPhoneNumber = (event: Event) => {
  const target = event.target as HTMLInputElement
  let value = target.value.replace(/\D/g, '') // Remove all non-digits

  if (value.length >= 6) {
    value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`
  } else if (value.length >= 3) {
    value = `(${value.slice(0, 3)}) ${value.slice(3)}`
  }

  phoneNumber.value = value
}

// Validate phone number has at least 10 digits
const isPhoneNumberValid = computed(() => {
  const digits = phoneNumber.value.replace(/\D/g, '')
  return digits.length === 10
})

// Redirect if not on app domain
onMounted(() => {
  if (isOnOrgSubdomain.value) {
    router.push('/login')
  }
})

const handleRegister = async () => {
  try {
    isLoading.value = true
    error.value = ''

    if (!isOnAppDomain.value) {
      error.value = 'Registration is only available on the main app domain'
      return
    }

    if (password.value !== confirmPassword.value) {
      error.value = 'Passwords do not match'
      return
    }

    const passwordError = validatePassword(password.value)
    if (passwordError) {
      error.value = passwordError
      return
    }

    if (!organizationDomain.value) {
      error.value = 'Organization domain is required'
      return
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9-]+$/
    if (!domainRegex.test(organizationDomain.value)) {
      error.value = 'Organization domain can only contain lowercase letters, numbers, and hyphens'
      return
    }

    // Validate phone number
    if (!isPhoneNumberValid.value) {
      error.value = 'Please enter a valid 10-digit phone number'
      return
    }

    const redirectUrl = `${getOrganizationUrl(organizationDomain.value)}/dashboard`

    const { data: signUpData, error: authError } = await authAPI.signUp(
      email.value,
      password.value,
      firstName.value,
      lastName.value,
      phoneNumber.value,
      organizationName.value,
      organizationDomain.value,
      undefined,
      redirectUrl
    )

    if (authError) {
      error.value = authError.message
    } else {
      // Show success message
      isSignupSuccess.value = true
    }
  } catch (err) {
    error.value = 'An unexpected error occurred'
    console.error('Register error:', err)
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}

const goToLoginWithSubdomain = () => {
  const subdomainUrl = getOrganizationUrl(organizationDomain.value) + '/login'
  window.location.href = subdomainUrl
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Success Message -->
      <div v-if="isSignupSuccess" class="text-center">
        <div class="mx-auto h-20 w-20 flex items-center justify-center">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Check Your Email
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          We've sent a confirmation email to <strong>{{ email }}</strong>.
          Please click the link in the email to complete your registration.
        </p>
        <div class="mt-6">
          <button
            @click="goToLoginWithSubdomain"
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Go to Login Page
          </button>
        </div>
      </div>

      <!-- Registration Form -->
      <div v-else>
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create Your Organization
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600">
            Get started with your account
          </p>
        </div>

        <form class="mt-8 space-y-6" @submit.prevent="handleRegister">
          <div class="space-y-4">
            <!-- Organization Details -->
            <div class="bg-blue-50 p-4 rounded-md">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Organization Details</h3>
              <div class="space-y-4">
                <div>
                  <label for="organizationName" class="block text-sm font-medium text-gray-700">Organization Name</label>
                  <input
                    id="organizationName"
                    v-model="organizationName"
                    name="organizationName"
                    type="text"
                    required
                    class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="My Organization"
                  />
                </div>
                <div>
                  <label for="organizationDomain" class="block text-sm font-medium text-gray-700">Organization URL</label>
                  <div class="flex">
                    <input
                      id="organizationDomain"
                      v-model="organizationDomain"
                      name="organizationDomain"
                      type="text"
                      required
                      class="flex-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="my-organization"
                    />
                    <span class="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-r-md">
                      .localhost
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-gray-500">This will be your organization's unique URL</p>
                </div>
              </div>
            </div>

            <!-- Personal Details -->
            <div class="bg-gray-50 p-4 rounded-md">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Your Details</h3>
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="firstName" class="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      id="firstName"
                      v-model="firstName"
                      name="firstName"
                      type="text"
                      required
                      class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label for="lastName" class="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      id="lastName"
                      v-model="lastName"
                      name="lastName"
                      type="text"
                      required
                      class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div>
                  <label for="phoneNumber" class="block text-sm font-medium text-gray-700">Phone Number</label>
                  <input
                    id="phoneNumber"
                    v-model="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    required
                    maxlength="14"
                    @input="formatPhoneNumber"
                    class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>

            <!-- Account Credentials -->
            <div class="bg-gray-50 p-4 rounded-md">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Account Credentials</h3>
              <div class="space-y-4">
                <div>
                  <label for="email" class="block text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    id="email"
                    v-model="email"
                    name="email"
                    type="email"
                    autocomplete="email"
                    required
                    class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Email address"
                  />
                </div>

                <div>
                  <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
                  <div class="relative">
                    <input
                      id="password"
                      v-model="password"
                      name="password"
                      :type="showPassword ? 'text' : 'password'"
                      autocomplete="new-password"
                      required
                      class="mt-1 appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Password (min 8 characters)"
                    />
                    <button
                      type="button"
                      @click="showPassword = !showPassword"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <svg v-if="showPassword" class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                      </svg>
                      <svg v-else class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label for="confirmPassword" class="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <div class="relative">
                    <input
                      id="confirmPassword"
                      v-model="confirmPassword"
                      name="confirmPassword"
                      :type="showConfirmPassword ? 'text' : 'password'"
                      autocomplete="new-password"
                      required
                      class="mt-1 appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Confirm password"
                    />
                    <button
                      type="button"
                      @click="showConfirmPassword = !showConfirmPassword"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <svg v-if="showConfirmPassword" class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                      </svg>
                      <svg v-else class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="error" class="text-red-600 text-sm text-center">
            {{ error }}
          </div>

          <div>
            <button
              type="submit"
              :disabled="isLoading || !isOnAppDomain"
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isLoading" class="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
              {{ isLoading ? 'Creating organization...' : 'Create Organization' }}
            </button>
          </div>

          <!-- Login link -->
          <div class="text-center">
            <p class="text-sm text-gray-600">
              Already have an organization?
              <button @click="goToLogin" class="font-medium text-blue-600 hover:text-blue-500">
                Sign in here
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

