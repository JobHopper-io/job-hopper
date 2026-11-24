/**
 * followup_sequences writes shared by the recovery and outreach runners: stop a sequence,
 * record a send, release a claim. A sequence is identified by its subject (one of the
 * three subject columns) and its sequence_key.
 *
 * Claiming differs by runner: recovery inserts the (profile, sequence, stage) row as its
 * claim (unique index), outreach pre-schedules rows and claims one with a conditional
 * update of claimed_at. Both rely on the database, not on the runner, so two concurrent
 * runs can't send the same stage.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

export type SubjectColumn = 'profile_id' | 'institutional_lead_id' | 'prospect_id'
export interface SequenceSubject {
  column: SubjectColumn
  id: string
}

/** Sets stop_reason on the sequence's rows that don't have one yet. */
export async function stopSequence(db: SupabaseClient, subject: SequenceSubject, sequenceKey: string, reason: string): Promise<void> {
  const { error } = await db
    .from('followup_sequences')
    .update({ stop_reason: reason })
    .eq(subject.column, subject.id)
    .eq('sequence_key', sequenceKey)
    .is('stop_reason', null)
  if (error) throw new Error(`followup_sequences stop: ${error.message}`)
}

export async function markSent(db: SupabaseClient, rowId: string, now: Date, emailEventId: string | null): Promise<void> {
  const { error } = await db
    .from('followup_sequences')
    .update({ sent_date: now.toISOString(), email_event_id: emailEventId })
    .eq('id', rowId)
  if (error) throw new Error(`followup_sequences mark sent: ${error.message}`)
}

/** Recovery: the claim is the row itself, so releasing deletes the unsent row. */
export async function deleteUnsentRow(db: SupabaseClient, rowId: string): Promise<void> {
  const { error } = await db.from('followup_sequences').delete().eq('id', rowId).is('sent_date', null)
  if (error) throw new Error(`followup_sequences release: ${error.message}`)
}

/** Outreach: atomically claims a pre-scheduled, unsent, unstopped row. False if another run has it. */
export async function claimScheduledRow(db: SupabaseClient, rowId: string, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from('followup_sequences')
    .update({ claimed_at: now.toISOString() })
    .eq('id', rowId)
    .is('claimed_at', null)
    .is('sent_date', null)
    .is('stop_reason', null)
    .select('id')
  if (error) throw new Error(`followup_sequences claim: ${error.message}`)
  return (data ?? []).length === 1
}

/** Outreach: un-claims a row whose send failed, so a later run retries it. */
export async function unclaimRow(db: SupabaseClient, rowId: string): Promise<void> {
  const { error } = await db.from('followup_sequences').update({ claimed_at: null }).eq('id', rowId).is('sent_date', null)
  if (error) throw new Error(`followup_sequences unclaim: ${error.message}`)
}
