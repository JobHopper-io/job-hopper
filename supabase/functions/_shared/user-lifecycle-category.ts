/** Mutually exclusive user lifecycle buckets (evaluated in this order). */
export type UserLifecycleCategory =
  | 'incomplete_onboarding'
  | 'stripe_free_trial'
  | 'active_subscription'
  | 'churned'
  | 'freemium'
  | 'unclassified' // UI label: "Data Error"

export interface UserSubscriptionFlags {
  onboardingCompleted: boolean
  hasTrialSub: boolean
  hasActiveSub: boolean
  hasCanceledSub: boolean
  hasAnySub: boolean
}

export function categorizeUserLifecycle(flags: UserSubscriptionFlags): UserLifecycleCategory {
  if (!flags.onboardingCompleted) {
    return 'incomplete_onboarding'
  }
  if (flags.hasTrialSub) {
    return 'stripe_free_trial'
  }
  if (flags.hasActiveSub) {
    return 'active_subscription'
  }
  if (flags.hasCanceledSub) {
    return 'churned'
  }
  if (!flags.hasAnySub) {
    return 'freemium'
  }
  return 'unclassified'
}

export function subscriptionFlagsFromStatuses(
  statuses: Iterable<string>,
  onboardingCompleted: boolean | null,
): UserSubscriptionFlags {
  let hasTrialSub = false
  let hasActiveSub = false
  let hasCanceledSub = false
  let hasAnySub = false

  for (const status of statuses) {
    hasAnySub = true
    if (status === 'trial') hasTrialSub = true
    else if (status === 'active') hasActiveSub = true
    else if (status === 'canceled') hasCanceledSub = true
  }

  return {
    onboardingCompleted: onboardingCompleted === true,
    hasTrialSub,
    hasActiveSub,
    hasCanceledSub,
    hasAnySub,
  }
}
