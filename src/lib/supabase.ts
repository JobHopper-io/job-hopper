import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database types
export interface User {
  id: string
  auth_user_id: string
  first_name: string
  last_name: string
  email: string
  phone_number?: string
  role: 'office' | 'tc' | 'doctor' | 'subscriber'
  organization_id?: string
  current_job_title?: string
  years_of_experience?: number
  current_industry?: string
  target_role_categories?: string[]
  desired_salary_min?: number
  desired_salary_max?: number
  preferred_locations?: string[]
  open_to_relocation?: boolean
  open_to_remote?: boolean
  resume_bucket_key?: string
  onboarding_completed?: boolean
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  name: string
  subscription_tier?: 'entry_mid' | 'senior_management' | 'director_vp_c_level'
  subscription_status?: 'trial' | 'active' | 'cancelled' | 'expired'
  trial_ends_at?: string
  current_period_start?: string
  current_period_end?: string
  premium_insights_enabled?: boolean
  interview_prep_enabled?: boolean
  resume_upgrade_purchased?: boolean
  stripe_customer_id?: string
  stripe_subscription_id?: string
  stripe_subscription_status?: string
  created_at: string
  updated_at: string
}

// API functions
export const authAPI = {
  async signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber?: string,
    emailRedirectTo?: string
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectTo ?? `${window.location.origin}/dashboard`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber || null
        }
      }
    })


    if (error) {
      console.error('Auth signUp error:', error.message, error)
    }
    return { data, error }
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    return { data, error }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()

    return { user, error }
  }
}

export const subscriptionAPI = {
  async createSubscription(tier: 'entry_mid' | 'senior_management' | 'director_vp_c_level', trialDays: number = 7) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('create_subscription_for_user', {
      user_id: user.id,
      tier,
      trial_days: trialDays
    })

    return { data, error }
  },

  async createCheckoutSession(
    tier: 'entry_mid' | 'senior_management' | 'director_vp_c_level',
    addons?: {
      premium_insights?: boolean
      interview_prep?: boolean
      resume_upgrade?: boolean
    },
    successUrl?: string,
    cancelUrl?: string
  ) {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        tier,
        addons: addons || {},
        successUrl: successUrl || `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl || `${window.location.origin}/billing`,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async createBillingPortalSession(returnUrl?: string) {
    const { data, error } = await supabase.functions.invoke('create-billing-portal', {
      body: {
        returnUrl: returnUrl || `${window.location.origin}/billing`,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async getCurrentSubscription() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userData?.organization_id) {
      return { data: null, error: null }
    }

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', userData.organization_id)
      .single()

    return { data, error }
  },

  async updateSubscriptionTier(newTier: 'entry_mid' | 'senior_management' | 'director_vp_c_level') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('update_subscription_tier', {
      user_id: user.id,
      new_tier: newTier
    })

    return { data, error }
  },

  async enableAddon(addonType: 'premium_insights' | 'interview_prep' | 'resume_upgrade') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('enable_premium_addon', {
      user_id: user.id,
      addon_type: addonType
    })

    return { data, error }
  },

  async cancelSubscription() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userData?.organization_id) {
      return { error: new Error('Subscription not found') }
    }

    const { data, error } = await supabase
      .from('organizations')
      .update({ subscription_status: 'cancelled' })
      .eq('id', userData.organization_id)
      .select()
      .single()

    return { data, error }
  }
}

export const profileAPI = {
  async updateProfile(profileData: {
    first_name?: string
    last_name?: string
    current_job_title?: string
    years_of_experience?: number
    current_industry?: string
    target_role_categories?: string[]
    desired_salary_min?: number
    desired_salary_max?: number
    preferred_locations?: string[]
    open_to_relocation?: boolean
    open_to_remote?: boolean
  }) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('users')
      .update(profileData)
      .eq('auth_user_id', user.id)
      .select()
      .single()

    return { data, error }
  },

  async uploadResume(file: File) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}-${Date.now()}.${fileExt}`
    const filePath = `resumes/${fileName}`

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file)

    if (uploadError) {
      return { data: null, error: uploadError }
    }

    // Update user profile with resume bucket key
    const { data: userData, error: userError } = await supabase
      .from('users')
      .update({ resume_bucket_key: filePath })
      .eq('auth_user_id', user.id)
      .select()
      .single()

    if (userError) {
      return { data: null, error: userError }
    }

    return { data: { ...userData, resume_url: uploadData.path }, error: null }
  },

  async markOnboardingComplete() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('auth_user_id', user.id)
      .select()
      .single()

    return { data, error }
  }
}

export const userAPI = {
  async getCurrentUserProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: new Error('Not authenticated') }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    return { data, error }
  },

  async updateEmail(newEmail: string) {
    const { data, error } = await supabase.auth.updateUser({
      email: newEmail
    })
    
    if (!error && data.user) {
      // Update email in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ email: newEmail })
        .eq('auth_user_id', data.user.id)
      
      if (updateError) {
        console.error('Error updating email in users table:', updateError)
      }
    }
    
    return { data, error }
  },

  async updatePhone(phoneNumber: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('users')
      .update({ phone_number: phoneNumber })
      .eq('auth_user_id', user.id)
      .select()
      .single()

    return { data, error }
  },

  async updatePassword(newPassword: string) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { data, error }
  }
}
