/**
 * Cold outreach sequences to institutional leads and job-seeker prospects: 4 stages at
 * day 0, 2, 4 and 6 (sequence_key 'outreach_<campaign>'). scripts/outbound-live-send.mjs
 * enrolls (a stage-1 row due now); the outreach-sequences edge function runs this.
 *
 * Same machinery as recovery (claim before send, never the same stage twice, stop with a
 * reason), with outreach's own rules:
 *   - one pending row per sequence; after a send the next stage is scheduled at
 *     stage-1 time + its offset, so a missed run catches up with ONE email (the next
 *     stage), and the 2-day rule spaces any further catch-up
 *   - at most one outreach email per person per 2 days (this sequence's rows, and any
 *     outreach email to the address)
 *   - no outreach within 2 days of a recovery email to the address (recovery checks the
 *     other direction, recovery_send_state.recent_outreach)
 *   - right before every send the sequence stops if the person paid, signed up (recovery
 *     takes over), replied since the sequence started (any class), complained, bounced,
 *     unsubscribed, was suppressed by hand, or no longer passes exclusion_lists (leads) /
 *     prospect_send_eligibility (prospects)
 *   - at most maxSends per run (growth_settings.outreach_max_per_run), oldest due first
 */
import { maskEmail } from './admin-prospects.ts'
import { OUTREACH_STAGE_OFFSETS_DAYS, OUTREACH_STAGES, outreachCampaign } from './outbound-templates.mjs'

const DAY_MS = 86_400_000
export const OUTREACH_GAP_DAYS = 2

export interface LeadFields {
  organization_name: string
  category: string
  contact_email: string | null
  decision_maker_name?: string | null
  student_size?: number | null
  recommended_package?: string | null
  signals?: Record<string, unknown> | null
  city?: string | null
  state?: string | null
}
export interface ProspectFields {
  email_normalized: string | null
  first_name: string | null
  target_job_title: string | null
}
export type OutreachSubject =
  | { kind: 'lead'; id: string; lead: LeadFields }
  | { kind: 'prospect'; id: string; prospect: ProspectFields }

export interface OutreachRow {
  id: string
  sequence_key: string
  sequence_stage: number
  scheduled_date: string
  sent_date: string | null
  claimed_at: string | null
  stop_reason: string | null
  created_at: string
}

export interface OutreachSequence {
  subject: OutreachSubject
  sequenceKey: string
  rows: OutreachRow[]
}

/** public.outreach_send_state(). */
export interface OutreachState {
  exists: boolean
  email: string | null
  replied: boolean
  unsubscribed: boolean
  bounced: boolean
  complained: boolean
  manual: boolean
  signed_up: boolean
  paid: boolean
  ineligible_reason: string | null
  last_outreach_at: string | null
  last_recovery_at: string | null
}

export type OutreachStopReason = 'paid' | 'signed_up' | 'reply' | 'complained' | 'bounced' | 'unsubscribed' | 'manual_pause' | 'no_consent'
export type OutreachSkipReason =
  | 'stopped' | 'complete' | 'in_flight' | 'not_due' | 'rate_limited_2d' | 'recent_recovery'
  | 'missing_email' | 'already_claimed' | 'run_limit'

export const campaignOf = (sequenceKey: string) => sequenceKey.replace(/^outreach_/, '')
export const subjectEmail = (s: OutreachSubject) => (s.kind === 'lead' ? s.lead.contact_email : s.prospect.email_normalized)

export type OutreachPlan = { row: OutreachRow; stage: number; startedAt: string } | { skip: OutreachSkipReason }

/** The one row due now in this sequence, if any. */
export function planOutreach(seq: OutreachSequence, nowMs: number): OutreachPlan {
  const rows = seq.rows
  if (rows.some((r) => r.stop_reason)) return { skip: 'stopped' }
  const pending = rows.filter((r) => !r.sent_date).sort((a, b) => a.sequence_stage - b.sequence_stage)[0]
  if (!pending) return { skip: 'complete' }
  if (pending.claimed_at) return { skip: 'in_flight' }
  if (new Date(pending.scheduled_date).getTime() > nowMs) return { skip: 'not_due' }
  const lastSent = Math.max(0, ...rows.filter((r) => r.sent_date).map((r) => new Date(r.sent_date!).getTime()))
  if (lastSent && nowMs - lastSent < OUTREACH_GAP_DAYS * DAY_MS) return { skip: 'rate_limited_2d' }
  // The sequence started when it was enrolled (stage-1 row created).
  const stage1 = rows.find((r) => r.sequence_stage === 1) ?? pending
  return { row: pending, stage: pending.sequence_stage, startedAt: stage1.created_at }
}

/** Stop reason, skip reason, or null (OK to send). Stops are checked before skips. */
export function outreachBlock(state: OutreachState, nowMs: number): { stop: OutreachStopReason } | { skip: OutreachSkipReason } | null {
  if (!state.exists) return { skip: 'missing_email' }
  if (state.paid) return { stop: 'paid' }
  if (state.signed_up) return { stop: 'signed_up' }
  if (state.replied) return { stop: 'reply' }
  if (state.complained) return { stop: 'complained' }
  if (state.bounced) return { stop: 'bounced' }
  if (state.unsubscribed) return { stop: 'unsubscribed' }
  if (state.manual) return { stop: 'manual_pause' }
  if (state.ineligible_reason) return { stop: state.ineligible_reason === 'no_consent' ? 'no_consent' : 'manual_pause' }
  const within = (at: string | null) => !!at && nowMs - new Date(at).getTime() < OUTREACH_GAP_DAYS * DAY_MS
  if (within(state.last_outreach_at)) return { skip: 'rate_limited_2d' }
  if (within(state.last_recovery_at)) return { skip: 'recent_recovery' }
  return null
}

/** When the next stage is due: stage-1 send time + that stage's offset. */
export function nextStageDue(stage1SentAt: string, nextStage: number): string {
  return new Date(new Date(stage1SentAt).getTime() + OUTREACH_STAGE_OFFSETS_DAYS[nextStage - 1] * DAY_MS).toISOString()
}

export interface OutreachDeps {
  loadSequences(): Promise<OutreachSequence[]>
  sendState(subject: OutreachSubject, since: string): Promise<OutreachState>
  /** Atomic: false if another run claimed (or sent, or stopped) the row first. */
  claim(rowId: string, now: Date): Promise<boolean>
  release(rowId: string): Promise<void>
  markSent(rowId: string, now: Date, emailEventId: string | null): Promise<void>
  scheduleStage(subject: OutreachSubject, sequenceKey: string, stage: number, dueAt: string): Promise<void>
  stopSequence(subject: OutreachSubject, sequenceKey: string, reason: OutreachStopReason): Promise<void>
  /** After stage 1: lead/prospect status 'new' -> 'contacted'. */
  markContacted(subject: OutreachSubject, campaign: string): Promise<void>
  send(subject: OutreachSubject, stage: number, campaign: string): Promise<{ success: boolean; emailEventId: string | null; error?: string }>
}

export interface PlannedOutreach {
  rowId: string
  kind: OutreachSubject['kind']
  name: string
  emailMasked: string | null
  stage: number
  campaign: string
}

export interface OutreachRunResult {
  mode: 'preview' | 'send'
  sequences: number
  planned: PlannedOutreach[]
  sent: number
  failed: number
  skipped: Partial<Record<OutreachSkipReason, number>>
  stopped: Partial<Record<OutreachStopReason, number>>
}

const bump = <K extends string>(m: Partial<Record<K, number>>, k: K, by = 1) => { m[k] = (m[k] ?? 0) + by }
const nameOf = (s: OutreachSubject) => (s.kind === 'lead' ? s.lead.organization_name : s.prospect.first_name ?? 'Prospect')

/**
 * preview: reads only (each due person's state included); send: claims, sends, schedules
 * the next stage, stops sequences that must stop.
 */
export async function runOutreach(opts: { mode: 'preview' | 'send'; maxSends: number; now: Date }, deps: OutreachDeps): Promise<OutreachRunResult> {
  const nowMs = opts.now.getTime()
  const sequences = await deps.loadSequences()
  const result: OutreachRunResult = { mode: opts.mode, sequences: sequences.length, planned: [], sent: 0, failed: 0, skipped: {}, stopped: {} }

  const due: { seq: OutreachSequence; row: OutreachRow; stage: number; startedAt: string }[] = []
  for (const seq of sequences) {
    const plan = planOutreach(seq, nowMs)
    if ('skip' in plan) bump(result.skipped, plan.skip)
    else due.push({ seq, ...plan })
  }
  due.sort((a, b) => a.row.scheduled_date.localeCompare(b.row.scheduled_date))

  let attempts = 0
  for (const [i, d] of due.entries()) {
    if (opts.mode === 'send' && attempts >= opts.maxSends) {
      bump(result.skipped, 'run_limit', due.length - i)
      break
    }
    const { subject } = d.seq
    const campaign = campaignOf(d.seq.sequenceKey)
    const block = outreachBlock(await deps.sendState(subject, d.startedAt), nowMs)
    if (block && 'stop' in block) {
      if (opts.mode === 'send') await deps.stopSequence(subject, d.seq.sequenceKey, block.stop)
      bump(result.stopped, block.stop)
      continue
    }
    if (block) {
      bump(result.skipped, block.skip)
      continue
    }
    const planned: PlannedOutreach = {
      rowId: d.row.id,
      kind: subject.kind,
      name: nameOf(subject),
      emailMasked: maskEmail(subjectEmail(subject)),
      stage: d.stage,
      campaign: outreachCampaign(campaign, d.stage),
    }
    if (opts.mode === 'preview') {
      result.planned.push(planned)
      continue
    }

    if (!(await deps.claim(d.row.id, opts.now))) {
      bump(result.skipped, 'already_claimed')
      continue
    }
    attempts += 1
    result.planned.push(planned)
    const sent = await deps.send(subject, d.stage, campaign).catch((err) => ({
      success: false,
      emailEventId: null,
      error: err instanceof Error ? err.message : String(err),
    }))
    if (!sent.success) {
      console.error('outreach: send failed; claim released', { rowId: d.row.id, error: sent.error })
      await deps.release(d.row.id)
      result.failed += 1
      continue
    }
    await deps.markSent(d.row.id, opts.now, sent.emailEventId)
    result.sent += 1
    if (d.stage === 1) await deps.markContacted(subject, campaign)
    if (d.stage < OUTREACH_STAGES) {
      const stage1SentAt = d.stage === 1 ? opts.now.toISOString() : d.seq.rows.find((r) => r.sequence_stage === 1)?.sent_date ?? opts.now.toISOString()
      await deps.scheduleStage(subject, d.seq.sequenceKey, d.stage + 1, nextStageDue(stage1SentAt, d.stage + 1))
    }
  }
  return result
}

/** The daily job only previews unless growth_settings.outreach_auto_send is on. */
export function outreachRunMode(settings: { outreach_auto_send: boolean }): 'preview' | 'send' {
  return settings.outreach_auto_send === true ? 'send' : 'preview'
}

export interface OutreachSequenceSummary {
  sequenceKey: string
  campaign: string
  kind: OutreachSubject['kind']
  name: string
  emailMasked: string | null
  stagesSent: number
  status: 'active' | 'stopped' | 'complete'
  stopReason: string | null
  /** Next stage and when it's due (active only). */
  nextStage: number | null
  nextDue: string | null
  lastSentAt: string | null
}

/** One line per sequence for the admin page: stage, next due, or stopped and why. */
export function summarizeOutreach(sequences: OutreachSequence[]): OutreachSequenceSummary[] {
  return sequences.map((seq) => {
    const sent = seq.rows.filter((r) => r.sent_date)
    const stop = seq.rows.find((r) => r.stop_reason)?.stop_reason ?? null
    const pending = seq.rows.filter((r) => !r.sent_date).sort((a, b) => a.sequence_stage - b.sequence_stage)[0]
    const status: OutreachSequenceSummary['status'] = stop ? 'stopped' : pending ? 'active' : 'complete'
    return {
      sequenceKey: seq.sequenceKey,
      campaign: campaignOf(seq.sequenceKey),
      kind: seq.subject.kind,
      name: nameOf(seq.subject),
      emailMasked: maskEmail(subjectEmail(seq.subject)),
      stagesSent: sent.length,
      status,
      stopReason: stop,
      nextStage: status === 'active' ? pending!.sequence_stage : null,
      nextDue: status === 'active' ? pending!.scheduled_date : null,
      lastSentAt: sent.map((r) => r.sent_date!).sort().at(-1) ?? null,
    }
  }).sort((a, b) => (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999'))
}
