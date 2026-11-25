import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { isServiceCall } from '../_shared/cron-auth.ts'
import { createOutreachDeps, loadOutreachSettings } from '../_shared/outreach-deps.ts'
import { outreachRunMode, runOutreach } from '../_shared/outreach-sequences.ts'

// Daily outreach-sequence run (4 stages at day 0/2/4/6; enrolled by
// scripts/outbound-live-send.mjs). Invoked by run-scheduled-jobs; self-enqueues its next
// run (and is in run-scheduled-jobs' RECURRING_CHAINS watchdog). While
// growth_settings.outreach_auto_send is false it only logs a preview: nothing is sent,
// claimed, stopped or scheduled.

const LOG = '[outreach-sequences]'
const INTERVAL_HOURS = 24

serve(async (req) => {
  if (!isServiceCall(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { 'Content-Type': 'application/json' }, status: 401 })
  }
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  // Enqueue the next run first, so the chain survives a failing run.
  const { error: scheduleError } = await db
    .from('scheduled_jobs')
    .insert({ function_name: 'outreach-sequences', payload: {}, run_at: new Date(Date.now() + INTERVAL_HOURS * 3_600_000).toISOString() })
  if (scheduleError && scheduleError.code !== '23505') { // 23505: next run already pending
    console.error(`${LOG} failed to enqueue next run`, { error: scheduleError.message })
  }

  try {
    const settings = await loadOutreachSettings(db)
    const mode = outreachRunMode(settings)
    const result = await runOutreach({ mode, maxSends: settings.outreach_max_per_run, now: new Date() }, createOutreachDeps(db, Deno.env))
    // Counts only; the planned list (masked emails) stays out of logs and the response.
    console.log(`${LOG} ${mode}`, {
      sequences: result.sequences,
      due: mode === 'preview' ? result.planned.length : undefined,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      stopped: result.stopped,
    })
    return new Response(JSON.stringify({ ...result, planned: undefined }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG} run failed`, { error: message })
    return new Response(JSON.stringify({ error: message }), { headers: { 'Content-Type': 'application/json' }, status: 500 })
  }
})
