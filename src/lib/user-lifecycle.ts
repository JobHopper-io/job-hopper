export type UserLifecycleCategory =
  | 'incomplete_onboarding'
  | 'stripe_free_trial'
  | 'active_subscription'
  | 'churned'
  | 'freemium'
  | 'unclassified'

export const USER_LIFECYCLE_CATEGORY_ORDER: UserLifecycleCategory[] = [
  'incomplete_onboarding',
  'stripe_free_trial',
  'freemium',
  'active_subscription',
  'churned',
  'unclassified',
]

// There is no purchasable Free plan (see Pricing.vue) -- these labels describe where a
// user is in the Core/Premium trial-to-paid flow, not a separate free product tier.
export const USER_LIFECYCLE_CATEGORY_LABELS: Record<UserLifecycleCategory, string> = {
  incomplete_onboarding: 'Signed up, not onboarded',
  stripe_free_trial: 'On trial (Core/Premium)',
  freemium: 'Onboarded, no plan yet',
  active_subscription: 'Paying customer',
  churned: 'Cancelled',
  unclassified: 'Data Error',
}

/** Summary rows for categories that should not show when empty (e.g. data errors). */
export function isUserLifecycleSummaryRowVisible(row: UserLifecycleSummaryRow): boolean {
  if (row.category === 'unclassified' && row.count === 0) {
    return false
  }
  return true
}

export interface UserLifecycleSummaryRow {
  category: UserLifecycleCategory
  count: number
  pct: number
}

export interface UserLifecycleUserRow {
  id: string
  email: string
  firstName: string
  lastName: string
  phoneNumber: string | null
  tier: 'core' | 'premium' | null
  createdAt: string | null
  category: UserLifecycleCategory
}

export interface UserLifecycleReport {
  summary: UserLifecycleSummaryRow[]
  users: UserLifecycleUserRow[]
  totalProfiles: number
  truncated: boolean
}
