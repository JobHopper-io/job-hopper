import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

// Public support chat proxy. The widget used to call the n8n RAG webhook directly with
// its key compiled into the public bundle; the key now stays here, and each visitor IP
// is rate limited so bots can't run up LLM/n8n costs.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_MESSAGE_LENGTH = 1000
const MAX_REQUESTS_PER_HOUR = 20
const N8N_TIMEOUT_MS = 30_000

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const webhookUrl = Deno.env.get('RAG_CHAT_WEBHOOK_URL')
  const webhookAuth = Deno.env.get('RAG_CHAT_AUTH')
  if (!webhookUrl || !webhookAuth) {
    console.error('support-chat: RAG_CHAT_WEBHOOK_URL / RAG_CHAT_AUTH not set')
    return json({ error: 'Chat is not configured' }, 500)
  }

  try {
    const body = await req.json().catch(() => null)
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return json({ error: 'Message is required' }, 400)
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.` }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    // First hop of x-forwarded-for is the client as seen by the Supabase edge.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const ipHash = await sha256(ip)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error: countError } = await supabase
      .from('support_chat_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', hourAgo)
    if (countError) throw new Error(`rate-limit count: ${countError.message}`)

    if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
      return json({ error: 'You’ve sent a lot of messages. Please try again in a little while, or email support@job-hopper.io.' }, 429)
    }

    const { error: insertError } = await supabase.from('support_chat_requests').insert({ ip_hash: ipHash })
    if (insertError) throw new Error(`rate-limit insert: ${insertError.message}`)

    // Best-effort pruning so the table stays small; failure doesn't affect the reply.
    await supabase
      .from('support_chat_requests')
      .delete()
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': webhookAuth },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`n8n webhook returned ${res.status}`)
    }
    const data = await res.json().catch(() => null)
    return json({ answer: typeof data?.answer === 'string' ? data.answer : null }, 200)
  } catch (err) {
    console.error('support-chat: unhandled error', err)
    return json({ error: "I couldn't reach support chat right now. Please try again in a moment, or email support@job-hopper.io." }, 502)
  }
})
