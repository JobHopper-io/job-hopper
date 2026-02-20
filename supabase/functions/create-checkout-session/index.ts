import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

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

    const { tier, addons = {}, successUrl, cancelUrl } = await req.json()

    const priceMap: Record<string, number> = {
      entry_mid: 1900,
      senior_management: 2900,
      director_vp_c_level: 4900,
    }
    const basePrice = priceMap[tier]
    if (!basePrice) {
      throw new Error('Invalid tier')
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Job-Hopper ${tier === 'entry_mid' ? 'Entry & Mid Level' : tier === 'senior_management' ? 'Senior & Management' : 'Director, VP & C-Level'} Plan`,
          },
          recurring: { interval: 'month' },
          unit_amount: basePrice,
        },
        quantity: 1,
      },
    ]

    if (addons.premium_insights) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Premium Insights & Contact Access' },
          recurring: { interval: 'month' },
          unit_amount: 3000,
        },
        quantity: 1,
      })
    }
    if (addons.interview_prep) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Interview Prep & Strategy' },
          recurring: { interval: 'month' },
          unit_amount: 3000,
        },
        quantity: 1,
      })
    }
    if (addons.resume_upgrade) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Resume Upgrade' },
          unit_amount: 1995,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: successUrl || `${defaultSiteUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${defaultSiteUrl}/billing`,
      metadata: {
        profile_id: profile.id,
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          profile_id: profile.id,
        },
      },
    })

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
