/**
 * Subscription data structures and display helpers.
 * Single source of truth for tier/status enums and their labels/prices.
 */

import type { SubscriptionTier, SubscriptionStatus, AddonType, Subscription, Addon } from '@/types/database'
import { supabase } from '@/lib/supabase'

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

export const subscriptionAPI = {
  async createSubscription(tier: SubscriptionTier, trialDays: number = 7) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('create_subscription_for_user', {
      user_id: user.id,
      tier,
      trial_days: trialDays,
    })

    return { data, error }
  },

  async createCheckoutSession(
    tier: SubscriptionTier,
    addons?: {
      premium_insights?: boolean
      interview_prep?: boolean
      resume_upgrade?: boolean
    },
    successUrl?: string,
    cancelUrl?: string,
  ) {
    // Supabase automatically includes the auth header when using an authenticated client
    // No need to manually pass Authorization header
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        tier,
        addons: addons || {},
        successUrl:
          successUrl || `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl || `${window.location.origin}/billing`,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async createBillingPortalSession(returnUrl?: string) {
    const { data, error } = await supabase.functions.invoke('create-billing-portal', {
      body: {
        returnUrl: returnUrl || `${window.location.origin}/billing`,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async getCurrentSubscription() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profileData } = await supabase
      .from('profiles')
      .select('subscription_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profileData?.subscription_id) {
      return { data: null, error: null }
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', profileData.subscription_id)
      .single<Subscription>()

    return { data, error }
  },

  async updateSubscriptionTier(newTier: SubscriptionTier) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('update_subscription_tier', {
      user_id: user.id,
      new_tier: newTier,
    })

    return { data, error }
  },

  async enableAddon(addonType: AddonType) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('enable_premium_addon', {
      user_id: user.id,
      addon_type: addonType,
    })

    return { data, error }
  },

  async cancelSubscription() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profileData } = await supabase
      .from('profiles')
      .select('subscription_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profileData?.subscription_id) {
      return { error: new Error('Subscription not found') }
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .update({ subscription_status: 'cancelled' as Subscription['subscription_status'] })
      .eq('id', profileData.subscription_id)
      .select()
      .single<Subscription>()

    return { data, error }
  },
}

