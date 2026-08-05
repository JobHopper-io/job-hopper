import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { normalizeCompanyName } from '../_shared/apollo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_RESULTS = 50
// Cap on rows pulled from the DB before in-memory filtering (role/location/exclusion) -
// keeps the query itself to a single cheap indexable predicate.
const FETCH_CAP = 200

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

type SearchBody = {
  role_category?: string
  career_level?: string
  location?: string
}

type CandidateRow = {
  id: string
  current_job_title: string | null
  career_level: string | null
  years_of_experience: number | null
  target_role_categories: string[] | null
  preferred_locations: string[] | null
  current_employer: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'No authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: employerAccount, error: employerError } = await supabaseAdmin
    .from('employer_accounts')
    .select('company_name, verification_status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (employerError || !employerAccount) {
    return jsonResponse({ error: 'no_employer_account' }, 403)
  }
  // Pending/rejected accounts can't search yet - manual review (Phase 6) isn't built, but
  // the gate belongs here regardless so an unreviewed signup can't already browse candidates.
  if (employerAccount.verification_status !== 'verified') {
    return jsonResponse({ error: 'not_verified' }, 403)
  }

  let body: SearchBody
  try {
    body = (await req.json()) as SearchBody
  } catch {
    body = {}
  }

  let query = supabaseAdmin
    .from('profiles')
    .select(
      'id, current_job_title, career_level, years_of_experience, target_role_categories, preferred_locations, current_employer',
    )
    .eq('recruiter_visible', true)
    .limit(FETCH_CAP)

  if (body.career_level) {
    query = query.eq('career_level', body.career_level)
  }

  const { data: rows, error: searchError } = await query.returns<CandidateRow[]>()

  if (searchError) {
    console.error('employer-candidate-search query failed', searchError.message)
    return jsonResponse({ error: 'search_failed' }, 500)
  }

  const roleCategory = body.role_category?.trim() || null
  const locationQuery = body.location?.trim().toLowerCase() || null
  // Same normalization used for employer signup verification (strip legal suffixes,
  // lowercase) - simplest reliable method per the plan; known gap: spelling variants on
  // either side ("Acme" vs "Acme Inc") can slip through undetected.
  const employerNameNormalized = normalizeCompanyName(employerAccount.company_name)

  const results = (rows ?? [])
    .filter((c) => {
      if (c.current_employer && normalizeCompanyName(c.current_employer) === employerNameNormalized) {
        return false
      }
      if (roleCategory && !(c.target_role_categories ?? []).includes(roleCategory)) {
        return false
      }
      if (locationQuery) {
        const locations = (c.preferred_locations ?? []).map((l) => l.toLowerCase())
        if (!locations.some((l) => l.includes(locationQuery))) return false
      }
      return true
    })
    .slice(0, MAX_RESULTS)
    .map((c) => ({
      id: c.id,
      current_job_title: c.current_job_title,
      career_level: c.career_level,
      years_of_experience: c.years_of_experience,
      target_role_categories: c.target_role_categories,
      preferred_locations: c.preferred_locations,
      // Deliberately excluded: name, email, phone, resume, current_employer - never leaves
      // this function for a candidate row, per the plan's anonymized-results requirement.
    }))

  return jsonResponse({ candidates: results }, 200)
})
