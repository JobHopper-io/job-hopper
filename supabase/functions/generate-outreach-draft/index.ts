import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { OUTREACH_DRAFT_SYSTEM, extractOutreachDraft, outreachDraftUserMessage } from '../_shared/outreach-draft-prompt.ts'
import { callChatCompletion } from '../_shared/llm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
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

    const body = (await req.json()) as { request_id?: string }
    const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : ''
    if (!requestId) {
      return jsonResponse({ error: 'Missing request_id' }, 400)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: employerAccount, error: employerError } = await supabaseAdmin
      .from('employer_accounts')
      .select('id, company_name')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (employerError || !employerAccount) {
      return jsonResponse({ error: 'no_employer_account' }, 403)
    }

    const { data: revealRequest, error: fetchError } = await supabaseAdmin
      .from('employer_reveal_requests')
      .select(
        'id, employer_account_id, employer_company_name, role_title, pay_min, pay_max, pay_type, status, revealed_first_name, candidate_job_title, candidate_career_level, candidate_years_of_experience, outreach_draft_subject, outreach_draft_body, outreach_draft_generated_at',
      )
      .eq('id', requestId)
      .maybeSingle()

    if (fetchError || !revealRequest) {
      return jsonResponse({ error: 'request_not_found' }, 404)
    }
    if (revealRequest.employer_account_id !== employerAccount.id) {
      return jsonResponse({ error: 'forbidden' }, 403)
    }
    if (revealRequest.status !== 'approved') {
      return jsonResponse({ error: 'not_approved' }, 409)
    }

    if (revealRequest.outreach_draft_subject && revealRequest.outreach_draft_body) {
      return jsonResponse(
        {
          subject: revealRequest.outreach_draft_subject,
          body: revealRequest.outreach_draft_body,
          generatedAt: revealRequest.outreach_draft_generated_at,
          cached: true,
        },
        200,
      )
    }

    // Falls back to LLM_MODEL_WHY_FIT (not a hardcoded default) for the same reason
    // interview-practice/generate-skills-gap do - Supabase secrets are write-only, so there's
    // no way to read an existing secret's value back to copy into a new
    // LLM_MODEL_OUTREACH_DRAFT secret. Set LLM_MODEL_OUTREACH_DRAFT explicitly only if this
    // should use a different model than why-fit.
    const llmModel = Deno.env.get('LLM_MODEL_OUTREACH_DRAFT') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'

    const userMessage = outreachDraftUserMessage({
      employerCompanyName: revealRequest.employer_company_name,
      roleTitle: revealRequest.role_title || 'this role',
      payMin: revealRequest.pay_min,
      payMax: revealRequest.pay_max,
      payType: revealRequest.pay_type,
      candidateFirstName: revealRequest.revealed_first_name || 'there',
      candidateJobTitle: revealRequest.candidate_job_title,
      candidateCareerLevel: revealRequest.candidate_career_level,
      candidateYearsOfExperience: revealRequest.candidate_years_of_experience,
    })

    const chatResult = await callChatCompletion(
      [
        { role: 'system', content: OUTREACH_DRAFT_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      { model: llmModel },
    )
    if (!chatResult.ok) {
      console.error('generate-outreach-draft: chat completion failed', chatResult.error)
      return jsonResponse({ error: 'Outreach draft generation is temporarily unavailable' }, chatResult.status)
    }

    const draft = extractOutreachDraft(chatResult.content)
    if (!draft) {
      console.error('generate-outreach-draft: LLM response had no usable draft', { rawContent: chatResult.content })
      return jsonResponse({ error: 'Outreach draft generation returned no usable draft' }, 502)
    }

    const generatedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('employer_reveal_requests')
      .update({
        outreach_draft_subject: draft.subject,
        outreach_draft_body: draft.body,
        outreach_draft_generated_at: generatedAt,
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('generate-outreach-draft: failed to cache draft', updateError)
    }

    return jsonResponse({ subject: draft.subject, body: draft.body, generatedAt, cached: false }, 200)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
