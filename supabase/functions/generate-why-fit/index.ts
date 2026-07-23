import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { WHY_FIT_SYSTEM, extractWhyFitBullets, whyFitUserMessage } from '../_shared/why-fit-prompt.ts'

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
      .select(
        'id, current_job_title, target_job_title, years_of_experience, current_industry, target_role_categories, desired_salary_min, desired_salary_max, preferred_locations, open_to_relocation, open_to_remote',
      )
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    // Ownership check: the match must belong to the calling profile.
    const { data: match, error: matchError } = await supabaseAdmin
      .from('job_matches')
      .select('id, job_id, score, why_fit_bullets, why_fit_generated_at')
      .eq('id', jobMatchId)
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (matchError || !match) {
      return jsonResponse({ error: 'Job match not found' }, 404)
    }

    const cachedBullets = Array.isArray(match.why_fit_bullets) ? match.why_fit_bullets : null
    if (cachedBullets && cachedBullets.length > 0) {
      return jsonResponse(
        { bullets: cachedBullets, generatedAt: match.why_fit_generated_at, cached: true },
        200,
      )
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_hopper_live')
      .select('job_title, company_name, description, ai_job_briefing, location, is_remote, pay_min, pay_max, role_category')
      .eq('id', match.job_id)
      .maybeSingle()

    if (jobError || !job) {
      return jsonResponse({ error: 'Job not found for this match' }, 404)
    }

    const llmApiKey = Deno.env.get('LLM_API_KEY') ?? ''
    if (!llmApiKey) {
      return jsonResponse(
        { error: 'LLM_API_KEY must be set as an Edge Function secret (Dashboard → Edge Functions → Secrets).' },
        500,
      )
    }
    const llmBaseUrl = (Deno.env.get('LLM_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
    const llmModel = Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'

    const userMessage = whyFitUserMessage({
      currentJobTitle: profile.current_job_title,
      targetJobTitle: profile.target_job_title,
      yearsOfExperience: profile.years_of_experience,
      currentIndustry: profile.current_industry,
      targetRoleCategories: profile.target_role_categories ?? [],
      desiredSalaryMin: profile.desired_salary_min,
      desiredSalaryMax: profile.desired_salary_max,
      preferredLocations: profile.preferred_locations ?? [],
      openToRelocation: profile.open_to_relocation,
      openToRemote: profile.open_to_remote,
      jobTitle: job.job_title ?? 'Untitled role',
      companyName: job.company_name,
      jobDescription: job.ai_job_briefing || job.description,
      jobLocation: job.location,
      jobIsRemote: job.is_remote,
      jobPayMin: job.pay_min,
      jobPayMax: job.pay_max,
      jobRoleCategory: job.role_category,
      matchScore: match.score,
    })

    let chatRes: Response
    try {
      chatRes = await fetch(`${llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmApiKey}` },
        body: JSON.stringify({
          model: llmModel,
          temperature: 0.2,
          messages: [
            { role: 'system', content: WHY_FIT_SYSTEM },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (fetchErr) {
      console.error('generate-why-fit: LLM request failed', {
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      })
      return jsonResponse({ error: 'Why-fit generation is temporarily unavailable' }, 502)
    }

    if (!chatRes.ok) {
      const errText = await chatRes.text().catch(() => '')
      console.error('generate-why-fit: LLM returned an error', { status: chatRes.status, body: errText })
      return jsonResponse({ error: 'Why-fit generation failed' }, 502)
    }

    const chatData = (await chatRes.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const rawContent = chatData.choices?.[0]?.message?.content ?? null
    const bullets = extractWhyFitBullets(rawContent)

    if (bullets.length === 0) {
      console.error('generate-why-fit: LLM response had no usable bullets', { rawContent })
      return jsonResponse({ error: 'Why-fit generation returned no bullets' }, 502)
    }

    const generatedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('job_matches')
      .update({ why_fit_bullets: bullets, why_fit_generated_at: generatedAt })
      .eq('id', jobMatchId)

    if (updateError) {
      console.error('generate-why-fit: failed to cache bullets', updateError)
    }

    return jsonResponse({ bullets, generatedAt, cached: false }, 200)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
