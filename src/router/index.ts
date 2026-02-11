import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ConfirmEmailView from '../views/ConfirmEmailView.vue'
import { authAPI } from '@/lib/supabase'

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

// Router guard to enforce authentication
router.beforeEach(async (to) => {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/how-it-works',
    '/pricing',
    '/faq',
    '/about',
    '/support',
    '/contact',
    '/login',
    '/register',
    '/confirm-email'
  ]

  if (publicRoutes.includes(to.path)) {
    return true
  }

  // Check authentication for protected routes
  try {
    const { user } = await authAPI.getCurrentUser()
    if (!user) {
      return '/login'
    }

    // Require email confirmation for dashboard and other protected routes
    const emailConfirmed = !!(user as { email_confirmed_at?: string }).email_confirmed_at
    if (!emailConfirmed) {
      return '/confirm-email'
    }

    return true
  } catch (error) {
    console.error('Router guard error:', error)
    return '/login'
  }
})

export default router

