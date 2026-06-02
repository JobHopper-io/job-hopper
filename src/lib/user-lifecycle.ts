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

export const USER_LIFECYCLE_CATEGORY_LABELS: Record<UserLifecycleCategory, string> = {
  incomplete_onboarding: 'Incomplete onboarding',
  stripe_free_trial: 'Stripe free trial',
  freemium: 'Freemium',
  active_subscription: 'Active subscription',
  churned: 'Churned',
  unclassified: 'Unclassified',
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
  category: UserLifecycleCategory
}

export interface UserLifecycleReport {
  summary: UserLifecycleSummaryRow[]
  users: UserLifecycleUserRow[]
  totalProfiles: number
  truncated: boolean
}
