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

const defaultSiteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'

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
      .select('id, email, first_name, last_name, stripe_customer_id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      throw new Error('User not found')
    }

    let customerId = profile.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || undefined,
        metadata: {
          supabase_user_id: user.id,
          supabase_profile_id: profile.id,
        },
      })
      customerId = customer.id

      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', profile.id)

      if (updateError) {
        console.error('Failed to update profile.stripe_customer_id:', updateError)
      }
    }

    const { productIds = [], successUrl, cancelUrl, trialEnd, jobMatchId } = await req.json()

    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('productIds must be a non-empty array')
    }

    const { data: products, error: productsError } = await supabaseClient
      .from('products')
      .select(
        'id, key, display_name, category, price_cents, stripe_product_id, available_for_purchase',
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

    const tailoringProduct = products.find((p) => p.key === 'resume_tailoring')
    if (
      typeof jobMatchId === 'string' &&
      jobMatchId &&
      tailoringProduct
    ) {
      const { data: existingTailoring } = await supabaseClient
        .from('resume_products')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('job_match_id', jobMatchId)
        .eq('product_id', tailoringProduct.id)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (existingTailoring) {
        throw new Error('You have already purchased resume tailoring for this job.')
      }
    }

    const basePlans = products.filter((p) => p.category === 'base_plan')
    const addons = products.filter((p) => p.category !== 'base_plan')
    if (basePlans.length > 1) {
      throw new Error('You may not purchase more than one base plan.')
    }

    const hasBasePlan = basePlans.length === 1
    const hasAddonsOnly = basePlans.length === 0 && addons.length > 0
    if (!hasBasePlan && !hasAddonsOnly) {
      throw new Error('Must include at least one base plan or at least one addon.')
    }

    const orderedProducts = hasBasePlan ? [basePlans[0], ...addons] : addons

    const stripeProductIdsBySupabaseId = new Map<string, string>()
    await Promise.all(
      orderedProducts.map(async (product) => {
        const stripeProductId = await getStripeProductId(product)
        stripeProductIdsBySupabaseId.set(product.id, stripeProductId)
      }),
    )

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      orderedProducts.map((product) => {
        const stripeProductId = stripeProductIdsBySupabaseId.get(product.id)
        if (!stripeProductId) {
          throw new Error(`Missing Stripe product id for product ${product.id}`)
        }

        const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
          currency: 'usd',
          unit_amount: product.price_cents,
          product: stripeProductId,
        }

        if (
          product.category === 'base_plan' ||
          product.category === 'subscription_addon'
        ) {
          priceData.recurring = { interval: 'month' }
        }

        return {
          price_data: priceData,
          quantity: 1,
        }
      })

    const hasRecurringProduct = orderedProducts.some(
      (p) => p.category === 'base_plan' || p.category === 'subscription_addon',
    )

    let session: Stripe.Checkout.Session

    if (hasRecurringProduct) {
      const subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] =
        {
          metadata: {
            profile_id: profile.id,
          },
        }
      if (typeof trialEnd === 'number' && trialEnd > 0) {
        subscriptionData.trial_end = trialEnd
      } else if (hasBasePlan) {
        subscriptionData.trial_period_days = 7
      }

      const metadata: Record<string, string> = { profile_id: profile.id }
      if (typeof jobMatchId === 'string' && jobMatchId) metadata.job_match_id = jobMatchId
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription',
        success_url:
          successUrl || `${defaultSiteUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${defaultSiteUrl}/billing`,
        metadata,
        subscription_data: subscriptionData,
      })
    } else {
      const metadata: Record<string, string> = { profile_id: profile.id }
      if (typeof jobMatchId === 'string' && jobMatchId) metadata.job_match_id = jobMatchId
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url:
          successUrl || `${defaultSiteUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${defaultSiteUrl}/billing`,
        metadata,
      })
    }

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
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
