import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const LOG = '[resume-advice-callback]'

// Same shape used elsewhere in the repo (see admin-job-processor).
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const header = req.headers.get('x-cron-secret')
  if (cronSecret && header === cronSecret) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization')
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
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

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  let body: { resumeProductId?: unknown; improvements?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const resumeProductId = typeof body.resumeProductId === 'string' ? body.resumeProductId.trim() : ''
  const improvements = typeof body.improvements === 'string' ? body.improvements.trim() : ''

  if (!uuidRe.test(resumeProductId)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid resumeProductId' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  if (!improvements) {
    return new Response(JSON.stringify({ error: 'Missing or empty improvements' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG} missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`)
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // Match on id only: a late success must outrank a 'failed' verdict written by the
  // stale-row sweeper in run-scheduled-jobs, so we do not filter on current status.
  const { data, error } = await supabaseAdmin
    .from('resume_products')
    .update({
      status: 'complete',
      improvements_text: improvements,
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', resumeProductId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`${LOG} update failed`, { resumeProductId, message: error.message })
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  if (!data) {
    console.warn(`${LOG} no resume_products row for id`, { resumeProductId })
    return new Response(JSON.stringify({ error: 'Resume product not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    })
  }

  console.log(`${LOG} row completed`, { resumeProductId, improvementsChars: improvements.length })
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
