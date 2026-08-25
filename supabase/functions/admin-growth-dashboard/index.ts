// Admin-only aggregate report for the COO Growth Command Center (/admin/growth-dashboard).
// Every number here is a real query against real tables - metrics with no backing data
// source (visitors, reply rate, calls booked, bulk-license/recovered revenue) are static
// "not tracked" markers, not fabricated. B2C reuses the exact lifecycle categorization
// used by admin-user-lifecycle-report (same shared categorizer) so this doesn't drift
// from that page's numbers.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { categorizeUserLifecycle, subscriptionFlagsFromStatuses } from '../_shared/user-lifecycle-category.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 1000
const MAX_ROWS = 20000

// Same threshold judgment call the plan left open ("or whatever threshold is meaningful").
const QUALIFIED_OPPORTUNITY_SCORE = 50

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // apikey uses the service-role key (not anon) so the PostgREST `current_user_has_role`
  // RPC calls succeed; Authorization still forwards the caller's own JWT, so auth.uid()
  // inside that function resolves to the caller, not an elevated identity.
  const supabaseUserClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await supabaseUserClient.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const [{ data: isAdmin, error: adminCheckError }, { data: isSuperAdmin, error: superAdminError }] =
    await Promise.all([
      supabaseUserClient.rpc('current_user_has_role', { role_name: 'admin' }),
      supabaseUserClient.rpc('current_user_has_role', { role_name: 'super_admin' }),
    ])

  if (adminCheckError || superAdminError) {
    console.error('admin-growth-dashboard: role check failed', adminCheckError ?? superAdminError)
    return new Response(JSON.stringify({ error: 'Failed to verify admin status' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  if (!isAdmin && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 403,
    })
  }

  const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  type FetchFilter = { column: string; op: 'eq'; value: string } | { column: string; op: 'in'; values: string[] }

  /** Paginate through a table with `.select(columns)`, up to MAX_ROWS, collecting all pages. */
  async function fetchAll<T>(table: string, columns: string, filter?: FetchFilter): Promise<T[]> {
    const all: T[] = []
    let offset = 0
    while (all.length < MAX_ROWS) {
      const remaining = MAX_ROWS - all.length
      const take = Math.min(PAGE_SIZE, remaining)
      let query = supabaseAdminClient.from(table).select(columns)
      if (filter?.op === 'eq') query = query.eq(filter.column, filter.value)
      else if (filter?.op === 'in') query = query.in(filter.column, filter.values)
      const { data: page, error: pageError } = await query.range(offset, offset + take - 1)
      if (pageError) {
        throw new Error(`Failed to load ${table}: ${pageError.message}`)
      }
      if (!page || page.length === 0) break
      all.push(...(page as T[]))
      offset += page.length
      if (page.length < take) break
    }
    return all
  }

  try {
    // --- B2C (from profiles + subscriptions, same tables/logic as admin-user-lifecycle-report) ---
    const profiles = await fetchAll<{
      id: string
      onboarding_completed: boolean | null
      referred_by_institutional_lead_id: string | null
    }>('profiles', 'id, onboarding_completed, referred_by_institutional_lead_id')

    const subscriptions = await fetchAll<{ profile_id: string; status: string }>(
      'subscriptions',
      'profile_id, status',
    )

    const statusesByProfile = new Map<string, string[]>()
    for (const sub of subscriptions) {
      const list = statusesByProfile.get(sub.profile_id)
      if (list) list.push(sub.status)
      else statusesByProfile.set(sub.profile_id, [sub.status])
    }

    let activatedUsers = 0
    let paidSubscribers = 0
    let churnedCount = 0
    let closedInstitutionalAccounts = 0

    for (const profile of profiles) {
      const flags = subscriptionFlagsFromStatuses(
        statusesByProfile.get(profile.id) ?? [],
        profile.onboarding_completed,
      )
      const category = categorizeUserLifecycle(flags)

      if (category !== 'incomplete_onboarding') activatedUsers += 1
      if (category === 'active_subscription' || category === 'stripe_free_trial') {
        paidSubscribers += 1
        if (profile.referred_by_institutional_lead_id) closedInstitutionalAccounts += 1
      }
      if (category === 'churned') churnedCount += 1
    }

    const totalSignups = profiles.length

    // --- Institutional (institutional_leads + trial_grants) ---
    const leads = await fetchAll<{
      status: string
      source: string
      opportunity_score: number | null
      recommended_package: string | null
    }>('institutional_leads', 'status, source, opportunity_score, recommended_package')

    const leadsBySourceMap = new Map<string, number>()
    let activeOpportunities = 0
    let qualifiedOrganizations = 0
    let emailsSent = 0
    const seatPackageMap = new Map<string, number>()

    // "Active" excludes both a manually-closed-out lead (dead) and one whose contact
    // email hard-bounced (bounced) - outbound-live-send.mjs only ever queries
    // status = 'new', so a bounced lead is never recontacted and isn't a live opportunity.
    for (const lead of leads) {
      leadsBySourceMap.set(lead.source, (leadsBySourceMap.get(lead.source) ?? 0) + 1)
      if (lead.status !== 'dead' && lead.status !== 'bounced') {
        activeOpportunities += 1
        if (lead.recommended_package) {
          seatPackageMap.set(lead.recommended_package, (seatPackageMap.get(lead.recommended_package) ?? 0) + 1)
        }
      }
      if ((lead.opportunity_score ?? 0) >= QUALIFIED_OPPORTUNITY_SCORE) qualifiedOrganizations += 1
      if (lead.status === 'contacted') emailsSent += 1
    }

    const nowIso = new Date().toISOString()
    const trialGrants = await fetchAll<{ status: string; expires_at: string }>(
      'trial_grants',
      'status, expires_at',
    )
    const trialOrganizations = trialGrants.filter((g) => g.status === 'active' && g.expires_at > nowIso).length

    // --- Revenue (subscriptions + subscription_product + products; Stripe is the source of truth) ---
    const activeSubRows = await fetchAll<{ id: string }>('subscriptions', 'id', {
      column: 'status',
      op: 'eq',
      value: 'active',
    })

    let mrrCents = 0
    if (activeSubRows.length > 0) {
      const subProductRows = await fetchAll<{ product_id: string }>('subscription_product', 'product_id', {
        column: 'subscription_id',
        op: 'in',
        values: activeSubRows.map((s) => s.id),
      })
      if (subProductRows.length > 0) {
        const productIds = Array.from(new Set(subProductRows.map((r) => r.product_id)))
        const products = await fetchAll<{ id: string; price_cents: number }>('products', 'id, price_cents', {
          column: 'id',
          op: 'in',
          values: productIds,
        })
        const priceById = new Map(products.map((p) => [p.id, p.price_cents]))
        for (const row of subProductRows) {
          mrrCents += priceById.get(row.product_id) ?? 0
        }
      }
    }

    return new Response(
      JSON.stringify({
        b2c: {
          totalSignups,
          activatedUsers,
          paidSubscribers,
          conversionRate: totalSignups > 0 ? paidSubscribers / totalSignups : 0,
        },
        institutional: {
          activeOpportunities,
          trialOrganizations,
          closedAccounts: closedInstitutionalAccounts,
          seatPipelineByPackage: Array.from(seatPackageMap.entries())
            .map(([recommendedPackage, leadCount]) => ({ recommendedPackage, leadCount }))
            .sort((a, b) => b.leadCount - a.leadCount),
        },
        acquisition: {
          totalLeads: leads.length,
          leadsBySource: Array.from(leadsBySourceMap.entries())
            .map(([source, count]) => ({ source, count }))
            .sort((a, b) => b.count - a.count),
          qualifiedOrganizations,
          emailsSent,
        },
        revenue: {
          mrrCents,
          annualizedRevenueCents: mrrCents * 12,
          churnedCount,
          churnRate: totalSignups > 0 ? churnedCount / totalSignups : 0,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('admin-growth-dashboard', error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
