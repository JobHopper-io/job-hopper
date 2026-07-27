import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { SKILLS_GAP_SYSTEM, extractSkillsGap, skillsGapUserMessage } from '../_shared/skills-gap-prompt.ts'
import { callChatCompletion } from '../_shared/llm.ts'
import { loadResumeText } from '../_shared/resume-text.ts'

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

    const body = (await req.json()) as { job_match_id?: string }
    const jobMatchId = typeof body.job_match_id === 'string' ? body.job_match_id.trim() : ''
    if (!jobMatchId) {
      return jsonResponse({ error: 'Missing job_match_id' }, 400)
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
      .select('id, job_id, skills_gap, skills_gap_generated_at')
      .eq('id', jobMatchId)
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (matchError || !match) {
      return jsonResponse({ error: 'Job match not found' }, 404)
    }

    if (match.skills_gap) {
      return jsonResponse(
        { ...(match.skills_gap as Record<string, unknown>), generatedAt: match.skills_gap_generated_at, cached: true },
        200,
      )
    }

    if (!profile.resume_bucket_key?.trim()) {
      return jsonResponse({ error: 'no_resume' }, 400)
    }

    const resumeText = await loadResumeText(supabaseAdmin, profile.resume_bucket_key)
    if (!resumeText) {
      return jsonResponse({ error: 'Could not read your resume - try re-uploading it' }, 422)
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_hopper_live')
      .select('job_title, company_name, description, ai_job_briefing')
      .eq('id', match.job_id)
      .maybeSingle()

    if (jobError || !job) {
      return jsonResponse({ error: 'Job not found for this match' }, 404)
    }

    // Falls back to LLM_MODEL_WHY_FIT (not a hardcoded default) for the same reason
    // interview-practice does - Supabase secrets are write-only, so there's no way to read
    // an existing secret's value back to copy into a new LLM_MODEL_SKILLS_GAP secret. Set
    // LLM_MODEL_SKILLS_GAP explicitly only if this should use a different model than why-fit.
    const llmModel = Deno.env.get('LLM_MODEL_SKILLS_GAP') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'

    const userMessage = skillsGapUserMessage({
      jobTitle: job.job_title ?? 'Untitled role',
      companyName: job.company_name,
      jobDescription: job.ai_job_briefing || job.description,
      resumeText,
    })

    const chatResult = await callChatCompletion(
      [
        { role: 'system', content: SKILLS_GAP_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      { model: llmModel },
    )
    if (!chatResult.ok) {
      console.error('generate-skills-gap: chat completion failed', chatResult.error)
      return jsonResponse({ error: 'Skills gap analysis is temporarily unavailable' }, chatResult.status)
    }

    const gap = extractSkillsGap(chatResult.content)
    if (!gap) {
      console.error('generate-skills-gap: LLM response had no usable shape', { rawContent: chatResult.content })
      return jsonResponse({ error: 'Skills gap analysis returned an unusable response' }, 502)
    }

    const generatedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('job_matches')
      .update({ skills_gap: gap, skills_gap_generated_at: generatedAt })
      .eq('id', jobMatchId)

    if (updateError) {
      console.error('generate-skills-gap: failed to cache result', updateError)
    }

    return jsonResponse({ ...gap, generatedAt, cached: false }, 200)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
