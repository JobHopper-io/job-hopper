// Matches supabase/functions/_shared/base-tier.ts's BaseTier — kept as a local literal
// union (instead of importing it) so this module has no npm-package type dependency.
type BaseTier = 'free' | 'core' | 'premium'

export type JobMatchEmailFrequency = 'immediate' | 'daily' | 'weekly'

/** Ordered most-frequent-first; the digest cadence a base tier is allowed to send. */
export const ALLOWED_JOB_MATCH_FREQUENCIES: Record<BaseTier, JobMatchEmailFrequency[]> = {
  free: ['weekly'],
  core: ['daily', 'weekly'],
  premium: ['immediate', 'daily', 'weekly'],
}

/** Falls back to the tier's most frequent allowed cadence (e.g. a downgraded Premium user). */
export function clampJobMatchFrequency(
  frequency: JobMatchEmailFrequency,
  tier: BaseTier,
): JobMatchEmailFrequency {
  const allowed = ALLOWED_JOB_MATCH_FREQUENCIES[tier]
  return allowed.includes(frequency) ? frequency : allowed[0]
}
