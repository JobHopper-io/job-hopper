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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Get user's subscription
    const { data: userData, error: userError } = await supabaseClient
      .from('profiles')
      .select('subscription_id, email, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !userData) {
      throw new Error('User not found')
    }

    // Get subscription details
    const { data: subscription, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('id', userData.subscription_id)
      .single()

    if (subError || !subscription) {
      throw new Error('Subscription not found')
    }

    // Parse request body
    const { tier, addons, successUrl, cancelUrl } = await req.json()

    // Price mapping (in cents)
    const priceMap: Record<string, number> = {
      entry_mid: 1900, // $19/month
      senior_management: 2900, // $29/month
      director_vp_c_level: 4900, // $49/month
    }

    const basePrice = priceMap[tier]
    
    if (!basePrice) {
      throw new Error('Invalid tier')
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Job-Hopper ${tier === 'entry_mid' ? 'Entry & Mid Level' : tier === 'senior_management' ? 'Senior & Management' : 'Director, VP & C-Level'} Plan`,
          },
          recurring: {
            interval: 'month',
          },
          unit_amount: basePrice,
        },
        quantity: 1,
      },
    ]

    // Add premium addons
    if (addons?.premium_insights) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Premium Insights & Contact Access',
          },
          recurring: {
            interval: 'month',
          },
          unit_amount: 3000, // $30/month
        },
        quantity: 1,
      })
    }

    if (addons?.interview_prep) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Interview Prep & Strategy',
          },
          recurring: {
            interval: 'month',
          },
          unit_amount: 3000, // $30/month
        },
        quantity: 1,
      })
    }

    if (addons?.resume_upgrade) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Resume Upgrade',
          },
          unit_amount: 1995, // $19.95 one-time
        },
        quantity: 1,
      })
    }

    // Create or retrieve Stripe customer
    let customerId = subscription.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: `${userData.first_name} ${userData.last_name}`,
        metadata: {
          supabase_user_id: user.id,
          subscription_id: subscription.id,
        },
      })
      customerId = customer.id

      // Update subscription with customer ID
      await supabaseClient
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('id', subscription.id)
    }

    // Create checkout session
    // Stripe Checkout supports both recurring and one-time line items in subscription mode.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: successUrl || `${Deno.env.get('SITE_URL') || 'http://localhost:5173'}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${Deno.env.get('SITE_URL') || 'http://localhost:5173'}/billing`,
      metadata: {
        user_id: user.id,
        subscription_id: subscription.id,
        tier,
        addons: JSON.stringify(addons || {}),
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
          subscription_id: subscription.id,
          tier,
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

