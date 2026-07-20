import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import Stripe from 'npm:stripe@14.21.0'

// Safety net: periodically re-check non-canceled subscriptions against live Stripe and
// self-correct any drift (status or period). Catches future webhook gaps — config or
// delivery — within hours instead of months. Invoked by run-scheduled-jobs (self-enqueues
// its next run) and secured like the other cron targets.

const LOG = '[reconcile-subscriptions]'
const RECONCILE_INTERVAL_HOURS = 6

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const header = req.headers.get('x-cron-secret')
  if (cronSecret && header === cronSecret) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization')
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
}

// Mirror of mapStripeStatus in stripe-webhook/index.ts — keep in sync.
function mapStripeStatus(stripeStatus: string): 'trial' | 'active' | 'past_due' | 'canceled' {
  if (stripeStatus === 'trialing') return 'trial'
  if (stripeStatus === 'active') return 'active'
  if (stripeStatus === 'past_due') return 'past_due'
  return 'canceled'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Enqueue the next run FIRST, so recurrence survives even if this run throws.
  const nextRunAt = new Date(Date.now() + RECONCILE_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
  const { error: scheduleError } = await supabaseAdmin
    .from('scheduled_jobs')
    .insert({ function_name: 'reconcile-subscriptions', payload: {}, run_at: nextRunAt })
  if (scheduleError) {
    console.error(`${LOG} failed to enqueue next run`, { error: scheduleError.message })
  }

  // Non-canceled rows with a real Stripe subscription id (skip synthetic test_ rows).
  const { data: rows, error: selError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, stripe_subscription_id, status, current_period_ends_at')
    .in('status', ['trial', 'active', 'past_due'])
    .like('stripe_subscription_id', 'sub_%')

  if (selError) {
    console.error(`${LOG} failed to select subscriptions`, { error: selError.message })
    return new Response(JSON.stringify({ error: 'select failed', details: selError.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  let checked = 0
  let corrected = 0
  let missing = 0
  const corrections: unknown[] = []

  for (const row of rows ?? []) {
    checked += 1
    let sub: Stripe.Subscription
    try {
      sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'resource_missing') {
        missing += 1
        console.warn(`${LOG} subscription not in Stripe`, { stripeSubscriptionId: row.stripe_subscription_id })
      } else {
        console.error(`${LOG} stripe retrieve failed`, {
          stripeSubscriptionId: row.stripe_subscription_id,
          message: err.message,
        })
      }
      continue
    }

    const newStatus = mapStripeStatus(sub.status)
    const newPeriodIso = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null

    const dbPeriodSec = row.current_period_ends_at
      ? Math.floor(new Date(row.current_period_ends_at).getTime() / 1000)
      : null
    const statusDrift = newStatus !== row.status
    const periodDrift = (sub.current_period_end ?? null) !== dbPeriodSec

    if (!statusDrift && !periodDrift) continue

    const { error: auditError } = await supabaseAdmin
      .from('subscription_reconciliation_audit')
      .insert({
        subscription_id: row.id,
        stripe_subscription_id: row.stripe_subscription_id,
        old_status: row.status,
        new_status: newStatus,
        old_period_ends_at: row.current_period_ends_at,
        new_period_ends_at: newPeriodIso,
        source: 'scheduled-drift',
        note: `stripe status=${sub.status}`,
      })
    if (auditError) {
      console.error(`${LOG} audit insert failed`, {
        stripeSubscriptionId: row.stripe_subscription_id,
        message: auditError.message,
      })
      continue
    }

    const { error: updError } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: newStatus, current_period_ends_at: newPeriodIso })
      .eq('id', row.id)
    if (updError) {
      console.error(`${LOG} update failed`, {
        stripeSubscriptionId: row.stripe_subscription_id,
        message: updError.message,
      })
      continue
    }

    corrected += 1
    corrections.push({
      stripe_subscription_id: row.stripe_subscription_id,
      status: `${row.status} -> ${newStatus}`,
      period: `${row.current_period_ends_at ?? 'null'} -> ${newPeriodIso ?? 'null'}`,
    })
    console.log(`${LOG} corrected drift`, corrections[corrections.length - 1])
  }

  console.log(`${LOG} done`, { checked, corrected, missing })
  return new Response(
    JSON.stringify({ checked, corrected, missing, corrections, nextRunAt }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
})
