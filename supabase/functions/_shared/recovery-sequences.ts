/**
 * B2C recovery sequences: every rule in one place, shared by the daily recovery-sequences
 * job and the admin manual send (admin-revenue-recovery-segments).
 *
 * Each segment is a 2-stage sequence (followup_sequences.sequence_key =
 * 'recovery_<segment>'): stage 1 when the user enters the segment, stage 2 five days
 * after stage 1 if they're still in that segment (i.e. haven't converted).
 *
 * Rules:
 *   - at most one recovery email per profile per 7 days, across all sequences (so in
 *     practice stage 2 goes out 7 days after stage 1, not 5)
 *   - a (sequence, stage) is never sent twice: the followup_sequences row is claimed
 *     (unique profile/sequence/stage) before the send
 *   - right before every send the profile's state is re-read; paid, unsubscribed, no
 *     marketing consent, bounced or complained stops a started sequence with that
 *     reason (a sequence that hasn't started is just skipped)
 *   - at most maxSends per run (growth_settings.recovery_max_sends_per_run)
 *   - skipped (not stopped) while an outreach email went to the same address in the
 *     last 2 days (recovery_send_state.recent_outreach)
 */
import { maskEmail } from './admin-prospects.ts'
import type { SendEmailOptions } from './email.ts'
import { wrapAnnouncementWithFooter } from './email-templates.ts'
import { buildSegmentCopy, plainTextToHtml, recoveryCampaign, type RecoveryStage } from './revenue-recovery-copy.ts'
import {
  assignSegment,
  RECOVERY_SEGMENT_PRIORITY,
  type RecoveryCandidate,
  type RevenueRecoverySegmentKey,
} from './revenue-recovery-segments.ts'

const DAY_MS = 86_400_000
export const RATE_LIMIT_DAYS = 7
export const STAGE_2_DELAY_DAYS = 5

export type StopReason = 'paid' | 'unsubscribed' | 'no_consent' | 'bounced' | 'complained' | 'manual_pause'
export type SkipReason = 'rate_limited_7d' | 'stopped' | 'in_flight' | 'complete' | 'waiting_stage_2' | 'past_due' | 'profile_missing' | 'already_claimed' | 'run_limit' | 'recent_outreach' | StopReason

/** A followup_sequences row (recovery sequences only). */
export interface SequenceRow {
  id: string
  profile_id: string
  sequence_key: string
  sequence_stage: number
  sent_date: string | null
  stop_reason: string | null
}

/** public.recovery_send_state(profile_id). */
export interface SendState {
  exists: boolean
  live_access: boolean
  past_due: boolean
  unsubscribed: boolean
  bounced: boolean
  complained: boolean
  manual: boolean
  marketing_consent: boolean
  /** An outreach email went to this address in the last 2 days (skip, don't stop). */
  recent_outreach?: boolean
}

export const sequenceKey = (segment: RevenueRecoverySegmentKey) => `recovery_${segment}`
export const isRecoverySequence = (key: string | null) => !!key?.startsWith('recovery_')

export type Plan = { stage: RecoveryStage } | { skip: SkipReason }

/** What's next for this profile in this segment's sequence, given all its recovery rows. */
export function planNext(segment: RevenueRecoverySegmentKey, rows: SequenceRow[], nowMs: number): Plan {
  const recovery = rows.filter((r) => isRecoverySequence(r.sequence_key))
  const lastSent = Math.max(0, ...recovery.filter((r) => r.sent_date).map((r) => new Date(r.sent_date!).getTime()))
  if (lastSent && nowMs - lastSent < RATE_LIMIT_DAYS * DAY_MS) return { skip: 'rate_limited_7d' }

  const seq = recovery.filter((r) => r.sequence_key === sequenceKey(segment))
  if (seq.some((r) => r.stop_reason)) return { skip: 'stopped' }
  const s1 = seq.find((r) => r.sequence_stage === 1)
  if (!s1) return { stage: 1 }
  if (!s1.sent_date) return { skip: 'in_flight' }
  const s2 = seq.find((r) => r.sequence_stage === 2)
  if (s2) return { skip: s2.sent_date ? 'complete' : 'in_flight' }
  if (nowMs - new Date(s1.sent_date).getTime() < STAGE_2_DELAY_DAYS * DAY_MS) return { skip: 'waiting_stage_2' }
  return { stage: 2 }
}

/** Why this profile must not get a recovery email right now (null = OK to send). */
export function blockReason(state: SendState): StopReason | 'past_due' | 'profile_missing' | 'recent_outreach' | null {
  if (!state.exists) return 'profile_missing'
  if (state.live_access) return 'paid'
  if (state.past_due) return 'past_due'
  if (state.complained) return 'complained'
  if (state.bounced) return 'bounced'
  if (state.unsubscribed) return 'unsubscribed'
  if (state.manual) return 'manual_pause'
  if (!state.marketing_consent) return 'no_consent'
  if (state.recent_outreach) return 'recent_outreach'
  return null
}

const STOP_REASONS = new Set<string>(['paid', 'unsubscribed', 'no_consent', 'bounced', 'complained', 'manual_pause'])
const isStopReason = (r: string | null): r is StopReason => r !== null && STOP_REASONS.has(r)

export interface RecoverySendInput {
  candidate: RecoveryCandidate
  segment: RevenueRecoverySegmentKey
  stage: RecoveryStage
  footer: { siteUrl: string; unsubscribeUrl: string; preferencesUrl: string }
  offer?: string | null
}

/** The sendEmail options for one recovery email (everything but the DB client). */
export function recoverySendOptions(input: RecoverySendInput): Omit<SendEmailOptions, 'supabase'> {
  const { candidate: c, segment, stage, footer } = input
  const campaign = recoveryCampaign(segment, stage)
  const copy = buildSegmentCopy(segment, stage, {
    firstName: c.first_name,
    siteUrl: footer.siteUrl,
    campaign,
    searchesUsed: c.job_searches_used,
    searchLimit: c.max_job_searches,
    hasResume: c.has_resume,
    targetJobTitle: c.target_job_title,
    offer: input.offer ?? null,
  })
  return {
    kind: 'marketing',
    unsubscribeUrl: footer.unsubscribeUrl,
    to: c.email,
    subject: copy.subject,
    html: wrapAnnouncementWithFooter(plainTextToHtml(copy.body), footer),
    text: copy.body,
    category: 'recovery',
    profileId: c.profile_id,
    eventType: 'recovery',
    templateKey: campaign,
    campaign,
    sequenceStage: stage,
    payload: { segment, stage, sequence_key: sequenceKey(segment) },
  }
}

export interface PlannedSend {
  profileId: string
  emailMasked: string | null
  segment: RevenueRecoverySegmentKey
  stage: RecoveryStage
  campaign: string
}

export interface RecoveryDeps {
  loadCandidates(): Promise<RecoveryCandidate[]>
  /** followup_sequences rows whose sequence_key starts with 'recovery_'. */
  loadSequences(): Promise<SequenceRow[]>
  sendState(profileId: string): Promise<SendState>
  /** Inserts the (profile, sequence, stage) row; null if it already exists. */
  claim(profileId: string, sequenceKey: string, stage: RecoveryStage, now: Date): Promise<string | null>
  /** Deletes a claim after a failed send, so a later run can retry. */
  release(rowId: string): Promise<void>
  markSent(rowId: string, now: Date, emailEventId: string | null): Promise<void>
  /** Sets stop_reason on the sequence's rows that don't have one. */
  stopSequence(profileId: string, sequenceKey: string, reason: StopReason): Promise<void>
  send(candidate: RecoveryCandidate, segment: RevenueRecoverySegmentKey, stage: RecoveryStage): Promise<{ success: boolean; emailEventId: string | null; error?: string }>
}

export interface RecoveryRunResult {
  mode: 'preview' | 'send'
  candidates: number
  bySegment: Partial<Record<RevenueRecoverySegmentKey, { members: number; due: number }>>
  /** preview: everyone due now who'd pass the pre-send check (ignoring the per-run cap); send: everyone attempted. */
  planned: PlannedSend[]
  sent: number
  failed: number
  skipped: Partial<Record<SkipReason, number>>
  stopped: Partial<Record<StopReason, number>>
}

const bump = <K extends string>(m: Partial<Record<K, number>>, k: K, by = 1) => { m[k] = (m[k] ?? 0) + by }

/**
 * preview: reads only (including each due person's send state), writes and sends
 * nothing. send: stops finished sequences, then
 * sends up to maxSends, re-checking each profile right before its send.
 */
export async function runRecovery(
  opts: { mode: 'preview' | 'send'; maxSends: number; now: Date },
  deps: RecoveryDeps,
): Promise<RecoveryRunResult> {
  const nowMs = opts.now.getTime()
  const result: RecoveryRunResult = { mode: opts.mode, candidates: 0, bySegment: {}, planned: [], sent: 0, failed: 0, skipped: {}, stopped: {} }
  const [candidates, sequences] = await Promise.all([deps.loadCandidates(), deps.loadSequences()])
  result.candidates = candidates.length

  const rowsByProfile = new Map<string, SequenceRow[]>()
  for (const r of sequences) rowsByProfile.set(r.profile_id, [...(rowsByProfile.get(r.profile_id) ?? []), r])

  // Started sequences of people who are no longer candidates (e.g. they paid): record why.
  if (opts.mode === 'send') {
    const candidateIds = new Set(candidates.map((c) => c.profile_id))
    const open = new Map<string, Set<string>>()
    for (const r of sequences) {
      if (candidateIds.has(r.profile_id) || !r.sent_date) continue
      if (sequences.some((o) => o.profile_id === r.profile_id && o.sequence_key === r.sequence_key && o.stop_reason)) continue
      open.set(r.profile_id, (open.get(r.profile_id) ?? new Set()).add(r.sequence_key))
    }
    for (const [profileId, keys] of open) {
      const reason = blockReason(await deps.sendState(profileId))
      if (!isStopReason(reason)) continue
      for (const key of keys) {
        await deps.stopSequence(profileId, key, reason)
        bump(result.stopped, reason)
      }
    }
  }

  const due: { candidate: RecoveryCandidate; segment: RevenueRecoverySegmentKey; stage: RecoveryStage }[] = []
  for (const c of candidates) {
    const segment = assignSegment(c, nowMs)
    if (!segment) continue
    const seg = (result.bySegment[segment] ??= { members: 0, due: 0 })
    seg.members += 1
    const plan = planNext(segment, rowsByProfile.get(c.profile_id) ?? [], nowMs)
    if ('skip' in plan) {
      bump(result.skipped, plan.skip)
      continue
    }
    seg.due += 1
    due.push({ candidate: c, segment, stage: plan.stage })
  }
  // The per-run cap goes to the highest-priority segments first.
  due.sort((a, b) => RECOVERY_SEGMENT_PRIORITY.indexOf(a.segment) - RECOVERY_SEGMENT_PRIORITY.indexOf(b.segment))

  const toPlanned = (d: (typeof due)[number]): PlannedSend => ({
    profileId: d.candidate.profile_id,
    emailMasked: maskEmail(d.candidate.email),
    segment: d.segment,
    stage: d.stage,
    campaign: recoveryCampaign(d.segment, d.stage),
  })

  if (opts.mode === 'preview') {
    // Same state check as a send (read-only), so the preview only lists people who would
    // actually get an email: no consent, unsubscribed, suppressed etc. are counted as skips.
    for (const d of due) {
      const reason = blockReason(await deps.sendState(d.candidate.profile_id))
      if (reason) {
        bump(result.skipped, reason)
        result.bySegment[d.segment]!.due -= 1
      } else {
        result.planned.push(toPlanned(d))
      }
    }
    return result
  }

  for (const [i, d] of due.entries()) {
    if (result.sent + result.failed >= opts.maxSends) {
      bump(result.skipped, 'run_limit', due.length - i)
      break
    }
    const key = sequenceKey(d.segment)
    const reason = blockReason(await deps.sendState(d.candidate.profile_id))
    if (reason) {
      result.bySegment[d.segment]!.due -= 1
      // Only a started sequence (stage 2 due) has something to stop.
      if (d.stage === 2 && isStopReason(reason)) {
        await deps.stopSequence(d.candidate.profile_id, key, reason)
        bump(result.stopped, reason)
      } else {
        bump(result.skipped, reason)
      }
      continue
    }
    const rowId = await deps.claim(d.candidate.profile_id, key, d.stage, opts.now)
    if (!rowId) {
      bump(result.skipped, 'already_claimed')
      continue
    }
    result.planned.push(toPlanned(d))
    // A thrown send (e.g. no unsubscribe secret) must still release the claim.
    const sendResult = await deps.send(d.candidate, d.segment, d.stage).catch((err) => ({
      success: false,
      emailEventId: null,
      error: err instanceof Error ? err.message : String(err),
    }))
    if (sendResult.success) {
      await deps.markSent(rowId, opts.now, sendResult.emailEventId)
      result.sent += 1
    } else {
      await deps.release(rowId)
      result.failed += 1
    }
  }
  return result
}

/** The daily job only previews unless growth_settings.recovery_auto_send is on. */
export function scheduledRunMode(settings: { recovery_auto_send: boolean }): 'preview' | 'send' {
  return settings.recovery_auto_send === true ? 'send' : 'preview'
}
