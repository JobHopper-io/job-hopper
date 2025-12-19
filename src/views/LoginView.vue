<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI, organizationAPI } from '@/lib/supabase'
import { isAppDomain, isOrganizationSubdomain, getSubdomainFromUrl, getOrganizationUrl, getBaseDomain, isLocalEnvironment } from '@/utils/domain'

const router = useRouter()

const email = ref('')
const password = ref('')
const subdomain = ref('')
const isLoading = ref(false)
const error = ref('')
const showPassword = ref(false)

const isOnAppDomain = computed(() => isAppDomain())
const isOnOrgSubdomain = computed(() => isOrganizationSubdomain())

// Computed property for domain suffix display
const domainSuffix = computed(() => {
  const baseDomain = getBaseDomain()
  const port = isLocalEnvironment() && window.location.port ? `:${window.location.port}` : ''
  return `.${baseDomain}${port}`
})

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
    console.log('User already authenticated, redirecting to dashboard')
    router.push('/dashboard')
  }
})

const handleLogin = async () => {
  try {
    isLoading.value = true
    error.value = ''

    // If on app domain, redirect to subdomain first
    if (isOnAppDomain.value && subdomain.value) {
      const subdomainUrl = `${getOrganizationUrl(subdomain.value)}/login`
      window.location.href = subdomainUrl
      return
    }

    // If on organization subdomain, validate email belongs to this organization
    if (isOnOrgSubdomain.value) {
      const subdomain = getSubdomainFromUrl()
      if (subdomain) {
        const { data: orgData, error: orgError } = await organizationAPI.getOrganizationByDomain(subdomain)

        if (orgError || !orgData || orgData.error) {
          error.value = 'Organization not found'
          return
        }

        // Check if email belongs to this organization
        const { data: userBelongsToOrg, error: userError } = await organizationAPI.checkUserBelongsToOrganization(email.value, subdomain)

        if (userError || !userBelongsToOrg) {
          error.value = 'This email is not associated with this organization'
          return
        }
      }
    }

    // Validate password format
    const passwordError = validatePassword(password.value)
    if (passwordError) {
      error.value = passwordError
      return
    }

    const { error: authError } = await authAPI.signIn(email.value, password.value)

    if (authError) {
      error.value = authError.message
      return
    }

    // Redirect based on domain
    if (isOnOrgSubdomain.value) {
      router.push('/dashboard')
    } else {
      // If on main domain, check if user's organization has a domain
      const { data: orgData, error: orgError } = await organizationAPI.getCurrentOrganization()
      if (!orgError && orgData && orgData.domain) {
        const organizationUrl = `${getOrganizationUrl(orgData.domain)}/dashboard`
        window.location.href = organizationUrl
        return
      }
      router.push('/dashboard')
    }
  } catch (err) {
    error.value = 'An unexpected error occurred'
    console.error('Login error:', err)
  } finally {
    isLoading.value = false
  }
}

const goToRegister = () => {
  if (isOnAppDomain.value) {
    router.push('/register')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {{ isOnAppDomain ? 'Sign in to your organization' : 'Sign in to your account' }}
        </h2>
        <p v-if="isOnAppDomain" class="mt-2 text-center text-sm text-gray-600">
          Enter your organization subdomain to access your account
        </p>
        <p v-else-if="isOnOrgSubdomain" class="mt-2 text-center text-sm text-gray-600">
          Welcome to your organization portal
        </p>
        <p v-else class="mt-2 text-center text-sm text-gray-600">
          Or
          <button @click="goToRegister" class="font-medium text-blue-600 hover:text-blue-500">
            create a new account
          </button>
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <!-- Subdomain input for app domain -->
        <div v-if="isOnAppDomain" class="rounded-md shadow-sm">
          <div>
            <label for="subdomain" class="block text-sm font-medium text-gray-700 mb-2">Organization Subdomain</label>
            <div class="flex">
              <input
                id="subdomain"
                v-model="subdomain"
                name="subdomain"
                type="text"
                required
                class="flex-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="your-organization"
              />
              <span class="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-r-md">
                {{ domainSuffix }}
              </span>
            </div>
          </div>
        </div>

        <!-- Email and password inputs for organization subdomain -->
        <div v-else-if="isOnOrgSubdomain" class="rounded-md shadow-sm -space-y-px">
          <div>
            <label for="email" class="sr-only">Email address</label>
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
            />
          </div>
          <div>
            <label for="password" class="sr-only">Password</label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                class="appearance-none rounded-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
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
        </div>

        <div v-if="error" class="text-red-600 text-sm text-center">
          {{ error }}
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading || (isOnAppDomain && !subdomain) || (isOnOrgSubdomain && (!email || !password))"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading" class="absolute left-0 inset-y-0 flex items-center pl-3">
              <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </span>
            {{ isLoading ? (isOnAppDomain ? 'Redirecting...' : 'Signing in...') : (isOnAppDomain ? 'Go to Organization' : 'Sign in') }}
          </button>
        </div>

        <!-- Register link only for app domain -->
        <div v-if="isOnAppDomain" class="text-center">
          <p class="text-sm text-gray-600">
            Don't have an organization yet?
            <button @click="goToRegister" class="font-medium text-blue-600 hover:text-blue-500">
              Create one here
            </button>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>

