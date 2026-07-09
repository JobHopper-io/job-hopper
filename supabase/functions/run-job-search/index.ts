import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Subscriber (Core/Premium) manual "Run job search".
 *
 * Counterpart to `freemium-run-job-search` (which is for users WITHOUT a subscription):
 * this lets a paying subscriber trigger a matching pass on demand instead of waiting for
 * the next automated digest — important for a fresh account with no match history.
 *
 * Unlike the freemium path there is no per-search credit consumption and no hard cap;
 * abuse is limited by the caller's button-disabled state while a run is in flight. The
 * matching tier is derived from the profile's career level inside `match-jobs`.
 */
const SUBSCRIBER_MANUAL_RUN_MATCH_LIMIT = 15

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
      .select('id, onboarding_completed, career_level')
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

    // Without a career level the tier gate in match-jobs rejects every job, which would
    // surface as a confusing "0 matches" success. Fail loudly instead. (Legacy profiles
    // onboarded before the career_level migration can hit this.)
    if (!profile.career_level) {
      return new Response(
        JSON.stringify({
          error:
            'Your profile has no career level set, so matching cannot run. Update your profile (career level) and try again.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        },
      )
    }

    // This endpoint is for subscribers only; users without an active subscription use
    // `freemium-run-job-search` (which enforces the free-tier search cap).
    const { count: subCount, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])

    if (subError) {
      console.error('run-job-search: subscription count failed', subError)
      return new Response(JSON.stringify({ error: 'Server error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if ((subCount ?? 0) === 0) {
      return new Response(
        JSON.stringify({ error: 'Manual job search requires an active subscription' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      )
    }

    // Matching tier is resolved from the profile's career level inside match-jobs when
    // subscription_tier_product_keys is omitted.
    const matchUrl = `${supabaseUrl}/functions/v1/match-jobs`
    const matchRes = await fetch(matchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        profile_id: profile.id,
        limit: SUBSCRIBER_MANUAL_RUN_MATCH_LIMIT,
      }),
    })

    const matchJson = (await matchRes.json().catch(() => ({}))) as Record<string, unknown>

    if (!matchRes.ok) {
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

    return new Response(JSON.stringify({ matchesCreated: stored }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('run-job-search: unexpected error', err)
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
