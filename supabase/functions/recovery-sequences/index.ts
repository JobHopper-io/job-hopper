import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { isServiceCall } from '../_shared/cron-auth.ts'
import { createRecoveryDeps, loadGrowthSettings } from '../_shared/recovery-deps.ts'
import { runRecovery, scheduledRunMode } from '../_shared/recovery-sequences.ts'

// Daily B2C recovery-sequence run. Invoked by run-scheduled-jobs; self-enqueues its next
// run (and is in run-scheduled-jobs' RECURRING_CHAINS watchdog). While
// growth_settings.recovery_auto_send is false it only logs a preview: nothing is sent and
// nothing is written to followup_sequences.

const LOG = '[recovery-sequences]'
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
    .insert({ function_name: 'recovery-sequences', payload: {}, run_at: new Date(Date.now() + INTERVAL_HOURS * 3_600_000).toISOString() })
  if (scheduleError && scheduleError.code !== '23505') { // 23505: next run already pending
    console.error(`${LOG} failed to enqueue next run`, { error: scheduleError.message })
  }

  try {
    const settings = await loadGrowthSettings(db)
    const mode = scheduledRunMode(settings)
    const result = await runRecovery(
      { mode, maxSends: settings.recovery_max_sends_per_run, now: new Date() },
      createRecoveryDeps(db, settings),
    )
    // Counts only; the preview list carries masked emails and stays out of the logs.
    console.log(`${LOG} ${mode}`, {
      candidates: result.candidates,
      bySegment: result.bySegment,
      due: mode === 'preview' ? result.planned.length : undefined,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      stopped: result.stopped,
    })
    const { planned: _planned, ...summary } = result
    return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' }, status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG} run failed`, { error: message })
    return new Response(JSON.stringify({ error: message }), { headers: { 'Content-Type': 'application/json' }, status: 500 })
  }
})
