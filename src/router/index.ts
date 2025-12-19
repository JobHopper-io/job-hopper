import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import { getSubdomainFromUrl } from '@/utils/domain'
import { organizationAPI, authAPI } from '@/lib/supabase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/dashboard'
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
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
  ],
})

// Router guard to enforce authentication
router.beforeEach(async (to) => {
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register']
  
  if (publicRoutes.includes(to.path)) {
    return true
  }

  // Check authentication for protected routes
  try {
    const { user } = await authAPI.getCurrentUser()
    if (!user) {
      return '/login'
    }

    // If on organization subdomain, validate user belongs to organization
    if (to.path.startsWith('/dashboard')) {
      const subdomain = getSubdomainFromUrl()
      if (subdomain) {
        const { data: orgData, error: orgError } = await organizationAPI.getOrganizationByDomain(subdomain)
        
        if (orgError || !orgData || orgData.error) {
          console.error('Organization not found:', orgError)
          return '/login'
        }

        // Check if email belongs to this organization
        const { data: userBelongsToOrg, error: userError } = await organizationAPI.checkUserBelongsToOrganization(
          user.email || '',
          subdomain
        )

        if (userError || !userBelongsToOrg) {
          console.error('User does not belong to organization:', userError)
          return '/login'
        }
      }
    }

    return true
  } catch (error) {
    console.error('Router guard error:', error)
    return '/login'
  }
})

export default router

