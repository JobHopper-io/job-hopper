import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import Stripe from 'npm:stripe@14.21.0'
import { getStripeProductId } from '../_shared/stripe-products.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      throw new Error('User not found')
    }

    const { productIds = [] } = await req.json()

    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('productIds must be a non-empty array')
    }

    const { data: products, error: productsError } = await supabaseClient
      .from('products')
      .select(
        'id, category, price_cents, stripe_product_id, display_name, available_for_purchase',
      )
      .in('id', productIds)

    if (productsError || !products?.length) {
      throw new Error('Products not found')
    }

    if (products.length !== productIds.length) {
      throw new Error('Some product ids are invalid')
    }

    if (products.some((p) => p.available_for_purchase === false)) {
      throw new Error('One or more selected products are not available for purchase.')
    }

    const invalidType = products.filter(
      (p) => p.category !== 'base_plan' && p.category !== 'subscription_addon',
    )
    if (invalidType.length > 0) {
      throw new Error('All products must be subscription products')
    }

    const basePlans = products.filter((p) => p.category === 'base_plan')
    if (basePlans.length === 0) {
      throw new Error('At least one base plan is required')
    }
    if (basePlans.length > 1) {
      throw new Error('You may not attach more than one base plan')
    }

    const { data: subscriptions, error: subsError } = await supabaseClient
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, profile_id')
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      throw new Error('No active subscription found; purchase a base plan first.')
    }

    let primarySubscription = subscriptions[0]

    if (subscriptions.length > 1) {
      const subIds = subscriptions.map((s) => s.id)

      const { data: subProducts, error: subProdError } = await supabaseClient
        .from('subscription_product')
        .select('subscription_id, product_id')
        .in('subscription_id', subIds)

      if (subProdError) {
        throw new Error(subProdError.message)
      }

      const productIdsInSubs = Array.from(
        new Set((subProducts ?? []).map((sp) => sp.product_id)),
      )

      const { data: productsForSubs, error: productsForSubsError } =
        await supabaseClient
          .from('products')
          .select('id, category')
          .in('id', productIdsInSubs)

      if (productsForSubsError) {
        throw new Error(productsForSubsError.message)
      }

      const productCategoryById = new Map(
        (productsForSubs ?? []).map((p) => [p.id, p.category] as const),
      )

      const subHasBasePlan = new Set(
        (subProducts ?? [])
          .filter((sp) => productCategoryById.get(sp.product_id) === 'base_plan')
          .map((sp) => sp.subscription_id),
      )

      const withBasePlan = subscriptions.find((s) => subHasBasePlan.has(s.id))
      if (withBasePlan) {
        primarySubscription = withBasePlan
      }
    }

    const stripeSubscriptionId = primarySubscription.stripe_subscription_id
    if (!stripeSubscriptionId) {
      throw new Error('Subscription is missing Stripe subscription id')
    }

    // Resolve Stripe product ids for all desired products and keep lookup maps
    const desiredStripeProductIds: string[] = []
    const productByStripeProductId = new Map<string, (typeof products)[number]>()
    const stripeProductIdBySupabaseId = new Map<string, string>()

    for (const product of products) {
      const stripeProductId = await getStripeProductId(product)
      desiredStripeProductIds.push(stripeProductId)
      productByStripeProductId.set(stripeProductId, product)
      stripeProductIdBySupabaseId.set(product.id, stripeProductId)
    }

    const desiredStripeProductIdSet = new Set(desiredStripeProductIds)

    const desiredBaseProduct = basePlans[0]
    const desiredBaseStripeProductId = stripeProductIdBySupabaseId.get(
      desiredBaseProduct.id,
    )
    if (!desiredBaseStripeProductId) {
      throw new Error('Failed to resolve Stripe product id for base plan')
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ['items.data.price.product'] },
    )

    const existingItems = stripeSubscription.items.data
    const existingStripeProductIdsByItemId = new Map<string, string>()

    for (const item of existingItems) {
      const price = item.price
      if (!price) continue
      const product = price.product
      let stripeProductId: string | null = null
      if (typeof product === 'string') {
        stripeProductId = product
      } else if (product && typeof product.id === 'string') {
        stripeProductId = product.id
      }
      if (!stripeProductId) continue
      existingStripeProductIdsByItemId.set(item.id, stripeProductId)
    }

    // Determine which items to keep vs. remove, and which desired products still need adding
    const desiredStripeProductIdsToAdd = new Set(desiredStripeProductIds)
    const removableItemIds: string[] = []

    for (const item of existingItems) {
      const stripeProductId = existingStripeProductIdsByItemId.get(item.id)
      if (!stripeProductId) continue

      if (desiredStripeProductIdSet.has(stripeProductId)) {
        // Already a desired product on the subscription: keep it and don't re-add later
        desiredStripeProductIdsToAdd.delete(stripeProductId)
      } else {
        // Not desired according to the requested productIds: candidate for removal
        removableItemIds.push(item.id)
      }
    }

    // Special case: subscription currently has a single item which is not in the desired set.
    // Instead of deleting the last item (which Stripe rejects), update it in-place to the desired base plan.
    if (existingItems.length === 1 && removableItemIds.length === 1) {
      const singleItemId = removableItemIds[0]
      const singleStripeProductId = existingStripeProductIdsByItemId.get(singleItemId)

      if (singleStripeProductId && singleStripeProductId !== desiredBaseStripeProductId) {
        await stripe.subscriptionItems.update(singleItemId, {
          price_data: {
            currency: 'usd',
            unit_amount: desiredBaseProduct.price_cents,
            recurring: { interval: 'month' },
            product: desiredBaseStripeProductId,
          },
          proration_behavior: 'create_prorations',
        })

        // Base plan now satisfied by the updated item; do not delete it or re-add it.
        desiredStripeProductIdsToAdd.delete(desiredBaseStripeProductId)
        removableItemIds.length = 0
      }
    }

    // Remove any remaining undesired items
    for (const itemId of removableItemIds) {
      await stripe.subscriptionItems.del(itemId, {
        proration_behavior: 'create_prorations',
      })
    }

    // Add items for desired Stripe products that are not currently present
    for (const stripeProductId of desiredStripeProductIdsToAdd) {
      const product = productByStripeProductId.get(stripeProductId)
      if (!product) continue

      await stripe.subscriptionItems.create({
        subscription: stripeSubscriptionId,
        price_data: {
          currency: 'usd',
          unit_amount: product.price_cents,
          recurring: { interval: 'month' },
          product: stripeProductId,
        },
        proration_behavior: 'create_prorations',
      })
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

