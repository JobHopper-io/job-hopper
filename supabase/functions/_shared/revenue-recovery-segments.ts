/**
 * B2C Revenue-Recovery Segments (Build 14). Pure membership functions, unit-testable
 * without a DB — the admin-revenue-recovery-segments Edge Function does the actual
 * fetching/orchestration and calls these.
 *
 * Only segments with a real, already-captured signal are here. Two of the plan's 9 are
 * deliberately absent, not approximated:
 *   - "Trial expired" (distinct from real churn): subscriptions stores only current
 *     status, not a status-transition history or a trial-converted flag, so a trial
 *     that ended without converting is indistinguishable from a subscription that was
 *     briefly active then canceled. Needs new instrumentation (e.g. an audit trail of
 *     every real transition, not just reconciliation drift corrections).
 *   - "Checkout abandoned": stripe-webhook only subscribes to checkout.session.completed
 *     / customer.subscription.updated / customer.subscription.deleted -- no
 *     checkout.session.expired handler and no client-side "began checkout" event
 *     anywhere, so an abandoned Stripe Checkout session is invisible to this app today.
 */

export type RevenueRecoverySegmentKey =
  | 'never_activated'
  | 'activated_never_paid'
  | 'cancelled'
  | 'no_login_30d'
  | 'heavy_free_usage'
  | 'high_match_users'
  | 'visa_focused_no_conversion'

export interface SubscriptionFlags {
  hasActiveSub: boolean
  hasTrialSub: boolean
  hasCanceledSub: boolean
  hasAnySub: boolean
}

export function subscriptionFlagsFromStatuses(statuses: Iterable<string>): SubscriptionFlags {
  let hasActiveSub = false
  let hasTrialSub = false
  let hasCanceledSub = false
  let hasAnySub = false
  for (const status of statuses) {
    hasAnySub = true
    if (status === 'active') hasActiveSub = true
    else if (status === 'trial') hasTrialSub = true
    else if (status === 'canceled') hasCanceledSub = true
  }
  return { hasActiveSub, hasTrialSub, hasCanceledSub, hasAnySub }
}

/** Not currently entitled -- the shared "hasn't converted" gate every segment but the
 * plain onboarding/churn ones uses, so a currently-paying user is never targeted by an
 * upsell-flavored re-engagement send. */
export function isNonPayer(flags: SubscriptionFlags): boolean {
  return !flags.hasActiveSub && !flags.hasTrialSub
}

const MIN_NEVER_ACTIVATED_AGE_DAYS = 3

export function isNeverActivated(
  profile: { onboardingCompleted: boolean | null; createdAt: string; hasAuthUser: boolean },
  nowMs: number,
): boolean {
  if (!profile.hasAuthUser) return false
  if (profile.onboardingCompleted === true) return false
  const ageDays = (nowMs - new Date(profile.createdAt).getTime()) / 86400000
  return ageDays >= MIN_NEVER_ACTIVATED_AGE_DAYS
}

export function isActivatedNeverPaid(onboardingCompleted: boolean | null, flags: SubscriptionFlags): boolean {
  return onboardingCompleted === true && !flags.hasAnySub
}

/** Same definition as the existing lifecycle report's "churned" category. */
export function isCancelled(flags: SubscriptionFlags): boolean {
  return flags.hasCanceledSub && !flags.hasActiveSub && !flags.hasTrialSub
}

const NO_LOGIN_DAYS = 30

// Scoped to non-payers, consistent with every other segment here -- this build is
// about the pre-conversion funnel, not retention nudges for people already paying.
export function isNoLogin30d(lastSignInAt: string | null, nowMs: number, flags: SubscriptionFlags): boolean {
  if (!isNonPayer(flags)) return false
  if (!lastSignInAt) return false // no real sign-in on record is a data gap, not a signal -- excluded rather than guessed
  const days = (nowMs - new Date(lastSignInAt).getTime()) / 86400000
  return days >= NO_LOGIN_DAYS
}

// "Heavy" is hitting the real, already-admin-tunable freemium cap (freemium_settings.
// max_job_searches) -- not an invented number. Someone who's used every free search
// they're allowed and hasn't converted is the clearest possible upsell signal this app
// already tracks.
export function isHeavyFreeUsage(jobSearchesUsed: number, maxJobSearches: number, flags: SubscriptionFlags): boolean {
  return isNonPayer(flags) && jobSearchesUsed >= maxJobSearches
}

/** 80th percentile of the real live job_matches-per-profile distribution (among users
 * with at least one match) -- "high" is defined relative to actual usage, not a
 * fabricated absolute count, and adapts automatically as the user base grows. */
export function highMatchCountThreshold(matchCounts: number[]): number {
  if (matchCounts.length === 0) return Infinity
  const sorted = [...matchCounts].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))
  return sorted[idx]
}

export function isHighMatchUser(matchCount: number, threshold: number, flags: SubscriptionFlags): boolean {
  return isNonPayer(flags) && matchCount > 0 && matchCount >= threshold
}

// requires_us_sponsorship is a real, populated onboarding field (56.8% of real profiles
// have a non-null value; not the "genuinely untracked" gap the plan assumed).
export function isVisaFocusedNoConversion(requiresUsSponsorship: boolean | null, flags: SubscriptionFlags): boolean {
  return requiresUsSponsorship === true && isNonPayer(flags)
}
