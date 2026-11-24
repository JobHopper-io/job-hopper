import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { renderFooter } from '../../../../scripts/outbound-unsubscribe.mjs'
import { groupSequences, outreachFooter } from '../outreach-deps.ts'
import {
  nextStageDue,
  outreachBlock,
  type OutreachDeps,
  type OutreachRow,
  outreachRunMode,
  type OutreachSequence,
  type OutreachState,
  type OutreachSubject,
  planOutreach,
  runOutreach,
} from '../outreach-sequences.ts'

const DAY = 86_400_000
const T0 = new Date('2026-11-25T09:00:00Z')
const at = (days: number) => new Date(T0.getTime() + days * DAY)
const CLEAN: OutreachState = {
  exists: true, email: 'dean@state.edu', replied: false, unsubscribed: false, bounced: false, complained: false,
  manual: false, signed_up: false, paid: false, ineligible_reason: null, last_outreach_at: null, last_recovery_at: null,
}
const LEAD: OutreachSubject = { kind: 'lead', id: 'l1', lead: { organization_name: 'State University', category: 'university', contact_email: 'dean@state.edu' } }
const PROSPECT: OutreachSubject = { kind: 'prospect', id: 'p1', prospect: { email_normalized: 'maria@example.com', first_name: 'Maria', target_job_title: 'UX Designer' } }

let n = 0
const row = (over: Partial<OutreachRow>): OutreachRow => ({
  id: `r${++n}`, sequence_key: 'outreach_nov', sequence_stage: 1, scheduled_date: T0.toISOString(), sent_date: null,
  claimed_at: null, stop_reason: null, created_at: T0.toISOString(), ...over,
})

/** In-memory followup_sequences + email log, with the same atomic claim as the DB. */
function store(subjects: OutreachSubject[], state: (s: OutreachSubject) => Partial<OutreachState> = () => ({})) {
  const rows: (OutreachRow & { subject: OutreachSubject })[] = subjects.map((subject) => ({ ...row({}), subject }))
  const sent: { who: string; stage: number; at: string }[] = []
  const stops: { who: string; reason: string }[] = []
  const contacted: string[] = []
  let now = T0
  const lastSendTo = (s: OutreachSubject) => sent.filter((x) => x.who === s.id).map((x) => x.at).sort().at(-1) ?? null
  const deps: OutreachDeps = {
    loadSequences: () => {
      const bySeq = new Map<string, OutreachSequence>()
      for (const r of rows) {
        const k = `${r.subject.id}:${r.sequence_key}`
        const seq = bySeq.get(k) ?? { subject: r.subject, sequenceKey: r.sequence_key, rows: [] }
        seq.rows.push({ ...r })
        bySeq.set(k, seq)
      }
      return Promise.resolve([...bySeq.values()])
    },
    sendState: (s) => Promise.resolve({ ...CLEAN, last_outreach_at: lastSendTo(s), ...state(s) }),
    claim: (id, t) => {
      const r = rows.find((x) => x.id === id)!
      if (r.claimed_at || r.sent_date || r.stop_reason) return Promise.resolve(false)
      r.claimed_at = t.toISOString()
      return Promise.resolve(true)
    },
    release: (id) => (rows.find((x) => x.id === id)!.claimed_at = null, Promise.resolve()),
    markSent: (id, t) => (rows.find((x) => x.id === id)!.sent_date = t.toISOString(), Promise.resolve()),
    scheduleStage: (s, key, stage, dueAt) => {
      if (!rows.some((r) => r.subject.id === s.id && r.sequence_key === key && r.sequence_stage === stage)) {
        rows.push({ ...row({ sequence_key: key, sequence_stage: stage, scheduled_date: dueAt, created_at: now.toISOString() }), subject: s })
      }
      return Promise.resolve()
    },
    stopSequence: (s, key, reason) => {
      stops.push({ who: s.id, reason })
      for (const r of rows) if (r.subject.id === s.id && r.sequence_key === key && !r.stop_reason) r.stop_reason = reason
      return Promise.resolve()
    },
    markContacted: (s) => (contacted.push(s.id), Promise.resolve()),
    send: (s, stage) => (sent.push({ who: s.id, stage, at: now.toISOString() }), Promise.resolve({ success: true, emailEventId: `ev${sent.length}` })),
  }
  const run = (t: Date, mode: 'preview' | 'send' = 'send', maxSends = 25) => {
    now = t
    return runOutreach({ mode, maxSends, now: t }, deps)
  }
  return { deps, rows, sent, stops, contacted, run }
}

// --- planning and blocks ---

Deno.test('planOutreach: due, not due, in flight, stopped, complete, 2-day gap', () => {
  const seq = (rows: OutreachRow[]): OutreachSequence => ({ subject: LEAD, sequenceKey: 'outreach_nov', rows })
  const now = T0.getTime()
  assertEquals('row' in planOutreach(seq([row({})]), now), true)
  assertEquals(planOutreach(seq([row({ scheduled_date: at(1).toISOString() })]), now), { skip: 'not_due' })
  assertEquals(planOutreach(seq([row({ claimed_at: T0.toISOString() })]), now), { skip: 'in_flight' })
  assertEquals(planOutreach(seq([row({ stop_reason: 'reply' })]), now), { skip: 'stopped' })
  assertEquals(planOutreach(seq([row({ sent_date: at(-1).toISOString() })]), now), { skip: 'complete' })
  const s1 = row({ sent_date: at(-1).toISOString() })
  assertEquals(planOutreach(seq([s1, row({ sequence_stage: 2, scheduled_date: at(-1).toISOString() })]), now), { skip: 'rate_limited_2d' })
})

Deno.test('outreachBlock: every stop reason, stops before skips; 2-day gaps', () => {
  const now = T0.getTime()
  const cases: [Partial<OutreachState>, unknown][] = [
    [{ paid: true, signed_up: true }, { stop: 'paid' }],
    [{ signed_up: true }, { stop: 'signed_up' }],
    [{ replied: true }, { stop: 'reply' }],
    [{ complained: true }, { stop: 'complained' }],
    [{ bounced: true }, { stop: 'bounced' }],
    [{ unsubscribed: true }, { stop: 'unsubscribed' }],
    [{ manual: true }, { stop: 'manual_pause' }],
    [{ ineligible_reason: 'exclusion_lists' }, { stop: 'manual_pause' }],
    [{ ineligible_reason: 'no_consent' }, { stop: 'no_consent' }],
    [{ ineligible_reason: 'non_us' }, { stop: 'manual_pause' }],
    [{ replied: true, last_outreach_at: T0.toISOString() }, { stop: 'reply' }],
    [{ last_outreach_at: at(-1).toISOString() }, { skip: 'rate_limited_2d' }],
    [{ last_recovery_at: at(-1.5).toISOString() }, { skip: 'recent_recovery' }],
    [{ last_recovery_at: at(-2).toISOString() }, null],
    [{ exists: false }, { skip: 'missing_email' }],
    [{}, null],
  ]
  for (const [state, expected] of cases) assertEquals(outreachBlock({ ...CLEAN, ...state }, now), expected, JSON.stringify(state))
})

Deno.test('4 stages on day 0, 2, 4, 6 for a lead and a prospect; stage 1 marks contacted', async () => {
  const h = store([LEAD, PROSPECT])
  for (const day of [0, 1, 2, 3, 4, 5, 6, 7, 8]) await h.run(at(day))
  assertEquals(h.sent.map((s) => `${s.who}:s${s.stage}:d${(new Date(s.at).getTime() - T0.getTime()) / DAY}`), [
    'l1:s1:d0', 'p1:s1:d0', 'l1:s2:d2', 'p1:s2:d2', 'l1:s3:d4', 'p1:s3:d4', 'l1:s4:d6', 'p1:s4:d6',
  ])
  assertEquals(h.contacted, ['l1', 'p1'])
  assertEquals(nextStageDue(T0.toISOString(), 4), at(6).toISOString())
})

Deno.test('a missed run catches up with only the next stage, never several at once', async () => {
  const h = store([LEAD])
  await h.run(at(0)) // stage 1
  const r = await h.run(at(4)) // runs on days 1-3 missed: stages 2 and 3 are both overdue
  assertEquals(r.sent, 1)
  assertEquals(h.sent.map((s) => s.stage), [1, 2])
  assertEquals((await h.run(at(5))).skipped.rate_limited_2d, 1) // stage 3 waits for the 2-day gap
  await h.run(at(6))
  assertEquals(h.sent.map((s) => s.stage), [1, 2, 3])
})

Deno.test('two runs at the same time send each due email once', async () => {
  const h = store([LEAD, PROSPECT])
  const [a, b] = await Promise.all([h.run(at(0)), h.run(at(0))])
  assertEquals(a.sent + b.sent, 2)
  assertEquals(h.sent.length, 2)
  assertEquals(h.sent.map((s) => s.who).sort(), ['l1', 'p1']) // each person once
  // The losing run skipped each person for one of: already claimed while planning
  // (in_flight), lost the claim (already_claimed), or already emailed (rate_limited_2d).
  const skips = (r: typeof a) => Object.values(r.skipped).reduce((x, y) => x + (y ?? 0), 0)
  assertEquals(skips(a) + skips(b), 2)
})

Deno.test('a reply stops the sequence before the next stage', async () => {
  let replied = false
  const h = store([LEAD, PROSPECT], (s) => ({ replied: replied && s.id === 'l1' }))
  await h.run(at(0))
  await h.run(at(2))
  replied = true
  const r = await h.run(at(4))
  assertEquals(r.stopped, { reply: 1 })
  assertEquals(h.sent.filter((s) => s.who === 'l1').map((s) => s.stage), [1, 2])
  assertEquals(h.sent.filter((s) => s.who === 'p1').map((s) => s.stage), [1, 2, 3])
  await h.run(at(6))
  assertEquals(h.sent.filter((s) => s.who === 'l1').length, 2) // stays stopped
})

Deno.test('unsubscribed, signed up and paid all stop; nothing more is sent', async () => {
  for (const [flag, reason] of [['unsubscribed', 'unsubscribed'], ['signed_up', 'signed_up'], ['paid', 'paid']] as const) {
    let on = false
    const h = store([PROSPECT], () => ({ [flag]: on }))
    await h.run(at(0))
    on = true
    await h.run(at(2))
    await h.run(at(4))
    assertEquals(h.stops, [{ who: 'p1', reason }], flag)
    assertEquals(h.sent.length, 1, flag)
  }
})

Deno.test('eligibility is re-checked right before every send', async () => {
  let excluded = false
  const h = store([LEAD], () => ({ ineligible_reason: excluded ? 'exclusion_lists' : null }))
  await h.run(at(0))
  excluded = true
  await h.run(at(2))
  assertEquals(h.sent.length, 1)
  assertEquals(h.stops, [{ who: 'l1', reason: 'manual_pause' }])
})

Deno.test('a recent recovery email to the same address skips (does not stop) outreach', async () => {
  const h = store([PROSPECT], () => ({ last_recovery_at: at(-1).toISOString() }))
  const r = await h.run(at(0))
  assertEquals(r.skipped.recent_recovery, 1)
  assertEquals(h.sent.length + h.stops.length, 0)
})

Deno.test('auto-send off previews: nothing claimed, sent, stopped or scheduled', async () => {
  assertEquals(outreachRunMode({ outreach_auto_send: false }), 'preview')
  assertEquals(outreachRunMode({ outreach_auto_send: true }), 'send')
  const h = store([LEAD, PROSPECT], (s) => ({ replied: s.id === 'p1' }))
  const r = await h.run(at(0), outreachRunMode({ outreach_auto_send: false }))
  assertEquals(r.planned.map((p) => [p.kind, p.emailMasked, p.stage, p.campaign]), [['lead', 'd***@state.edu', 1, 'outreach_nov_s1']])
  assertEquals(r.stopped, { reply: 1 }) // reported, not written
  assertEquals(h.sent.length + h.stops.length + h.contacted.length, 0)
  assert(h.rows.every((x) => !x.claimed_at && !x.stop_reason) && h.rows.length === 2)
})

Deno.test('per-run cap, oldest due first; a failed send is released and retried', async () => {
  const h = store([LEAD, PROSPECT])
  h.rows[1].scheduled_date = at(-1).toISOString() // prospect enrolled earlier
  const r = await h.run(at(0), 'send', 1)
  assertEquals([r.sent, r.skipped.run_limit], [1, 1])
  assertEquals(h.sent.map((s) => s.who), ['p1'])

  const f = store([LEAD])
  f.deps.send = () => Promise.reject(new Error('provider down'))
  assertEquals((await f.run(at(0))).failed, 1)
  assertEquals(f.rows[0].claimed_at, null)
  assertEquals(f.rows[0].sent_date, null)
})

Deno.test('groupSequences: one sequence per subject and key; rows without a subject are dropped', () => {
  const base = { sequence_key: 'outreach_nov', scheduled_date: T0.toISOString(), sent_date: null, claimed_at: null, stop_reason: null, created_at: T0.toISOString() }
  const leadRow = { institutional_lead_id: 'l1', prospect_id: null, institutional_leads: { id: 'l1', organization_name: 'State University', category: 'university', contact_email: 'dean@state.edu' }, prospects: null }
  const seqs = groupSequences([
    { ...base, id: 'a', sequence_stage: 1, ...leadRow },
    { ...base, id: 'b', sequence_stage: 2, ...leadRow },
    { ...base, id: 'c', sequence_stage: 1, institutional_lead_id: null, prospect_id: 'p1', institutional_leads: null, prospects: { id: 'p1', email_normalized: 'm@x.com', first_name: null, target_job_title: null } },
    { ...base, id: 'd', sequence_stage: 1, institutional_lead_id: null, prospect_id: null, institutional_leads: null, prospects: null },
  ] as unknown as Parameters<typeof groupSequences>[0])
  assertEquals(seqs.map((s) => [s.subject.kind, s.subject.id, s.rows.length]), [['lead', 'l1', 2], ['prospect', 'p1', 1]])
})

Deno.test('the edge-function footer matches the Node outbound footer exactly', () => {
  const url = 'https://x.supabase.co/functions/v1/unsubscribe-email?token=a.b'
  assertEquals(outreachFooter(url, '1 Main St, Austin, TX'), renderFooter({ unsubscribeUrl: url, postalAddress: '1 Main St, Austin, TX' }))
})
