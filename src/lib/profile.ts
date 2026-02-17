import { supabase } from '@/lib/supabase'
import type { User, UserUpdate } from '@/types/database'

type ProfileUpdate = Pick<
  UserUpdate,
  | 'first_name'
  | 'last_name'
  | 'current_job_title'
  | 'years_of_experience'
  | 'current_industry'
  | 'target_role_categories'
  | 'desired_salary_min'
  | 'desired_salary_max'
  | 'preferred_locations'
  | 'open_to_relocation'
  | 'open_to_remote'
>

export const profileAPI = {
  async getCurrentUserProfile(): Promise<{ data: User | null; error: Error | null }> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single<User>()

    return { data: data ?? null, error }
  },

  async updateProfile(profileData: ProfileUpdate) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('users')
      .update(profileData)
      .eq('auth_user_id', user.id)
      .select()
      .single<User>()

    return { data, error }
  },

  async uploadResume(file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: existingUser } = await supabase
      .from('users')
      .select('resume_bucket_key')
      .eq('auth_user_id', user.id)
      .single<{ resume_bucket_key: string | null }>()

    if (existingUser?.resume_bucket_key) {
      await supabase.storage.from('resumes').remove([existingUser.resume_bucket_key])
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}-${Date.now()}.${fileExt}`
    const filePath = `resumes/${fileName}`

    const {
      data: uploadData,
      error: uploadError,
    } = await supabase.storage.from('resumes').upload(filePath, file)

    if (uploadError) {
      return { data: null, error: uploadError }
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .update({ resume_bucket_key: filePath } satisfies Pick<UserUpdate, 'resume_bucket_key'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<User>()

    if (userError) {
      return { data: null, error: userError }
    }

    return {
      data: { ...userData, resume_url: uploadData.path },
      error: null as Error | null,
    }
  },

  async getResumeDownloadUrl(bucketKey: string, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUrl(bucketKey, expiresInSeconds)
    if (error) return { data: null, error }
    return { data: data.signedUrl, error: null }
  },

  async markOnboardingComplete() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('users')
      .update({ onboarding_completed: true } satisfies Pick<UserUpdate, 'onboarding_completed'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<User>()

    return { data, error }
  },

  async updateEmail(newEmail: string) {
    const { data, error } = await supabase.auth.updateUser({
      email: newEmail,
    })

    if (!error && data.user) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ email: newEmail } satisfies Pick<UserUpdate, 'email'>)
        .eq('auth_user_id', data.user.id)

      if (updateError) {
        console.error('Error updating email in users table:', updateError)
      }
    }

    return { data, error }
  },

  async updatePhone(phoneNumber: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('users')
      .update({ phone_number: phoneNumber } satisfies Pick<UserUpdate, 'phone_number'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<User>()

    return { data, error }
  },
}

