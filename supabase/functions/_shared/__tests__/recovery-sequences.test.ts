import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { sendEmail } from '../email.ts'
import {
  blockReason,
  planNext,
  type RecoveryDeps,
  recoverySendOptions,
  runRecovery,
  scheduledRunMode,
  type SendState,
  type SequenceRow,
} from '../recovery-sequences.ts'
import type { RecoveryCandidate } from '../revenue-recovery-segments.ts'
import { candidate } from './recovery-fixtures.ts'

const NOW = new Date('2026-11-24T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const OK: SendState = { exists: true, live_access: false, past_due: false, unsubscribed: false, bounced: false, complained: false, manual: false, marketing_consent: true }

let nextId = 0
const row = (over: Partial<SequenceRow>): SequenceRow => ({
  id: `r${++nextId}`, profile_id: 'p1', sequence_key: 'recovery_cancelled', sequence_stage: 1, sent_date: null, stop_reason: null, ...over,
})

// --- planNext: stages, 7-day limit, no repeats ---

Deno.test('stage 1 when the sequence has no rows', () => {
  assertEquals(planNext('cancelled', [], NOW.getTime()), { stage: 1 })
})

Deno.test('7-day limit applies across all recovery sequences', () => {
  const other = row({ sequence_key: 'recovery_heavy_free_usage', sent_date: daysAgo(6) })
  assertEquals(planNext('cancelled', [other], NOW.getTime()), { skip: 'rate_limited_7d' })
  assertEquals(planNext('cancelled', [{ ...other, sent_date: daysAgo(7) }], NOW.getTime()), { stage: 1 })
})

Deno.test('stage 2 needs stage 1 sent at least 5 days ago (and the 7-day limit makes it 7)', () => {
  const s1 = row({ sent_date: daysAgo(4) })
  assertEquals(planNext('cancelled', [s1], NOW.getTime()), { skip: 'rate_limited_7d' })
  assertEquals(planNext('cancelled', [{ ...s1, sent_date: daysAgo(7) }], NOW.getTime()), { stage: 2 })
})

Deno.test('no repeat sends: a sent stage is never planned again; a claimed one is in flight', () => {
  const s1 = row({ sent_date: daysAgo(20) })
  const s2 = row({ sequence_stage: 2, sent_date: daysAgo(10) })
  assertEquals(planNext('cancelled', [s1, s2], NOW.getTime()), { skip: 'complete' })
  assertEquals(planNext('cancelled', [row({ sent_date: null })], NOW.getTime()), { skip: 'in_flight' })
  assertEquals(planNext('cancelled', [s1, row({ sequence_stage: 2, sent_date: null })], NOW.getTime()), { skip: 'in_flight' })
})

Deno.test('a stopped sequence is never continued', () => {
  assertEquals(planNext('cancelled', [row({ sent_date: daysAgo(20), stop_reason: 'no_consent' })], NOW.getTime()), { skip: 'stopped' })
})

// --- stop reasons ---

Deno.test('blockReason: every stop reason, in order', () => {
  assertEquals(blockReason(OK), null)
  assertEquals(blockReason({ ...OK, live_access: true }), 'paid')
  assertEquals(blockReason({ ...OK, past_due: true }), 'past_due')
  assertEquals(blockReason({ ...OK, complained: true }), 'complained')
  assertEquals(blockReason({ ...OK, bounced: true }), 'bounced')
  assertEquals(blockReason({ ...OK, unsubscribed: true }), 'unsubscribed')
  assertEquals(blockReason({ ...OK, manual: true }), 'manual_pause')
  assertEquals(blockReason({ ...OK, marketing_consent: false }), 'no_consent')
  assertEquals(blockReason({ ...OK, exists: false }), 'profile_missing')
  assertEquals(blockReason({ ...OK, live_access: true, complained: true, marketing_consent: false }), 'paid')
})

// --- runner with fakes ---

function harness(opts: { candidates?: RecoveryCandidate[]; rows?: SequenceRow[]; state?: (id: string) => SendState; sendFails?: boolean } = {}) {
  const rows = [...(opts.rows ?? [])]
  const sent: { profileId: string; segment: string; stage: number }[] = []
  const stops: { profileId: string; key: string; reason: string }[] = []
  const stateCalls: string[] = []
  const deps: RecoveryDeps = {
    loadCandidates: () => Promise.resolve(opts.candidates ?? []),
    loadSequences: () => Promise.resolve(rows.map((r) => ({ ...r }))),
    sendState: (id) => (stateCalls.push(id), Promise.resolve(opts.state?.(id) ?? OK)),
    claim: (profileId, key, stage) => {
      if (rows.some((r) => r.profile_id === profileId && r.sequence_key === key && r.sequence_stage === stage)) return Promise.resolve(null)
      const r = row({ profile_id: profileId, sequence_key: key, sequence_stage: stage })
      rows.push(r)
      return Promise.resolve(r.id)
    },
    release: (id) => (rows.splice(rows.findIndex((r) => r.id === id), 1), Promise.resolve()),
    markSent: (id, now, eventId) => (Object.assign(rows.find((r) => r.id === id)!, { sent_date: now.toISOString(), eventId }), Promise.resolve()),
    stopSequence: (profileId, key, reason) => {
      stops.push({ profileId, key, reason })
      for (const r of rows) if (r.profile_id === profileId && r.sequence_key === key && !r.stop_reason) r.stop_reason = reason
      return Promise.resolve()
    },
    send: (c, segment, stage) => {
      if (opts.sendFails) return Promise.resolve({ success: false, emailEventId: null, error: 'provider down' })
      sent.push({ profileId: c.profile_id, segment, stage })
      return Promise.resolve({ success: true, emailEventId: `ev-${c.profile_id}` })
    },
  }
  return { deps, rows, sent, stops, stateCalls }
}

const cancelled = (id: string) => candidate({ profile_id: id, email: `${id}@example.com`, has_canceled_sub: true })

Deno.test('auto-send off: the scheduled run only previews; nothing is claimed, sent or stopped', async () => {
  assertEquals(scheduledRunMode({ recovery_auto_send: false }), 'preview')
  assertEquals(scheduledRunMode({ recovery_auto_send: true }), 'send')
  const h = harness({ candidates: [cancelled('a'), cancelled('b')] })
  const result = await runRecovery({ mode: scheduledRunMode({ recovery_auto_send: false }), maxSends: 25, now: NOW }, h.deps)
  assertEquals(result.planned.map((p) => [p.emailMasked, p.segment, p.stage]), [['a***@example.com', 'cancelled', 1], ['b***@example.com', 'cancelled', 1]])
  assertEquals(h.sent.length + h.stops.length + h.rows.length, 0)
})

Deno.test('preview lists only people who would pass the pre-send check', async () => {
  const h = harness({ candidates: [cancelled('a'), cancelled('b')], state: (id) => ({ ...OK, marketing_consent: id === 'a' }) })
  const result = await runRecovery({ mode: 'preview', maxSends: 25, now: NOW }, h.deps)
  assertEquals(result.planned.map((p) => p.profileId), ['a'])
  assertEquals(result.skipped.no_consent, 1)
  assertEquals(result.bySegment.cancelled, { members: 2, due: 1 })
  assertEquals(h.sent.length + h.stops.length + h.rows.length, 0)
})

Deno.test('send: claims, sends, marks sent with the email_events id; a second run sends nothing', async () => {
  const h = harness({ candidates: [cancelled('a')] })
  const first = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(first.sent, 1)
  assertEquals(h.rows.map((r) => [r.sequence_key, r.sequence_stage, !!r.sent_date]), [['recovery_cancelled', 1, true]])
  assertEquals((h.rows[0] as unknown as { eventId: string }).eventId, 'ev-a')
  const second = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(second.sent, 0)
  assertEquals(second.skipped.rate_limited_7d, 1)
  assertEquals(h.sent.length, 1)
})

Deno.test('send: a claim that already exists is never sent twice', async () => {
  const h = harness({ candidates: [cancelled('a')] })
  const realClaim = h.deps.claim
  h.deps.claim = () => Promise.resolve(null) // another run claimed it between plan and send
  const result = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(result.skipped.already_claimed, 1)
  assertEquals(h.sent.length, 0)
  h.deps.claim = realClaim
})

Deno.test('send: a failed send releases the claim so a later run retries', async () => {
  const h = harness({ candidates: [cancelled('a')], sendFails: true })
  const result = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(result.failed, 1)
  assertEquals(h.rows.length, 0)
})

Deno.test('send: per-run cap, highest-priority segments first', async () => {
  const heavy = candidate({ profile_id: 'h', email: 'h@example.com', job_searches_used: 9 })
  const abandoned = candidate({ profile_id: 'x', email: 'x@example.com', abandoned_checkout_at: daysAgo(1) })
  const h = harness({ candidates: [heavy, cancelled('c'), abandoned] })
  const result = await runRecovery({ mode: 'send', maxSends: 2, now: NOW }, h.deps)
  assertEquals(h.sent.map((s) => s.segment), ['abandoned_checkout', 'cancelled'])
  assertEquals(result.skipped.run_limit, 1)
})

Deno.test('every stop reason stops a started sequence right before stage 2', async () => {
  const cases: [Partial<SendState>, string][] = [
    [{ live_access: true }, 'paid'],
    [{ unsubscribed: true }, 'unsubscribed'],
    [{ marketing_consent: false }, 'no_consent'],
    [{ bounced: true }, 'bounced'],
    [{ complained: true }, 'complained'],
    [{ manual: true }, 'manual_pause'],
  ]
  for (const [state, reason] of cases) {
    const h = harness({ candidates: [cancelled('a')], rows: [row({ profile_id: 'a', sent_date: daysAgo(8) })], state: () => ({ ...OK, ...state }) })
    const result = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
    assertEquals(h.sent.length, 0, reason)
    assertEquals(h.stops, [{ profileId: 'a', key: 'recovery_cancelled', reason }], reason)
    assertEquals(result.stopped[reason as 'paid'], 1, reason)
    assertEquals(h.rows[0].stop_reason, reason)
  }
})

Deno.test('a block before stage 1 skips without starting (or stopping) a sequence', async () => {
  const h = harness({ candidates: [cancelled('a')], state: () => ({ ...OK, marketing_consent: false }) })
  const result = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(result.skipped.no_consent, 1)
  assertEquals(h.rows.length + h.stops.length + h.sent.length, 0)
})

Deno.test('someone who paid (no longer a candidate) gets their open sequence stopped as paid', async () => {
  const h = harness({ candidates: [], rows: [row({ profile_id: 'gone', sent_date: daysAgo(2) })], state: () => ({ ...OK, live_access: true }) })
  const result = await runRecovery({ mode: 'send', maxSends: 25, now: NOW }, h.deps)
  assertEquals(h.stops, [{ profileId: 'gone', key: 'recovery_cancelled', reason: 'paid' }])
  assertEquals(result.stopped.paid, 1)
})

// --- attribution ---

const FOOTER = { siteUrl: 'https://job-hopper.io', unsubscribeUrl: 'https://x.supabase.co/functions/v1/unsubscribe-email?token=t', preferencesUrl: 'https://job-hopper.io/profile' }

Deno.test('attribution: recovery type, campaign, stage, template key and UTM links', () => {
  const o = recoverySendOptions({ candidate: cancelled('a'), segment: 'cancelled', stage: 2, footer: FOOTER })
  assertEquals(o.kind, 'marketing')
  assertEquals(o.eventType, 'recovery')
  assertEquals(o.campaign, 'recovery_cancelled_s2')
  assertEquals(o.templateKey, 'recovery_cancelled_s2')
  assertEquals(o.sequenceStage, 2)
  assertEquals(o.profileId, 'a')
  assertEquals(o.unsubscribeUrl, FOOTER.unsubscribeUrl)
  assertEquals(o.payload, { segment: 'cancelled', stage: 2, sequence_key: 'recovery_cancelled' })
  const link = o.text!.match(/https:\/\/job-hopper\.io\/pricing\S*/)?.[0]
  assert(link, 'has a pricing link')
  const params = new URL(link).searchParams
  assertEquals([params.get('utm_source'), params.get('utm_medium'), params.get('utm_campaign')], ['email_recovery', 'email', 'recovery_cancelled_s2'])
})

Deno.test('attribution: sendEmail logs type, campaign and sequence_stage, and returns the row id', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = { from: () => ({ insert: (r: unknown) => (inserted.push(r as Record<string, unknown>), Promise.resolve({ error: null })) }) }
  const options = recoverySendOptions({ candidate: cancelled('a'), segment: 'cancelled', stage: 1, footer: FOOTER })
  const result = await sendEmail({ ...options, supabase }, {
    isSuppressed: () => Promise.resolve(false),
    send: () => Promise.resolve({ success: true, messageId: 'm1' }),
  })
  assertEquals(inserted.length, 1)
  assertEquals([inserted[0].type, inserted[0].campaign, inserted[0].sequence_stage, inserted[0].template_key], ['recovery', 'recovery_cancelled_s1', 1, 'recovery_cancelled_s1'])
  assertEquals(result.emailEventId, inserted[0].id)
})
