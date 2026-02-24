import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
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
      }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, stripe_customer_id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      throw new Error('User not found')
    }

    const { productIds = [] } = await req.json()

    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('productIds must be a non-empty array')
    }

    // Load requested addon products
    const { data: products, error: productsError } = await supabaseClient
      .from('products')
      .select('id, display_name, is_addon, price_cents, type, stripe_product_id')
      .in('id', productIds)

    if (productsError || !products?.length) {
      throw new Error('Products not found')
    }

    if (products.length !== productIds.length) {
      throw new Error('Some product ids are invalid')
    }

    const invalid = products.filter(
      (p) => !p.is_addon || p.type !== 'subscription',
    )
    if (invalid.length > 0) {
      throw new Error('All products must be subscription add-ons')
    }

    // Find primary active/trial subscription for this profile
    const { data: subscriptions, error: subsError } = await supabaseClient
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, profile_id')
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      throw new Error('No active subscription found; Purchase a base plan first.')
    }

    let primarySubscription = subscriptions[0]

    if (subscriptions.length > 1) {
      // Prefer subscription that has a base (non-addon) product
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
          .select('id, is_addon')
          .in('id', productIdsInSubs)

      if (productsForSubsError) {
        throw new Error(productsForSubsError.message)
      }

      const productIsAddon = new Map(
        (productsForSubs ?? []).map((p) => [p.id, p.is_addon] as const),
      )

      const subHasBasePlan = new Set(
        (subProducts ?? [])
          .filter((sp) => productIsAddon.get(sp.product_id) === false)
          .map((sp) => sp.subscription_id),
      )

      const withBasePlan = subscriptions.find((s) => subHasBasePlan.has(s.id))
      if (withBasePlan) {
        primarySubscription = withBasePlan
      }
    }

    const stripeSubscriptionId = primarySubscription.stripe_subscription_id

    const stripeSubscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ['items.data.price.product'] },
    )

    const existingStripeProductIds = new Set<string>()
    for (const item of stripeSubscription.items.data) {
      const price = item.price
      if (!price) continue
      const product = price.product
      if (typeof product === 'string') {
        existingStripeProductIds.add(product)
      } else if (product && typeof product.id === 'string') {
        existingStripeProductIds.add(product.id)
      }
    }

    const productsWithStripeIds = await Promise.all(
      products.map(async (product) => {
        const stripeProductId = await getStripeProductId(
          supabaseClient,
          product,
        )
        return { ...product, stripeProductId }
      }),
    )

    const productsToAdd = productsWithStripeIds.filter(
      (p) => !existingStripeProductIds.has(p.stripeProductId),
    )
    if (productsToAdd.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No new add-ons to add.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    for (const product of productsToAdd) {
      await stripe.subscriptionItems.create({
        subscription: stripeSubscriptionId,
        price_data: {
          currency: 'usd',
          unit_amount: product.price_cents,
          recurring: { interval: 'month' },
          product: product.stripeProductId,
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

