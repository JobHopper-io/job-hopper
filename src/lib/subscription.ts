/**
 * Subscription utility functions AND the subscription API for DB operations.
 * Stripe is source of truth; subscription entitlements are derived from subscriptions + products + subscription_product rows.
 */

import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionProduct,
  Product,
  TrialGrant,
} from '@/types/database'
import { supabase } from '@/lib/supabase'

// Keyed by string (not Record<SubscriptionStatus>) so the `past_due` label is
// present before the generated enum in src/types/supabase.ts is regenerated to
// include it. getStatusLabel falls back to DEFAULT_STATUS_LABEL for anything
// unknown, so this stays safe either way.
const STATUS_LABELS: Record<string, string> = {
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Cancelled',
}

const DEFAULT_STATUS_LABEL = '—'

export function getStatusLabel(status?: SubscriptionStatus | null): string {
  if (!status) return DEFAULT_STATUS_LABEL
  return STATUS_LABELS[status] ?? DEFAULT_STATUS_LABEL
}

export function getProductPrice(basePlan: Product | null | undefined): number {
  if (!basePlan) return 0
  return basePlan.price_cents / 100
}

/** Display name plus price suffix for a product line (e.g. billing add-on list). */
export function formatProductLineLabel(product: Product): string {
  const base = product.display_name
  const price = getProductPrice(product)
  if (
    product.category === 'one_time_addon' ||
    product.category === 'one_time_item'
  ) {
    return `${base} ($${price.toFixed(2)} one-time)`
  }
  return `${base} (+$${price}/month)`
}

const productColumns =
  'id, key, display_name, description, category, price_cents, available_for_purchase, stripe_product_id'

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'

/**
 * Billing cycle options for the plan pickers. Discounts MUST match CYCLE_CONFIG in
 * supabase/functions/_shared/billing-cycles.ts — the edge function charges the
 * server-computed amount and it has to equal what we display here.
 */
export const BILLING_CYCLES: {
  value: BillingCycle
  label: string
  discountPct: number
  months: number
}[] = [
  { value: 'monthly', label: 'Monthly', discountPct: 0, months: 1 },
  { value: 'quarterly', label: 'Quarterly', discountPct: 10, months: 3 },
  { value: 'yearly', label: 'Yearly', discountPct: 20, months: 12 },
]

function cycleMeta(cycle: BillingCycle) {
  return BILLING_CYCLES.find((c) => c.value === cycle) ?? BILLING_CYCLES[0]
}

/** Discounted monthly-equivalent price (dollars) shown as the big "/month" figure. */
export function cycleMonthlyPrice(monthlyDollars: number, cycle: BillingCycle): number {
  return monthlyDollars * (1 - cycleMeta(cycle).discountPct / 100)
}

/** Total charged per billing period (dollars) — matches the edge function's cyclePeriodAmountCents. */
export function cyclePeriodTotal(monthlyDollars: number, cycle: BillingCycle): number {
  return cycleMonthlyPrice(monthlyDollars, cycle) * cycleMeta(cycle).months
}

/** "Billed monthly" / "Billed quarterly ($80.97 every 3 months)" / "Billed yearly ($287.90/year)". */
export function cycleBillingNote(monthlyDollars: number, cycle: BillingCycle): string {
  if (cycle === 'monthly') return 'Billed monthly'
  const total = cyclePeriodTotal(monthlyDollars, cycle).toFixed(2)
  return cycle === 'quarterly'
    ? `Billed quarterly ($${total} every 3 months)`
    : `Billed yearly ($${total}/year)`
}

export interface CreateCheckoutSessionOptions {
  trialEnd?: number
  /** For per-job resume advice; passed to Stripe session metadata and webhook. */
  jobMatchId?: string
  /** Base-plan billing cycle. Defaults to monthly on the server when omitted. */
  billingCycle?: BillingCycle
}

export const subscriptionAPI = {
  /**
   * Set the user's subscription to exactly the given product IDs (one base plan + optional add-ons).
   * Stripe subscription is updated in place; webhook syncs Supabase.
   */
  async modifySubscription(productIds: string[]) {
    const { data, error } = await supabase.functions.invoke('modify-subscription', {
      body: { productIds },
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  async createCheckoutSession(
    productIds: string[],
    successUrl?: string,
    cancelUrl?: string,
    options?: CreateCheckoutSessionOptions,
  ) {
    const body: {
      productIds: string[]
      successUrl?: string
      cancelUrl?: string
      trialEnd?: number
      jobMatchId?: string
      billingCycle?: BillingCycle
    } = {
      productIds,
      successUrl:
        successUrl ?? `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl ?? `${window.location.origin}/billing`,
    }
    if (typeof options?.trialEnd === 'number' && options.trialEnd > 0) {
      body.trialEnd = options.trialEnd
    }
    if (typeof options?.jobMatchId === 'string' && options.jobMatchId) {
      body.jobMatchId = options.jobMatchId
    }
    if (options?.billingCycle && options.billingCycle !== 'monthly') {
      body.billingCycle = options.billingCycle
    }

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body,
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  /**
   * Subscription bundle add-ons: recurring add-ons and one-time add-ons (e.g. resume upgrade).
   * Excludes `one_time_item` products such as `per_job_resume_advice` (load via `resumeProductsAPI.getResumeAdviceProduct()`).
   */
  async getAddonProducts(): Promise<{ data: Product[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .in('category', ['subscription_addon', 'one_time_addon'])
      .eq('available_for_purchase', true)
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data ?? [], error: null }
  },

  /**
   * TEMP (Free tier removed): true when the profile has a trial or active subscription.
   * Used by the router guard to force onboarded, non-subscribed users into /choose-plan.
   */
  async hasActiveOrTrialSubscription(
    profileId: string,
  ): Promise<{ data: boolean; error: Error | null }> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('profile_id', profileId)
      .in('status', ['trial', 'active'])
      .limit(1)
    if (error) return { data: false, error: new Error(error.message) }
    return { data: (data?.length ?? 0) > 0, error: null }
  },

  async getBasePlanProducts(): Promise<{ data: Product[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('category', 'base_plan')
      .eq('available_for_purchase', true)
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data ?? [], error: null }
  },

  /**
   * Fetch a single base-plan product by key, regardless of `available_for_purchase`.
   * Used to render a not-yet-sellable tier (e.g. Premium) as a locked "coming soon" card.
   */
  async getBasePlanByKey(
    key: string,
  ): Promise<{ data: Product | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('category', 'base_plan')
      .eq('key', key)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data ?? null, error: null }
  },

  /** The caller's own linked trial grant (RLS scopes this to profiles.trial_grant_id). */
  async getTrialGrant(trialGrantId: string): Promise<{ data: TrialGrant | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('trial_grants')
      .select('*')
      .eq('id', trialGrantId)
      .maybeSingle()

    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
  },

  /**
   * All `products.key` values for base plans (including not currently for sale), for admin UI and matching hints.
   */
  async listBasePlanProductKeys(): Promise<{ data: string[]; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select('key')
      .eq('category', 'base_plan')
      .order('key')

    if (error) {
      return { data: [], error: new Error(error.message) }
    }

    const keys = (data ?? [])
      .map((row) => row.key)
      .filter((k): k is string => typeof k === 'string' && k.length > 0)

    return { data: keys, error: null }
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

  async getProfileSubscriptionData(): Promise<{
    data: {
      subscriptions: Subscription[]
      products: Product[]
      subscriptionProducts: SubscriptionProduct[]
    } | null
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
      .maybeSingle()

    if (profileError || !profile) {
      return { data: null, error: profileError ? new Error(profileError.message) : null }
    }

    const { data: subRows, error: subError } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, profile_id, status, current_period_ends_at')
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])
      .order('current_period_ends_at', { ascending: false })

    if (subError) {
      return { data: null, error: new Error(subError.message) }
    }

    const subscriptions = subRows ?? []

    const { data: subscriptionProductRows, error: subProdError } = await supabase
      .from('subscription_product')
      .select('id, subscription_id, product_id, stripe_subscription_item_id')
      .in(
        'subscription_id',
        subscriptions.map((s) => s.id),
      )

    if (subProdError) {
      return { data: null, error: new Error(subProdError.message) }
    }

    const subscriptionProducts = subscriptionProductRows ?? []

    const productIdsFromSubs = new Set<string>(
      subscriptionProducts.map((sp) => sp.product_id),
    )

    const { data: resumeProductRows } = await supabase
      .from('resume_products')
      .select('product_id')
      .eq('profile_id', profile.id)
    const resumeProductIds = new Set<string>(
      (resumeProductRows ?? []).map((r) => r.product_id),
    )

    const allProductIds = Array.from(
      new Set<string>([...productIdsFromSubs, ...resumeProductIds]),
    )

    let products: Product[] = []
    if (allProductIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select(productColumns)
        .in('id', allProductIds)

      if (productError) {
        return { data: null, error: new Error(productError.message) }
      }

      products = productRows ?? []
    }

    return {
      data: {
        subscriptions,
        products,
        subscriptionProducts,
      },
      error: null,
    }
  },

  /**
   * Career-level tier key(s) for a profile, read from `profiles.career_level` (matches
   * job_hopper_live.subscription_tier). Single source of truth for matching; NOT derived
   * from the base plan the user bought. Returns `[]` when career level is unset.
   */
  async getCareerLevelTierKeysForProfile(
    profileId: string,
  ): Promise<{ data: string[]; error: Error | null }> {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('career_level')
      .eq('id', profileId)
      .maybeSingle()

    if (error) {
      return { data: [], error: new Error(error.message) }
    }
    return { data: profile?.career_level ? [profile.career_level] : [], error: null }
  },

}
