import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ConfirmEmailView from '../views/ConfirmEmailView.vue'
import OnboardingView from '../views/OnboardingView.vue'
import { authAPI, userAPI } from '@/lib/supabase'
import { useGlobalLoading } from '@/composables/useGlobalLoading'

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

const { isGlobalLoading } = useGlobalLoading()

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

// Router guard to enforce authentication and handle redirects
router.beforeEach(async (to) => {
  isGlobalLoading.value = true

  const targetPath = to.path

  // Public paths don't require authentication - allow immediately
  if (publicPaths.includes(targetPath)) {
    return true
  }

  // Check authentication status
  let user = null
  try {
    const { user: currentUser } = await authAPI.getCurrentUser()
    user = currentUser
  } catch (error) {
    console.error('Router guard error:', error)
  }

  // Protected paths require authentication
  if (!user) {
    return '/login'
  }

  // Helper to fetch user profile (cached within this guard execution to avoid duplicate API calls)
  let profile: { onboarding_completed?: boolean } | null = null
  const getProfile = async () => {
    if (profile === null) {
      try {
        const { data } = await userAPI.getCurrentUserProfile()
        profile = data
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }
    return profile
  }

  // Handle authenticated user redirects based on onboarding status
  const authRedirectPaths = ['/login', '/register']
  const onboardingPaths = ['/onboarding', '/dashboard']

  if (authRedirectPaths.includes(targetPath)) {
    // Authenticated users shouldn't access login/register - redirect based on onboarding status
    const userProfile = await getProfile()
    return userProfile?.onboarding_completed ? '/dashboard' : '/onboarding'
  }

  if (onboardingPaths.includes(targetPath)) {
    // Enforce onboarding flow: completed users go to dashboard, incomplete users go to onboarding
    const userProfile = await getProfile()
    
    if (targetPath === '/onboarding' && userProfile?.onboarding_completed) {
      return '/dashboard'
    }
    
    if (targetPath === '/dashboard' && !userProfile?.onboarding_completed) {
      return '/onboarding'
    }
  }

  return true
})

router.afterEach(() => {
  isGlobalLoading.value = false
})

export default router

