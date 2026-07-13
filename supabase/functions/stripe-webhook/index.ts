import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import Stripe from 'npm:stripe@14.21.0'
import { fulfillResumeProductViaN8n } from '../_shared/n8n-resume-fulfillment.ts'
import { sendEmail } from '../_shared/email.ts'
import {
  renderSubscriptionStarted,
  renderSubscriptionUpdated,
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
/** Grep-friendly prefix for resume_products + n8n path inside checkout.session.completed. */
const RESUME_LOG = `${LOG_PREFIX}[resume]`

function mapStripeStatus(stripeStatus: string): 'trial' | 'active' | 'canceled' {
  if (stripeStatus === 'trialing') return 'trial'
  if (stripeStatus === 'active' || stripeStatus === 'past_due') return 'active'
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

    console.log(`${LOG_PREFIX} received`, {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
    })

    // Log every received event so delivery/coverage is answerable from our own DB.
    // outcome=handled if a case below processes this type, else ignored. Upsert on the
    // Stripe event id so redeliveries don't duplicate.
    const HANDLED_TYPES = new Set([
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ])
    const { error: logError } = await supabaseAdmin
      .from('stripe_webhook_events')
      .upsert(
        {
          id: event.id,
          type: event.type,
          outcome: HANDLED_TYPES.has(event.type) ? 'handled' : 'ignored',
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
          if (profileUpdateError) {
            console.error('Failed to update profile stripe_customer_id/onboarding_completed:', profileUpdateError)
          } else {
            console.log(`${LOG_PREFIX} profile updated with stripe_customer_id and onboarding_completed`, {
              profileId,
            })
          }
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

            if (productsForSubError) {
              console.error(
                'checkout.session.completed: failed to load products for subscription items',
                productsForSubError,
              )
            }

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

              await supabaseAdmin
                .from('subscription_product')
                .upsert(
                  {
                    subscription_id: subscriptionId,
                    product_id: productId,
                    stripe_subscription_item_id: item.id,
                  },
                  { onConflict: 'subscription_id,product_id' },
                )
            }
          }
        } else {
          console.log(`${LOG_PREFIX} checkout.session.completed: session has no subscription (one-time or non-subscription checkout)`, {
            sessionId: session.id,
            profileId,
          })
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          {
            expand: ['data.price.product'],
          },
        )

        const oneTimeStripeProductIds = new Set<string>()
        for (const line of lineItems.data) {
          const price = line.price
          if (!price) continue
          if (price.recurring != null) continue
          const product = price.product
          if (typeof product === 'string') {
            oneTimeStripeProductIds.add(product)
          } else if (product && typeof product.id === 'string') {
            oneTimeStripeProductIds.add(product.id)
          }
        }

        const oneTimeStripeProductIdArray = Array.from(oneTimeStripeProductIds)
        if (oneTimeStripeProductIdArray.length === 0) {
          console.log(`${LOG_PREFIX} checkout.session.completed: no one-time (non-recurring) line items`, {
            sessionId: session.id,
            profileId,
            lineItemCount: lineItems.data.length,
          })
        }
        if (oneTimeStripeProductIdArray.length > 0) {
          const jobMatchId = session.metadata?.job_match_id ?? null
          console.log(`${RESUME_LOG} one-time line items`, {
            checkoutSessionId: session.id,
            profileId,
            stripeOneTimeProductIdCount: oneTimeStripeProductIdArray.length,
            jobMatchIdFromMetadata: jobMatchId,
          })

          const { data: oneTimeProducts, error: oneTimeProductsError } =
            await supabaseAdmin
              .from('products')
              .select('id, key, stripe_product_id')
              .in('stripe_product_id', oneTimeStripeProductIdArray)

          if (oneTimeProductsError) {
            console.error(
              'checkout.session.completed: failed to load products for one-time items',
              oneTimeProductsError,
            )
          }

          const oneTimeProductIdByStripeProductId = new Map<string, { id: string; key: string }>()
          for (const row of oneTimeProducts ?? []) {
            if (row.stripe_product_id) {
              oneTimeProductIdByStripeProductId.set(row.stripe_product_id, { id: row.id, key: row.key })
            }
          }

          console.log(`${RESUME_LOG} resolved Supabase products for Stripe one-time IDs`, {
            checkoutSessionId: session.id,
            mappedKeys: [...(oneTimeProducts ?? [])].map((r) => r.key),
          })

          for (const line of lineItems.data) {
            const price = line.price
            if (!price) continue
            if (price.recurring != null) continue
            const product = price.product
            const stripeProductId =
              typeof product === 'string' ? product : product?.id
            if (!stripeProductId) {
              console.error(
                'checkout.session.completed: one-time line missing Stripe product id, skipping',
              )
              continue
            }

            const resolved = oneTimeProductIdByStripeProductId.get(stripeProductId)
            if (!resolved) {
              console.error(
                'checkout.session.completed: no matching Supabase product for one-time Stripe product id, skipping',
                stripeProductId,
              )
              continue
            }

            const isPerJobResume = resolved.key === 'per_job_resume_advice'
            if (resolved.key !== 'resume_upgrade' && !isPerJobResume) {
              continue
            }

            console.log(`${RESUME_LOG} handling resume product line`, {
              checkoutSessionId: session.id,
              profileId,
              productKey: resolved.key,
              supabaseProductId: resolved.id,
              stripeProductId,
              isPerJobResume,
              jobMatchId: isPerJobResume ? jobMatchId : null,
            })

            const { data: resumeRow, error: resumeProductError } = await supabaseAdmin
              .from('resume_products')
              .upsert(
                {
                  profile_id: profileId,
                  product_id: resolved.id,
                  job_match_id: isPerJobResume ? (jobMatchId || null) : null,
                },
                { onConflict: 'profile_id,job_match_id,product_id' },
              )
              .select('id')
              .maybeSingle()
            if (resumeProductError) {
              console.error(
                `${RESUME_LOG} failed to upsert resume_products`,
                {
                  checkoutSessionId: session.id,
                  productKey: resolved.key,
                  error: resumeProductError,
                },
              )
            } else if (!resumeRow?.id) {
              console.warn(`${RESUME_LOG} upsert returned no row id`, {
                checkoutSessionId: session.id,
                productKey: resolved.key,
              })
            } else {
              console.log(`${RESUME_LOG} resume_products row ready`, {
                checkoutSessionId: session.id,
                resumeProductId: resumeRow.id,
                productKey: resolved.key,
              })
              console.log(`${RESUME_LOG} scheduling n8n fulfillment (EdgeRuntime.waitUntil)`, {
                checkoutSessionId: session.id,
                resumeProductId: resumeRow.id,
                productKey: resolved.key,
              })
              EdgeRuntime.waitUntil(
                fulfillResumeProductViaN8n({
                  supabaseAdmin,
                  resumeProductId: resumeRow.id,
                  productKey: resolved.key,
                  profileId,
                  jobMatchId: isPerJobResume ? (jobMatchId ?? null) : null,
                }).catch((err) =>
                  console.error(`${RESUME_LOG} n8n fulfillment rejected`, {
                    checkoutSessionId: session.id,
                    resumeProductId: resumeRow.id,
                    productKey: resolved.key,
                    message: err instanceof Error ? err.message : String(err),
                  }),
                ),
              )
            }
          }
        }

        await upsertFreemiumUsageForCheckout(supabaseAdmin, profileId)

        if (subscriptionCheckoutInsertSucceeded) {
          // Schedule initial job matching for this profile ~45 minutes after subscription checkout.
          const runAt = new Date(Date.now() + 45 * 60 * 1000).toISOString()
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

        const { data: existingSub } = await supabaseAdmin
          .from('subscriptions')
          .select('id, profile_id')
          .eq('stripe_subscription_id', stripeSub.id)
          .single()

        if (!existingSub) {
          console.warn(`${LOG_PREFIX} customer.subscription.updated: no matching subscriptions row`, {
            stripeSubscriptionId: stripeSub.id,
          })
          break
        }

        const subscriptionStatus = mapStripeStatus(expanded.status)
        const currentPeriodEnd = expanded.current_period_end
          ? new Date(expanded.current_period_end * 1000).toISOString()
          : null

        const isCancelScheduled =
          expanded.cancel_at_period_end === true || !!expanded.cancel_at

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscriptionStatus,
            current_period_ends_at: currentPeriodEnd,
          })
          .eq('id', existingSub.id)

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

        if (productsForSubError) {
          console.error(
            'customer.subscription.updated: failed to load products for subscription items',
            productsForSubError,
          )
        }

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
          await supabaseAdmin
            .from('subscription_product')
            .upsert(
              {
                subscription_id: existingSub.id,
                product_id: productId,
                stripe_subscription_item_id: item.id,
              },
              { onConflict: 'subscription_id,product_id' },
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
              if (isCancelScheduled && subscriptionStatus !== 'canceled') {
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

        const { data: deletedSub } = await supabaseAdmin
          .from('subscriptions')
          .select('profile_id')
          .eq('stripe_subscription_id', stripeSub.id)
          .single()
        const { error: canceledUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', stripeSub.id)

        if (canceledUpdateError) {
          console.error(`${LOG_PREFIX} customer.subscription.deleted: failed to set status canceled`, {
            stripeSubscriptionId: stripeSub.id,
            error: canceledUpdateError,
          })
        } else {
          console.log(`${LOG_PREFIX} customer.subscription.deleted: subscriptions row marked canceled`, {
            stripeSubscriptionId: stripeSub.id,
            hadLocalRow: Boolean(deletedSub?.profile_id),
          })
        }

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
