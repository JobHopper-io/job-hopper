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
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (employerError || !employerAccount) {
    return jsonResponse({ error: 'no_employer_account' }, 403)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  const requestId = body.request_id
  if (!requestId) {
    return jsonResponse({ error: 'missing_request_id' }, 400)
  }

  const { data: revealRequest, error: fetchError } = await supabaseAdmin
    .from('employer_reveal_requests')
    .select('id, employer_account_id, status')
    .eq('id', requestId)
    .maybeSingle()

  if (fetchError || !revealRequest) {
    return jsonResponse({ error: 'request_not_found' }, 404)
  }
  if (revealRequest.employer_account_id !== employerAccount.id) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }
  // Only a still-open request can be withdrawn - once the seeker has approved or declined,
  // that outcome is final and isn't something the employer can retract.
  if (revealRequest.status !== 'pending') {
    return jsonResponse({ error: 'not_pending' }, 409)
  }

  const { error: updateError } = await supabaseAdmin
    .from('employer_reveal_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) {
    console.error('employer-cancel-reveal-request update failed', updateError.message)
    return jsonResponse({ error: 'cancel_failed' }, 500)
  }

  return jsonResponse({ success: true }, 200)
})
