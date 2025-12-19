import { createClient } from '@supabase/supabase-js'
import { getOrganizationUrl } from '@/utils/domain'

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
  role: 'office' | 'tc' | 'doctor'
  organization_id?: string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  domain: string
  logo_bucket_key?: string
  primary_color?: string
  secondary_color?: string
  booking_link?: string
  is_onboarded?: boolean
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
    phoneNumber: string,
    organizationName: string,
    organizationDomain: string,
    bookingLink?: string,
    emailRedirectTo?: string
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectTo ?? `${getOrganizationUrl(organizationDomain)}/dashboard`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          organization_name: organizationName,
          organization_domain: organizationDomain,
          booking_link: bookingLink
        }
      }
    })

    // If signup succeeded and we have a user id, immediately create the org and link the user
    let organizationId: string | undefined
    if (!error && data?.user) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile_and_organization', {
          user_id: data.user.id,
          user_email: data.user.email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber || null,
          org_name: organizationName || null,
          org_domain: organizationDomain || null,
          booking_link: bookingLink || null
        })
        
        if (!rpcError && rpcData?.organization_id) {
          organizationId = rpcData.organization_id
        }
      } catch (e) {
        // Non-blocking: log and proceed to email confirmation UI
        console.warn('create_user_profile_and_organization failed post-signup', e)
      }
    }

    return { data: { ...data, organizationId }, error }
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    // If sign in successful, ensure user profile exists
    if (data.user && !error) {
      await authAPI.ensureUserProfile(data.user)
    }

    return { data, error }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()

    // If user exists, ensure profile exists
    if (user && !error) {
      await authAPI.ensureUserProfile(user)
    }

    return { user, error }
  },

  async ensureUserProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    try {
      // Check if user profile exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, organization_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!existingUser) {
        // Create user profile with organization data from metadata
        const { data, error } = await supabase.rpc('create_user_profile_and_organization', {
          user_id: user.id,
          user_email: user.email,
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          phone_number: user.user_metadata?.phone_number || null,
          org_name: user.user_metadata?.organization_name || null,
          org_domain: user.user_metadata?.organization_domain || null,
          booking_link: user.user_metadata?.booking_link || null
        })

        if (error) {
          console.error('Error creating user profile:', error)
          return { success: false, error }
        } else {
          console.log('User profile created:', data)
          return { success: true, data }
        }
      }

      return { success: true, data: existingUser }
    } catch (error) {
      console.error('Error ensuring user profile:', error)
      return { success: false, error }
    }
  },

  async updateUserOrganizationFromSubdomain(userId: string, subdomain: string) {
    try {
      // Get organization by subdomain
      const { data: orgData, error: orgError } = await organizationAPI.getOrganizationByDomain(subdomain)

      if (orgError || !orgData || orgData.error) {
        console.error('Organization not found for subdomain:', subdomain, orgError)
        return { success: false, error: 'Organization not found' }
      }

      // Update user's organization_id
      const { data, error } = await supabase
        .from('users')
        .update({ organization_id: orgData.id })
        .eq('auth_user_id', userId)
        .select()

      if (error) {
        console.error('Error updating user organization:', error)
        return { success: false, error }
      }

      console.log('User organization updated:', data)
      return { success: true, data }
    } catch (error) {
      console.error('Error updating user organization from subdomain:', error)
      return { success: false, error }
    }
  }
}

export const organizationAPI = {
  async createOrganization(orgData: {
    name: string
    domain: string
    logo_bucket_key?: string
    primary_color?: string
    secondary_color?: string
  }) {
    const { data, error } = await supabase.rpc('create_organization_and_link_doctor', orgData)
    return { data, error }
  },

  async getCurrentOrganization() {
    const { data, error } = await supabase.rpc('get_current_user_organization')
    return { data, error }
  },

  async userNeedsOnboarding() {
    const { data, error } = await supabase.rpc('user_needs_onboarding')
    return { data, error }
  },

  async getOrganizationByDomain(domain: string) {
    const { data, error } = await supabase.rpc('get_organization_by_domain_public', { domain_name: domain })
    return { data, error }
  },

  async checkUserBelongsToOrganization(email: string, domain: string) {
    const { data, error } = await supabase.rpc('check_user_belongs_to_organization', {
      user_email: email,
      org_domain: domain
    })
    return { data, error }
  },

  async markOrganizationOnboarded() {
    const { data, error } = await supabase.rpc('mark_organization_onboarded')
    return { data, error }
  },

  async updateOrganization(orgData: {
    name?: string
    domain?: string
    logo_bucket_key?: string
    primary_color?: string
    secondary_color?: string
    booking_link?: string
  }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Remove undefined/empty-string fields to avoid violating constraints
    const updates = Object.fromEntries(
      Object.entries(orgData).filter((entry) => entry[1] !== undefined && entry[1] !== '')
    ) as typeof orgData

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !userData) throw new Error('User organization not found')

    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', userData.organization_id)
      .select()
      .single()
    return { data, error }
  }
}

export const userAPI = {
  async getCurrentUserProfile() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
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

