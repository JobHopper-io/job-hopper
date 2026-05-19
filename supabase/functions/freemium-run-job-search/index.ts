import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { getFreemiumSettings } from '../_shared/freemium-settings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Max new matches a single freemium manual run may create (passed to match-jobs). */
const FREEMIUM_MANUAL_RUN_MATCH_LIMIT = 5

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
        console.error('freemium-run-job-search: failed to create freemium_usage', insertLimErr)
        return new Response(JSON.stringify({ error: 'Freemium limits not available' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
    }

    const { count: subCount, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])

    if (subError) {
      console.error('freemium-run-job-search: subscription count failed', subError)
      return new Response(JSON.stringify({ error: 'Server error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if ((subCount ?? 0) > 0) {
      return new Response(JSON.stringify({ error: 'Manual job search is only for users without an active subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const settings = await getFreemiumSettings(supabaseAdmin)
    if (settings.max_job_searches <= 0) {
      return new Response(JSON.stringify({ error: 'Manual job search is disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const { data: limitsRow, error: limitsReadError } = await supabaseAdmin
      .from('freemium_usage')
      .select('selected_tier_key, job_searches_used')
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (limitsReadError || !limitsRow?.selected_tier_key) {
      return new Response(JSON.stringify({ error: 'Freemium limits not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const { data: consumeRows, error: consumeError } = await supabaseAdmin.rpc(
      'try_consume_freemium_job_search',
      { p_profile_id: profile.id },
    )

    if (consumeError) {
      console.error('freemium-run-job-search: rpc failed', consumeError)
      return new Response(JSON.stringify({ error: 'Failed to reserve job search' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const consume = Array.isArray(consumeRows) ? consumeRows[0] : null
    const success = Boolean(consume?.success)
    const maxJobSearches = typeof consume?.max_job_searches === 'number' ? consume.max_job_searches : settings.max_job_searches
    let jobSearchesUsed = typeof consume?.job_searches_used === 'number' ? consume.job_searches_used : limitsRow.job_searches_used

    if (!success) {
      return new Response(
        JSON.stringify({
          error: 'No manual job searches remaining',
          jobSearchesUsed,
          jobSearchesRemaining: Math.max(0, maxJobSearches - jobSearchesUsed),
          maxJobSearches,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      )
    }

    const matchUrl = `${supabaseUrl}/functions/v1/match-jobs`
    const matchRes = await fetch(matchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        profile_id: profile.id,
        limit: FREEMIUM_MANUAL_RUN_MATCH_LIMIT,
        subscription_tier_product_keys: [limitsRow.selected_tier_key],
      }),
    })

    const matchJson = (await matchRes.json().catch(() => ({}))) as Record<string, unknown>

    if (!matchRes.ok) {
      const prevUsed = jobSearchesUsed > 0 ? jobSearchesUsed - 1 : 0
      await supabaseAdmin
        .from('freemium_usage')
        .update({ job_searches_used: prevUsed })
        .eq('profile_id', profile.id)

      return new Response(
        JSON.stringify({
          error: typeof matchJson.error === 'string' ? matchJson.error : 'Job matching failed',
          details: matchJson,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        },
      )
    }

    const stored = typeof matchJson.stored === 'number' ? matchJson.stored : 0
    jobSearchesUsed = typeof consume?.job_searches_used === 'number' ? consume.job_searches_used : jobSearchesUsed

    return new Response(
      JSON.stringify({
        matchesCreated: stored,
        jobSearchesUsed,
        jobSearchesRemaining: Math.max(0, maxJobSearches - jobSearchesUsed),
        maxJobSearches,
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
