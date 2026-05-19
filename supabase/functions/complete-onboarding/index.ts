import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { isFreemiumBasePlanTierKey } from '../_shared/freemium-tier-keys.ts'

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

    const body = (await req.json()) as { selectedTierKey?: string }
    const tier = typeof body.selectedTierKey === 'string' ? body.selectedTierKey.trim() : ''
    if (!isFreemiumBasePlanTierKey(tier)) {
      return new Response(JSON.stringify({ error: 'Invalid selectedTierKey' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, auth_user_id, onboarding_completed')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (profile.onboarding_completed === true) {
      return new Response(JSON.stringify({ error: 'Onboarding already completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      })
    }

    const { count: subCount, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .in('status', ['trial', 'active'])

    if (subError) {
      console.error('complete-onboarding: subscription count failed', subError)
      return new Response(JSON.stringify({ error: 'Server error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if ((subCount ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: 'Use the billing flow when you already have a subscription' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        },
      )
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', profile.id)

    if (profileUpdateError) {
      console.error('complete-onboarding: profile update failed', profileUpdateError)
      return new Response(JSON.stringify({ error: 'Failed to complete onboarding' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const { error: limitsError } = await supabaseAdmin.from('freemium_usage').upsert(
      {
        profile_id: profile.id,
        selected_tier_key: tier,
        job_searches_used: 0,
        resume_advice_used: 0,
        premium_insights_used: 0,
      },
      { onConflict: 'profile_id' },
    )

    if (limitsError) {
      console.error('complete-onboarding: freemium_usage upsert failed', limitsError)
      await supabaseAdmin.from('profiles').update({ onboarding_completed: false }).eq('id', profile.id)
      return new Response(JSON.stringify({ error: 'Failed to save freemium usage' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    return new Response(JSON.stringify({ ok: true, profile_id: profile.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
