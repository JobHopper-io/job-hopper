/**
 * Subscription utility functions AND the subscription API for DB operations.
 * Stripe is source of truth; subscription entitlements are derived from subscriptions + products + subscription_product rows.
 */

import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionProduct,
  Product,
} from '@/types/database'
import { supabase } from '@/lib/supabase'

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Free trial',
  active: 'Active',
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
  if (product.type === 'payment') {
    return `${base} ($${price.toFixed(2)} one-time)`
  }
  return `${base} (+$${price}/month)`
}

const productColumns = 'id, key, display_name, description, is_addon, price_cents, type'

export interface CreateCheckoutSessionOptions {
  trialEnd?: number
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
    } = {
      productIds,
      successUrl:
        successUrl ?? `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl ?? `${window.location.origin}/billing`,
    }
    if (typeof options?.trialEnd === 'number' && options.trialEnd > 0) {
      body.trialEnd = options.trialEnd
    }

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body,
    })

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  },

  /** Fetch products where is_addon = true */
  async getAddonProducts(): Promise<{ data: Product[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('is_addon', true)
    if (error) return { data: null, error: new Error(error.message) }
    return { data: (data ?? []) as Product[], error: null }
  },

  async getBasePlanProducts(): Promise<{ data: Product[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('is_addon', false)
    if (error) return { data: null, error: new Error(error.message) }
    return { data: (data ?? []) as Product[], error: null }
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
      .single()

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

    const subscriptions: Subscription[] = (subRows ?? []) as Subscription[]

    const { data: subscriptionProductRows, error: subProdError } = await supabase
      .from('subscription_product')
      .select('id, subscription_id, product_id')
      .in(
        'subscription_id',
        subscriptions.map((s) => s.id),
      )

    if (subProdError) {
      return { data: null, error: new Error(subProdError.message) }
    }

    const subscriptionProducts: SubscriptionProduct[] =
      (subscriptionProductRows ?? []) as SubscriptionProduct[]

    const productIdsFromSubs = new Set<string>(
      subscriptionProducts.map((sp) => sp.product_id),
    )

    const { data: profileProducts } = await supabase
      .from('profile_product')
      .select('product_id')
      .eq('profile_id', profile.id)
    const profileProductIds = new Set<string>(
      (profileProducts ?? []).map((r) => r.product_id),
    )

    const allProductIds = Array.from(
      new Set<string>([...productIdsFromSubs, ...profileProductIds]),
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

      products = (productRows ?? []) as Product[]
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
}
