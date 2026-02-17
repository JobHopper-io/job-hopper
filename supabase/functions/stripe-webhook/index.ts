import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        // Get subscription ID from metadata
        const subscriptionId = session.metadata?.subscription_id
        const userId = session.metadata?.user_id
        const tier = session.metadata?.tier
        const addons = session.metadata?.addons ? JSON.parse(session.metadata.addons) : {}

        if (!subscriptionId || !userId) {
          console.error('Missing metadata in checkout session')
          break
        }

        // Update subscription status
        const updates: {
          subscription_status: string
          stripe_subscription_id: string | null
          stripe_subscription_status: string
          subscription_tier?: string
          premium_insights_enabled?: boolean
          interview_prep_enabled?: boolean
          resume_upgrade_purchased?: boolean
        } = {
          subscription_status: 'active',
          stripe_subscription_id: (session.subscription as string) ?? null,
          stripe_subscription_status: session.payment_status ?? 'unknown',
        }

        if (tier) {
          updates.subscription_tier = tier
        }

        // Update addon flags
        if (addons.premium_insights) {
          updates.premium_insights_enabled = true
        }
        if (addons.interview_prep) {
          updates.interview_prep_enabled = true
        }
        if (addons.resume_upgrade) {
          updates.resume_upgrade_purchased = true
        }

        await supabaseAdmin
          .from('subscriptions')
          .update(updates)
          .eq('id', subscriptionId)

        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        
        // Find subscription by Stripe subscription ID
        const { data: orgData } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (orgData) {
          const updates: {
            stripe_subscription_status: string
            current_period_start: string
            current_period_end: string
            subscription_status?: string
          } = {
            stripe_subscription_status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }

          if (event.type === 'customer.subscription.deleted' || subscription.status === 'canceled') {
            updates.subscription_status = 'cancelled'
          }

          await supabaseAdmin
            .from('subscriptions')
            .update(updates)
            .eq('id', orgData.id)
        }

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          const { data: orgData } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single()

          if (orgData) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                subscription_status: 'active',
                stripe_subscription_status: 'active',
                current_period_start: new Date(invoice.period_start * 1000).toISOString(),
                current_period_end: new Date(invoice.period_end * 1000).toISOString(),
              })
              .eq('id', orgData.id)
          }
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          const { data: orgData } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single()

          if (orgData) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                stripe_subscription_status: 'past_due',
              })
              .eq('id', orgData.id)
          }
        }

        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

