import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { sendEmail } from '../_shared/email.ts'
import { renderSponsorWatchAlert } from '../_shared/email-templates.ts'
import { getFooterLinksForProfile } from '../_shared/unsubscribe-token.ts'
import { resolveBaseTier } from '../_shared/base-tier.ts'

// D51-55: quarterly diff-alert worker for Sponsor Watch. See
// docs/sponsorship-data-engine.md D51-55 for the full design.
//
// Self-enqueues its next run (same pattern as reconcile-subscriptions) so recurrence survives
// even if this run throws. Compares each actively-watched employer's current summed
// `total_worker_positions` (Certified/Certified-Withdrawn lca_filings, via the
// sum_counted_lca_positions RPC) against the value recorded at its last check
// (employer_sponsorship_scores.watch_last_checked_positions). Alerts (writes a
// sponsor_watch_events row + emails subscribers) when the score bucket changes OR the relative
// change is >=25% - see the doc for why a flat percentage alone doesn't work across this scope's
// ~1,189x employer-size spread, and why the %-guard is a starting estimate (no historical
// quarter-over-quarter data exists yet to calibrate real volatility).
//
// LCA data only refreshes when someone re-ingests a new DOL quarterly file (dol.gov blocks this
// sandbox's network - see CLAUDE.md-adjacent context), so most runs of this worker will find no
// change at all. That's expected, not a bug - "quarterly diff alerts on whatever data exists",
// not a live feed.

const LOG = '[sponsor-watch-check]'
const CHECK_INTERVAL_DAYS = 90
const RELATIVE_CHANGE_THRESHOLD = 0.25

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const header = req.headers.get('x-cron-secret')
  if (cronSecret && header === cronSecret) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization')
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
}

type ScoreRow = {
  employer_id: string
  score: string
  watch_last_checked_positions: number | null
  watch_last_checked_score: string | null
  fiscal_years_used: number[] | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG} missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`)
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Enqueue the next run FIRST, so recurrence survives even if this run throws.
  const nextRunAt = new Date(Date.now() + CHECK_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error: scheduleError } = await supabase
    .from('scheduled_jobs')
    .insert({ function_name: 'sponsor-watch-check', payload: {}, run_at: nextRunAt })
  if (scheduleError) {
    console.error(`${LOG} failed to enqueue next run`, { error: scheduleError.message })
  }

  // 1. Which employers are actively watched, and by whom.
  const { data: subRows, error: subError } = await supabase
    .from('sponsor_watch_subscriptions')
    .select('employer_id, profile_id')

  if (subError) {
    console.error(`${LOG} failed to load sponsor_watch_subscriptions`, { error: subError.message })
    return new Response(JSON.stringify({ error: 'Failed to load subscriptions', details: subError.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const profileIdsByEmployer = new Map<string, Set<string>>()
  for (const row of subRows ?? []) {
    const employerId = row.employer_id as string
    const profileId = row.profile_id as string
    if (!profileIdsByEmployer.has(employerId)) profileIdsByEmployer.set(employerId, new Set())
    profileIdsByEmployer.get(employerId)!.add(profileId)
  }
  const employerIds = Array.from(profileIdsByEmployer.keys())

  if (employerIds.length === 0) {
    console.log(`${LOG} no active watches, nothing to check`)
    return new Response(JSON.stringify({ employersChecked: 0, alertsFired: 0, emailsSent: 0, nextRunAt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // 2. Current score bucket + last-checked baseline for each watched employer.
  const { data: scoreRows, error: scoreError } = await supabase
    .from('employer_sponsorship_scores')
    .select('employer_id, score, watch_last_checked_positions, watch_last_checked_score, fiscal_years_used')
    .in('employer_id', employerIds)

  if (scoreError) {
    console.error(`${LOG} failed to load employer_sponsorship_scores`, { error: scoreError.message })
    return new Response(JSON.stringify({ error: 'Failed to load scores', details: scoreError.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  // 3. Current summed counted positions per employer (RPC - PostgREST can't GROUP BY).
  const { data: positionRows, error: positionsError } = await supabase.rpc('sum_counted_lca_positions', {
    p_employer_ids: employerIds,
  })

  if (positionsError) {
    console.error(`${LOG} failed to compute counted positions`, { error: positionsError.message })
    return new Response(JSON.stringify({ error: 'Failed to compute positions', details: positionsError.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const positionsByEmployer = new Map<string, number>()
  for (const row of (positionRows ?? []) as { employer_id: string; counted_positions: number | string }[]) {
    positionsByEmployer.set(row.employer_id, Number(row.counted_positions))
  }

  // 4. Employers of currently-watched profiles who are still Premium (a downgrade after
  // subscribing shouldn't keep emailing them a feature they no longer have access to; the
  // subscription row itself is left alone - re-upgrading should just resume watching).
  const allProfileIds = Array.from(new Set((subRows ?? []).map((r) => r.profile_id as string)))
  const premiumProfileIds = new Set<string>()
  for (const profileId of allProfileIds) {
    const tier = await resolveBaseTier(supabase, profileId)
    if (tier === 'premium') premiumProfileIds.add(profileId)
  }

  // 5. Global email opt-out (notification_settings.email_unsubscribed_at). Profiles with no row
  // yet default to subscribed (no trigger creates the row on profile creation - see
  // 20260302100000's note on this being created lazily on first read/write).
  const { data: settingsRows } = await supabase
    .from('notification_settings')
    .select('profile_id, email_unsubscribed_at')
    .in('profile_id', allProfileIds)
  const unsubscribedProfileIds = new Set<string>()
  for (const row of (settingsRows ?? []) as { profile_id: string; email_unsubscribed_at: string | null }[]) {
    if (row.email_unsubscribed_at != null) unsubscribedProfileIds.add(row.profile_id)
  }

  const { data: employerNameRows } = await supabase
    .from('employers')
    .select('id, canonical_name')
    .in('id', employerIds)
  const employerNameById = new Map<string, string>()
  for (const row of (employerNameRows ?? []) as { id: string; canonical_name: string }[]) {
    employerNameById.set(row.id, row.canonical_name)
  }

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, email, first_name')
    .in('id', allProfileIds)
  const profileById = new Map<string, { email: string | null; first_name: string | null }>()
  for (const row of (profileRows ?? []) as { id: string; email: string | null; first_name: string | null }[]) {
    profileById.set(row.id, { email: row.email, first_name: row.first_name })
  }

  const now = new Date().toISOString()
  let employersChecked = 0
  let alertsFired = 0
  let baselinesInitialized = 0
  let emailsSent = 0
  let emailsFailed = 0
  const eventsSummary: unknown[] = []

  for (const scoreRow of (scoreRows ?? []) as ScoreRow[]) {
    const employerId = scoreRow.employer_id
    const currentPositions = positionsByEmployer.get(employerId)
    if (currentPositions == null) {
      // No lca_filings rows resolved to this employer (shouldn't happen for a scored employer,
      // but skip rather than crash or compare against a fabricated zero).
      continue
    }
    employersChecked += 1

    const currentScore = scoreRow.score
    const lastPositions = scoreRow.watch_last_checked_positions
    const lastScore = scoreRow.watch_last_checked_score

    if (lastPositions == null) {
      // First check for this employer: establish the baseline, no alert (nothing to compare to).
      baselinesInitialized += 1
      const { error: initError } = await supabase
        .from('employer_sponsorship_scores')
        .update({
          watch_last_checked_positions: currentPositions,
          watch_last_checked_score: currentScore,
          watch_last_checked_at: now,
        })
        .eq('employer_id', employerId)
      if (initError) {
        console.error(`${LOG} failed to initialize watch baseline`, { employerId, error: initError.message })
      }
      continue
    }

    const crossedBucket = lastScore != null && lastScore !== currentScore
    const pctChange = lastPositions > 0 ? Math.abs(currentPositions - lastPositions) / lastPositions : 0
    const meaningful = crossedBucket || pctChange >= RELATIVE_CHANGE_THRESHOLD

    if (meaningful) {
      alertsFired += 1
      const direction = currentPositions >= lastPositions ? 'up' : 'down'
      const employerName = employerNameById.get(employerId) ?? 'This employer'
      const fiscalYears = scoreRow.fiscal_years_used ?? []
      const fiscalPeriod = fiscalYears.length > 0 ? `FY${Math.max(...fiscalYears)}` : 'unknown'

      const { data: eventRow, error: eventError } = await supabase
        .from('sponsor_watch_events')
        .insert({
          employer_id: employerId,
          event_type: 'filing_volume_change',
          delta: {
            previous_positions: lastPositions,
            current_positions: currentPositions,
            pct_change: Math.round(pctChange * 10000) / 10000,
            previous_score: lastScore,
            current_score: currentScore,
            crossed_bucket: crossedBucket,
          },
          fiscal_period: fiscalPeriod,
          notified: false,
        })
        .select('id')
        .single()

      if (eventError) {
        console.error(`${LOG} failed to insert sponsor_watch_events row`, { employerId, error: eventError.message })
      } else {
        eventsSummary.push({ employerId, employerName, direction, pctChange, crossedBucket })

        const recipientProfileIds = Array.from(profileIdsByEmployer.get(employerId) ?? [])
        let anySent = false
        for (const profileId of recipientProfileIds) {
          if (!premiumProfileIds.has(profileId)) continue
          if (unsubscribedProfileIds.has(profileId)) continue
          const profile = profileById.get(profileId)
          if (!profile?.email) continue

          try {
            const footer = await getFooterLinksForProfile(profileId)
            const { html, text } = renderSponsorWatchAlert({
              recipientName: profile.first_name ?? 'there',
              employerName,
              previousPositions: lastPositions,
              currentPositions,
              previousScore: lastScore,
              currentScore,
              direction,
              pctChange: pctChange * 100,
              dashboardUrl: `${footer.siteUrl}/dashboard`,
              footer,
            })
            const result = await sendEmail({
              to: profile.email,
              subject: `Sponsor Watch: ${employerName}'s filing activity changed`,
              html,
              text,
              profileId,
              eventType: 'sponsor_watch_alert',
              templateKey: 'sponsor_watch_alert',
              payload: { employer_id: employerId, event_id: eventRow?.id },
              supabase,
            })
            if (result.success) {
              emailsSent += 1
              anySent = true
            } else {
              emailsFailed += 1
            }
          } catch (err) {
            emailsFailed += 1
            console.error(`${LOG} failed to send alert email`, {
              employerId,
              profileId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }

        if (anySent && eventRow?.id) {
          await supabase.from('sponsor_watch_events').update({ notified: true }).eq('id', eventRow.id)
        }
      }
    }

    const { error: updateError } = await supabase
      .from('employer_sponsorship_scores')
      .update({
        watch_last_checked_positions: currentPositions,
        watch_last_checked_score: currentScore,
        watch_last_checked_at: now,
      })
      .eq('employer_id', employerId)
    if (updateError) {
      console.error(`${LOG} failed to update watch baseline`, { employerId, error: updateError.message })
    }
  }

  console.log(`${LOG} done`, { employersChecked, alertsFired, baselinesInitialized, emailsSent, emailsFailed })
  return new Response(
    JSON.stringify({
      employersChecked,
      alertsFired,
      baselinesInitialized,
      emailsSent,
      emailsFailed,
      events: eventsSummary,
      nextRunAt,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
})
