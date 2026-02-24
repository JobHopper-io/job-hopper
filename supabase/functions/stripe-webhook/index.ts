import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const METADATA_PRODUCT_ID = 'supabase_product_id'

function mapStripeStatus(stripeStatus: string): 'trial' | 'active' | 'canceled' {
  if (stripeStatus === 'trialing') return 'trial'
  if (stripeStatus === 'active' || stripeStatus === 'past_due') return 'active'
  return 'canceled'
}

function getOurProductId(stripeProduct: Stripe.Product | string): string | null {
  const product = stripeProduct
  if (typeof product === 'string') return null
  const id = product.metadata?.[METADATA_PRODUCT_ID]
  return typeof id === 'string' && id.length > 0 ? id : null
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const profileId = session.metadata?.profile_id
        if (!profileId) {
          console.error('checkout.session.completed: missing profile_id in metadata')
          break
        }

        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        if (customerId) {
          const { error: profileUpdateError } = await supabaseAdmin
            .from('profiles')
            .update({
              stripe_customer_id: customerId,
              onboarding_completed: true,
            })
            .eq('id', profileId)
          if (profileUpdateError) {
            console.error('Failed to update profile stripe_customer_id/onboarding_completed:', profileUpdateError)
          }
        }

        if (session.subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items.data.price.product'] }
          )

          const subscriptionStatus = mapStripeStatus(stripeSubscription.status)
          const currentPeriodEnd = stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
            : null

          const { data: subRow, error: subInsertError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
              stripe_subscription_id: stripeSubscription.id,
              profile_id: profileId,
              status: subscriptionStatus,
              current_period_ends_at: currentPeriodEnd,
            })
            .select('id')
            .single()

          if (subInsertError) {
            console.error('Failed to insert subscription:', subInsertError)
            break
          }

          const subscriptionId = subRow.id

          for (const item of stripeSubscription.items.data) {
            const product = item.price?.product as Stripe.Product | string
            const productId = getOurProductId(product)
            if (!productId) {
              console.error('checkout.session.completed: missing supabase_product_id in product metadata, skipping item')
              continue
            }
            await supabaseAdmin
              .from('subscription_product')
              .upsert(
                {
                  subscription_id: subscriptionId,
                  product_id: productId,
                  stripe_subscription_item_id: item.id,
                },
                { onConflict: 'subscription_id,product_id' }
              )
          }
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product'],
        })

        for (const line of lineItems.data) {
          const price = line.price
          if (!price) continue
          if (price.recurring != null) continue
          const product = price.product as Stripe.Product | string
          const productId = getOurProductId(product)
          if (!productId) {
            console.error('checkout.session.completed: one-time line missing supabase_product_id, skipping')
            continue
          }
          await supabaseAdmin
            .from('profile_product')
            .upsert(
              { profile_id: profileId, product_id: productId },
              { onConflict: 'profile_id,product_id' }
            )
        }
        break
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const expanded = await stripe.subscriptions.retrieve(stripeSub.id, {
          expand: ['items.data.price.product'],
        })

        const { data: existingSub } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('stripe_subscription_id', stripeSub.id)
          .single()

        if (!existingSub) break

        const subscriptionStatus = mapStripeStatus(expanded.status)
        const currentPeriodEnd = expanded.current_period_end
          ? new Date(expanded.current_period_end * 1000).toISOString()
          : null

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscriptionStatus,
            current_period_ends_at: currentPeriodEnd,
          })
          .eq('id', existingSub.id)

        const productIdsInStripe: string[] = []
        for (const item of expanded.items.data) {
          const product = item.price?.product as Stripe.Product | string
          const productId = getOurProductId(product)
          if (!productId) continue
          productIdsInStripe.push(productId)
          await supabaseAdmin
            .from('subscription_product')
            .upsert(
              {
                subscription_id: existingSub.id,
                product_id: productId,
                stripe_subscription_item_id: item.id,
              },
              { onConflict: 'subscription_id,product_id' }
            )
        }

        const { data: currentSubProducts } = await supabaseAdmin
          .from('subscription_product')
          .select('product_id')
          .eq('subscription_id', existingSub.id)
        const toRemove = (currentSubProducts ?? []).filter((r) => !productIdsInStripe.includes(r.product_id))
        for (const row of toRemove) {
          await supabaseAdmin
            .from('subscription_product')
            .delete()
            .eq('subscription_id', existingSub.id)
            .eq('product_id', row.product_id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', stripeSub.id)
        break
      }

      default:
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
