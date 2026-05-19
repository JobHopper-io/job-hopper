import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  buildCompanyCacheKey,
  employerNamePlausible,
  hiringTitlePhrases,
  matchPersonById,
  normalizeCompanyName,
  personToMatchedContact,
  pickBestPerson,
  scoreOrganizationCandidates,
  searchOrganizationsByName,
  searchPeopleAtOrganization,
} from '../_shared/apollo.ts'
import { refundApolloCredits, tryConsumeApolloCredits } from '../_shared/apollo-limits.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROCESS = 'premium_insights'
const CACHE_TTL_DAYS = 90

type RpcRow = { ok?: boolean; hiring_contact_id?: string; err?: string }

async function profileHasPremiumInsightsAddon(
  admin: ReturnType<typeof createClient>,
  profileId: string,
): Promise<boolean> {
  const { data: subs, error: subsErr } = await admin
    .from('subscriptions')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['trial', 'active'])
  if (subsErr || !subs?.length) return false
  const subIds = subs.map((s) => s.id as string)
  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id')
    .eq('key', 'premium_insights')
    .maybeSingle()
  if (pErr || !product?.id) return false
  const { data: sp, error: spErr } = await admin
    .from('subscription_product')
    .select('id')
    .in('subscription_id', subIds)
    .eq('product_id', product.id as string)
    .limit(1)
  if (spErr) return false
  return (sp?.length ?? 0) > 0
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const apolloKey = Deno.env.get('APOLLO_API_KEY') ?? ''

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  let body: { job_match_id?: string }
  try {
    body = (await req.json()) as { job_match_id?: string }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const jobMatchId = typeof body.job_match_id === 'string' ? body.job_match_id.trim() : ''
  if (!jobMatchId) {
    return new Response(JSON.stringify({ error: 'Missing job_match_id' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, onboarding_completed')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    })
  }

  if (profile.onboarding_completed !== true) {
    return new Response(JSON.stringify({ error: 'Complete onboarding first' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 403,
    })
  }

  const profileId = profile.id as string

  const { data: matchRow, error: matchErr } = await admin
    .from('job_matches')
    .select(
      `
      id,
      profile_id,
      job_id,
      job_hopper_live (
        company_name,
        location,
        job_title,
        role_category
      )
    `,
    )
    .eq('id', jobMatchId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (matchErr || !matchRow) {
    return new Response(JSON.stringify({ error: 'Job match not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    })
  }

  const jhlRaw = matchRow.job_hopper_live as
    | {
        company_name: string
        location: string | null
        job_title: string
        role_category: string
      }
    | {
        company_name: string
        location: string | null
        job_title: string
        role_category: string
      }[]
    | null
  const job = Array.isArray(jhlRaw) ? jhlRaw[0] : jhlRaw
  if (!job?.company_name) {
    return new Response(JSON.stringify({ error: 'Job data incomplete' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 422,
    })
  }

  const { data: existingRow } = await admin
    .from('job_hiring_contacts')
    .select('id, status, contacts, company_summary, error_code')
    .eq('profile_id', profileId)
    .eq('job_match_id', jobMatchId)
    .maybeSingle()

  if (existingRow?.status === 'complete') {
    return new Response(
      JSON.stringify({
        status: 'complete',
        contacts: existingRow.contacts ?? [],
        company_summary: existingRow.company_summary ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }

  const { data: pendingOther } = await admin
    .from('job_hiring_contacts')
    .select('id, job_match_id')
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .maybeSingle()

  if (pendingOther && pendingOther.job_match_id !== jobMatchId) {
    return new Response(JSON.stringify({ error: 'Another job is already processing' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 409,
    })
  }

  const hasAddon = await profileHasPremiumInsightsAddon(admin, profileId)

  let hiringContactId: string | null =
    existingRow?.status === 'pending' ? (existingRow.id as string) : null

  /** When true, `redeem_freemium_premium_insights` ran successfully in this request; roll back quota on failure. */
  let freemiumChargedThisRequest = false

  if (!hiringContactId) {
    if (hasAddon) {
      const { data: claimData, error: claimErr } = await admin.rpc('claim_premium_insights_for_addon', {
        p_profile_id: profileId,
        p_job_match_id: jobMatchId,
      })
      if (claimErr) {
        console.error('claim_premium_insights_for_addon', claimErr)
        return new Response(JSON.stringify({ error: 'Could not start insights' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      const row = Array.isArray(claimData) ? claimData[0] : claimData
      const cr = row as RpcRow
      if (!cr?.ok) {
        const code = cr?.err ?? 'unknown'
        const status = code === 'in_progress' ? 409 : code === 'already_exists' ? 400 : 400
        return new Response(JSON.stringify({ error: code }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status,
        })
      }
      hiringContactId = cr.hiring_contact_id ?? null
    } else {
      const { data: redeemData, error: redeemErr } = await admin.rpc('redeem_freemium_premium_insights', {
        p_profile_id: profileId,
        p_job_match_id: jobMatchId,
      })
      if (redeemErr) {
        console.error('redeem_freemium_premium_insights', redeemErr)
        return new Response(JSON.stringify({ error: 'Could not start insights' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      const row = Array.isArray(redeemData) ? redeemData[0] : redeemData
      const cr = row as RpcRow
      if (!cr?.ok) {
        const code = cr?.err ?? 'unknown'
        const status =
          code === 'in_progress'
            ? 409
            : code === 'quota_exceeded' || code === 'disabled'
              ? 403
              : code === 'already_exists'
                ? 400
                : 400
        return new Response(JSON.stringify({ error: code }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status,
        })
      }
      hiringContactId = cr.hiring_contact_id ?? null
      freemiumChargedThisRequest = true
    }
  }

  if (!hiringContactId) {
    return new Response(JSON.stringify({ error: 'Missing hiring contact row' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const finalizeFailure = async (code: string) => {
    if (freemiumChargedThisRequest && hiringContactId) {
      const { error: rfErr } = await admin.rpc('refund_freemium_premium_insights', {
        p_profile_id: profileId,
        p_hiring_contact_id: hiringContactId,
      })
      if (rfErr) console.error('refund_freemium_premium_insights', rfErr)
      return
    }
    if (hiringContactId) {
      await admin
        .from('job_hiring_contacts')
        .update({
          status: 'failed',
          error_code: code,
          completed_at: new Date().toISOString(),
        })
        .eq('id', hiringContactId)
    }
  }

  if (!apolloKey) {
    await finalizeFailure('apollo_not_configured')
    return new Response(JSON.stringify({ error: 'Apollo is not configured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 503,
    })
  }

  const companyName = job.company_name
  const location = job.location
  const cacheKey = buildCompanyCacheKey(companyName, location)
  const nowIso = new Date().toISOString()

  const { data: cacheHit } = await admin
    .from('company_apollo_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .gt('expires_at', nowIso)
    .maybeSingle()

  let organizationId: string | null = cacheHit?.apollo_organization_id ?? null
  let primaryDomain: string | null = cacheHit?.primary_domain ?? null
  let resolvedOrgName = companyName

  const needOrgSearch = !organizationId

  try {
    if (needOrgSearch) {
      const c1 = await tryConsumeApolloCredits(admin, PROCESS, 1)
      if (!c1.ok) {
        await finalizeFailure('apollo_exhausted')
        return new Response(JSON.stringify({ error: 'apollo_exhausted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }
      let orgs
      try {
        orgs = await searchOrganizationsByName(apolloKey, companyName, location)
      } catch (e) {
        await refundApolloCredits(admin, PROCESS, 1)
        await finalizeFailure('org_search_error')
        const msg = e instanceof Error ? e.message : String(e)
        return new Response(JSON.stringify({ error: msg }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        })
      }

      const scored = scoreOrganizationCandidates(companyName, location, orgs)
      if (scored.ambiguous) {
        await refundApolloCredits(admin, PROCESS, 1)
        await finalizeFailure('ambiguous_org')
        return new Response(JSON.stringify({ error: 'ambiguous_org' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 422,
        })
      }
      if (!scored.best) {
        await refundApolloCredits(admin, PROCESS, 1)
        await finalizeFailure('org_not_found')
        return new Response(JSON.stringify({ error: 'org_not_found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 422,
        })
      }
      organizationId = scored.best.organizationId
      primaryDomain = scored.best.primaryDomain
      resolvedOrgName = scored.best.name

      const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString()
      await admin.from('company_apollo_cache').upsert(
        {
          cache_key: cacheKey,
          company_name: normalizeCompanyName(companyName),
          location_region: location ?? null,
          apollo_organization_id: organizationId,
          primary_domain: primaryDomain,
          resolved_at: nowIso,
          expires_at: expiresAt,
        },
        { onConflict: 'cache_key' },
      )
    }

    const c2 = await tryConsumeApolloCredits(admin, PROCESS, 1)
    if (!c2.ok) {
      await finalizeFailure('apollo_exhausted')
      return new Response(JSON.stringify({ error: 'apollo_exhausted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const phrases = hiringTitlePhrases(job.role_category, job.job_title)
    let people
    try {
      people = await searchPeopleAtOrganization(apolloKey, organizationId!, phrases)
    } catch (e) {
      await refundApolloCredits(admin, PROCESS, 1)
      await finalizeFailure('people_search_error')
      const msg = e instanceof Error ? e.message : String(e)
      return new Response(JSON.stringify({ error: msg }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      })
    }

    const filtered = people.filter((p) =>
      employerNamePlausible(companyName, p.organization?.name ?? null),
    )
    const pool = filtered.length ? filtered : people
    const best = pickBestPerson(pool, phrases)
    if (!best) {
      await refundApolloCredits(admin, PROCESS, 1)
      await finalizeFailure('no_contacts')
      return new Response(JSON.stringify({ error: 'no_contacts' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 422,
      })
    }

    const { person, creditError } = await matchPersonById(apolloKey, best.id)
    if (creditError || !person) {
      await refundApolloCredits(admin, PROCESS, 1)
      await finalizeFailure(creditError ? 'apollo_credit_error' : 'match_failed')
      return new Response(JSON.stringify({ error: creditError ? 'apollo_credit_error' : 'match_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: creditError ? 403 : 422,
      })
    }

    const contact = personToMatchedContact(person, phrases)
    const contacts = [
      {
        name: contact.name,
        title: contact.title,
        email: contact.email,
        location: contact.location,
        note: contact.note,
      },
    ]

    const company_summary = {
      name: resolvedOrgName,
      primary_domain: primaryDomain,
      apollo_organization_id: organizationId,
    }

    await admin
      .from('job_hiring_contacts')
      .update({
        status: 'complete',
        contacts,
        company_summary,
        error_code: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', hiringContactId)

    return new Response(
      JSON.stringify({
        status: 'complete',
        contacts,
        company_summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (e) {
    console.error('premium-insights', e)
    await finalizeFailure('unexpected')
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
