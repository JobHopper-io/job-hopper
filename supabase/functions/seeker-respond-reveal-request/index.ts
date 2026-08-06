import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

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
  request_id?: string
  decision?: 'approved' | 'declined'
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, phone_number')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return jsonResponse({ error: 'no_profile' }, 403)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  const { request_id, decision } = body
  if (!request_id || (decision !== 'approved' && decision !== 'declined')) {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  const { data: revealRequest, error: fetchError } = await supabaseAdmin
    .from('employer_reveal_requests')
    .select('id, candidate_profile_id, status')
    .eq('id', request_id)
    .maybeSingle()

  if (fetchError || !revealRequest) {
    return jsonResponse({ error: 'request_not_found' }, 404)
  }
  if (revealRequest.candidate_profile_id !== profile.id) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }
  if (revealRequest.status !== 'pending') {
    return jsonResponse({ error: 'already_responded' }, 409)
  }

  const update =
    decision === 'approved'
      ? {
          status: 'approved',
          responded_at: new Date().toISOString(),
          revealed_first_name: profile.first_name,
          revealed_last_name: profile.last_name,
          revealed_email: profile.email,
          revealed_phone_number: profile.phone_number,
        }
      : {
          status: 'declined',
          responded_at: new Date().toISOString(),
        }

  const { error: updateError } = await supabaseAdmin
    .from('employer_reveal_requests')
    .update(update)
    .eq('id', request_id)

  if (updateError) {
    console.error('seeker-respond-reveal-request update failed', updateError.message)
    return jsonResponse({ error: 'respond_failed' }, 500)
  }

  return jsonResponse({ success: true }, 200)
})
