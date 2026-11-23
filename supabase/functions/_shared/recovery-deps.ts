/**
 * RecoveryDeps backed by Supabase (service role). Shared by recovery-sequences (daily
 * job) and admin-revenue-recovery-segments (preview + manual send) so both run the same
 * rules. The rules themselves live in recovery-sequences.ts.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { sendEmail } from './email.ts'
import { getFooterLinksForProfile } from './unsubscribe-token.ts'
import type { RecoveryCandidate } from './revenue-recovery-segments.ts'
import { type RecoveryDeps, recoverySendOptions, type SendState, type SequenceRow } from './recovery-sequences.ts'

export interface GrowthSettings {
  recovery_auto_send: boolean
  recovery_max_sends_per_run: number
  recovery_offers: Record<string, string>
}

export async function loadGrowthSettings(db: SupabaseClient): Promise<GrowthSettings> {
  const { data, error } = await db
    .from('growth_settings')
    .select('recovery_auto_send, recovery_max_sends_per_run, recovery_offers')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(`growth_settings: ${error.message}`)
  // No row: the safe defaults (auto-send off).
  return (data as GrowthSettings | null) ?? { recovery_auto_send: false, recovery_max_sends_per_run: 25, recovery_offers: {} }
}

export function createRecoveryDeps(db: SupabaseClient, settings: GrowthSettings): RecoveryDeps {
  return {
    async loadCandidates() {
      const out: RecoveryCandidate[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.rpc('recovery_candidates').range(from, from + 999)
        if (error) throw new Error(`recovery_candidates: ${error.message}`)
        out.push(...((data ?? []) as RecoveryCandidate[]))
        if (!data || data.length < 1000) return out
      }
    },

    async loadSequences() {
      const out: SequenceRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from('followup_sequences')
          .select('id, profile_id, sequence_key, sequence_stage, sent_date, stop_reason')
          .like('sequence_key', 'recovery\\_%')
          .order('id')
          .range(from, from + 999)
        if (error) throw new Error(`followup_sequences: ${error.message}`)
        out.push(...((data ?? []) as SequenceRow[]))
        if (!data || data.length < 1000) return out
      }
    },

    async sendState(profileId) {
      const { data, error } = await db.rpc('recovery_send_state', { p_profile_id: profileId })
      if (error) throw new Error(`recovery_send_state: ${error.message}`)
      return data as SendState
    },

    async claim(profileId, sequenceKey, stage, now) {
      const { data, error } = await db
        .from('followup_sequences')
        .insert({ profile_id: profileId, sequence_key: sequenceKey, sequence_stage: stage, scheduled_date: now.toISOString() })
        .select('id')
        .single()
      if (error?.code === '23505') return null // already claimed or sent
      if (error) throw new Error(`followup_sequences claim: ${error.message}`)
      return (data as { id: string }).id
    },

    async release(rowId) {
      const { error } = await db.from('followup_sequences').delete().eq('id', rowId).is('sent_date', null)
      if (error) throw new Error(`followup_sequences release: ${error.message}`)
    },

    async markSent(rowId, now, emailEventId) {
      const { error } = await db
        .from('followup_sequences')
        .update({ sent_date: now.toISOString(), email_event_id: emailEventId })
        .eq('id', rowId)
      if (error) throw new Error(`followup_sequences mark sent: ${error.message}`)
    },

    async stopSequence(profileId, sequenceKey, reason) {
      const { error } = await db
        .from('followup_sequences')
        .update({ stop_reason: reason })
        .eq('profile_id', profileId)
        .eq('sequence_key', sequenceKey)
        .is('stop_reason', null)
      if (error) throw new Error(`followup_sequences stop: ${error.message}`)
    },

    async send(candidate, segment, stage) {
      // Throws if the unsubscribe secret is missing: a marketing email never goes out
      // without a working unsubscribe link.
      const footer = await getFooterLinksForProfile(candidate.profile_id, candidate.email, 'marketing')
      const result = await sendEmail({
        ...recoverySendOptions({ candidate, segment, stage, footer, offer: settings.recovery_offers?.[segment] ?? null }),
        supabase: db,
      })
      return { success: result.success, emailEventId: result.emailEventId, error: result.error }
    },
  }
}
