/**
 * B2C recovery segments. Pure functions over one public.recovery_candidates() row, so
 * they're unit-testable without a DB.
 *
 * Population (in SQL, migration 20261124120100): the growth_dashboard_counts() base (an
 * auth user; no partner staff, university billing profiles or admins), minus anyone with
 * live access (active/trial subscription, live org seat, active trial grant) and anyone
 * past_due (they get the transactional payment-failed email instead).
 *
 * A user in several segments gets only the first one in RECOVERY_SEGMENT_PRIORITY.
 *
 * Not built:
 *   - "Trial expired" (distinct from real churn): subscriptions keeps no transition
 *     history, so a trial that ended unconverted looks like any other cancellation.
 *   - high_match_users: disabled while the job feed is stale (job_hopper_live has had no
 *     new jobs since 2026-11-12, so most matches point at old jobs). See
 *     isHighMatchUser below to re-enable once the feed is fresh again.
 */

export const RECOVERY_SEGMENT_PRIORITY = [
  'abandoned_checkout',
  'cancelled',
  'heavy_free_usage',
  'visa_focused_no_conversion',
  'activated_never_paid',
  'onboarded_no_resume',
  'never_activated',
  'no_login_30d',
] as const

export type RevenueRecoverySegmentKey = (typeof RECOVERY_SEGMENT_PRIORITY)[number]

export const SEGMENT_LABELS: Record<RevenueRecoverySegmentKey, string> = {
  abandoned_checkout: 'Abandoned checkout',
  cancelled: 'Cancelled',
  heavy_free_usage: 'Heavy free usage',
  visa_focused_no_conversion: 'Visa/sponsorship-focused, not converted',
  activated_never_paid: 'Activated, never paid',
  onboarded_no_resume: 'Onboarded, no resume',
  never_activated: 'Signed up, never activated',
  no_login_30d: 'Not seen in 30+ days',
}

/** One row of public.recovery_candidates(). */
export interface RecoveryCandidate {
  profile_id: string
  email: string
  first_name: string | null
  target_job_title: string | null
  created_at: string
  email_confirmed: boolean
  onboarding_completed: boolean
  has_resume: boolean
  requires_us_sponsorship: boolean | null
  /** Later of profiles.last_active_at and auth last_sign_in_at. */
  last_seen_at: string | null
  has_any_sub: boolean
  has_canceled_sub: boolean
  job_searches_used: number
  max_job_searches: number
  abandoned_checkout_at: string | null
  abandoned_checkout_proxy: boolean
}

const DAY_MS = 86_400_000
const MIN_NEVER_ACTIVATED_AGE_DAYS = 3
const NO_LOGIN_DAYS = 30

type Rule = (c: RecoveryCandidate, nowMs: number) => boolean

/** Every candidate already has no live access and isn't past_due (SQL). */
export const SEGMENT_RULES: Record<RevenueRecoverySegmentKey, Rule> = {
  // A started/expired checkout over an hour old with nothing completed after it; the
  // stripe_customer_id proxy only for users with no checkout_attempts rows at all.
  abandoned_checkout: (c) => c.abandoned_checkout_at !== null || c.abandoned_checkout_proxy,
  cancelled: (c) => c.has_canceled_sub,
  // Used every free search the admin-tunable freemium cap allows.
  heavy_free_usage: (c) => c.job_searches_used >= c.max_job_searches,
  visa_focused_no_conversion: (c) => c.requires_us_sponsorship === true,
  activated_never_paid: (c) => c.onboarding_completed && !c.has_any_sub,
  onboarded_no_resume: (c) => c.onboarding_completed && !c.has_resume,
  never_activated: (c, now) =>
    !c.onboarding_completed && (now - new Date(c.created_at).getTime()) / DAY_MS >= MIN_NEVER_ACTIVATED_AGE_DAYS,
  // Never seen at all is a data gap, not a signal: excluded.
  no_login_30d: (c, now) => c.last_seen_at !== null && (now - new Date(c.last_seen_at).getTime()) / DAY_MS >= NO_LOGIN_DAYS,
}

/** Every segment the candidate matches, in priority order. */
export function matchingSegments(c: RecoveryCandidate, nowMs: number): RevenueRecoverySegmentKey[] {
  return RECOVERY_SEGMENT_PRIORITY.filter((key) => SEGMENT_RULES[key](c, nowMs))
}

/** The one segment a candidate is targeted with, or null. */
export function assignSegment(c: RecoveryCandidate, nowMs: number): RevenueRecoverySegmentKey | null {
  return matchingSegments(c, nowMs)[0] ?? null
}

/** Disabled (not in RECOVERY_SEGMENT_PRIORITY) while the job feed is stale; see header. */
export function highMatchCountThreshold(matchCounts: number[]): number {
  if (matchCounts.length === 0) return Infinity
  const sorted = [...matchCounts].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))]
}

export function isHighMatchUser(matchCount: number, threshold: number): boolean {
  return matchCount > 0 && matchCount >= threshold
}
