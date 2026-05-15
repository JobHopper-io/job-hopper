import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  pickBestPerson,
  revealPersonEmails,
  resolveOrganizationDomain,
  searchPeopleAtDomain,
  truncateApolloRaw,
  type ApolloLookupDeps,
} from '../_shared/apollo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ERROR_RETRY_MS = 30 * 24 * 60 * 60 * 1000

interface Body {
  job_id?: string
}

function isoUtcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getApolloDeps(): Promise<ApolloLookupDeps | null> {
  const apiKey = Deno.env.get('APOLLO_API_KEY') ?? ''
  if (!apiKey.trim()) return null
  const headerName = Deno.env.get('APOLLO_HEADER_NAME') ?? 'X-Api-Key'
  return { apiKey: apiKey.trim(), headerName }
}

async function checkApolloBudget(admin: SupabaseClient): Promise<{ ok: true } | { ok: false; code: string }> {
  const budgetRaw = Deno.env.get('APOLLO_DAILY_BUDGET')
  const budget = budgetRaw == null || budgetRaw === '' ? 200 : Number(budgetRaw)
  if (!Number.isFinite(budget) || budget <= 0) return { ok: true }

  const usage_date = isoUtcDay()
  const { data, error } = await admin
    .from('apollo_usage_daily')
    .select('request_count')
    .eq('usage_date', usage_date)
    .maybeSingle()

  if (error) {
    console.warn('find-hiring-contact: apollo_usage_daily read failed', error.message)
    return { ok: true }
  }

  const cur = typeof data?.request_count === 'number' ? data.request_count : 0
  if (cur >= budget) return { ok: false, code: 'daily_budget_exhausted' }
  return { ok: true }
}

async function incrementApolloUsage(admin: SupabaseClient, delta: number): Promise<void> {
  const { error } = await admin.rpc('increment_apollo_usage_daily', { p_delta: delta })
  if (error) {
    console.warn('find-hiring-contact: increment_apollo_usage_daily failed', error.message)
  }
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()

  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : ''

  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profileError || !profile?.id) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const profileId = profile.id as string

    const { data: subs } = await admin
      .from('subscriptions')
      .select('id')
      .eq('profile_id', profileId)
      .in('status', ['trial', 'active'])

    if (!subs?.length) {
      return new Response(JSON.stringify({ error: 'Active subscription required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const deps = await getApolloDeps()
    if (!deps) {
      return new Response(JSON.stringify({ error: 'Apollo is not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      })
    }

    const { data: matchRow } = await admin
      .from('job_matches')
      .select('id')
      .eq('profile_id', profileId)
      .eq('job_id', jobId)
      .maybeSingle()

    if (!matchRow?.id) {
      return new Response(JSON.stringify({ error: 'Job match not found for this profile' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const { data: cached } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()

    if (cached?.status === 'error') {
      const created = cached.created_at ? Date.parse(cached.created_at as string) : 0
      if (Date.now() - created < ERROR_RETRY_MS) {
        return new Response(JSON.stringify({ row: cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      await admin.from('job_hiring_contacts').delete().eq('id', cached.id as string)
    } else if (cached) {
      return new Response(JSON.stringify({ row: cached, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const budget = await checkApolloBudget(admin)
    if (!budget.ok) {
      await admin.from('job_hiring_contacts').insert({
        job_id: jobId,
        status: 'error',
        error_message: budget.code,
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()
      return new Response(JSON.stringify({ row: inserted, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const { data: job, error: jobErr } = await admin
      .from('job_hopper_live')
      .select('id, company_name, role_category')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const companyName = (job.company_name as string | null)?.trim() ?? ''
    if (!companyName) {
      await admin.from('job_hiring_contacts').insert({
        job_id: jobId,
        status: 'error',
        error_message: 'missing_company_name',
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()
      return new Response(JSON.stringify({ row: inserted, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const domain = await resolveOrganizationDomain(deps, companyName)
    if (!domain) {
      await admin.from('job_hiring_contacts').insert({
        job_id: jobId,
        status: 'not_found',
        apollo_raw: truncateApolloRaw({ reason: 'no_domain_for_company', company: companyName }),
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()
      return new Response(JSON.stringify({ row: inserted, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const roleCategory = job.role_category as string | undefined
    const hits = await searchPeopleAtDomain(deps, domain, roleCategory)
    await incrementApolloUsage(admin, 1)

    const best = pickBestPerson(hits, roleCategory)
    if (!best?.id) {
      await admin.from('job_hiring_contacts').insert({
        job_id: jobId,
        status: 'not_found',
        apollo_raw: truncateApolloRaw({ domain, hits: hits.length }),
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()
      return new Response(JSON.stringify({ row: inserted, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const reveal = await revealPersonEmails(deps, best.id)
    await incrementApolloUsage(admin, 1)

    if (!reveal.ok || !reveal.person) {
      await admin.from('job_hiring_contacts').insert({
        job_id: jobId,
        status: 'error',
        apollo_person_id: best.id,
        apollo_raw: truncateApolloRaw({ reveal_status: reveal.status, snippet: reveal.rawText.slice(0, 2000) }),
        error_message: `apollo_reveal_failed_${reveal.status}`,
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()
      return new Response(JSON.stringify({ row: inserted, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const p = reveal.person
    const fullName =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      best.name ||
      null

    await admin.from('job_hiring_contacts').insert({
      job_id: jobId,
      status: 'found',
      full_name: fullName,
      title: p.title ?? best.title ?? null,
      email: p.email ?? best.email ?? null,
      linkedin_url: p.linkedin_url ?? best.linkedin_url ?? null,
      apollo_person_id: p.id,
      apollo_raw: truncateApolloRaw({ search_hit: best, reveal: p }),
      looked_up_by_profile_id: profileId,
    })

    const { data: inserted } = await admin.from('job_hiring_contacts').select('*').eq('job_id', jobId).maybeSingle()

    return new Response(JSON.stringify({ row: inserted, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('find-hiring-contact:', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
