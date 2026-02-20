/**
 * Subscription data structures and display helpers.
 * New schema: Stripe is source of truth; tier and addons derived from products (subscription_product + profile_product).
 */

import type {
  SubscriptionTier,
  SubscriptionStatus,
  AddonType,
  CurrentSubscription,
  Addon,
} from '@/types/database'
import { supabase } from '@/lib/supabase'

const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  entry_mid: 'Entry & Mid Level Roles',
  senior_management: 'Senior & Management Level Roles',
  director_vp_c_level: 'Director, VP & C-Level Roles',
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Free trial',
  active: 'Active',
  canceled: 'Cancelled',
}

const TIER_PRICES: Record<SubscriptionTier, number> = {
  entry_mid: 19,
  senior_management: 29,
  director_vp_c_level: 49,
}

/** Add-on labels with price (for billing detail when not using product.display_name). */
const ADDON_DISPLAY_WITH_PRICE: Record<AddonType, string> = {
  premium_insights: 'Premium Insights & Contact Access (+$30/month)',
  interview_prep: 'Interview Prep & Strategy (+$30/month)',
  resume_upgrade: 'Resume Upgrade (one-time purchase)',
}

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

export function getActiveAddons(
  current: CurrentSubscription | null | undefined,
  withPrice = false
): Addon[] {
  if (!current?.addons?.length) return []
  if (!withPrice) return current.addons
  return current.addons.map((a) => {
    const withPriceLabel = ADDON_DISPLAY_WITH_PRICE[a.key as AddonType]
    return { key: a.key, label: withPriceLabel ?? a.label }
  })
}

/** Whether the user has a given addon by product key (e.g. premium_insights, interview_prep, resume_upgrade). */
export function hasAddonByKey(current: CurrentSubscription | null | undefined, addonKey: string): boolean {
  if (!current?.addons) return false
  return current.addons.some((a) => a.key === addonKey)
}

export const subscriptionAPI = {
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
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        tier,
        addons: addons ?? {},
        successUrl:
          successUrl ?? `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl ?? `${window.location.origin}/billing`,
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
        returnUrl: returnUrl ?? `${window.location.origin}/billing`,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async getCurrentSubscription(): Promise<{
    data: CurrentSubscription | null
    error: Error | null
  }> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      return { data: null, error: profileError ? new Error(profileError.message) : null }
    }

    const { data: subRow, error: subError } = await supabase
      .from('subscription')
      .select('id, stripe_subscription_id, profile_id, subscription_status, current_period_ends_at')
      .eq('profile_id', profile.id)
      .in('subscription_status', ['trial', 'active'])
      .order('current_period_ends_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      return { data: null, error: new Error(subError.message) }
    }

    const productMap = new Map<
      string,
      { id: string; stripe_product_id: string; key: string; display_name: string; is_addon: boolean }
    >()

    if (subRow) {
      const { data: subProducts } = await supabase
        .from('subscription_product')
        .select('product_id')
        .eq('subscription_id', subRow.id)
      const productIds = (subProducts ?? []).map((r) => r.product_id)
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, stripe_product_id, key, display_name, is_addon')
          .in('id', productIds)
        for (const p of products ?? []) {
          productMap.set(p.id, {
            id: p.id,
            stripe_product_id: p.stripe_product_id,
            key: p.key,
            display_name: p.display_name,
            is_addon: p.is_addon,
          })
        }
      }
    }

    const { data: profileProducts } = await supabase
      .from('profile_product')
      .select('product_id')
      .eq('profile_id', profile.id)
    const profileProductIds = (profileProducts ?? []).map((r) => r.product_id)
    if (profileProductIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, stripe_product_id, key, display_name, is_addon')
        .in('id', profileProductIds)
      for (const p of products ?? []) {
        productMap.set(p.id, {
          id: p.id,
          stripe_product_id: p.stripe_product_id,
          key: p.key,
          display_name: p.display_name,
          is_addon: p.is_addon,
        })
      }
    }

    const products = Array.from(productMap.values())
    const baseProduct = products.find((p) => !p.is_addon)
    const tier = baseProduct?.key ?? null
    const addons: Addon[] = products
      .filter((p) => p.is_addon)
      .map((p) => ({ key: p.key, label: p.display_name }))

    const subscription = subRow
      ? {
          id: subRow.id,
          stripe_subscription_id: subRow.stripe_subscription_id,
          profile_id: subRow.profile_id,
          subscription_status: subRow.subscription_status,
          current_period_ends_at: subRow.current_period_ends_at,
        }
      : null

    const trialEndsAt =
      subscription?.subscription_status === 'trial' ? subscription.current_period_ends_at : null

    return {
      data: {
        subscription,
        products,
        tier,
        addons,
        trialEndsAt,
      },
      error: null,
    }
  },
}
