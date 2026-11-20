// Classifies unprocessed reply_events rows (reply_class + processed) via the shared LLM
// path proven in admin-growth-dashboard. Invoked directly by pg_cron (create the schedule
// manually) or by hand -- no logged-in user, same isAuthorized() shape as
// reset-apollo-limits/reconcile-subscriptions. Not routed through run-scheduled-jobs
// because this sweeps a table, not a one-shot payload.
//
// Compliance: an Unsubscribe classification suppresses the sender's address in
// suppressed_emails (scope marketing) for every reply, matched to a lead or not, and,
// for a reply matched to a lead, also adds the lead's organization_name to
// exclusion_lists. scripts/outbound-live-send.mjs checks both before every send. If the
// address write fails the reply stays unprocessed and is retried next sweep. Per-reply
// logic: _shared/reply-outcome.ts.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { callChatCompletion } from '../_shared/llm.ts'
import { recordClassifiedReply, type ReplyOutcomeDeps } from '../_shared/reply-outcome.ts'
import { REPLY_CLASSIFICATION_SYSTEM, replyClassificationUserMessage, normalizeReplyClass } from '../_shared/reply-classification-prompt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const PER_RUN_LIMIT = 25

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const header = req.headers.get('x-cron-secret')
  if (cronSecret && header === cronSecret) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization')
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
}

type ReplyEventRow = {
  id: string
  institutional_lead_id: string | null
  from_email: string
  raw_subject: string | null
  raw_body: string | null
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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: rows, error: selectError } = await admin
    .from('reply_events')
    .select('id, institutional_lead_id, from_email, raw_subject, raw_body')
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(PER_RUN_LIMIT)

  if (selectError) {
    console.error('classify-replies: failed to select unprocessed rows', selectError)
    return new Response(JSON.stringify({ error: 'Failed to load unprocessed replies' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const pending = (rows ?? []) as ReplyEventRow[]
  let classified = 0
  let unparseable = 0
  let unsubscribed = 0
  let companiesExcluded = 0
  let errors = 0

  const outcomeDeps: ReplyOutcomeDeps = {
    suppressSender: async (fromEmail) => {
      const { error } = await admin.rpc('suppress_email', {
        p_email: fromEmail,
        p_reason: 'unsubscribe',
        p_scope: 'marketing',
        p_source: 'classify-replies',
      })
      if (error) throw new Error(error.message)
    },
    markClassified: async (replyId, replyClass) => {
      const { error } = await admin.from('reply_events').update({ reply_class: replyClass, processed: true }).eq('id', replyId)
      if (error) throw new Error(error.message)
    },
    findLeadOrganization: async (leadId) => {
      const { data, error } = await admin.from('institutional_leads').select('organization_name').eq('id', leadId).maybeSingle()
      if (error) throw new Error(error.message)
      return data?.organization_name ?? null
    },
    excludeCompany: async (organizationName) => {
      const { error } = await admin
        .from('exclusion_lists')
        .upsert({ company_name: organizationName }, { onConflict: 'company_name', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  }

  for (const reply of pending) {
    const chatResult = await callChatCompletion(
      [
        { role: 'system', content: REPLY_CLASSIFICATION_SYSTEM },
        {
          role: 'user',
          content: replyClassificationUserMessage({
            fromEmail: reply.from_email,
            subject: reply.raw_subject,
            body: reply.raw_body,
          }),
        },
      ],
      {
        model: Deno.env.get('LLM_MODEL_REPLY_CLASSIFICATION') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini',
        temperature: 0,
        timeoutMs: 20_000,
      },
    )

    if (!chatResult.ok) {
      // Leave processed=false so the next sweep retries -- an LLM/network failure isn't
      // this reply's fault, and there's no bounded-retry counter to burn through here.
      errors += 1
      console.error('classify-replies: LLM call failed', { replyEventId: reply.id, error: chatResult.error })
      continue
    }

    const replyClass = normalizeReplyClass(chatResult.content)
    const outcome = await recordClassifiedReply(outcomeDeps, reply, replyClass)
    if (outcome === 'retry') {
      errors += 1
      continue
    }
    if (!replyClass) unparseable += 1
    else classified += 1
    if (outcome === 'unsubscribed' || outcome === 'unsubscribed_unmatched') unsubscribed += 1
    if (outcome === 'unsubscribed') companiesExcluded += 1
    if (outcome === 'error') errors += 1
  }

  return new Response(
    JSON.stringify({ processed: pending.length, classified, unparseable, unsubscribed, companiesExcluded, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
})
