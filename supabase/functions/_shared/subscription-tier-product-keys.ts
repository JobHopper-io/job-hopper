import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

/**
 * Career-level tier key(s) for a profile, read from `profiles.career_level`.
 *
 * This is the single source of truth for aligning job matching with
 * `job_hopper_live.subscription_tier`. It is NEVER derived from the base-plan the user
 * bought: under the Free/Core/Premium model base plans are feature depth, not career
 * level, so `products.key` no longer encodes a career tier.
 *
 * Returns `[]` when the profile has no career level set yet (which, by design, matches
 * no jobs -- same as a not-yet-onboarded profile).
 */
export async function getCareerLevelTierKeysForProfile(
  client: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: profile, error } = await client
    .from('profiles')
    .select('career_level')
    .eq('id', profileId)
    .maybeSingle()

  if (error || !profile?.career_level) {
    return []
  }

  return [profile.career_level as string]
}

/** User-facing error when matching cannot run because the profile has no career level. */
export function subscriptionTierKeysRequiredMessage(): string {
  return (
    'No career level is set for this profile, and the tier keys override field is empty. ' +
    'Set profiles.career_level (entry_mid / senior_management / director_vp_c_level), ' +
    'or enter comma-separated tier keys that match job_hopper_live.subscription_tier.'
  )
}

export function assertSubscriptionTierKeysForMatching(keys: readonly string[]): void {
  if (keys.length === 0) {
    throw new Error(subscriptionTierKeysRequiredMessage())
  }
}
