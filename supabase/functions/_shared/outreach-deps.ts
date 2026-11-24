/**
 * OutreachDeps backed by Supabase (service role), for the outreach-sequences function.
 * The rules live in outreach-sequences.ts; the followup_sequences writes are shared with
 * recovery (sequence-store.ts).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { sendEmail } from './email.ts'
import { outreachCampaign, renderOutreach } from './outbound-templates.mjs'
import { getFooterLinksForProfile } from './unsubscribe-token.ts'
import type { OutreachDeps, OutreachRow, OutreachSequence, OutreachState, OutreachSubject } from './outreach-sequences.ts'
import { claimScheduledRow, markSent, type SequenceSubject, stopSequence, unclaimRow } from './sequence-store.ts'

export interface OutreachSettings {
  outreach_auto_send: boolean
  outreach_max_per_run: number
}

export async function loadOutreachSettings(db: SupabaseClient): Promise<OutreachSettings> {
  const { data, error } = await db.from('growth_settings').select('outreach_auto_send, outreach_max_per_run').eq('id', 1).maybeSingle()
  if (error) throw new Error(`growth_settings: ${error.message}`)
  return (data as OutreachSettings | null) ?? { outreach_auto_send: false, outreach_max_per_run: 25 }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Same wording and markup as scripts/outbound-unsubscribe.mjs renderFooter (a test keeps
 * them equal); the scripts/ file isn't importable from a deployed edge function. */
export function outreachFooter(unsubscribeUrl: string, postalAddress: string): { text: string; html: string } {
  return {
    text: `\n\n--\nJob-Hopper, ${postalAddress}\nDon't want emails like this? Unsubscribe: ${unsubscribeUrl}`,
    html: `\n<p style="margin:2em 0 0;font-size:12px;color:#6b7280;">Job-Hopper, ${escapeHtml(postalAddress)}<br>` +
      `Don't want emails like this? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`,
  }
}

/** A prospect's newest shortlist that can be sent: status ready and not expired. */
export async function readyShortlistFor(db: SupabaseClient, prospectId: string, now: Date): Promise<{ token: string; jobs: unknown[] } | null> {
  const { data, error } = await db
    .from('prospect_shortlists')
    .select('token, jobs')
    .eq('prospect_id', prospectId)
    .eq('status', 'ready')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`prospect_shortlists: ${error.message}`)
  return (data as { token: string; jobs: unknown[] } | null) ?? null
}

const LEAD_FIELDS ='id, organization_name, category, contact_email, decision_maker_name, student_size, recommended_package, signals, city, state'
const PROSPECT_FIELDS = 'id, email_normalized, first_name, target_job_title'

type Joined = OutreachRow & {
  institutional_lead_id: string | null
  prospect_id: string | null
  institutional_leads: (OutreachSubject & { kind: 'lead' })['lead'] & { id: string } | null
  prospects: (OutreachSubject & { kind: 'prospect' })['prospect'] & { id: string } | null
}

const storeSubject = (s: OutreachSubject): SequenceSubject =>
  s.kind === 'lead' ? { column: 'institutional_lead_id', id: s.id } : { column: 'prospect_id', id: s.id }

/** Groups outreach rows into sequences (subject + key). Exported for tests. */
export function groupSequences(rows: Joined[]): OutreachSequence[] {
  const bySeq = new Map<string, OutreachSequence>()
  for (const r of rows) {
    let subject: OutreachSubject | null = null
    if (r.institutional_lead_id && r.institutional_leads) subject = { kind: 'lead', id: r.institutional_lead_id, lead: r.institutional_leads }
    else if (r.prospect_id && r.prospects) subject = { kind: 'prospect', id: r.prospect_id, prospect: r.prospects }
    if (!subject) continue
    const key = `${subject.kind}:${subject.id}:${r.sequence_key}`
    const seq = bySeq.get(key) ?? { subject, sequenceKey: r.sequence_key, rows: [] }
    seq.rows.push({
      id: r.id, sequence_key: r.sequence_key, sequence_stage: r.sequence_stage, scheduled_date: r.scheduled_date,
      sent_date: r.sent_date, claimed_at: r.claimed_at, stop_reason: r.stop_reason, created_at: r.created_at,
    })
    bySeq.set(key, seq)
  }
  return [...bySeq.values()]
}

export function createOutreachDeps(db: SupabaseClient, env: { get(name: string): string | undefined }): OutreachDeps {
  return {
    async loadSequences() {
      // ponytail: loads every outreach row; filter to open sequences in SQL once there are thousands.
      const rows: Joined[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from('followup_sequences')
          .select(`id, sequence_key, sequence_stage, scheduled_date, sent_date, claimed_at, stop_reason, created_at, institutional_lead_id, prospect_id, institutional_leads(${LEAD_FIELDS}), prospects(${PROSPECT_FIELDS})`)
          .like('sequence_key', 'outreach\\_%')
          .order('id')
          .range(from, from + 999)
        if (error) throw new Error(`followup_sequences: ${error.message}`)
        rows.push(...((data ?? []) as unknown as Joined[]))
        if (!data || data.length < 1000) break
      }
      return groupSequences(rows)
    },

    async sendState(subject, since) {
      const { data, error } = await db.rpc('outreach_send_state', {
        p_lead_id: subject.kind === 'lead' ? subject.id : null,
        p_prospect_id: subject.kind === 'prospect' ? subject.id : null,
        p_since: since,
      })
      if (error) throw new Error(`outreach_send_state: ${error.message}`)
      return data as OutreachState
    },

    claim: (rowId, now) => claimScheduledRow(db, rowId, now),
    release: (rowId) => unclaimRow(db, rowId),
    markSent: (rowId, now, emailEventId) => markSent(db, rowId, now, emailEventId),
    stopSequence: (subject, key, reason) => stopSequence(db, storeSubject(subject), key, reason),

    async scheduleStage(subject, sequenceKey, stage, dueAt) {
      const s = storeSubject(subject)
      const { error } = await db
        .from('followup_sequences')
        .upsert({ [s.column]: s.id, sequence_key: sequenceKey, sequence_stage: stage, scheduled_date: dueAt }, {
          onConflict: `${s.column},sequence_key,sequence_stage`,
          ignoreDuplicates: true,
        })
      if (error) throw new Error(`followup_sequences schedule: ${error.message}`)
    },

    async markContacted(subject, campaign) {
      const { error } = subject.kind === 'lead'
        ? await db.from('institutional_leads').update({ status: 'contacted', campaign, last_send_attempted_at: new Date().toISOString(), last_send_error: null }).eq('id', subject.id).eq('status', 'new')
        : await db.from('prospects').update({ status: 'contacted' }).eq('id', subject.id).eq('status', 'new')
      if (error) throw new Error(`mark contacted: ${error.message}`)
    },

    async send(subject, stage, campaign) {
      const to = subject.kind === 'lead' ? subject.lead.contact_email : subject.prospect.email_normalized
      if (!to) return { success: false, emailEventId: null, error: 'no email address' }
      // Every outreach email carries the postal address and a signed unsubscribe link
      // (address-keyed v2 token, scope marketing); without them nothing is sent.
      const postalAddress = env.get('OUTBOUND_POSTAL_ADDRESS')?.trim()
      if (!postalAddress) return { success: false, emailEventId: null, error: 'OUTBOUND_POSTAL_ADDRESS is not set' }
      const { unsubscribeUrl } = await getFooterLinksForProfile(null, to, 'marketing') // throws without the secret
      const footer = outreachFooter(unsubscribeUrl, postalAddress)
      // Prospect stage 1 is the shortlist email: it needs their latest ready, unexpired
      // shortlist (scripts/build-shortlists.mjs), and nothing is sent without one.
      let shortlist: { token: string; jobs: unknown[] } | null = null
      if (subject.kind === 'prospect' && stage === 1) {
        shortlist = await readyShortlistFor(db, subject.id, new Date())
        if (!shortlist) return { success: false, emailEventId: null, error: 'no ready, unexpired shortlist' }
      }
      const email = renderOutreach({ subject: { ...subject, shortlist }, stage, campaign, senderName: env.get('SENDER_NAME') || 'Job-Hopper Team' })
      if (email.unfilled.length) return { success: false, emailEventId: null, error: `unfilled placeholders: ${email.unfilled.join(', ')}` }
      const tag = outreachCampaign(campaign, stage)
      const result = await sendEmail({
        kind: 'marketing',
        unsubscribeUrl,
        to,
        subject: email.subject,
        text: email.body + footer.text,
        html: email.html + footer.html,
        category: 'outreach',
        fromName: email.fromName,
        replyTo: email.replyTo,
        eventType: 'outbound',
        campaign: tag,
        templateKey: email.templateKey,
        sequenceStage: stage,
        institutionalLeadId: subject.kind === 'lead' ? subject.id : null,
        prospectId: subject.kind === 'prospect' ? subject.id : null,
        payload: { sequence_key: `outreach_${campaign}`, stage, draft_copy: email.draft },
        supabase: db,
      })
      return { success: result.success, emailEventId: result.emailEventId, error: result.error }
    },
  }
}
