import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { INTERVIEW_SYSTEM, extractInterviewTurn, interviewOpeningMessage } from '../_shared/interview-prompt.ts'
import { callChatCompletion, type ChatMessage } from '../_shared/llm.ts'
import { loadResumeText } from '../_shared/resume-text.ts'
import { resolveBaseTier } from '../_shared/base-tier.ts'

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

type TranscriptTurn = ChatMessage

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

    const body = (await req.json()) as {
      job_match_id?: string
      session_id?: string
      answer?: string
    }
    const jobMatchId = typeof body.job_match_id === 'string' ? body.job_match_id.trim() : ''
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''
    const answer = typeof body.answer === 'string' ? body.answer.trim() : ''

    if (!jobMatchId) {
      return jsonResponse({ error: 'Missing job_match_id' }, 400)
    }
    if (sessionId && !answer) {
      return jsonResponse({ error: 'Missing answer' }, 400)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, resume_bucket_key')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    // Ownership check: the match must belong to the calling profile.
    const { data: match, error: matchError } = await supabaseAdmin
      .from('job_matches')
      .select('id, job_id')
      .eq('id', jobMatchId)
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (matchError || !match) {
      return jsonResponse({ error: 'Job match not found' }, 404)
    }

    // Free tier: capped questions/day. Core/Premium: unlimited, RPC never called, quota omitted.
    const baseTier = await resolveBaseTier(supabaseAdmin, profile.id)
    let quota: { used: number; dailyLimit: number } | null = null
    if (baseTier === 'free') {
      const dailyLimit = Number(Deno.env.get('INTERVIEW_PRACTICE_DAILY_LIMIT') ?? '3')
      const { data: quotaRow, error: quotaError } = await supabaseAdmin.rpc('try_consume_interview_question', {
        p_profile_id: profile.id,
        p_daily_limit: dailyLimit,
      })
      const result = Array.isArray(quotaRow) ? quotaRow[0] : quotaRow
      if (quotaError || !result?.ok) {
        return jsonResponse(
          {
            error: 'quota_exceeded',
            used: result?.used ?? dailyLimit,
            dailyLimit,
          },
          403,
        )
      }
      quota = { used: result.used, dailyLimit }
    }

    let session: { id: string; resume_text: string | null; transcript: TranscriptTurn[] }

    if (sessionId) {
      const { data: existing, error: sessionError } = await supabaseAdmin
        .from('interview_sessions')
        .select('id, resume_text, transcript')
        .eq('id', sessionId)
        .eq('profile_id', profile.id)
        .eq('job_match_id', jobMatchId)
        .maybeSingle()

      if (sessionError || !existing) {
        return jsonResponse({ error: 'Interview session not found' }, 404)
      }
      session = {
        id: existing.id,
        resume_text: existing.resume_text,
        transcript: Array.isArray(existing.transcript) ? (existing.transcript as TranscriptTurn[]) : [],
      }
    } else {
      const { data: job, error: jobError } = await supabaseAdmin
        .from('job_hopper_live')
        .select('job_title, company_name, description, ai_job_briefing')
        .eq('id', match.job_id)
        .maybeSingle()

      if (jobError || !job) {
        return jsonResponse({ error: 'Job not found for this match' }, 404)
      }

      const resumeText = profile.resume_bucket_key
        ? await loadResumeText(supabaseAdmin, profile.resume_bucket_key)
        : null

      const opening: TranscriptTurn = {
        role: 'user',
        content: interviewOpeningMessage({
          jobTitle: job.job_title ?? 'Untitled role',
          companyName: job.company_name,
          jobDescription: job.ai_job_briefing || job.description,
          resumeText,
        }),
      }

      const { data: created, error: createError } = await supabaseAdmin
        .from('interview_sessions')
        .insert({ profile_id: profile.id, job_match_id: jobMatchId, resume_text: resumeText, transcript: [] })
        .select('id')
        .single()

      if (createError || !created) {
        console.error('interview-practice: failed to create session', createError)
        return jsonResponse({ error: 'Could not start interview session' }, 500)
      }

      session = { id: created.id, resume_text: resumeText, transcript: [opening] }
    }

    if (sessionId && answer) {
      session.transcript = [...session.transcript, { role: 'user', content: answer }]
    }

    // Falls back to LLM_MODEL_WHY_FIT (not a hardcoded default) because that secret is
    // already configured against whatever LLM_BASE_URL actually serves in this environment
    // - Supabase secrets are write-only, so there's no way to read its value back to copy
    // it into a new LLM_MODEL_INTERVIEW_PRACTICE secret. Set LLM_MODEL_INTERVIEW_PRACTICE
    // explicitly only if interview practice should use a different model than why-fit.
    const llmModel =
      Deno.env.get('LLM_MODEL_INTERVIEW_PRACTICE') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'
    const chatResult = await callChatCompletion(
      [{ role: 'system', content: INTERVIEW_SYSTEM }, ...session.transcript],
      { model: llmModel },
    )
    if (!chatResult.ok) {
      console.error('interview-practice: chat completion failed', chatResult.error)
      return jsonResponse({ error: 'Interview practice is temporarily unavailable' }, chatResult.status)
    }

    const turn = extractInterviewTurn(chatResult.content)
    if (!turn) {
      console.error('interview-practice: LLM response had no usable turn', { rawContent: chatResult.content })
      return jsonResponse({ error: 'Interview practice returned an unusable response' }, 502)
    }

    const updatedTranscript = [...session.transcript, { role: 'assistant' as const, content: chatResult.content }]

    const { error: saveError } = await supabaseAdmin
      .from('interview_sessions')
      .update({ transcript: updatedTranscript, updated_at: new Date().toISOString() })
      .eq('id', session.id)

    if (saveError) {
      console.error('interview-practice: failed to save transcript', saveError)
    }

    return jsonResponse(
      {
        session_id: session.id,
        feedback: turn.feedback,
        question: turn.question,
        quota,
      },
      200,
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
