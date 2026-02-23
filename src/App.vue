<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { authAPI, onAuthStateChange } from '@/lib/auth'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const isAuthenticated = ref(false)
const mobileMenuOpen = ref(false)

const isOnboarded = computed(() => !!userStore.profile?.onboarding_completed)

// Load profile + subscription once when user becomes authenticated
watch(isAuthenticated, (authenticated) => {
  if (authenticated) userStore.refreshUserData()
  else userStore.clear()
})

// Listen to auth state changes to update isAuthenticated reactively
// Use a distinct name to avoid confusion with domain "Subscription" model
const {
  data: { subscription: authListener },
} = onAuthStateChange(async (_event, session) => {
  isAuthenticated.value = !!session?.user
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
    const hash = window.location.hash
    if (hash && (hash.includes('access_token=') || hash.includes('refresh_token='))) {
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
      <nav class="bg-white/95 backdrop-blur-md border-b border-neutral-border sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <!-- Logo -->
            <div class="flex items-center">
              <router-link
                :to="isAuthenticated ? (isOnboarded ? '/dashboard' : '/onboarding') : '/'"
                class="flex items-center space-x-2"
              >
                <div class="w-8 h-8 bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                </div>
                <span class="text-lg sm:text-xl font-heading font-bold text-brand-primary">Job-Hopper</span>
              </router-link>
            </div>

            <!-- Desktop Navigation -->
            <div class="hidden md:flex items-center space-x-8">
              <template v-if="!isAuthenticated">
                <router-link
                  to="/how-it-works"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  How It Works
                </router-link>
                <router-link
                  to="/pricing"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Pricing
                </router-link>
                <router-link
                  to="/faq"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  FAQ
                </router-link>
                <router-link
                  to="/login"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Login
                </router-link>
                <router-link
                  to="/register"
                  class="btn-primary text-sm"
                >
                  Get Started
                </router-link>
              </template>
              <template v-else-if="isOnboarded">
                <router-link
                  to="/dashboard"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Dashboard
                </router-link>
                <router-link
                  to="/profile"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Profile
                </router-link>
                <router-link
                  to="/billing"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Billing
                </router-link>
                <button
                  @click="handleSignOut"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </template>
              <template v-else>
                <button
                  @click="handleSignOut"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
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
      <footer class="bg-white border-t border-neutral-border mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div class="col-span-1 md:col-span-2">
              <router-link to="/" class="flex items-center space-x-2 mb-4">
                <div class="w-8 h-8 bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                </div>
                <span class="text-lg font-heading font-bold text-brand-primary">Job-Hopper</span>
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

