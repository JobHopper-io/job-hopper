import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { ApolloCreditError, scoreOrganizationCandidates, searchOrganizationsByName } from '../_shared/apollo.ts'
import { refundApolloCredits, tryConsumeApolloCredits } from '../_shared/apollo-limits.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROCESS = 'employer_verification'

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null
  return domain.trim().toLowerCase().replace(/^www\./, '') || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apolloKey = Deno.env.get('APOLLO_API_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for verify-employer-account')
    return jsonResponse({ error: 'Server misconfiguration' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let body: { employer_account_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const employerAccountId = body.employer_account_id
  if (!employerAccountId) {
    return jsonResponse({ error: 'employer_account_id required' }, 400)
  }

  const { data: account, error: fetchError } = await supabase
    .from('employer_accounts')
    .select('id, company_name, work_email')
    .eq('id', employerAccountId)
    .maybeSingle()

  if (fetchError || !account) {
    console.error('employer_accounts row not found', employerAccountId, fetchError?.message)
    return jsonResponse({ error: 'employer_accounts row not found', details: fetchError?.message }, 404)
  }

  const workDomain = normalizeDomain(account.work_email.split('@')[1])

  // Apollo is the authoritative signal when it resolves cleanly. Any inconclusive outcome
  // (no match, ambiguous, credit exhaustion, API error) leaves verification_status exactly
  // as the signup-time heuristic (employers.domain match / free-email fallback) already set
  // it - this job never regresses a row to a worse state than it found it in, except for the
  // one case where Apollo actively contradicts the claimed company (see below).
  const consumed = await tryConsumeApolloCredits(supabase, PROCESS, 1)
  if (!consumed.ok) {
    console.log(
      JSON.stringify({ fn: 'verify-employer-account', outcome: 'apollo_exhausted', employerAccountId }),
    )
    return jsonResponse({ status: 'skipped_apollo_exhausted' }, 200)
  }

  let orgs
  try {
    orgs = await searchOrganizationsByName(apolloKey, account.company_name, null)
  } catch (e) {
    await refundApolloCredits(supabase, PROCESS, 1)
    const code = e instanceof ApolloCreditError ? 'apollo_credit_error' : 'org_search_error'
    console.log(
      JSON.stringify({
        fn: 'verify-employer-account',
        outcome: code,
        employerAccountId,
        message: e instanceof Error ? e.message : String(e),
      }),
    )
    return jsonResponse({ status: `skipped_${code}` }, 200)
  }

  const scored = scoreOrganizationCandidates(account.company_name, null, orgs)
  if (scored.kind !== 'picked') {
    await refundApolloCredits(supabase, PROCESS, 1)
    console.log(
      JSON.stringify({
        fn: 'verify-employer-account',
        outcome: 'inconclusive',
        scoreKind: scored.kind,
        employerAccountId,
      }),
    )
    return jsonResponse({ status: 'inconclusive', score_kind: scored.kind }, 200)
  }

  const apolloDomain = normalizeDomain(scored.best.primaryDomain)
  if (!apolloDomain) {
    // Confident company-name match, but Apollo has no domain on file for it - can't compare,
    // so this is inconclusive too, same as no_candidates/below_threshold above.
    await refundApolloCredits(supabase, PROCESS, 1)
    console.log(
      JSON.stringify({
        fn: 'verify-employer-account',
        outcome: 'inconclusive_no_domain',
        employerAccountId,
        apolloOrgName: scored.best.name,
      }),
    )
    return jsonResponse({ status: 'inconclusive', score_kind: 'no_domain' }, 200)
  }

  // A confident Apollo match whose domain doesn't match the claimed work email is a real
  // signal something's off (wrong company name, or an email that isn't actually theirs) -
  // downgrade to pending for human review rather than leaving a false "verified" in place.
  const newStatus = apolloDomain === workDomain ? 'verified' : 'pending'

  const { error: updateError } = await supabase
    .from('employer_accounts')
    .update({ verification_status: newStatus })
    .eq('id', employerAccountId)

  if (updateError) {
    console.error('Failed to update employer_accounts verification_status', updateError.message)
    return jsonResponse(
      { error: 'Failed to update verification_status', details: updateError.message },
      500,
    )
  }

  console.log(
    JSON.stringify({
      fn: 'verify-employer-account',
      outcome: 'resolved',
      employerAccountId,
      apolloOrgName: scored.best.name,
      apolloDomain,
      workDomain,
      newStatus,
    }),
  )

  return jsonResponse({ status: newStatus }, 200)
})
