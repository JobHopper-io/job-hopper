// Classifies unprocessed reply_events rows (reply_class + processed) via the shared LLM
// path proven in admin-growth-dashboard. Invoked directly by pg_cron (create the schedule
// manually) or by hand -- no logged-in user, same isAuthorized() shape as
// reset-apollo-limits/reconcile-subscriptions. Not routed through run-scheduled-jobs
// because this sweeps a table, not a one-shot payload.
//
// Compliance: an Unsubscribe classification writes the reply's source lead's
// organization_name into exclusion_lists, the same suppression list scripts/outbound-*
// already check before every send -- real, not optional. This system only tracks
// suppression at the organization level (exclusion_lists.company_name, no email column),
// so a reply with no institutional_lead_id match (sender doesn't match any lead's
// contact_email) can't be suppressed by company; logged loudly rather than silently
// dropped so it can be handled by hand.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { callChatCompletion } from '../_shared/llm.ts'
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
  let errors = 0

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
    if (!replyClass) unparseable += 1
    else classified += 1

    const { error: updateError } = await admin
      .from('reply_events')
      .update({ reply_class: replyClass, processed: true })
      .eq('id', reply.id)

    if (updateError) {
      errors += 1
      console.error('classify-replies: failed to write reply_class', { replyEventId: reply.id, error: updateError })
      continue
    }

    if (replyClass !== 'Unsubscribe') continue

    if (!reply.institutional_lead_id) {
      console.error('classify-replies: Unsubscribe reply has no matched lead, cannot suppress by company', {
        replyEventId: reply.id,
        fromEmail: reply.from_email,
      })
      continue
    }

    const { data: lead, error: leadError } = await admin
      .from('institutional_leads')
      .select('organization_name')
      .eq('id', reply.institutional_lead_id)
      .maybeSingle()

    if (leadError || !lead) {
      errors += 1
      console.error('classify-replies: failed to look up lead for Unsubscribe suppression', {
        replyEventId: reply.id,
        error: leadError,
      })
      continue
    }

    const { error: exclusionError } = await admin
      .from('exclusion_lists')
      .upsert({ company_name: lead.organization_name }, { onConflict: 'company_name', ignoreDuplicates: true })

    if (exclusionError) {
      errors += 1
      console.error('classify-replies: failed to add company to exclusion_lists', {
        replyEventId: reply.id,
        organizationName: lead.organization_name,
        error: exclusionError,
      })
      continue
    }

    unsubscribed += 1
  }

  return new Response(
    JSON.stringify({ processed: pending.length, classified, unparseable, unsubscribed, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
})
