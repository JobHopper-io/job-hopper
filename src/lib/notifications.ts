import { supabase } from '@/lib/supabase'
import type {
  NotificationSettings,
  NotificationSettingsInsert,
  NotificationSettingsUpdate,
  JobMatchEmailFrequency,
} from '@/types/database'

async function getProfileId(): Promise<string | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  return data?.id ?? null
}

export const notificationsAPI = {
  async getNotificationSettings(): Promise<{
    data: NotificationSettings | null
    error: Error | null
  }> {
    const profileId = await getProfileId()
    if (!profileId) {
      return { data: null, error: new Error('Not authenticated') }
    }
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error) return { data: null, error }
    if (!data) {
      const { data: inserted, error: insertError } = await supabase
        .from('notification_settings')
        .insert({ profile_id: profileId })
        .select()
        .single()
      if (insertError) return { data: null, error: insertError }
      return { data: inserted, error: null }
    }
    return { data, error: null }
  },

  async updateNotificationSettings(
    updates: Partial<NotificationSettingsUpdate>
  ): Promise<{ data: NotificationSettings | null; error: Error | null }> {
    const profileId = await getProfileId()
    if (!profileId) {
      return { data: null, error: new Error('Not authenticated') }
    }
    const allowed: NotificationSettingsInsert = {
      profile_id: profileId,
      updated_at: new Date().toISOString(),
    }
    if (updates.job_match_email_enabled !== undefined) {
      allowed.job_match_email_enabled = updates.job_match_email_enabled
    }
    if (updates.job_match_email_frequency !== undefined) {
      allowed.job_match_email_frequency = updates.job_match_email_frequency
    }
    if (updates.subscription_updates_email_enabled !== undefined) {
      allowed.subscription_updates_email_enabled = updates.subscription_updates_email_enabled
    }
    if (updates.system_announcements_email_enabled !== undefined) {
      allowed.system_announcements_email_enabled = updates.system_announcements_email_enabled
    }
    if (updates.email_unsubscribed_at !== undefined) {
      allowed.email_unsubscribed_at = updates.email_unsubscribed_at
    }
    const { data, error } = await supabase
      .from('notification_settings')
      .upsert(allowed, { onConflict: 'profile_id' })
      .select()
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  },

  async unsubscribeFromAll(): Promise<{ error: Error | null }> {
    return this.updateNotificationSettings({
      email_unsubscribed_at: new Date().toISOString(),
    }).then((r) => ({ error: r.error }))
  },

  async resubscribe(): Promise<{ error: Error | null }> {
    return this.updateNotificationSettings({
      email_unsubscribed_at: null,
    }).then((r) => ({ error: r.error }))
  },
}

export const JOB_MATCH_FREQUENCY_OPTIONS: { value: JobMatchEmailFrequency; label: string }[] = [
  { value: 'immediate', label: 'Immediate (when we find matches)' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
]

export type BaseTier = 'free' | 'core' | 'premium'

/** Ordered most-frequent-first. Mirrors supabase/functions/_shared/job-match-email-frequency.ts. */
export const ALLOWED_JOB_MATCH_FREQUENCIES: Record<BaseTier, JobMatchEmailFrequency[]> = {
  free: ['weekly'],
  core: ['daily', 'weekly'],
  premium: ['immediate', 'daily', 'weekly'],
}

export function allowedJobMatchFrequencyOptions(tier: BaseTier) {
  const allowed = ALLOWED_JOB_MATCH_FREQUENCIES[tier]
  return JOB_MATCH_FREQUENCY_OPTIONS.filter((opt) => allowed.includes(opt.value))
}

/** Falls back to the tier's most frequent allowed cadence (e.g. a downgraded Premium user). */
export function clampJobMatchFrequency(
  frequency: JobMatchEmailFrequency,
  tier: BaseTier,
): JobMatchEmailFrequency {
  const allowed = ALLOWED_JOB_MATCH_FREQUENCIES[tier]
  return allowed.includes(frequency) ? frequency : allowed[0]
}
