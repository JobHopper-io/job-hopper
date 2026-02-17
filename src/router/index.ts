import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ConfirmEmailView from '../views/ConfirmEmailView.vue'
import OnboardingView from '../views/OnboardingView.vue'
import { authAPI } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import type { User } from '@/types/database'

/** Single source of truth for routes that don't require authentication. */
export const publicPaths = [
  '/',
  '/how-it-works',
  '/pricing',
  '/faq',
  '/about',
  '/support',
  '/contact',
  '/privacy',
  '/terms',
  '/login',
  '/register',
  '/confirm-email',
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/how-it-works',
      name: 'how-it-works',
      component: () => import('../views/HowItWorksView.vue'),
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('../views/PricingView.vue'),
    },
    {
      path: '/faq',
      name: 'faq',
      component: () => import('../views/FAQView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/support',
      name: 'support',
      component: () => import('../views/SupportView.vue'),
    },
    {
      path: '/contact',
      redirect: '/support',
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../views/TermsView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
    },
    {
      path: '/confirm-email',
      name: 'confirm-email',
      component: ConfirmEmailView,
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: OnboardingView,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/job/:id',
      name: 'job-detail',
      component: () => import('../views/JobDetailView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
    },
    {
      path: '/billing',
      name: 'billing',
      component: () => import('../views/BillingView.vue'),
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    // Back/forward: restore browser's saved position
    if (savedPosition) {
      return savedPosition
    }
    // New navigation: scroll to top
    return { left: 0, top: 0 }
  },
})

// Helper to avoid hanging the entire app if Supabase is slow/unreachable.
// Returns the current user or null if unavailable/timeout.
async function getUserWithTimeout(timeoutMs = 2000) {
  try {
    const authPromise = authAPI.getCurrentUser().then(({ user }) => user ?? null)
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    })

    const result = await Promise.race([authPromise, timeoutPromise])
    return result
  } catch (error) {
    console.error('Router guard auth timeout/failure:', error)
    return null
  }
}

// Router guard to enforce authentication and handle redirects
router.beforeEach(async (to) => {
  const targetPath = to.path
  const isPublicPath = publicPaths.includes(targetPath)
  const publicRedirectPaths = ['/login', '/register']

  let user: unknown = null

  // Only attempt Supabase auth lookup when it's actually needed:
  // - for protected paths, or
  // - for login/register redirect logic.
  if (!isPublicPath || publicRedirectPaths.includes(targetPath)) {
    user = await getUserWithTimeout()
  }

  // Helper to fetch user profile (cached within this guard execution to avoid duplicate API calls)
  let profile: User | null = null
  const getProfile = async () => {
    if (!user || profile !== null) return profile

    try {
      const { data } = await profileAPI.getCurrentUserProfile()
      profile = data
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }

    return profile
  }

  // Authenticated users should not see login/register; gracefully skip if Supabase is unavailable.
  if (user && publicRedirectPaths.includes(targetPath)) {
    const userProfile = await getProfile()
    return userProfile?.onboarding_completed ? '/dashboard' : '/onboarding'
  }

  // Public paths don't require authentication; never block these on Supabase.
  if (isPublicPath) {
    return true
  }

  // Protected paths require authentication; if we couldn't confirm a user (including timeout), send to login.
  if (!user) {
    return '/login'
  }

  const userProfile = await getProfile()

  // If onboarding is not complete, force ANY protected path (including `/dashboard`, `/profile`, `/billing`, etc.)
  // to `/onboarding`. The only allowed authenticated route in this state is `/onboarding` itself.
  if (!userProfile?.onboarding_completed) {
    if (targetPath !== '/onboarding') {
      return '/onboarding'
    }
    return true
  }

  // If onboarding is complete, prevent access back to `/onboarding`
  if (targetPath === '/onboarding') {
    return '/dashboard'
  }

  return true
})

export default router

