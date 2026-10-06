import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import Stripe from 'npm:stripe@14.21.0'
import { sendEmail } from '../_shared/email.ts'
import {
  renderSubscriptionStarted,
  renderSubscriptionUpdated,
  renderSubscriptionPaymentFailed,
  renderSubscriptionCancelScheduled,
  renderSubscriptionCanceled,
} from '../_shared/email-templates.ts'
import { getFooterLinksForProfile } from '../_shared/unsubscribe-token.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
const cryptoProvider = Stripe.createSubtleCryptoProvider()

/** Grep-friendly prefix for all webhook logs. */
const LOG_PREFIX = '[stripe-webhook]'

/** Throws on a failed DB call so the handler returns 5xx and Stripe redelivers the event. */
function assertOk(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

function mapStripeStatus(stripeStatus: string): 'trial' | 'active' | 'past_due' | 'canceled' {
  if (stripeStatus === 'trialing') return 'trial'
  if (stripeStatus === 'active') return 'active'
  // A failed payment (incl. a trial that ends and the card is declined) lands in
  // `past_due`. It must NOT be treated as `active` — that would grant paid access
  // for free. `past_due` is non-entitling everywhere ('trial'/'active' whitelist).
  if (stripeStatus === 'past_due') return 'past_due'
  return 'canceled'
}

type SupabaseAdmin = ReturnType<typeof createClient>

const FREEMIUM_TIER_KEYS = new Set(['entry_mid', 'senior_management', 'director_vp_c_level'])

async function upsertFreemiumUsageForCheckout(
  supabaseAdmin: SupabaseAdmin,
  profileId: string,
) {
  const [{ data: existing }, { data: profileRow }] = await Promise.all([
    supabaseAdmin
      .from('freemium_usage')
      .select('selected_tier_key, job_searches_used, resume_advice_used, premium_insights_used')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('career_level')
      .eq('id', profileId)
      .maybeSingle(),
  ])

  // Career level comes from the profile, never from the purchased product. (Under the
  // Free/Core/Premium model the base-plan key no longer encodes a career tier.)
  const careerLevel =
    typeof profileRow?.career_level === 'string' && FREEMIUM_TIER_KEYS.has(profileRow.career_level)
      ? (profileRow.career_level as string)
      : null
  const selectedTierKey =
    careerLevel ?? existing?.selected_tier_key ?? 'entry_mid'

  const { error } = await supabaseAdmin.from('freemium_usage').upsert(
    {
      profile_id: profileId,
      selected_tier_key: selectedTierKey,
      job_searches_used: existing?.job_searches_used ?? 0,
      resume_advice_used: existing?.resume_advice_used ?? 0,
      premium_insights_used: existing?.premium_insights_used ?? 0,
    },
    { onConflict: 'profile_id' },
  )

  if (error) {
    console.error(`${LOG_PREFIX} freemium_usage upsert failed`, { profileId, error })
  } else {
    console.log(`${LOG_PREFIX} freemium_usage upserted`, { profileId, selectedTierKey })
  }
}

async function loadProfileAndCheckSubscriptionEmailAllowed(
  supabaseAdmin: SupabaseAdmin,
  profileId: string
): Promise<{ email: string; firstName: string } | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, first_name')
    .eq('id', profileId)
    .single()
  if (!profile?.email) return null

  const { data: settings } = await supabaseAdmin
    .from('notification_settings')
    .select('subscription_updates_email_enabled, email_unsubscribed_at')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (settings?.email_unsubscribed_at != null) return null
  if (settings?.subscription_updates_email_enabled === false) return null

  return { email: profile.email, firstName: profile.first_name?.trim() || 'there' }
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.warn(`${LOG_PREFIX} missing stripe-signature header`)
    return new Response('No signature', { status: 400 })
  }

  // Set once the signature is verified; the catch uses it to tell a bad request (400)
  // from a processing failure (500, so Stripe retries).
  let verifiedEventId: string | null = null
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )

    verifiedEventId = event.id

    console.log(`${LOG_PREFIX} received`, {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
    })

    // Log every received event so delivery/coverage is answerable from our own DB.
    // outcome: received -> processed | failed for handled types, ignored otherwise.
    // 'handled' is the legacy pre-idempotency value (logged before processing).
    const HANDLED_TYPES = new Set([
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ])

    // Idempotency: Stripe redelivers on timeouts/5xx; never re-run side effects (emails,
    // match scheduling) for an event that already completed.
    // ponytail: two concurrent deliveries of the same event can both pass this check;
    // add a conditional claim (update ... where outcome <> 'processed') if that shows up.
    const { data: priorEvent } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('outcome')
      .eq('id', event.id)
      .maybeSingle()
    if (priorEvent?.outcome === 'processed' || priorEvent?.outcome === 'handled') {
      console.log(`${LOG_PREFIX} duplicate delivery, already processed`, { id: event.id, type: event.type })
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const { error: logError } = await supabaseAdmin
      .from('stripe_webhook_events')
      .upsert(
        {
          id: event.id,
          type: event.type,
          outcome: HANDLED_TYPES.has(event.type) ? 'received' : 'ignored',
          error_message: null,
        },
        { onConflict: 'id' },
      )
    if (logError) {
      console.error(`${LOG_PREFIX} failed to log webhook event`, {
        id: event.id,
        message: logError.message,
      })
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const profileId = session.metadata?.profile_id
        if (!profileId) {
          console.error(
            `${LOG_PREFIX} checkout.session.completed: missing profile_id in metadata`,
            { sessionId: session.id, mode: session.mode },
          )
          break
        }

        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        console.log(`${LOG_PREFIX} checkout.session.completed`, {
          sessionId: session.id,
          profileId,
          mode: session.mode,
          hasSubscription: Boolean(session.subscription),
          hasCustomer: Boolean(customerId),
        })

        if (customerId) {
          const { error: profileUpdateError } = await supabaseAdmin
            .from('profiles')
            .update({
              stripe_customer_id: customerId,
              onboarding_completed: true,
            })
            .eq('id', profileId)
          assertOk(profileUpdateError, 'checkout.session.completed: profile update')
          console.log(`${LOG_PREFIX} profile updated with stripe_customer_id and onboarding_completed`, {
            profileId,
          })
        } else {
          console.warn(`${LOG_PREFIX} checkout.session.completed: no customer id on session`, {
            sessionId: session.id,
            profileId,
          })
        }

        let subscriptionCheckoutInsertSucceeded = false

        if (session.subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items.data.price.product'] },
          )

          const subscriptionStatus = mapStripeStatus(stripeSubscription.status)
          const currentPeriodEnd = stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
            : null

          // Upsert: a retried delivery, or a subscription.updated that arrived first and
          // created the row, must not fail on the stripe_subscription_id unique constraint.
          const { data: subRow, error: subInsertError } = await supabaseAdmin
            .from('subscriptions')
            .upsert(
              {
                stripe_subscription_id: stripeSubscription.id,
                profile_id: profileId,
                status: subscriptionStatus,
                current_period_ends_at: currentPeriodEnd,
              },
              { onConflict: 'stripe_subscription_id' },
            )
            .select('id')
            .single()

          if (subInsertError) {
            throw new Error(`checkout.session.completed: subscriptions upsert: ${subInsertError.message}`)
          } else {
            subscriptionCheckoutInsertSucceeded = true
            const subscriptionId = subRow.id
            console.log(`${LOG_PREFIX} subscription row inserted`, {
              subscriptionId,
              profileId,
              stripeSubscriptionId: stripeSubscription.id,
              status: subscriptionStatus,
            })

            const stripeProductIds = new Set<string>()
            for (const item of stripeSubscription.items.data) {
              const price = item.price
              if (!price) continue
              const product = price.product
              if (typeof product === 'string') {
                stripeProductIds.add(product)
              } else if (product && typeof product.id === 'string') {
                stripeProductIds.add(product.id)
              }
            }

            const stripeProductIdArray = Array.from(stripeProductIds)
            const { data: productsForSub, error: productsForSubError } =
              await supabaseAdmin
                .from('products')
                .select('id, stripe_product_id')
                .in('stripe_product_id', stripeProductIdArray)

            assertOk(productsForSubError, 'checkout.session.completed: load products')

            const productIdByStripeProductId = new Map<string, string>()
            for (const row of productsForSub ?? []) {
              if (row.stripe_product_id) {
                productIdByStripeProductId.set(row.stripe_product_id, row.id)
              }
            }

            for (const item of stripeSubscription.items.data) {
              const price = item.price
              if (!price) continue
              const product = price.product
              const stripeProductId =
                typeof product === 'string' ? product : product?.id
              if (!stripeProductId) {
                console.error(
                  'checkout.session.completed: missing Stripe product id on subscription item, skipping',
                )
                continue
              }

              const productId = productIdByStripeProductId.get(stripeProductId)
              if (!productId) {
                console.error(
                  'checkout.session.completed: no matching Supabase product for Stripe product id, skipping item',
                  stripeProductId,
                )
                continue
              }

              const { error: linkError } = await supabaseAdmin
                .from('subscription_product')
                .upsert(
                  {
                    subscription_id: subscriptionId,
                    product_id: productId,
                    stripe_subscription_item_id: item.id,
                  },
                  { onConflict: 'subscription_id,product_id' },
                )
              assertOk(linkError, 'checkout.session.completed: subscription_product upsert')
            }
          }
        } else {
          console.log(`${LOG_PREFIX} checkout.session.completed: session has no subscription (one-time or non-subscription checkout)`, {
            sessionId: session.id,
            profileId,
          })
        }

        await upsertFreemiumUsageForCheckout(supabaseAdmin, profileId)

        if (subscriptionCheckoutInsertSucceeded) {
          // Schedule initial job matching for this profile ~1 minute after subscription checkout
          // (was 45 min - shortened so the dashboard isn't empty on first load; still goes
          // through scheduled_jobs/run-scheduled-jobs rather than running inline in the webhook).
          const runAt = new Date(Date.now() + 60 * 1000).toISOString()
          const { error: scheduleError } = await supabaseAdmin
            .from('scheduled_jobs')
            .insert({
              function_name: 'match-jobs',
              payload: { profile_id: profileId, limit: 15 },
              run_at: runAt,
            })
          if (scheduleError) {
            console.error('checkout.session.completed: failed to schedule match-jobs:', scheduleError)
          } else {
            console.log(`${LOG_PREFIX} scheduled match-jobs`, { profileId, runAt })
          }

          // Welcome / subscription started email (if allowed by notification settings).
          const recipient = await loadProfileAndCheckSubscriptionEmailAllowed(supabaseAdmin, profileId)
          if (recipient) {
            try {
              const footer = await getFooterLinksForProfile(profileId)
              const { html, text } = renderSubscriptionStarted({
                recipientName: recipient.firstName,
                footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
              })
              await sendEmail({
                to: recipient.email,
                subject: 'Welcome to Job-Hopper',
                html,
                text,
                profileId,
                eventType: 'subscription_update',
                templateKey: 'subscription_started',
                payload: null,
                supabase: supabaseAdmin,
              })
              console.log(`${LOG_PREFIX} welcome email sent`, { profileId, sessionId: session.id })
            } catch (err) {
              console.error('checkout.session.completed: welcome email failed', { profileId, message: err instanceof Error ? err.message : String(err) })
            }
          } else {
            console.log(`${LOG_PREFIX} welcome email skipped (no recipient or subscription email disabled / unsubscribed)`, {
              profileId,
              sessionId: session.id,
            })
          }
        }

        break
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const expanded = await stripe.subscriptions.retrieve(stripeSub.id, {
          expand: ['items.data.price.product'],
        })

        console.log(`${LOG_PREFIX} customer.subscription.updated`, {
          stripeSubscriptionId: stripeSub.id,
          status: expanded.status,
          cancelAtPeriodEnd: expanded.cancel_at_period_end,
        })

        const subscriptionStatus = mapStripeStatus(expanded.status)
        const currentPeriodEnd = expanded.current_period_end
          ? new Date(expanded.current_period_end * 1000).toISOString()
          : null

        const { data: foundSub, error: findSubError } = await supabaseAdmin
          .from('subscriptions')
          .select('id, profile_id')
          .eq('stripe_subscription_id', stripeSub.id)
          .maybeSingle()
        assertOk(findSubError, 'customer.subscription.updated: load subscription')

        let existingSub = foundSub
        if (!existingSub) {
          // Stripe doesn't order events: this can arrive before checkout.session.completed.
          // Checkout stamps profile_id on the subscription, so create the row from it.
          const metaProfileId = expanded.metadata?.profile_id
          if (!metaProfileId) {
            console.warn(`${LOG_PREFIX} customer.subscription.updated: no local row and no profile_id metadata`, {
              stripeSubscriptionId: stripeSub.id,
            })
            break
          }
          const { data: createdSub, error: createSubError } = await supabaseAdmin
            .from('subscriptions')
            .upsert(
              {
                stripe_subscription_id: stripeSub.id,
                profile_id: metaProfileId,
                status: subscriptionStatus,
                current_period_ends_at: currentPeriodEnd,
              },
              { onConflict: 'stripe_subscription_id' },
            )
            .select('id, profile_id')
            .single()
          if (createSubError || !createdSub) {
            throw new Error(`customer.subscription.updated: create missing subscription row: ${createSubError?.message ?? 'no row returned'}`)
          }
          existingSub = createdSub
          console.log(`${LOG_PREFIX} customer.subscription.updated: created missing subscriptions row`, {
            stripeSubscriptionId: stripeSub.id,
            profileId: metaProfileId,
          })
        }

        const isCancelScheduled =
          expanded.cancel_at_period_end === true || !!expanded.cancel_at

        const { error: subUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscriptionStatus,
            current_period_ends_at: currentPeriodEnd,
          })
          .eq('id', existingSub.id)
        assertOk(subUpdateError, 'customer.subscription.updated: subscriptions update')

        const stripeProductIds = new Set<string>()
        for (const item of expanded.items.data) {
          const price = item.price
          if (!price) continue
          const product = price.product
          if (typeof product === 'string') {
            stripeProductIds.add(product)
          } else if (product && typeof product.id === 'string') {
            stripeProductIds.add(product.id)
          }
        }

        const stripeProductIdArray = Array.from(stripeProductIds)
        const { data: productsForSub, error: productsForSubError } =
          await supabaseAdmin
            .from('products')
            .select('id, stripe_product_id')
            .in('stripe_product_id', stripeProductIdArray)

        // Must throw: with no products loaded, the sync below would remove every product link.
        assertOk(productsForSubError, 'customer.subscription.updated: load products')

        const productIdByStripeProductId = new Map<string, string>()
        for (const row of productsForSub ?? []) {
          if (row.stripe_product_id) {
            productIdByStripeProductId.set(row.stripe_product_id, row.id)
          }
        }

        const productIdsInStripe: string[] = []
        for (const item of expanded.items.data) {
          const price = item.price
          if (!price) continue
          const product = price.product
          const stripeProductId =
            typeof product === 'string' ? product : product?.id
          if (!stripeProductId) continue

          const productId = productIdByStripeProductId.get(stripeProductId)
          if (!productId) continue

          productIdsInStripe.push(productId)
          const { error: linkError } = await supabaseAdmin
            .from('subscription_product')
            .upsert(
              {
                subscription_id: existingSub.id,
                product_id: productId,
                stripe_subscription_item_id: item.id,
              },
              { onConflict: 'subscription_id,product_id' },
            )
          assertOk(linkError, 'customer.subscription.updated: subscription_product upsert')
        }

        const { data: currentSubProducts, error: currentLinksError } = await supabaseAdmin
          .from('subscription_product')
          .select('product_id')
          .eq('subscription_id', existingSub.id)
        assertOk(currentLinksError, 'customer.subscription.updated: load subscription_product')
        const toRemove = (currentSubProducts ?? []).filter((r) => !productIdsInStripe.includes(r.product_id))
        for (const row of toRemove) {
          const { error: unlinkError } = await supabaseAdmin
            .from('subscription_product')
            .delete()
            .eq('subscription_id', existingSub.id)
            .eq('product_id', row.product_id)
          assertOk(unlinkError, 'customer.subscription.updated: subscription_product delete')
        }

        console.log(`${LOG_PREFIX} customer.subscription.updated: synced subscription_product`, {
          subscriptionId: existingSub.id,
          profileId: existingSub.profile_id,
          stripeSubscriptionId: stripeSub.id,
          mappedProductCount: productIdsInStripe.length,
          removedProductLinks: toRemove.length,
        })

        // Subscription updated email: plan name and next billing date, or cancellation scheduled notice.
        const profileIdUpdated = existingSub.profile_id
        if (profileIdUpdated) {
          const recipient = await loadProfileAndCheckSubscriptionEmailAllowed(supabaseAdmin, profileIdUpdated)
          if (recipient) {
            try {
              const nextBilling = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : undefined
              const cancelAtDate = expanded.cancel_at
                ? new Date(expanded.cancel_at * 1000).toLocaleDateString()
                : nextBilling

              let planName: string | undefined
              if (productIdsInStripe.length > 0) {
                const { data: products } = await supabaseAdmin.from('products').select('display_name').in('id', productIdsInStripe.slice(0, 3))
                planName = (products ?? []).map((p) => p.display_name).join(', ')
              }
              const footer = await getFooterLinksForProfile(profileIdUpdated)
              if (subscriptionStatus === 'past_due') {
                // Payment failed (e.g. trial ended and the card was declined). Do
                // NOT send the "subscription updated" email — the customer has not
                // been granted paid access. Prompt them to update their card.
                const { html, text } = renderSubscriptionPaymentFailed({
                  recipientName: recipient.firstName,
                  footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
                })
                await sendEmail({
                  to: recipient.email,
                  subject: 'Your Job-Hopper payment failed',
                  html,
                  text,
                  profileId: profileIdUpdated,
                  eventType: 'subscription_update',
                  templateKey: 'subscription_payment_failed',
                  payload: null,
                  supabase: supabaseAdmin,
                })
                console.log(`${LOG_PREFIX} payment failed email sent (past_due)`, {
                  profileId: profileIdUpdated,
                  stripeSubscriptionId: stripeSub.id,
                })
              } else if (isCancelScheduled && subscriptionStatus !== 'canceled') {
                const { html, text } = renderSubscriptionCancelScheduled({
                  recipientName: recipient.firstName,
                  cancelAtDate,
                  footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
                })
                await sendEmail({
                  to: recipient.email,
                  subject: 'Your Job-Hopper subscription will be canceled',
                  html,
                  text,
                  profileId: profileIdUpdated,
                  eventType: 'subscription_update',
                  templateKey: 'subscription_cancel_scheduled',
                  payload: { cancelAtDate },
                  supabase: supabaseAdmin,
                })
                console.log(`${LOG_PREFIX} subscription update email sent (cancel scheduled)`, {
                  profileId: profileIdUpdated,
                  stripeSubscriptionId: stripeSub.id,
                })
              } else {
                const { html, text } = renderSubscriptionUpdated({
                  recipientName: recipient.firstName,
                  planName,
                  nextBillingDate: nextBilling,
                  footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
                })
                await sendEmail({
                  to: recipient.email,
                  subject: 'Your Job-Hopper subscription was updated',
                  html,
                  text,
                  profileId: profileIdUpdated,
                  eventType: 'subscription_update',
                  templateKey: 'subscription_updated',
                  payload: { planName, nextBillingDate: nextBilling },
                  supabase: supabaseAdmin,
                })
                console.log(`${LOG_PREFIX} subscription update email sent (updated)`, {
                  profileId: profileIdUpdated,
                  stripeSubscriptionId: stripeSub.id,
                })
              }
            } catch (err) {
              console.error('customer.subscription.updated: email failed', { profileId: profileIdUpdated, message: err instanceof Error ? err.message : String(err) })
            }
          } else {
            console.log(`${LOG_PREFIX} customer.subscription.updated: subscription email skipped (no recipient or prefs)`, {
              profileId: profileIdUpdated,
              stripeSubscriptionId: stripeSub.id,
            })
          }
        } else {
          console.warn(`${LOG_PREFIX} customer.subscription.updated: subscriptions row has no profile_id`, {
            subscriptionId: existingSub.id,
            stripeSubscriptionId: stripeSub.id,
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        console.log(`${LOG_PREFIX} customer.subscription.deleted`, {
          stripeSubscriptionId: stripeSub.id,
        })

        const { data: deletedSub, error: deletedFindError } = await supabaseAdmin
          .from('subscriptions')
          .select('profile_id')
          .eq('stripe_subscription_id', stripeSub.id)
          .maybeSingle()
        assertOk(deletedFindError, 'customer.subscription.deleted: load subscription')
        const { error: canceledUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', stripeSub.id)
        assertOk(canceledUpdateError, 'customer.subscription.deleted: set status canceled')
        console.log(`${LOG_PREFIX} customer.subscription.deleted: subscriptions row marked canceled`, {
          stripeSubscriptionId: stripeSub.id,
          hadLocalRow: Boolean(deletedSub?.profile_id),
        })

        if (!deletedSub?.profile_id) {
          console.warn(`${LOG_PREFIX} customer.subscription.deleted: no subscriptions row with profile_id`, {
            stripeSubscriptionId: stripeSub.id,
          })
        }

        if (deletedSub?.profile_id) {
          const recipient = await loadProfileAndCheckSubscriptionEmailAllowed(supabaseAdmin, deletedSub.profile_id)
          if (recipient) {
            try {
              const footer = await getFooterLinksForProfile(deletedSub.profile_id)
              const { html, text } = renderSubscriptionCanceled({
                recipientName: recipient.firstName,
                footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
              })
              await sendEmail({
                to: recipient.email,
                subject: 'Your Job-Hopper subscription was canceled',
                html,
                text,
                profileId: deletedSub.profile_id,
                eventType: 'subscription_update',
                templateKey: 'subscription_canceled',
                payload: null,
                supabase: supabaseAdmin,
              })
              console.log(`${LOG_PREFIX} subscription canceled email sent`, {
                profileId: deletedSub.profile_id,
                stripeSubscriptionId: stripeSub.id,
              })
            } catch (err) {
              console.error('customer.subscription.deleted: email failed', { profileId: deletedSub.profile_id, message: err instanceof Error ? err.message : String(err) })
            }
          } else {
            console.log(`${LOG_PREFIX} customer.subscription.deleted: canceled email skipped (no recipient or prefs)`, {
              profileId: deletedSub.profile_id,
              stripeSubscriptionId: stripeSub.id,
            })
          }
        }
        break
      }

      default:
        console.log(`${LOG_PREFIX} ignored event type (no handler)`, {
          type: event.type,
          id: event.id,
        })
        break
    }

    if (HANDLED_TYPES.has(event.type)) {
      const { error: doneError } = await supabaseAdmin
        .from('stripe_webhook_events')
        .update({ outcome: 'processed' })
        .eq('id', event.id)
      if (doneError) {
        console.error(`${LOG_PREFIX} failed to mark event processed`, { id: event.id, message: doneError.message })
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Signature/body problems are the sender's fault: 400, no retry.
    if (!verifiedEventId) {
      return new Response(JSON.stringify({ error: message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Processing failed: record it and return 500 so Stripe redelivers (with backoff, up to 3 days).
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({ outcome: 'failed', error_message: message.slice(0, 1000) })
      .eq('id', verifiedEventId)
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
