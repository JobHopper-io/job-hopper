import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/Login.vue'
import RegisterView from '../views/Register.vue'
import ConfirmEmailView from '../views/ConfirmEmail.vue'
import OnboardingView from '../views/Onboarding.vue'
import { authAPI } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import type { Profile } from '@/types/database'

/** Single source of truth for routes that don't require authentication. */
export const publicPaths = [
  '/',
  '/how-it-works',
  '/pricing',
  '/install-app',
  '/faq',
  '/about',
  '/support',
  '/contact',
  '/privacy',
  '/terms',
  '/login',
  '/register',
  '/confirm-email',
  '/unsubscribe-success',
  '/find-hiring-contact',
]

/** Routes that require the user to be an admin. */
const adminPaths = [
  '/admin',
  '/admin/dashboard',
  '/admin/admin-management',
  '/admin/job-matching-algorithm',
  '/admin/test-emails',
  '/admin/settings',
  '/admin/dashboard-banner',
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // Search for __TEST_ONLY__ to find test-only routes and related code to remove before production.
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/how-it-works',
      name: 'how-it-works',
      component: () => import('../views/HowItWorks.vue'),
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('../views/Pricing.vue'),
    },
    {
      path: '/install-app',
      name: 'install-app',
      component: () => import('../views/InstallApp.vue'),
    },
    {
      path: '/faq',
      name: 'faq',
      component: () => import('../views/FAQ.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/About.vue'),
    },
    {
      path: '/support',
      name: 'support',
      component: () => import('../views/Support.vue'),
    },
    {
      path: '/contact',
      redirect: '/support',
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/Privacy.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../views/Terms.vue'),
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
      path: '/unsubscribe-success',
      name: 'unsubscribe-success',
      component: () => import('../views/UnsubscribeSuccess.vue'),
    },
    {
      path: '/find-hiring-contact',
      name: 'find-hiring-contact',
      component: () => import('../views/FindHiringContact.vue'),
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: OnboardingView,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
    },
    {
      path: '/job/:id',
      name: 'job-detail',
      component: () => import('../views/JobDetail.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/Profile.vue'),
    },
    {
      path: '/billing',
      name: 'billing',
      component: () => import('../views/Billing.vue'),
    },
    {
      path: '/billing/manage',
      name: 'billing-purchase',
      component: () => import('../views/ManageSubscription.vue'),
    },
    {
      path: '/admin',
      redirect: '/admin/dashboard',
    },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('../views/AdminDashboard.vue'),
    },
    {
      path: '/admin/admin-management',
      name: 'admin-management',
      component: () => import('../views/AdminAdmins.vue'),
    },
    {
      path: '/admin/job-processor',
      redirect: '/admin/dashboard',
    },
    {
      path: '/admin/job-matching-algorithm',
      name: 'admin-job-matching-algorithm',
      component: () => import('../views/AdminJobMatchingAlgorithm.vue'),
    },
    {
      path: '/admin/test-emails',
      name: 'admin-test-emails',
      component: () => import('../views/AdminTestEmails.vue'),
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: () => import('../views/AdminSettings.vue'),
    },
    {
      path: '/admin/dashboard-banner',
      name: 'admin-dashboard-banner',
      component: () => import('../views/AdminDashboardBanner.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundPage.vue'),
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

/** True when the app is running as an installed PWA (not a normal browser tab). */
function isPwaDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  if (window.matchMedia?.('(display-mode: window-controls-overlay)').matches) return true
  const nav = window.navigator as { standalone?: boolean }
  return nav.standalone === true
}

// Router guard to enforce authentication and handle redirects
router.beforeEach(async (to) => {
  const targetPath = to.path
  const isPublicPath = publicPaths.includes(targetPath)
  // Public routes that authenticated users should be redirected away from
  const publicRedirectPaths = ['/', '/login', '/register']

  let user: unknown = null

  // Only attempt Supabase auth lookup when it's actually needed:
  // - for protected paths, or
  // - for login/register redirect logic.
  if (!isPublicPath || publicRedirectPaths.includes(targetPath)) {
    user = await getUserWithTimeout()
  }

  // Helper to fetch user profile (cached within this guard execution to avoid duplicate API calls)
  let profile: Profile | null = null
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

  // PWA: last-opened URL can be /install-app; send users to the app instead of the install guide.
  if (targetPath === '/install-app' && isPwaDisplayMode()) {
    user = user ?? (await getUserWithTimeout())
    if (!user) {
      return '/login'
    }
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

  // Admin routes require the user to have appropriate admin roles.
  if (adminPaths.includes(targetPath)) {
    const [isAdmin, isSuperAdmin] = await Promise.all([
      profileAPI.hasRole('admin'),
      profileAPI.hasRole('super_admin'),
    ])

    // Admin Management and Job processor are restricted to super_admin only.
    if (targetPath === '/admin/admin-management') {
      if (!isSuperAdmin) {
        return '/dashboard'
      }
    } else if (!isAdmin && !isSuperAdmin) {
      return '/dashboard'
    }
  }

  return true
})

export default router

