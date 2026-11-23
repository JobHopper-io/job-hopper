import { supabase, getSessionUser } from '@/lib/supabase'
import { MARKETING_EMAIL_WORDING_VERSION } from '@/lib/consent'
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

  /** Effective marketing consent (latest marketing row is a grant of an accepted wording). */
  async getMarketingConsent(): Promise<{ data: boolean | null; error: Error | null }> {
    const profileId = await getProfileId()
    if (!profileId) return { data: null, error: new Error('Not authenticated') }
    const { data, error } = await pendingRpc('current_marketing_consent', { p_profile_id: profileId })
    if (error) return { data: null, error }
    return { data: data === true, error: null }
  },

  /** Marketing emails toggle: appends a consent_records row (never edits one). */
  async setMarketingConsent(granted: boolean): Promise<{ error: Error | null }> {
    const { error } = await pendingRpc('set_own_marketing_consent', {
      p_granted: granted,
      p_wording_version: granted ? MARKETING_EMAIL_WORDING_VERSION : null,
    })
    return { error }
  },

  /**
   * "Unsubscribe from all" / "Re-enable emails". One RPC sets
   * notification_settings.email_unsubscribed_at and a scope 'all' suppressed_emails row;
   * re-enabling removes the user's scope 'all' unsubscribe rows (from any source), never
   * bounce, complaint or marketing-scope rows. Returns the refreshed settings.
   */
  async setUnsubscribedFromAll(
    unsubscribed: boolean
  ): Promise<{ data: NotificationSettings | null; error: Error | null }> {
    const { error } = await pendingRpc('set_own_email_unsubscribed', { p_unsubscribed: unsubscribed })
    if (error) return { data: null, error }
    return this.getNotificationSettings()
  },
}

// ponytail: these RPCs (migrations 20261120130000 and 20261121120000) aren't in the
// generated src/types/supabase.ts until the migrations are pushed and `npm run db:types`
// re-runs (regenerating from the local DB would drop remote-only tables). Delete this
// cast then and call supabase.rpc directly.
interface PendingRpcs {
  set_own_email_unsubscribed: { args: { p_unsubscribed: boolean }; returns: null }
  set_own_marketing_consent: { args: { p_granted: boolean; p_wording_version: string | null }; returns: null }
  current_marketing_consent: { args: { p_profile_id: string }; returns: boolean }
}
const pendingRpc = supabase.rpc.bind(supabase) as unknown as <K extends keyof PendingRpcs>(
  fn: K,
  args: PendingRpcs[K]['args']
) => PromiseLike<{ data: PendingRpcs[K]['returns'] | null; error: Error | null }>

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
