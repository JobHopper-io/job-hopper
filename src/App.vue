<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { authAPI, onAuthStateChange } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import { useUserStore } from '@/stores/user'
import ChatWidget from '@/components/ChatWidget.vue'
import jobHopperFullLogo from '@/assets/job-hopper-logo.png'
import jobHopperWordsLogo from '@/assets/job-hopper-words.png'
import jobHopperRabbitLogo from '@/assets/job-hopper-rabbit.png'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { baseTier } = storeToRefs(userStore)

/** Same tier check as JobCard.vue/JobDetail.vue's isPremium - the Sponsor Watch nav link is
 * discovery only (hiding it doesn't gate the route itself; direct /premium-tools navigation
 * still shows the waitlist panel for Free/Core, unchanged). */
const isPremium = computed(() => baseTier.value === 'premium')
/** Application Tracker (its own page, not on the dashboard) is Core+Premium. */
const isCoreOrPremium = computed(() => baseTier.value === 'core' || baseTier.value === 'premium')

// The public landing page (`/`) ships its own bespoke fixed nav + dark footer that
// match the redesign, so suppress the shared app chrome there. Authenticated users are
// redirected away from `/` by the router guard, so this only ever affects the marketing page.
const isLandingPage = computed(() => route.path === '/')

// Login/Register/Onboarding ship their own header baked into the hero (transparent nav
// merged into the gradient on Login/Register, step progress on Onboarding) - the shared
// sticky white nav would double up on top of it. The shared footer is still used on
// Login/Register (matches the rest of the app); Onboarding's step flow has none.
// Employer login/register use the exact same AuthSplitPanel hero, so they need the same
// treatment - this was missed when Phase 2 added them, causing the shared nav to render on
// top of AuthSplitPanel's own blurred header (the "double nav" look) and the footer gap
// below not to close.
const CHROME_FREE_NAV_ROUTES = ['/login', '/register', '/onboarding', '/confirm-email', '/email-verified', '/employer/login', '/employer/register']
const CHROME_FREE_FOOTER_ROUTES = ['/onboarding']
const hideNav = computed(() => isLandingPage.value || CHROME_FREE_NAV_ROUTES.includes(route.path))
const hideFooter = computed(() => isLandingPage.value || CHROME_FREE_FOOTER_ROUTES.includes(route.path))
// Ask Hopper is a distraction on the signup/onboarding funnel - keep it off /login, /register,
// and /onboarding specifically (unlike hideNav/hideFooter, not tied to the full chrome-free list).
const HIDE_CHAT_WIDGET_ROUTES = ['/login', '/register', '/onboarding', '/employer/login', '/employer/register']
const hideChatWidget = computed(() => HIDE_CHAT_WIDGET_ROUTES.includes(route.path))

// These marketing pages (plus Dashboard, Profile, Billing, the job detail page, and
// interview practice, which now share the same warm cream background as Login/Register)
// share the warm cream background used on the landing page's "How It Works"/"Pricing"
// sections and the auth pages - the shared nav needs to pick up the same tint here
// instead of its default white, or it'd read as a hard-edged bar again. Job detail /
// interview practice are matched by prefix since their routes carry a param
// (/job/:id, /interview-practice/:id). employer/dashboard uses the same app-warm-bg class
// as Dashboard.vue and was missed the same way as the employer auth routes above.
const WARM_BG_ROUTES = ['/how-it-works', '/pricing', '/install-app', '/faq', '/dashboard', '/profile', '/billing', '/billing/manage', '/applications', '/reveal-requests', '/premium-tools', '/employer/dashboard']
const WARM_BG_PREFIXES = ['/job/', '/interview-practice/']
const isWarmPage = computed(
  () => WARM_BG_ROUTES.includes(route.path) || WARM_BG_PREFIXES.some((p) => route.path.startsWith(p)),
)
// Same "no seam" treatment as the auth routes below: the page's own background already
// fades to the same cream tone the footer sits on, so the usual mt-16 gap would just
// expose the app shell's gray bg-neutral-bg between the two.
const noFooterGapRoutes = [...CHROME_FREE_NAV_ROUTES, '/dashboard', '/profile', '/billing', '/billing/manage', '/applications', '/reveal-requests', '/premium-tools', '/employer/dashboard']
const noFooterGap = computed(
  () => noFooterGapRoutes.includes(route.path) || WARM_BG_PREFIXES.some((p) => route.path.startsWith(p)),
)

const isAuthenticated = ref(false)
const mobileMenuOpen = ref(false)

// Shared nav's Login/Get Started split into a job-seeker-vs-employer choice - the employer
// side has no other discoverable entry point from these pages.
const authMenuOpen = ref<'login' | 'register' | null>(null)
const authMenuRef = ref<HTMLElement | null>(null)
onClickOutside(authMenuRef, () => {
  authMenuOpen.value = null
})
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
    // First-touch paid/campaign attribution for signups that land directly on the
    // SPA (e.g. an ad link), mirroring landing_path's capture on static SEO pages
    // (scripts/generate-seo-pages.mjs). Read once per app load; never overwritten.
    try {
      const params = new URLSearchParams(window.location.search)
      const utmSource = params.get('utm_source')
      const utmCampaign = params.get('utm_campaign')
      const utmMedium = params.get('utm_medium')
      if (utmSource) sessionStorage.setItem('utm_source', utmSource)
      if (utmCampaign) sessionStorage.setItem('utm_campaign', utmCampaign)
      if (utmMedium) sessionStorage.setItem('utm_medium', utmMedium)
    } catch {
      // sessionStorage unavailable (privacy mode, etc.) - attribution is best-effort.
    }

    // Organic-referral fallback (no utm tag needed) for the same first-touch moment -
    // only meaningful on this initial load (App.vue mounts once per full page load,
    // not per in-app route change) and only when it's an external site, not our own
    // client-side navigation re-entering via a full reload.
    try {
      if (document.referrer) {
        const referrerHost = new URL(document.referrer).hostname
        if (referrerHost && referrerHost !== window.location.hostname) {
          sessionStorage.setItem('referrer_host', referrerHost)
        }
      }
    } catch {
      // Malformed/opaque referrer - attribution is best-effort.
    }

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
  <div class="flex min-h-screen flex-col bg-neutral-bg">
      <!-- Navigation Header -->
      <nav
        v-if="!hideNav"
        class="backdrop-blur-md border-b border-neutral-border sticky top-0 z-50"
        :class="isWarmPage ? 'bg-[#fff7ed]/95' : 'bg-white/95'"
      >
        <div class="max-w-6xl mx-auto px-5">
          <div class="flex justify-between items-center h-16">
            <!-- Logo -->
            <div class="flex items-center">
              <router-link
                to="/"
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
                  v-if="isCoreOrPremium"
                  to="/applications"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Applications
                </router-link>
                <router-link
                  v-if="userStore.profile?.recruiter_visible"
                  to="/reveal-requests"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Recruiter Requests
                </router-link>
                <router-link
                  to="/profile"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Profile
                </router-link>
                <router-link
                  v-if="isPremium"
                  to="/premium-tools"
                  class="text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                >
                  Sponsor Watch
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
                <div ref="authMenuRef" class="flex items-center gap-3">
                  <div class="relative">
                    <button
                      type="button"
                      class="flex items-center gap-1 text-sm font-medium text-neutral-body transition-colors hover:text-brand-primary"
                      @click="authMenuOpen = authMenuOpen === 'login' ? null : 'login'"
                    >
                      Login
                      <font-awesome-icon :icon="['fas', 'chevron-down']" class="text-[10px]" aria-hidden="true" />
                    </button>
                    <div
                      v-if="authMenuOpen === 'login'"
                      class="absolute right-0 top-full z-10 mt-2 w-40 rounded-[12px] border border-neutral-border bg-white py-1.5 shadow-lg"
                    >
                      <router-link to="/login" class="block px-4 py-2 text-sm text-brand-charcoal hover:bg-neutral-bg" @click="authMenuOpen = null">
                        Job seeker
                      </router-link>
                      <router-link to="/employer/login" class="block px-4 py-2 text-sm text-brand-charcoal hover:bg-neutral-bg" @click="authMenuOpen = null">
                        Employer
                      </router-link>
                    </div>
                  </div>
                  <div class="relative">
                    <button
                      type="button"
                      class="btn-primary flex items-center gap-1.5 text-sm"
                      @click="authMenuOpen = authMenuOpen === 'register' ? null : 'register'"
                    >
                      Get Started
                      <font-awesome-icon :icon="['fas', 'chevron-down']" class="text-[10px]" aria-hidden="true" />
                    </button>
                    <div
                      v-if="authMenuOpen === 'register'"
                      class="absolute right-0 top-full z-10 mt-2 w-40 rounded-[12px] border border-neutral-border bg-white py-1.5 shadow-lg"
                    >
                      <router-link to="/register" class="block px-4 py-2 text-sm text-brand-charcoal hover:bg-neutral-bg" @click="authMenuOpen = null">
                        Job seeker
                      </router-link>
                      <router-link to="/employer/register" class="block px-4 py-2 text-sm text-brand-charcoal hover:bg-neutral-bg" @click="authMenuOpen = null">
                        Employer
                      </router-link>
                    </div>
                  </div>
                </div>
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
                <div class="flex items-center gap-2 px-3 pt-2 mt-1 border-t border-neutral-border text-sm">
                  <span class="text-neutral-body">Hiring?</span>
                  <router-link to="/employer/login" class="font-semibold text-brand-primary" @click="mobileMenuOpen = false">
                    Employer login
                  </router-link>
                  <span class="text-neutral-body">·</span>
                  <router-link to="/employer/register" class="font-semibold text-brand-primary" @click="mobileMenuOpen = false">
                    Sign up
                  </router-link>
                </div>
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
                  v-if="isCoreOrPremium"
                  to="/applications"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Applications
                </router-link>
                <router-link
                  v-if="userStore.profile?.recruiter_visible"
                  to="/reveal-requests"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Recruiter Requests
                </router-link>
                <router-link
                  to="/profile"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Profile
                </router-link>
                <router-link
                  v-if="isPremium"
                  to="/premium-tools"
                  class="px-3 py-2 text-neutral-body hover:text-brand-primary rounded-md text-sm font-medium"
                  @click="mobileMenuOpen = false"
                >
                  Sponsor Watch
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
      <main class="flex-1">
        <RouterView />
      </main>

      <!-- Footer -->
      <!-- No top margin on the auth routes (and Dashboard): their background already fades
           to the same cream tone the footer sits on and must butt straight into it with no
           visible seam. -->
      <footer v-if="!hideFooter" class="bg-white border-t border-neutral-border" :class="noFooterGap ? '' : 'mt-16'">
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
                <li><a href="/jobs/browse" class="text-sm text-neutral-body hover:text-brand-primary">Browse Jobs</a></li>
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

      <!-- RAG support chat widget: available to everyone, including logged-out visitors,
      except the signup/onboarding funnel where it's a distraction. -->
      <ChatWidget v-if="!hideChatWidget" />
  </div>
</template>

