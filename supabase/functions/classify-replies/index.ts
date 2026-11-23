// Classifies unprocessed reply_events rows. Invoked by pg_cron (create the schedule
// manually) or by hand -- no logged-in user, same isAuthorized() shape as
// reset-apollo-limits/reconcile-subscriptions. Not routed through run-scheduled-jobs
// because this sweeps a table, not a one-shot payload.
//
// Per reply (_shared/reply-processing.ts): class (b2b prompt for institutional leads, b2c
// prompt for prospects/profiles), extraction, a draft reply that is never sent, default
// owner and next action, and the class written back to the lead and prospect.
// Safe to re-run: only unprocessed rows not flagged for manual review are picked, and
// the final write only applies while the row is still unprocessed. A reply that fails
// classification stays unprocessed and is retried, up to MAX_CLASSIFY_ATTEMPTS.
//
// Compliance: an unsubscribe suppresses the sender in suppressed_emails (scope
// marketing) before anything else, and for a lead also adds the organization to
// exclusion_lists. If the suppression write fails the reply is retried next sweep.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { isServiceCall } from '../_shared/cron-auth.ts'
import { callChatCompletion } from '../_shared/llm.ts'
import { processReply, type ReplyProcessingDeps, type ReplyRow } from '../_shared/reply-processing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const PER_RUN_LIMIT = 25
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isServiceCall(req)) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const [{ data: rows, error: selectError }, { data: settings, error: settingsError }] = await Promise.all([
    admin
      .from('reply_events')
      .select('id, institutional_lead_id, prospect_id, profile_id, from_email, raw_subject, raw_body, received_at, classify_attempts')
      .eq('processed', false)
      .eq('needs_manual_review', false)
      .order('received_at', { ascending: true })
      .limit(PER_RUN_LIMIT),
    admin.from('growth_settings').select('default_reply_owner').eq('id', 1).maybeSingle(),
  ])
  if (selectError || settingsError) {
    console.error('classify-replies: failed to load replies or settings', selectError ?? settingsError)
    return json({ error: 'Failed to load unprocessed replies' }, 500)
  }

  const model = Deno.env.get('LLM_MODEL_REPLY_CLASSIFICATION') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'
  const deps: ReplyProcessingDeps = {
    llm: (messages, purpose) =>
      callChatCompletion(messages, { model, temperature: purpose === 'draft' ? 0.3 : 0, timeoutMs: 20_000 }),
    suppressSender: async (fromEmail) => {
      const { error } = await admin.rpc('suppress_email', { p_email: fromEmail, p_reason: 'unsubscribe', p_scope: 'marketing', p_source: 'classify-replies' })
      if (error) throw new Error(error.message)
    },
    findLeadOrganization: async (leadId) => {
      const { data, error } = await admin.from('institutional_leads').select('organization_name').eq('id', leadId).maybeSingle()
      if (error) throw new Error(error.message)
      return data?.organization_name ?? null
    },
    excludeCompany: async (organizationName) => {
      const { error } = await admin.from('exclusion_lists').upsert({ company_name: organizationName }, { onConflict: 'company_name', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
    markLeadReplied: async (leadId, replyClass) => {
      const { error } = await admin.from('institutional_leads').update({ reply_class: replyClass }).eq('id', leadId)
      if (error) throw new Error(error.message)
      const { error: statusError } = await admin.from('institutional_leads').update({ status: 'replied' }).eq('id', leadId).in('status', ['new', 'contacted'])
      if (statusError) throw new Error(statusError.message)
    },
    markProspectReplied: async (prospectId) => {
      const { error } = await admin.from('prospects').update({ status: 'replied' }).eq('id', prospectId).in('status', ['new', 'contacted'])
      if (error) throw new Error(error.message)
    },
    saveProcessed: async (replyId, patch) => {
      const { error } = await admin.from('reply_events').update(patch).eq('id', replyId).eq('processed', false)
      if (error) throw new Error(error.message)
    },
    recordFailure: async (replyId, attempts, error, needsManualReview) => {
      const { error: updateError } = await admin
        .from('reply_events')
        .update({ classify_attempts: attempts, last_classify_error: error, needs_manual_review: needsManualReview })
        .eq('id', replyId)
        .eq('processed', false)
      if (updateError) console.error('classify-replies: failed to record a failure', { replyEventId: replyId, error: updateError.message })
    },
    defaultOwner: (settings?.default_reply_owner as string | null) ?? null,
    siteUrl: Deno.env.get('SITE_URL') || 'https://job-hopper.io',
    now: () => new Date(),
  }

  const counts = { processed: 0, retry: 0, manualReview: 0, suppressionRetry: 0, unsubscribed: 0, companiesExcluded: 0, draftFallbacks: 0 }
  for (const reply of (rows ?? []) as ReplyRow[]) {
    const outcome = await processReply(deps, reply)
    if (outcome.status === 'processed') {
      counts.processed += 1
      if (outcome.unsubscribed) counts.unsubscribed += 1
      if (outcome.companyExcluded) counts.companiesExcluded += 1
      if (outcome.draftFallback) counts.draftFallbacks += 1
    } else if (outcome.status === 'retry') counts.retry += 1
    else if (outcome.status === 'manual_review') counts.manualReview += 1
    else counts.suppressionRetry += 1
    if (outcome.status !== 'processed') console.error('classify-replies: reply not processed', { replyEventId: reply.id, ...outcome })
  }

  return json({ picked: rows?.length ?? 0, ...counts })
})
