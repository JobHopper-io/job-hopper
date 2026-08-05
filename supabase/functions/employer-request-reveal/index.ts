import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { normalizeCompanyName } from '../_shared/apollo.ts'
import { sendEmail } from '../_shared/email.ts'
import { renderRevealRequestReceived } from '../_shared/email-templates.ts'
import { getFooterLinksForProfile } from '../_shared/unsubscribe-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

type RequestBody = {
  candidate_profile_id?: string
}

type CandidateRow = {
  id: string
  recruiter_visible: boolean
  current_employer: string | null
  current_job_title: string | null
  career_level: string | null
  years_of_experience: number | null
  target_role_categories: string[] | null
  preferred_locations: string[] | null
  email: string
  first_name: string
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
    .select('id, company_name, verification_status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (employerError || !employerAccount) {
    return jsonResponse({ error: 'no_employer_account' }, 403)
  }
  if (employerAccount.verification_status !== 'verified') {
    return jsonResponse({ error: 'not_verified' }, 403)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  const candidateProfileId = body.candidate_profile_id
  if (!candidateProfileId) {
    return jsonResponse({ error: 'missing_candidate_profile_id' }, 400)
  }

  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, recruiter_visible, current_employer, current_job_title, career_level, years_of_experience, target_role_categories, preferred_locations, email, first_name',
    )
    .eq('id', candidateProfileId)
    .maybeSingle<CandidateRow>()

  if (candidateError || !candidate) {
    return jsonResponse({ error: 'candidate_not_found' }, 404)
  }

  // Re-validate server-side rather than trusting the client's (possibly stale) search result -
  // same exclusion rules employer-candidate-search applies at query time.
  if (!candidate.recruiter_visible) {
    return jsonResponse({ error: 'candidate_not_found' }, 404)
  }
  if (
    candidate.current_employer &&
    normalizeCompanyName(candidate.current_employer) === normalizeCompanyName(employerAccount.company_name)
  ) {
    return jsonResponse({ error: 'candidate_not_found' }, 404)
  }

  const { error: insertError } = await supabaseAdmin.from('employer_reveal_requests').insert({
    employer_account_id: employerAccount.id,
    candidate_profile_id: candidate.id,
    employer_company_name: employerAccount.company_name,
    candidate_job_title: candidate.current_job_title,
    candidate_career_level: candidate.career_level,
    candidate_years_of_experience: candidate.years_of_experience,
    candidate_target_role_categories: candidate.target_role_categories,
    candidate_preferred_locations: candidate.preferred_locations,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return jsonResponse({ error: 'already_requested' }, 409)
    }
    console.error('employer-request-reveal insert failed', insertError.message)
    return jsonResponse({ error: 'request_failed' }, 500)
  }

  // Best-effort notification - a failed send shouldn't fail the request itself.
  try {
    const { data: settings } = await supabaseAdmin
      .from('notification_settings')
      .select('email_unsubscribed_at')
      .eq('profile_id', candidate.id)
      .maybeSingle()

    if (!settings?.email_unsubscribed_at) {
      const footer = await getFooterLinksForProfile(candidate.id)
      const { html, text } = renderRevealRequestReceived({
        recipientName: candidate.first_name || 'there',
        employerCompanyName: employerAccount.company_name,
        requestsUrl: `${footer.siteUrl}/reveal-requests`,
        footer,
      })
      await sendEmail({
        to: candidate.email,
        subject: `${employerAccount.company_name} wants to learn more about you`,
        html,
        text,
        profileId: candidate.id,
        eventType: 'reveal_request_received',
        templateKey: 'reveal_request_received',
        payload: { employer_account_id: employerAccount.id },
        supabase: supabaseAdmin,
      })
    }
  } catch (err) {
    console.error('employer-request-reveal notification failed', err instanceof Error ? err.message : err)
  }

  return jsonResponse({ success: true }, 200)
})
