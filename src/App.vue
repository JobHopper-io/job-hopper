<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { authAPI, onAuthStateChange } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import { useUserStore } from '@/stores/user'
import jobHopperFullLogo from '@/assets/job-hopper-logo.png'
import jobHopperWordsLogo from '@/assets/job-hopper-words.png'
import jobHopperRabbitLogo from '@/assets/job-hopper-rabbit.png'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// The public landing page (`/`) ships its own bespoke fixed nav + dark footer that
// match the redesign, so suppress the shared app chrome there. Authenticated users are
// redirected away from `/` by the router guard, so this only ever affects the marketing page.
const isLandingPage = computed(() => route.path === '/')

const isAuthenticated = ref(false)
const mobileMenuOpen = ref(false)
const isAdmin = ref(false)
const isSuperAdmin = ref(false)

const isOnboarded = computed(() => !!userStore.profile?.onboarding_completed)
const canAccessAdmin = computed(() => isAdmin.value || isSuperAdmin.value)

const loadAdminRoles = async () => {
  try {
    const [admin, superAdmin] = await Promise.all([
      profileAPI.hasRole('admin'),
      profileAPI.hasRole('super_admin'),
    ])
    isAdmin.value = admin
    isSuperAdmin.value = superAdmin
  } catch (error) {
    console.error('Error loading admin roles:', error)
    isAdmin.value = false
    isSuperAdmin.value = false
  }
}

// Load profile + subscription once when user becomes authenticated
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    void Promise.all([
      userStore.refreshProfile(),
      userStore.refreshSubscription(),
      loadAdminRoles(),
    ])
  } else {
    userStore.clear()
    isAdmin.value = false
    isSuperAdmin.value = false
  }
})

// Listen to auth state changes to update isAuthenticated reactively
// Use a distinct name to avoid confusion with domain "Subscription" model
const {
  data: { subscription: authListener },
} = onAuthStateChange(async (event, session) => {
  isAuthenticated.value = !!session?.user

  // A recovery session must always land on the reset form, regardless of which URL the
  // email link resolved to. Fires once Supabase consumes the recovery token.
  if (event === 'PASSWORD_RECOVERY' && router.currentRoute.value.path !== '/reset-password') {
    void router.push('/reset-password')
  }
})

// Cleanup auth listener on unmount
onUnmounted(() => {
  authListener.unsubscribe()
})

onMounted(async () => {
  try {
    const { user } = await authAPI.getCurrentUser()
    isAuthenticated.value = !!user
    // watch(isAuthenticated) above handles loadUserData() / clear() when this changes

    // Strip auth tokens from URL after Supabase has consumed them (e.g. after email confirmation).
    // Exception: leave recovery tokens intact so the reset-password flow can consume them; that
    // flow clears the hash by navigating to /dashboard on success.
    const hash = window.location.hash
    if (
      hash &&
      !hash.includes('type=recovery') &&
      (hash.includes('access_token=') || hash.includes('refresh_token='))
    ) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch (error) {
    console.error('Error checking authentication:', error)
  }
})

const handleSignOut = async () => {
  try {
    const { error } = await authAPI.signOut()
    if (error) throw error
    userStore.clear()
    isAdmin.value = false
    isSuperAdmin.value = false
    router.push('/')
  } catch (error) {
    console.error('Error signing out:', error)
  }
}

const handleSignOutAndCloseMenu = async () => {
  await handleSignOut()
  mobileMenuOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg">
      <!-- Navigation Header -->
      <nav v-if="!isLandingPage" class="bg-white/95 backdrop-blur-md border-b border-neutral-border sticky top-0 z-50">
        <div class="max-w-6xl mx-auto px-5">
          <div class="flex justify-between items-center h-16">
            <!-- Logo -->
            <div class="flex items-center">
              <router-link
                :to="isAuthenticated ? (isOnboarded ? '/dashboard' : '/onboarding') : '/'"
                class="flex items-center space-x-2"
              >
                <img
                  :src="jobHopperFullLogo"
                  alt="Job-Hopper"
                  class="h-8 w-auto"
                >
              </router-link>
            </div>

            <!-- Desktop Navigation (centered links, matching the landing nav) -->
            <div class="hidden md:flex items-center gap-6">
              <template v-if="!isAuthenticated">
                <router-link
                  to="/how-it-works"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  How It Works
                </router-link>
                <router-link
                  to="/pricing"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Pricing
                </router-link>
                <router-link
                  to="/install-app"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Get the app
                </router-link>
                <router-link
                  to="/faq"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  FAQ
                </router-link>
              </template>
              <template v-else-if="isOnboarded">
                <router-link
                  to="/dashboard"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Dashboard
                </router-link>
                <router-link
                  to="/profile"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Profile
                </router-link>
                <router-link
                  to="/billing"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Billing
                </router-link>
                <router-link
                  v-if="canAccessAdmin"
                  to="/admin/dashboard"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Admin
                </router-link>
              </template>
            </div>

            <!-- Desktop actions (right, matching the landing nav) -->
            <div class="hidden md:flex items-center gap-3">
              <template v-if="!isAuthenticated">
                <router-link
                  to="/login"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Login
                </router-link>
                <router-link to="/register" class="btn-primary text-sm">
                  Get Started
                </router-link>
              </template>
              <template v-else>
                <button
                  @click="handleSignOut"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Sign Out
                </button>
              </template>
            </div>

            <!-- Mobile Menu Button -->
            <button
              @click="mobileMenuOpen = !mobileMenuOpen"
              class="md:hidden p-2 rounded-md text-neutral-body hover:text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <svg v-if="!mobileMenuOpen" class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
              <svg v-else class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Mobile Menu -->
          <div v-if="mobileMenuOpen" class="md:hidden py-4 border-t border-neutral-border">
            <div class="flex flex-col space-y-2">
              <template v-if="!isAuthenticated">
                <router-link
                  to="/how-it-works"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  How It Works
                </router-link>
                <router-link
                  to="/pricing"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Pricing
                </router-link>
                <router-link
                  to="/install-app"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Get the app
                </router-link>
                <router-link
                  to="/faq"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  FAQ
                </router-link>
                <router-link
                  to="/login"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Login
                </router-link>
                <router-link
                  to="/register"
                  class="btn-primary text-sm text-center"
                  @click="mobileMenuOpen = false"
                >
                  Get Started
                </router-link>
              </template>
              <template v-else-if="isOnboarded">
                <router-link
                  to="/dashboard"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Dashboard
                </router-link>
                <router-link
                  to="/profile"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Profile
                </router-link>
                <router-link
                  to="/billing"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Billing
                </router-link>
                <router-link
                  v-if="canAccessAdmin"
                  to="/admin/dashboard"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Admin
                </router-link>
                <button
                  @click="handleSignOutAndCloseMenu"
                  class="px-3 py-2 text-left text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                >
                  Sign Out
                </button>
              </template>
              <template v-else>
                <button
                  @click="handleSignOutAndCloseMenu"
                  class="px-3 py-2 text-left text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                >
                  Sign Out
                </button>
              </template>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main>
        <RouterView />
      </main>

      <!-- Footer -->
      <footer v-if="!isLandingPage" class="bg-white border-t border-neutral-border mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div class="col-span-1 md:col-span-2">
              <router-link to="/" class="flex items-center space-x-2 mb-4">
                <img
                  :src="jobHopperWordsLogo"
                  alt="Job-Hopper"
                  class="h-5 w-auto"
                >
                <img
                  :src="jobHopperRabbitLogo"
                  alt="Job-Hopper rabbit logo"
                  class="h-8 w-auto"
                >
              </router-link>
              <p class="text-sm text-neutral-body">
                Curated job matches delivered to your inbox. Stop applying into the void.
              </p>
            </div>
            <div>
              <h3 class="text-sm font-heading font-semibold text-brand-charcoal mb-4">Product</h3>
              <ul class="space-y-2">
                <li><router-link to="/how-it-works" class="text-sm text-neutral-body hover:text-brand-primary">How It Works</router-link></li>
                <li><router-link to="/pricing" class="text-sm text-neutral-body hover:text-brand-primary">Pricing</router-link></li>
                <li><router-link to="/install-app" class="text-sm text-neutral-body hover:text-brand-primary">Get the app</router-link></li>
                <li><router-link to="/faq" class="text-sm text-neutral-body hover:text-brand-primary">FAQ</router-link></li>
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-heading font-semibold text-brand-charcoal mb-4">Company</h3>
              <ul class="space-y-2">
                <li><router-link to="/about" class="text-sm text-neutral-body hover:text-brand-primary">About</router-link></li>
                <li><router-link to="/support" class="text-sm text-neutral-body hover:text-brand-primary">Support</router-link></li>
                <li><router-link to="/privacy" class="text-sm text-neutral-body hover:text-brand-primary">Privacy Policy</router-link></li>
                <li><router-link to="/terms" class="text-sm text-neutral-body hover:text-brand-primary">Terms of Service</router-link></li>
              </ul>
            </div>
          </div>
          <div class="mt-8 pt-8 border-t border-neutral-border">
            <p class="text-xs text-neutral-body text-center">
              Job-Hopper is a product of Schepmont Group LLC
            </p>
          </div>
        </div>
      </footer>
  </div>
</template>

