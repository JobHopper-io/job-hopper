import { supabase, getSessionUser } from '@/lib/supabase'
import type {
  NotificationSettings,
  NotificationSettingsInsert,
  NotificationSettingsUpdate,
  JobMatchEmailFrequency,
} from '@/types/database'

async function getProfileId(): Promise<string | null> {
  const user = await getSessionUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
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

  /**
   * "Unsubscribe from all" / "Re-enable emails". One RPC sets
   * notification_settings.email_unsubscribed_at and the suppressed_emails row (source
   * 'profile'); re-enabling removes only that row, never bounce/complaint rows. Returns
   * the refreshed settings.
   */
  async setUnsubscribedFromAll(
    unsubscribed: boolean
  ): Promise<{ data: NotificationSettings | null; error: Error | null }> {
    const { error } = await setOwnEmailUnsubscribed('set_own_email_unsubscribed', {
      p_unsubscribed: unsubscribed,
    })
    if (error) return { data: null, error }
    return this.getNotificationSettings()
  },
}

// ponytail: set_own_email_unsubscribed (migration 20261120130000) isn't in the generated
// src/types/supabase.ts until that migration is pushed and `npm run db:types` re-runs
// (regenerating from the local DB would drop remote-only tables). Delete this cast then
// and call supabase.rpc directly.
const setOwnEmailUnsubscribed = supabase.rpc.bind(supabase) as unknown as (
  fn: 'set_own_email_unsubscribed',
  args: { p_unsubscribed: boolean }
) => PromiseLike<{ error: Error | null }>

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
