/**
 * Subscription data structures and display helpers.
 * Single source of truth for tier/status enums and their labels/prices.
 */

// --- Types (align with DB enums) ---

export type SubscriptionTier = 'entry_mid' | 'senior_management' | 'director_vp_c_level'
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired'
export type AddonType = 'premium_insights' | 'interview_prep' | 'resume_upgrade'

/** Subscription (organizations row / API response). Single source of truth. */
export interface Subscription {
  id: string
  name: string
  subscription_tier?: SubscriptionTier
  subscription_status?: SubscriptionStatus
  trial_ends_at?: string
  current_period_start?: string
  current_period_end?: string
  premium_insights_enabled?: boolean
  interview_prep_enabled?: boolean
  resume_upgrade_purchased?: boolean
  stripe_customer_id?: string
  stripe_subscription_id?: string
  stripe_subscription_status?: string
  created_at: string
  updated_at: string
}

// --- Display maps (internal; used by getters below) ---

const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  entry_mid: 'Entry & Mid Level Roles',
  senior_management: 'Senior & Management Level Roles',
  director_vp_c_level: 'Director, VP & C-Level Roles'
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Free trial',
  active: 'Active',
  cancelled: 'Cancelled',
  expired: 'Expired'
}

const TIER_PRICES: Record<SubscriptionTier, number> = {
  entry_mid: 19,
  senior_management: 29,
  director_vp_c_level: 49
}

/** Add-on display labels (short form for lists). */
const ADDON_DISPLAY_NAMES: Record<AddonType, string> = {
  premium_insights: 'Premium Insights',
  interview_prep: 'Interview Prep',
  resume_upgrade: 'Resume Upgrade'
}

/** Add-on labels with price (for billing detail). */
const ADDON_DISPLAY_WITH_PRICE: Record<AddonType, string> = {
  premium_insights: 'Premium Insights & Contact Access (+$30/month)',
  interview_prep: 'Interview Prep & Strategy (+$30/month)',
  resume_upgrade: 'Resume Upgrade (one-time purchase)'
}

// --- Helpers ---

const DEFAULT_TIER_LABEL = 'Not set'
const DEFAULT_STATUS_LABEL = '—'

export function getTierDisplayName(tier?: string | null): string {
  if (!tier) return DEFAULT_TIER_LABEL
  return TIER_DISPLAY_NAMES[tier as SubscriptionTier] ?? DEFAULT_TIER_LABEL
}

export function getStatusLabel(status?: string | null): string {
  if (!status) return DEFAULT_STATUS_LABEL
  return STATUS_LABELS[status as SubscriptionStatus] ?? DEFAULT_STATUS_LABEL
}

export function getTierPrice(tier?: string | null): number {
  if (!tier) return 0
  return TIER_PRICES[tier as SubscriptionTier] ?? 0
}

function getAddonDisplayName(addon: AddonType, withPrice = false): string {
  return withPrice ? ADDON_DISPLAY_WITH_PRICE[addon] : ADDON_DISPLAY_NAMES[addon]
}

/** List of addon keys in display order. */
const ADDON_KEYS: AddonType[] = ['premium_insights', 'interview_prep', 'resume_upgrade']

function hasAddon(
  subscription: Subscription | null | undefined,
  addonKey: AddonType
): boolean {
  if (!subscription) return false
  if (addonKey === 'premium_insights') return !!subscription.premium_insights_enabled
  if (addonKey === 'interview_prep') return !!subscription.interview_prep_enabled
  if (addonKey === 'resume_upgrade') return !!subscription.resume_upgrade_purchased
  return false
}

export interface Addon {
  key: AddonType
  label: string
}

export function getActiveAddons(
  subscription: Subscription | null | undefined,
  withPrice = false
): Addon[] {
  if (!subscription) return []
  return ADDON_KEYS.filter((key) => hasAddon(subscription, key)).map((key) => ({
    key,
    label: getAddonDisplayName(key, withPrice)
  }))
}

/**
 * Composable: returns subscription display helpers used by the app.
 * Components can use this or import the named functions directly.
 */
export function useSubscription() {
  return {
    getTierDisplayName,
    getStatusLabel,
    getTierPrice,
    getActiveAddons
  }
}
