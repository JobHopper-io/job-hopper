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
import { inferRoleCategoryFromJobText } from '../_shared/infer-role-category.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ERROR_RETRY_MS = 30 * 24 * 60 * 60 * 1000

interface ExternalPayload {
  company_name?: string
  job_title?: string
  job_url?: string
  job_description?: string
}

interface Body {
  external?: ExternalPayload
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
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
    console.warn('public-find-hiring-contact: apollo_usage_daily read failed', error.message)
    return { ok: true }
  }

  const cur = typeof data?.request_count === 'number' ? data.request_count : 0
  if (cur >= budget) return { ok: false, code: 'daily_budget_exhausted' }
  return { ok: true }
}

async function incrementApolloUsage(admin: SupabaseClient, delta: number): Promise<void> {
  const { error } = await admin.rpc('increment_apollo_usage_daily', { p_delta: delta })
  if (error) {
    console.warn('public-find-hiring-contact: increment_apollo_usage_daily failed', error.message)
  }
}

function tokenizeCompany(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function companyTokensOk(companyName: string): boolean {
  const tokens = tokenizeCompany(companyName)
  return tokens.length >= 2
}

async function hasActiveSubscription(admin: SupabaseClient, profileId: string): Promise<boolean> {
  const { data: subs } = await admin
    .from('subscriptions')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['trial', 'active'])
  return (subs?.length ?? 0) > 0
}

async function getTeaserLookupCount(admin: SupabaseClient, authUserId: string): Promise<number> {
  const { data, error } = await admin
    .from('public_teaser_hiring_contact_usage')
    .select('successful_lookups')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    console.warn('public-find-hiring-contact: teaser usage read failed', error.message)
    return 0
  }
  return typeof data?.successful_lookups === 'number' ? data.successful_lookups : 0
}

async function incrementTeaserUsage(admin: SupabaseClient, authUserId: string): Promise<number> {
  const { data, error } = await admin.rpc('increment_public_teaser_hiring_contact_usage', {
    p_auth_user_id: authUserId,
  })
  if (error) {
    console.warn('public-find-hiring-contact: increment teaser usage failed', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

type HiringRow = Record<string, unknown>

function redactRowForTeaser(row: HiringRow | null, reveal: boolean): HiringRow | null {
  if (!row || reveal) return row
  if (row.status !== 'found') return row
  const out = { ...row }
  out.email = null
  out.linkedin_url = null
  return out
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

  const ext = body.external ?? {}
  const companyRaw = typeof ext.company_name === 'string' ? ext.company_name.trim() : ''
  const titleRaw = typeof ext.job_title === 'string' ? ext.job_title.trim() : ''
  const descriptionRaw = typeof ext.job_description === 'string' ? ext.job_description.trim() : ''

  if (!companyRaw || !titleRaw) {
    return new Response(JSON.stringify({ error: 'company_name and job_title are required' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  if (!companyTokensOk(companyRaw)) {
    return new Response(JSON.stringify({ error: 'company_name_must_have_two_meaningful_tokens' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const limitRaw = Deno.env.get('PUBLIC_TEASER_LOOKUP_LIMIT')
  const teaserLimit = limitRaw == null || limitRaw === '' ? 3 : Number(limitRaw)
  const limitOk = Number.isFinite(teaserLimit) && teaserLimit > 0

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
    const subscribed = await hasActiveSubscription(admin, profileId)

    const normalizedKey =
      `${companyRaw.toLowerCase()}|${titleRaw.toLowerCase()}`
    const externalKey = await sha256Hex(normalizedKey)

    const revealContactDetails = subscribed

    const usedTeaser = limitOk && !subscribed ? await getTeaserLookupCount(admin, user.id) : 0

    const deps = await getApolloDeps()
    if (!deps) {
      return new Response(JSON.stringify({ error: 'Apollo is not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      })
    }

    const { data: cached } = await admin
      .from('job_hiring_contacts')
      .select('*')
      .eq('external_job_key', externalKey)
      .maybeSingle()

    if (cached?.status === 'error') {
      const created = cached.created_at ? Date.parse(cached.created_at as string) : 0
      if (Date.now() - created < ERROR_RETRY_MS) {
        const row = redactRowForTeaser(cached as HiringRow, revealContactDetails)
        return new Response(
          JSON.stringify({
            row,
            cached: true,
            reveal_contact_details: revealContactDetails,
            company_name: companyRaw,
            quota: limitOk && !subscribed ? { used: usedTeaser, limit: teaserLimit } : undefined,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }
      await admin.from('job_hiring_contacts').delete().eq('id', cached.id as string)
    } else if (cached) {
      const row = redactRowForTeaser(cached as HiringRow, revealContactDetails)
      return new Response(
        JSON.stringify({
          row,
          cached: true,
          reveal_contact_details: revealContactDetails,
          company_name: companyRaw,
          quota: limitOk && !subscribed ? { used: usedTeaser, limit: teaserLimit } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    if (limitOk && !subscribed && usedTeaser >= teaserLimit) {
      return new Response(
        JSON.stringify({
          error: 'quota_exhausted',
          quota: { used: usedTeaser, limit: teaserLimit },
          reveal_contact_details: false,
          company_name: companyRaw,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    const budget = await checkApolloBudget(admin)
    if (!budget.ok) {
      await admin.from('job_hiring_contacts').insert({
        external_job_key: externalKey,
        status: 'error',
        error_message: budget.code,
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin
        .from('job_hiring_contacts')
        .select('*')
        .eq('external_job_key', externalKey)
        .maybeSingle()
      const row = redactRowForTeaser(inserted as HiringRow, revealContactDetails)
      return new Response(
        JSON.stringify({
          row,
          cached: false,
          reveal_contact_details: revealContactDetails,
          company_name: companyRaw,
          quota: limitOk && !subscribed ? { used: usedTeaser, limit: teaserLimit } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    const roleCategory = inferRoleCategoryFromJobText(titleRaw, descriptionRaw)

    const domain = await resolveOrganizationDomain(deps, companyRaw)
    if (!domain) {
      await admin.from('job_hiring_contacts').insert({
        external_job_key: externalKey,
        status: 'not_found',
        apollo_raw: truncateApolloRaw({ reason: 'no_domain_for_company', company: companyRaw }),
        looked_up_by_profile_id: profileId,
      })
      await incrementApolloUsage(admin, 1)
      let newUsed = usedTeaser
      if (!subscribed && limitOk) {
        newUsed = await incrementTeaserUsage(admin, user.id)
      }
      const { data: inserted } = await admin
        .from('job_hiring_contacts')
        .select('*')
        .eq('external_job_key', externalKey)
        .maybeSingle()
      const row = redactRowForTeaser(inserted as HiringRow, revealContactDetails)
      return new Response(
        JSON.stringify({
          row,
          cached: false,
          reveal_contact_details: revealContactDetails,
          company_name: companyRaw,
          quota: limitOk && !subscribed ? { used: newUsed, limit: teaserLimit } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    const hits = await searchPeopleAtDomain(deps, domain, roleCategory)
    await incrementApolloUsage(admin, 1)

    const best = pickBestPerson(hits, roleCategory)
    if (!best?.id) {
      await admin.from('job_hiring_contacts').insert({
        external_job_key: externalKey,
        status: 'not_found',
        apollo_raw: truncateApolloRaw({ domain, hits: hits.length }),
        looked_up_by_profile_id: profileId,
      })
      let newUsed = usedTeaser
      if (!subscribed && limitOk) {
        newUsed = await incrementTeaserUsage(admin, user.id)
      }
      const { data: inserted } = await admin
        .from('job_hiring_contacts')
        .select('*')
        .eq('external_job_key', externalKey)
        .maybeSingle()
      const row = redactRowForTeaser(inserted as HiringRow, revealContactDetails)
      return new Response(
        JSON.stringify({
          row,
          cached: false,
          reveal_contact_details: revealContactDetails,
          company_name: companyRaw,
          quota: limitOk && !subscribed ? { used: newUsed, limit: teaserLimit } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    const reveal = await revealPersonEmails(deps, best.id)
    await incrementApolloUsage(admin, 1)

    if (!reveal.ok || !reveal.person) {
      await admin.from('job_hiring_contacts').insert({
        external_job_key: externalKey,
        status: 'error',
        apollo_person_id: best.id,
        apollo_raw: truncateApolloRaw({
          reveal_status: reveal.status,
          snippet: reveal.rawText.slice(0, 2000),
        }),
        error_message: `apollo_reveal_failed_${reveal.status}`,
        looked_up_by_profile_id: profileId,
      })
      const { data: inserted } = await admin
        .from('job_hiring_contacts')
        .select('*')
        .eq('external_job_key', externalKey)
        .maybeSingle()
      const row = redactRowForTeaser(inserted as HiringRow, revealContactDetails)
      return new Response(
        JSON.stringify({
          row,
          cached: false,
          reveal_contact_details: revealContactDetails,
          company_name: companyRaw,
          quota: limitOk && !subscribed ? { used: usedTeaser, limit: teaserLimit } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    const p = reveal.person
    const fullName =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      best.name ||
      null

    await admin.from('job_hiring_contacts').insert({
      external_job_key: externalKey,
      status: 'found',
      full_name: fullName,
      title: p.title ?? best.title ?? null,
      email: p.email ?? best.email ?? null,
      linkedin_url: p.linkedin_url ?? best.linkedin_url ?? null,
      apollo_person_id: p.id,
      apollo_raw: truncateApolloRaw({ search_hit: best, reveal: p }),
      looked_up_by_profile_id: profileId,
    })

    let newUsed = usedTeaser
    if (!subscribed && limitOk) {
      newUsed = await incrementTeaserUsage(admin, user.id)
    }

    const { data: inserted } = await admin
      .from('job_hiring_contacts')
      .select('*')
      .eq('external_job_key', externalKey)
      .maybeSingle()

    const row = redactRowForTeaser(inserted as HiringRow, revealContactDetails)

    return new Response(
      JSON.stringify({
        row,
        cached: false,
        reveal_contact_details: revealContactDetails,
        company_name: companyRaw,
        quota: limitOk && !subscribed ? { used: newUsed, limit: teaserLimit } : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('public-find-hiring-contact:', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
