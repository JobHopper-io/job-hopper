import { supabase } from '@/lib/supabase'
import { resumeFileSizeErrorIfAny } from '@/lib/resumeUploadLimits'
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
    const sizeError = resumeFileSizeErrorIfAny(file)
    if (sizeError) {
      return { data: null, error: new Error(sizeError) }
    }

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

  /** Lightweight check that uses the server-side helper to see if the current user has a role. */
  async hasRole(roleName: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase.rpc('current_user_has_role', {
      role_name: roleName,
    })

    if (error) {
      console.error('Error checking user role via RPC:', error)
      return false
    }

    return data === true
  },
}

