import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { fulfillResumeProductViaN8n } from '../_shared/n8n-resume-fulfillment.ts'
import { getFreemiumSettings } from '../_shared/freemium-settings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const body = (await req.json()) as { job_match_id?: string }
    const jobMatchId = typeof body.job_match_id === 'string' ? body.job_match_id.trim() : ''
    if (!jobMatchId) {
      return new Response(JSON.stringify({ error: 'Missing job_match_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: profile, error: profileError } = await supabaseAdmin
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

    const settings = await getFreemiumSettings(supabaseAdmin)
    if (settings.max_resume_advice <= 0) {
      return new Response(JSON.stringify({ error: 'Free resume advice is disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const { data: limitsExists } = await supabaseAdmin
      .from('freemium_usage')
      .select('profile_id')
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (!limitsExists) {
      const { error: insertLimErr } = await supabaseAdmin.from('freemium_usage').insert({
        profile_id: profile.id,
        selected_tier_key: 'entry_mid',
        job_searches_used: 0,
        resume_advice_used: 0,
      })
      if (insertLimErr) {
        console.error('freemium-resume-advice: failed to create freemium_usage', insertLimErr)
        return new Response(JSON.stringify({ error: 'Freemium limits not available' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
    }

    const { data: productRow, error: productError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('key', 'per_job_resume_advice')
      .maybeSingle()

    if (productError || !productRow?.id) {
      return new Response(JSON.stringify({ error: 'Resume advice product not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const { data: redeemRows, error: redeemError } = await supabaseAdmin.rpc(
      'redeem_freemium_resume_advice',
      {
        p_profile_id: profile.id,
        p_job_match_id: jobMatchId,
        p_product_id: productRow.id,
      },
    )

    if (redeemError) {
      console.error('freemium-resume-advice: rpc failed', redeemError)
      return new Response(JSON.stringify({ error: 'Failed to redeem free resume advice' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const row = Array.isArray(redeemRows) ? redeemRows[0] : null
    if (!row?.ok) {
      const err = typeof row?.err === 'string' ? row.err : 'unknown'
      const status = err === 'not_found' ? 404 : err === 'already_purchased' ? 409 : 403
      return new Response(
        JSON.stringify({
          error:
            err === 'quota_exceeded'
              ? 'No free resume advice redemptions remaining'
              : err === 'already_purchased'
                ? 'Resume advice already exists for this job'
                : err === 'not_found'
                  ? 'Job match not found'
                  : err === 'disabled'
                    ? 'Free resume advice is disabled'
                    : 'Cannot redeem free resume advice',
          code: err,
          resumeAdviceUsed: row?.resume_advice_used ?? 0,
          resumeAdviceRemaining: Math.max(
            0,
            (row?.max_resume_advice ?? settings.max_resume_advice) - (row?.resume_advice_used ?? 0),
          ),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status,
        },
      )
    }

    const resumeProductId = row.resume_product_id as string
    const maxResume = typeof row.max_resume_advice === 'number' ? row.max_resume_advice : settings.max_resume_advice
    const used = typeof row.resume_advice_used === 'number' ? row.resume_advice_used : 0

    EdgeRuntime.waitUntil(
      fulfillResumeProductViaN8n({
        supabaseAdmin,
        resumeProductId,
        productKey: 'per_job_resume_advice',
        profileId: profile.id,
        jobMatchId,
      }).catch((err) =>
        console.error('[freemium-resume-advice] n8n fulfillment rejected', {
          resumeProductId,
          message: err instanceof Error ? err.message : String(err),
        }),
      ),
    )

    return new Response(
      JSON.stringify({
        resumeProductId,
        resumeAdviceUsed: used,
        resumeAdviceRemaining: Math.max(0, maxResume - used),
        maxResumeAdvice: maxResume,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
