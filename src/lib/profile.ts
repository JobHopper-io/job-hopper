import { supabase } from '@/lib/supabase'
import type { Profile, ProfileUpdate, ProfileUserEditable } from '@/types/database'

export const profileAPI = {
  async getCurrentUserProfile(): Promise<{ data: Profile | null; error: Error | null }> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single<Profile>()

    return { data: data ?? null, error }
  },

  async updateProfile(profileData: ProfileUserEditable) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('auth_user_id', user.id)
      .select()
      .single<Profile>()

    return { data, error }
  },

  async uploadResume(file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('resume_bucket_key')
      .eq('auth_user_id', user.id)
      .single<{ resume_bucket_key: string | null }>()

    if (existingProfile?.resume_bucket_key) {
      await supabase.storage.from('resumes').remove([existingProfile.resume_bucket_key])
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

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .update({ resume_bucket_key: filePath } satisfies Pick<ProfileUpdate, 'resume_bucket_key'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<Profile>()

    if (profileError || !profileData) {
      return { data: null, error: profileError ?? new Error('Profile update returned no data') }
    }

    return {
      data: { ...profileData, resume_url: uploadData.path },
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
      .from('profiles')
      .update({ onboarding_completed: true } satisfies Pick<ProfileUpdate, 'onboarding_completed'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<Profile>()

    return { data, error }
  },

  async updateEmail(newEmail: string) {
    const { data, error } = await supabase.auth.updateUser({
      email: newEmail,
    })

    if (!error && data.user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ email: newEmail } satisfies Pick<ProfileUpdate, 'email'>)
        .eq('auth_user_id', data.user.id)

      if (updateError) {
        console.error('Error updating email in profiles table:', updateError)
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
      .from('profiles')
      .update({ phone_number: phoneNumber } satisfies Pick<ProfileUpdate, 'phone_number'>)
      .eq('auth_user_id', user.id)
      .select()
      .single<Profile>()

    return { data, error }
  },
}

