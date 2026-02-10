<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { authAPI } from '@/lib/supabase'

const route = useRoute()
const router = useRouter()

const isAuthenticated = ref(false)
const isLoading = ref(true)
const mobileMenuOpen = ref(false)

const isHomePage = computed(() => route.path === '/')
const isLoginPage = computed(() => route.path === '/login')
const isRegisterPage = computed(() => route.path === '/register')
const isPublicPage = computed(() => {
  const publicRoutes = ['/', '/how-it-works', '/pricing', '/faq', '/about', '/support', '/contact']
  return publicRoutes.includes(route.path)
})

onMounted(async () => {
  try {
    const { user } = await authAPI.getCurrentUser()
    isAuthenticated.value = !!user

    if (isAuthenticated.value) {
      // Redirect authenticated users away from login/register
      if (isLoginPage.value || isRegisterPage.value) {
        router.push('/dashboard')
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error)
  } finally {
    isLoading.value = false
  }
})

const handleSignOut = async () => {
  try {
    const { error } = await authAPI.signOut()
    if (error) throw error
    router.push('/')
  } catch (error) {
    console.error('Error signing out:', error)
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg">
    <!-- Loading State -->
    <div v-if="isLoading" class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <svg class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-neutral-body">Loading...</p>
      </div>
    </div>

    <!-- Main App Content -->
    <div v-else>
      <!-- Navigation Header -->
      <nav class="bg-white/95 backdrop-blur-md border-b border-neutral-border sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <!-- Logo -->
            <div class="flex items-center">
              <router-link :to="isAuthenticated ? '/dashboard' : '/'" class="flex items-center space-x-2">
                <img src="/icon-512.png" alt="Job-Hopper" class="w-8 h-8 rounded-lg object-contain" />
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
              <template v-else>
                <router-link
                  to="/dashboard"
                  class="text-neutral-body hover:text-brand-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Dashboard
                </router-link>
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
              <template v-else>
                <router-link
                  to="/dashboard"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Dashboard
                </router-link>
                <button
                  @click="handleSignOut; mobileMenuOpen = false"
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
      <footer v-if="isPublicPage || isAuthenticated" class="bg-white border-t border-neutral-border mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div class="col-span-1 md:col-span-2">
              <router-link to="/" class="flex items-center space-x-2 mb-4">
                <img src="/icon-512.png" alt="Job-Hopper" class="w-8 h-8 rounded-lg object-contain" />
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
                <li><a href="#" class="text-sm text-neutral-body hover:text-brand-primary">Privacy Policy</a></li>
                <li><a href="#" class="text-sm text-neutral-body hover:text-brand-primary">Terms of Service</a></li>
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
  </div>
</template>

