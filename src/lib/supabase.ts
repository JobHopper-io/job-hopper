import { createClient } from '@supabase/supabase-js'
import type { SubscriptionTier, AddonType } from '@/lib/subscription'

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
export interface Profile {
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

/** Job list item (dashboard feed / JobCard). */
export interface JobFeedItem {
  id: string
  title: string
  company: string
  location: string
  salary_min?: number
  salary_max?: number
  brief?: string
  tags?: string[]
  status?: 'new' | 'updated' | 'closing_soon'
}

/** Hiring contact shown on job detail. */
export interface JobHiringContact {
  name: string
  title: string
  location: string
  note: string
}

/** Interview prep content on job detail. */
export interface JobInterviewPrep {
  themes: string[]
  questions_they_might_ask: string[]
  questions_to_ask: string[]
}

/** Job detail (detail page). */
export interface JobDetail {
  id: string
  title: string
  company: string
  location: string
  salary_min?: number
  salary_max?: number
  overview?: string
  shift?: string
  company_size?: string
  employment_type?: string
  posted_date?: string
  match_reasons?: string[]
  hiring_contacts?: JobHiringContact[]
  interview_prep?: JobInterviewPrep
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
  async createSubscription(tier: SubscriptionTier, trialDays: number = 7) {
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
    tier: SubscriptionTier,
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

  async updateSubscriptionTier(newTier: SubscriptionTier) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('update_subscription_tier', {
      user_id: user.id,
      new_tier: newTier
    })

    return { data, error }
  },

  async enableAddon(addonType: AddonType) {
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

    // If user already has a resume, delete it from storage first
    const { data: existingUser } = await supabase
      .from('users')
      .select('resume_bucket_key')
      .eq('auth_user_id', user.id)
      .single()

    if (existingUser?.resume_bucket_key) {
      await supabase.storage
        .from('resumes')
        .remove([existingUser.resume_bucket_key])
    }

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

  async getResumeDownloadUrl(bucketKey: string, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUrl(bucketKey, expiresInSeconds)
    if (error) return { data: null, error }
    return { data: data.signedUrl, error: null }
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
