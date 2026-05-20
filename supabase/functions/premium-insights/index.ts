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
const NEGATIVE_CACHE_TTL_DAYS = 7

type StoredOrgDisambiguation = {
  apollo_organization_id: string
  name: string
  primary_domain: string | null
  score: number
}

function parseStoredOrgDisambiguation(raw: unknown): StoredOrgDisambiguation[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: StoredOrgDisambiguation[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    const id = typeof o.apollo_organization_id === 'string' ? o.apollo_organization_id.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const scoreRaw = o.score
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw
        : typeof scoreRaw === 'string'
          ? Number(scoreRaw)
          : NaN
    if (!id || !name || Number.isNaN(score)) return null
    out.push({
      apollo_organization_id: id,
      name,
      primary_domain: typeof o.primary_domain === 'string' ? o.primary_domain : null,
      score,
    })
  }
  return out
}

/** Match a user-selected org id against stored JSON even when strict parse fails (e.g. numeric score as string). */
function findOrgChoiceInRaw(
  raw: unknown,
  selectedId: string,
): StoredOrgDisambiguation | null {
  if (!Array.isArray(raw)) return null
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.apollo_organization_id === 'string' ? o.apollo_organization_id.trim() : ''
    if (id !== selectedId) continue
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const scoreRaw = o.score
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw
        : typeof scoreRaw === 'string'
          ? Number(scoreRaw)
          : NaN
    if (!name || Number.isNaN(score)) return null
    return {
      apollo_organization_id: id,
      name,
      primary_domain: typeof o.primary_domain === 'string' ? o.primary_domain : null,
      score,
    }
  }
  return null
}

function userMessageForPremiumInsightsFailure(code: string): string {
  switch (code) {
    case 'apollo_exhausted':
      return 'Contact lookups are temporarily unavailable. Please try again later.'
    case 'user_declined_org_choice':
      return "We couldn't find a hiring contact for this job."
    case 'org_not_found':
    case 'no_contacts':
    case 'match_failed':
      return 'We could not confidently identify a hiring contact for this posting.'
    case 'cached_resolution_miss':
      return 'We could not find a hiring contact for this job. Feel free to try again in a few days.'
    case 'org_search_error':
    case 'people_search_error':
      return 'The hiring-contact service had a problem. Please try again in a few minutes.'
    case 'apollo_credit_error':
      return 'Contact lookups are temporarily unavailable. Please try again later.'
    case 'apollo_not_configured':
      return 'Contact lookups are not available right now. Please try again later.'
    case 'unexpected':
      return 'Something went wrong. Please try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

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

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const jobMatchId = typeof body.job_match_id === 'string' ? body.job_match_id.trim() : ''
  const declineOrgDisambiguation = body.decline_org_disambiguation === true
  const selectedApolloOrganizationId =
    typeof body.selected_apollo_organization_id === 'string'
      ? body.selected_apollo_organization_id.trim()
      : ''
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

  console.log(
    JSON.stringify({
      fn: 'premium-insights',
      phase: 'job_loaded',
      job_match_id: jobMatchId,
      profile_id: profileId,
      job_id: matchRow.job_id,
      company_name: job.company_name,
      location: job.location,
      job_title: job.job_title,
      role_category: job.role_category,
    }),
  )

  const companyName = job.company_name
  const location = job.location
  const cacheKey = buildCompanyCacheKey(companyName, location)

  const searchMissExpiresAt = () =>
    new Date(Date.now() + NEGATIVE_CACHE_TTL_DAYS * 86400000).toISOString()

  async function hasActiveSearchMiss(): Promise<boolean> {
    const { data: miss } = await admin
      .from('company_apollo_search_miss')
      .select('cache_key')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    return Boolean(miss)
  }

  async function recordSearchMiss(reason: string) {
    await admin.from('company_apollo_search_miss').upsert(
      {
        cache_key: cacheKey,
        reason,
        expires_at: searchMissExpiresAt(),
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    )
  }

  const { data: existingRow } = await admin
    .from('job_hiring_contacts')
    .select('id, status, contacts, company_summary, error_code, org_disambiguation_options')
    .eq('profile_id', profileId)
    .eq('job_match_id', jobMatchId)
    .maybeSingle()

  const orgDisambiguationStored = parseStoredOrgDisambiguation(existingRow?.org_disambiguation_options)
  const pendingOrgDisambiguation =
    existingRow?.status === 'pending' &&
    Boolean(orgDisambiguationStored && orgDisambiguationStored.length > 0)

  if (existingRow?.status === 'complete') {
    console.log(
      JSON.stringify({
        fn: 'premium-insights',
        phase: 'short_circuit_complete_row',
        job_match_id: jobMatchId,
        profile_id: profileId,
      }),
    )
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

  if (!pendingOrgDisambiguation && (await hasActiveSearchMiss())) {
    if (hiringContactId) {
      await admin
        .from('job_hiring_contacts')
        .update({
          status: 'failed',
          error_code: 'cached_resolution_miss',
          completed_at: new Date().toISOString(),
          org_disambiguation_options: null,
        })
        .eq('id', hiringContactId)
    }
    const user_message = userMessageForPremiumInsightsFailure('cached_resolution_miss')
    const missBody: Record<string, unknown> = {
      status: 'failed',
      error_code: 'cached_resolution_miss',
      user_message,
      cached_miss: true,
    }
    if (!hasAddon) {
      missBody.freemium_credit_never_consumed = true
      missBody.freemium_credit_refunded = false
    }
    return new Response(JSON.stringify(missBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

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

  const finalizeFailure = async (code: string): Promise<{ refunded: boolean }> => {
    if (freemiumChargedThisRequest && hiringContactId) {
      const { error: rfErr } = await admin.rpc('refund_freemium_premium_insights', {
        p_profile_id: profileId,
        p_hiring_contact_id: hiringContactId,
      })
      if (rfErr) console.error('refund_freemium_premium_insights', rfErr)
      return { refunded: !rfErr }
    }
    if (hiringContactId) {
      await admin
        .from('job_hiring_contacts')
        .update({
          status: 'failed',
          error_code: code,
          completed_at: new Date().toISOString(),
          org_disambiguation_options: null,
        })
        .eq('id', hiringContactId)
    }
    return { refunded: false }
  }

  const respondFailure = async (
    code: string,
    httpStatus: number,
    options?: { recordMiss?: boolean },
  ): Promise<Response> => {
    const fin = await finalizeFailure(code)
    if (options?.recordMiss) await recordSearchMiss(code)
    const user_message = userMessageForPremiumInsightsFailure(code)
    const body: Record<string, unknown> = {
      status: 'failed',
      error_code: code,
      user_message,
    }
    if (!hasAddon) {
      body.freemium_credit_never_consumed = !freemiumChargedThisRequest
      if (freemiumChargedThisRequest) body.freemium_credit_refunded = fin.refunded
    }
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: httpStatus,
    })
  }

  let prefilledOrg: {
    organizationId: string
    primaryDomain: string | null
    resolvedOrgName: string
  } | null = null

  const pendingInsightsRow = existingRow?.status === 'pending'
  const userSubmittedOrgResolution =
    pendingInsightsRow && (declineOrgDisambiguation || Boolean(selectedApolloOrganizationId))

  if (userSubmittedOrgResolution) {
    if (declineOrgDisambiguation && selectedApolloOrganizationId) {
      return new Response(
        JSON.stringify({
          error: 'Use either decline_org_disambiguation or selected_apollo_organization_id, not both',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }
    if (declineOrgDisambiguation) {
      await refundApolloCredits(admin, PROCESS, 1)
      return await respondFailure('user_declined_org_choice', 422)
    }
    const found =
      orgDisambiguationStored?.find(
        (o) => o.apollo_organization_id === selectedApolloOrganizationId,
      ) ??
      findOrgChoiceInRaw(existingRow?.org_disambiguation_options, selectedApolloOrganizationId)
    if (!found) {
      return new Response(JSON.stringify({ error: 'Invalid organization selection' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    prefilledOrg = {
      organizationId: found.apollo_organization_id,
      primaryDomain: found.primary_domain,
      resolvedOrgName: found.name,
    }
    await admin
      .from('job_hiring_contacts')
      .update({
        org_disambiguation_options: null,
        error_code: null,
      })
      .eq('id', hiringContactId)
  }

  if (pendingOrgDisambiguation && !declineOrgDisambiguation && !selectedApolloOrganizationId) {
    return new Response(
      JSON.stringify({
        status: 'needs_org_choice',
        organizations: orgDisambiguationStored,
        job_match_id: jobMatchId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }

  if (!apolloKey) {
    return await respondFailure('apollo_not_configured', 503)
  }

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

  if (prefilledOrg) {
    organizationId = prefilledOrg.organizationId
    primaryDomain = prefilledOrg.primaryDomain
    resolvedOrgName = prefilledOrg.resolvedOrgName
  }

  const needOrgSearch = !organizationId && !prefilledOrg

  console.log(
    JSON.stringify({
      fn: 'premium-insights',
      phase: 'company_cache_lookup',
      job_match_id: jobMatchId,
      profile_id: profileId,
      cache_key: cacheKey,
      cache_hit: Boolean(cacheHit),
      need_org_search: needOrgSearch,
      cached_apollo_organization_id: organizationId,
    }),
  )

  try {
    if (needOrgSearch) {
      const c1 = await tryConsumeApolloCredits(admin, PROCESS, 1)
      if (!c1.ok) {
        return await respondFailure('apollo_exhausted', 403)
      }
      let orgs
      try {
        orgs = await searchOrganizationsByName(apolloKey, companyName, location)
      } catch (e) {
        console.log(
          JSON.stringify({
            fn: 'premium-insights',
            phase: 'failure',
            job_match_id: jobMatchId,
            profile_id: profileId,
            code: 'org_search_error',
            message: e instanceof Error ? e.message : String(e),
          }),
        )
        await refundApolloCredits(admin, PROCESS, 1)
        return await respondFailure('org_search_error', 502)
      }

      const scored = scoreOrganizationCandidates(companyName, location, orgs)
      if (scored.kind === 'needs_user_choice') {
        console.log(
          JSON.stringify({
            fn: 'premium-insights',
            phase: 'org_disambiguation_required',
            job_match_id: jobMatchId,
            profile_id: profileId,
            candidate_count: scored.candidates.length,
          }),
        )
        await admin
          .from('job_hiring_contacts')
          .update({
            org_disambiguation_options: scored.candidates,
          })
          .eq('id', hiringContactId)
        return new Response(
          JSON.stringify({
            status: 'needs_org_choice',
            organizations: scored.candidates,
            job_match_id: jobMatchId,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
      }
      if (scored.kind !== 'picked') {
        console.log(
          JSON.stringify({
            fn: 'premium-insights',
            phase: 'failure',
            job_match_id: jobMatchId,
            profile_id: profileId,
            code: 'org_not_found',
            score_kind: scored.kind,
          }),
        )
        await refundApolloCredits(admin, PROCESS, 1)
        return await respondFailure('org_not_found', 422, {
          recordMiss: scored.kind === 'no_candidates',
        })
      }
      organizationId = scored.best.organizationId
      primaryDomain = scored.best.primaryDomain
      resolvedOrgName = scored.best.name

      console.log(
        JSON.stringify({
          fn: 'premium-insights',
          phase: 'org_resolved',
          job_match_id: jobMatchId,
          profile_id: profileId,
          apollo_organization_id: organizationId,
          resolved_name: resolvedOrgName,
          primary_domain: primaryDomain,
        }),
      )

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
    } else {
      if (prefilledOrg) {
        console.log(
          JSON.stringify({
            fn: 'premium-insights',
            phase: 'org_from_user_disambiguation',
            job_match_id: jobMatchId,
            profile_id: profileId,
            cache_key: cacheKey,
            apollo_organization_id: organizationId,
            primary_domain: primaryDomain,
          }),
        )
        const expiresAtUserPick = new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString()
        await admin.from('company_apollo_cache').upsert(
          {
            cache_key: cacheKey,
            company_name: normalizeCompanyName(companyName),
            location_region: location ?? null,
            apollo_organization_id: organizationId,
            primary_domain: primaryDomain,
            resolved_at: nowIso,
            expires_at: expiresAtUserPick,
          },
          { onConflict: 'cache_key' },
        )
      } else {
        console.log(
          JSON.stringify({
            fn: 'premium-insights',
            phase: 'org_from_company_cache',
            job_match_id: jobMatchId,
            profile_id: profileId,
            cache_key: cacheKey,
            apollo_organization_id: organizationId,
            primary_domain: primaryDomain,
          }),
        )
      }
    }

    const c2 = await tryConsumeApolloCredits(admin, PROCESS, 1)
    if (!c2.ok) {
      return await respondFailure('apollo_exhausted', 403)
    }

    const phrases = hiringTitlePhrases(job.role_category, job.job_title)
    console.log(
      JSON.stringify({
        fn: 'premium-insights',
        phase: 'people_step',
        job_match_id: jobMatchId,
        profile_id: profileId,
        organization_id: organizationId,
        title_phrases: phrases.slice(0, 12),
      }),
    )
    let people
    try {
      people = await searchPeopleAtOrganization(apolloKey, organizationId!, phrases)
    } catch (e) {
      console.log(
        JSON.stringify({
          fn: 'premium-insights',
          phase: 'failure',
          job_match_id: jobMatchId,
          profile_id: profileId,
          code: 'people_search_error',
          message: e instanceof Error ? e.message : String(e),
        }),
      )
      await refundApolloCredits(admin, PROCESS, 1)
      return await respondFailure('people_search_error', 502)
    }

    const filtered = people.filter((p) =>
      employerNamePlausible(companyName, p.organization?.name ?? null),
    )
    const pool = filtered.length ? filtered : people
    const best = pickBestPerson(pool, phrases)
    if (!best) {
      console.log(
        JSON.stringify({
          fn: 'premium-insights',
          phase: 'failure',
          job_match_id: jobMatchId,
          profile_id: profileId,
          code: 'no_contacts',
          organization_id: organizationId,
          people_count: people.length,
          after_employer_filter: filtered.length,
        }),
      )
      await refundApolloCredits(admin, PROCESS, 1)
      return await respondFailure('no_contacts', 422, { recordMiss: true })
    }

    const { person, creditError } = await matchPersonById(apolloKey, best.id)
    if (creditError || !person) {
      console.log(
        JSON.stringify({
          fn: 'premium-insights',
          phase: 'failure',
          job_match_id: jobMatchId,
          profile_id: profileId,
          code: creditError ? 'apollo_credit_error' : 'match_failed',
          person_id: best.id,
        }),
      )
      await refundApolloCredits(admin, PROCESS, 1)
      const failCode = creditError ? 'apollo_credit_error' : 'match_failed'
      return await respondFailure(failCode, creditError ? 403 : 422, {
        recordMiss: !creditError,
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

    console.log(
      JSON.stringify({
        fn: 'premium-insights',
        phase: 'complete',
        job_match_id: jobMatchId,
        profile_id: profileId,
        apollo_organization_id: organizationId,
        contact_count: contacts.length,
      }),
    )

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
    return await respondFailure('unexpected', 500)
  }
})
