import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'npm:stripe@14.21.0'

// Read-only reconciliation: retrieves live Stripe status for a set of subscription IDs so we
// can compare against our DB. NEVER mutates Stripe (retrieve only). Auth-gated to
// service-role / x-cron-secret; returns customer billing data, so it must not be public.

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

function tsToIso(ts: number | null | undefined): string | null {
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  let body: { subscriptionIds?: unknown; customerOfSubscription?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  // Mode 2: resolve the customer behind a subscription id and list ALL their subscriptions
  // (any status), so we can detect Stripe subscriptions with no row in our DB.
  if (typeof body.customerOfSubscription === 'string' && body.customerOfSubscription.trim()) {
    const seedId = body.customerOfSubscription.trim()
    try {
      const seed = await stripe.subscriptions.retrieve(seedId)
      const customerId = typeof seed.customer === 'string' ? seed.customer : seed.customer.id
      const customer = await stripe.customers.retrieve(customerId)
      const customerEmail =
        customer && !('deleted' in customer && customer.deleted) ? customer.email ?? null : null

      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice'],
      })

      const list = subs.data.map((sub) => {
        const inv = sub.latest_invoice
        return {
          id: sub.id,
          status: sub.status,
          created: tsToIso(sub.created),
          current_period_end: tsToIso(sub.current_period_end),
          cancel_at_period_end: sub.cancel_at_period_end,
          canceled_at: tsToIso(sub.canceled_at),
          latest_invoice_status:
            inv && typeof inv === 'object' ? inv.status : null,
          latest_invoice_amount_paid:
            inv && typeof inv === 'object' ? inv.amount_paid : null,
        }
      })

      return new Response(
        JSON.stringify({ customerId, customerEmail, count: list.length, subscriptions: list }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    } catch (e) {
      const err = e as { message?: string; code?: string }
      return new Response(
        JSON.stringify({ error: err.message ?? String(e), code: err.code ?? null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 },
      )
    }
  }

  const ids = Array.isArray(body.subscriptionIds)
    ? body.subscriptionIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []
  if (ids.length === 0) {
    return new Response(JSON.stringify({ error: 'subscriptionIds must be a non-empty string array' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const results: unknown[] = []
  for (const id of ids) {
    try {
      const sub = await stripe.subscriptions.retrieve(id, { expand: ['latest_invoice'] })
      const inv = sub.latest_invoice
      const invoice =
        inv && typeof inv === 'object'
          ? {
              id: inv.id,
              status: inv.status,
              paid: inv.paid,
              amount_paid: inv.amount_paid,
              amount_due: inv.amount_due,
              created: tsToIso(inv.created),
            }
          : null
      results.push({
        id,
        found: true,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: tsToIso(sub.current_period_end),
        trial_end: tsToIso(sub.trial_end),
        canceled_at: tsToIso(sub.canceled_at),
        latest_invoice: invoice,
      })
    } catch (e) {
      const err = e as { code?: string; statusCode?: number; message?: string }
      results.push({
        id,
        found: false,
        error: err.message ?? String(e),
        code: err.code ?? null,
        statusCode: err.statusCode ?? null,
      })
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
