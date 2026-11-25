#!/usr/bin/env node
// Enrolls institutional leads (and, with --prospects, approved job-seeker prospects) into
// a 4-stage outreach sequence: one followup_sequences row per person, stage 1 due now,
// sequence_key 'outreach_<campaign>'. It sends nothing itself: the outreach-sequences
// edge function (_shared/outreach-sequences.ts) does the sending, with the claim,
// no-repeat, 2-day spacing and stop rules, and re-checks exclusion_lists / prospect
// eligibility and suppression right before every send.
//
// Who gets enrolled:
// - leads: status='new', category in (university, employer), opportunity_score >= 50,
//   contact_email set (same query as before); not on exclusion_lists (case-insensitive),
//   address not suppressed, not already in an open outreach sequence. When several leads
//   share one inbox only the highest-scored one is enrolled, so one person doesn't get
//   several sequences.
// - --prospects: job seekers with review_status='approved' that pass
//   prospect_send_eligibility, aren't already in an open outreach sequence, and have a
//   ready, unexpired shortlist (scripts/build-shortlists.mjs): their stage 1 is the
//   shortlist email, so a prospect without one is skipped (no_ready_shortlist).
// - --only="Name1,Name2" limits leads to those exact organization names (and prospects
//   to those exact emails); --limit / --exclude work as before.
//
// Blocked leads still get one email_events row per (lead, reason), as before.
// --preview prints who would be enrolled and renders their stage-1 email with the
// footer (placeholder footer if UNSUBSCRIBE_EMAIL_SECRET / OUTBOUND_POSTAL_ADDRESS are
// missing). It writes nothing.
//
// Usage: node scripts/outbound-live-send.mjs --preview [--prospects]
//        node scripts/outbound-live-send.mjs --campaign=nov-2026 [--prospects] [--limit=20]

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { CANDIDATE_CATEGORIES, MIN_OPPORTUNITY_SCORE, SENDER_NAME, requireEnv } from './outbound-dry-run.mjs';
import { makeFooterFor, normalizeEmail, readFooterConfig } from './outbound-unsubscribe.mjs';
import { outreachSequenceKey, renderOutreach } from '../supabase/functions/_shared/outbound-templates.mjs';

// Per-address suppression (suppressed_emails via the is_email_suppressed RPC, same check
// sendEmail runs). Cold outbound is always kind 'marketing'. An RPC error throws and stops
// the run -- fail closed, same as an exclusion_lists query error.
export async function isEmailSuppressed(supabase, email) {
  const { data, error } = await supabase.rpc('is_email_suppressed', { p_email: email, p_kind: 'marketing' });
  if (error) throw new Error(`Failed to check suppressed_emails for ${email.split('@')[1] ?? 'address'}: ${error.message}`);
  if (typeof data !== 'boolean') throw new Error(`is_email_suppressed returned ${JSON.stringify(data)}`);
  return data;
}

// email_events is the send log (growth step 3): one row per send attempt -- sent, failed,
// or blocked by suppression -- with type 'outbound'. A merged send (one email for several
// leads sharing a contact) is one row: institutional_lead_id is the primary lead and the
// payload lists all of them. The webhook later moves status to delivered/bounced/complained
// by provider_message_id.
export function outboundEventRow({ toEmail, leadIds, orgNames, category, merged = false, subject = null, campaign, status, messageId = null, error = null, blockedReason = null }) {
  return {
    type: 'outbound',
    profile_id: null,
    institutional_lead_id: leadIds[0] ?? null,
    to_email_normalized: normalizeEmail(toEmail),
    campaign,
    subject,
    template_key: category ? `outbound_${category}${merged ? '_generic' : ''}` : null,
    provider_message_id: messageId,
    status,
    error_message: error,
    payload: {
      institutional_lead_ids: leadIds,
      organization_names: orgNames,
      category,
      merged,
      ...(blockedReason ? { blocked_reason: blockedReason } : {}),
    },
  };
}

// Why a lead wasn't sent to. Stored as payload.blocked_reason, which is what the dashboard
// counts as emailsBlocked (kept apart from real send failures).
export const BLOCK_REASONS = {
  exclusion_lists: 'company is on exclusion_lists',
  suppressed_emails: 'address is in suppressed_emails',
};

export function blockedEventRow({ reason, atSendTime = false, ...fields }) {
  return outboundEventRow({
    ...fields,
    status: 'failed',
    error: `blocked${atSendTime ? ' at send time' : ''}: ${BLOCK_REASONS[reason]}`,
    blockedReason: reason,
  });
}

// A suppressed lead stays status 'new', so every run would block it again. Write its
// blocked row only once per (institutional_lead_id, reason). If the check itself fails,
// write the row anyway -- a duplicate is better than a missing record.
export async function logBlockedOnce(supabase, row) {
  const reason = row.payload.blocked_reason;
  const { data, error } = await supabase
    .from('email_events')
    .select('id')
    .eq('type', 'outbound')
    .eq('institutional_lead_id', row.institutional_lead_id)
    .eq('payload->>blocked_reason', reason)
    .limit(1);
  if (error) {
    console.log(`  -> WARNING: couldn't check for an earlier blocked row (${error.message}); writing one anyway`);
  } else if (data.length > 0) {
    return true;
  }
  return logOutboundEvent(supabase, row);
}

// A failed log write is reported, never thrown: by the time it runs for a real send the
// email is already out, and stopping the batch here could leave leads looking unsent.
export async function logOutboundEvent(supabase, row) {
  const { error } = await supabase.from('email_events').insert(row);
  if (error) {
    console.log(`  -> WARNING: failed to write email_events row (${row.status}): ${error.message}`);
    return false;
  }
  return true;
}

const normName = (s) => (s ?? '').trim().toLowerCase();

/**
 * Which leads to enroll. leads must be in priority order (highest opportunity_score first).
 * Returns { enroll, skipped: [{ lead, reason }] } with reason exclusion_lists |
 * already_enrolled | shared_inbox. Suppressed addresses are checked separately (RPC).
 */
export function pickLeadsToEnroll(leads, { exclusionNames, enrolledLeadIds }) {
  const excluded = new Set(exclusionNames.map(normName));
  const seenInbox = new Map();
  const enroll = [];
  const skipped = [];
  for (const lead of leads) {
    if (excluded.has(normName(lead.organization_name))) skipped.push({ lead, reason: 'exclusion_lists' });
    else if (enrolledLeadIds.has(lead.id)) skipped.push({ lead, reason: 'already_enrolled' });
    else if (seenInbox.has(normalizeEmail(lead.contact_email))) skipped.push({ lead, reason: 'shared_inbox', with: seenInbox.get(normalizeEmail(lead.contact_email)) });
    else {
      seenInbox.set(normalizeEmail(lead.contact_email), lead.organization_name);
      enroll.push(lead);
    }
  }
  return { enroll, skipped };
}

/** followup_sequences stage-1 rows, due now. */
/**
 * Prospects that can get the shortlist email: each paired with their newest ready,
 * unexpired shortlist. shortlists: prospect_shortlists rows (any status/expiry).
 * Returns { enroll: [{ prospect, shortlist }], skipped: [{ prospect, reason }] }.
 */
export function pickProspectsWithShortlist(prospects, shortlists, now = new Date()) {
  const best = new Map();
  for (const s of shortlists) {
    if (s.status !== 'ready' || !(new Date(s.expires_at) > now)) continue;
    const cur = best.get(s.prospect_id);
    if (!cur || s.created_at > cur.created_at) best.set(s.prospect_id, s);
  }
  const enroll = [];
  const skipped = [];
  for (const prospect of prospects) {
    const shortlist = best.get(prospect.id);
    if (shortlist) enroll.push({ prospect, shortlist });
    else skipped.push({ prospect, reason: 'no_ready_shortlist' });
  }
  return { enroll, skipped };
}

export function enrollmentRows({ leadIds = [], prospectIds = [] }, campaign, now = new Date()) {
  const base = { sequence_key: outreachSequenceKey(campaign), sequence_stage: 1, scheduled_date: now.toISOString() };
  return [
    ...leadIds.map((id) => ({ ...base, institutional_lead_id: id })),
    ...prospectIds.map((id) => ({ ...base, prospect_id: id })),
  ];
}

/** Subjects already in an outreach sequence that hasn't finished or stopped. */
async function openOutreachSubjects(supabase) {
  const { data, error } = await supabase
    .from('followup_sequences')
    .select('institutional_lead_id, prospect_id, sequence_key, sent_date, stop_reason, sequence_stage')
    .like('sequence_key', 'outreach\\_%');
  if (error) throw new Error(`Failed to read followup_sequences: ${error.message}`);
  const bySeq = new Map();
  for (const r of data) {
    const k = `${r.institutional_lead_id ?? ''}|${r.prospect_id ?? ''}|${r.sequence_key}`;
    bySeq.set(k, [...(bySeq.get(k) ?? []), r]);
  }
  const leads = new Set();
  const prospects = new Set();
  for (const rows of bySeq.values()) {
    if (rows.some((r) => r.stop_reason) || rows.some((r) => r.sequence_stage === 4 && r.sent_date)) continue;
    if (rows[0].institutional_lead_id) leads.add(rows[0].institutional_lead_id);
    if (rows[0].prospect_id) prospects.add(rows[0].prospect_id);
  }
  return { leads, prospects };
}

const listArg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map((x) => x.trim()).filter(Boolean) : null;
};

async function main() {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const preview = process.argv.includes('--preview');
  const withProspects = process.argv.includes('--prospects');
  const campaign = listArg('campaign')?.[0] ?? (preview ? 'preview' : null);
  if (!campaign) throw new Error('--campaign=<tag> is required to enroll (e.g. --campaign=nov-2026)');
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/i.test(campaign)) throw new Error('--campaign must be letters, digits and dashes');
  const only = listArg('only');
  const excludeNames = listArg('exclude');
  const limitArg = listArg('limit');
  const limit = limitArg ? Number(limitArg[0]) : null;

  const { config: footerConfig, missing: footerMissing } = readFooterConfig();
  if (!footerConfig) console.warn(`WARNING: footer not configured (${footerMissing.join(', ')}); the preview shows a placeholder footer and the outreach runner will refuse to send until it is.`);
  const footerFor = makeFooterFor(footerConfig, footerMissing);

  console.log(`${preview ? 'PREVIEW (no writes)' : 'ENROLL'}: campaign "${campaign}" (sequence ${outreachSequenceKey(campaign)})`);

  let leadsQuery = supabase
    .from('institutional_leads')
    .select('id, organization_name, category, contact_email, decision_maker_name, opportunity_score, signals, city, state, student_size, recommended_package')
    .eq('status', 'new')
    .in('category', CANDIDATE_CATEGORIES)
    .gte('opportunity_score', MIN_OPPORTUNITY_SCORE)
    .not('contact_email', 'is', null)
    .order('opportunity_score', { ascending: false })
    .order('organization_name', { ascending: true });
  if (only) leadsQuery = leadsQuery.in('organization_name', only);
  const { data: leadRows, error: leadsError } = await leadsQuery;
  if (leadsError) throw new Error(`Failed to query institutional_leads: ${leadsError.message}`);
  let leads = leadRows;
  if (excludeNames) leads = leads.filter((l) => !excludeNames.includes(l.organization_name));
  if (limit != null) leads = leads.slice(0, limit);

  const { data: exclusions, error: exclusionsError } = await supabase.from('exclusion_lists').select('company_name');
  if (exclusionsError) throw new Error(`Failed to query exclusion_lists: ${exclusionsError.message}`);
  const open = await openOutreachSubjects(supabase);
  const { enroll, skipped } = pickLeadsToEnroll(leads, { exclusionNames: exclusions.map((r) => r.company_name), enrolledLeadIds: open.leads });

  const logBlocked = async (lead, reason) => {
    if (preview) return;
    await logBlockedOnce(supabase, blockedEventRow({ reason, toEmail: lead.contact_email, leadIds: [lead.id], orgNames: [lead.organization_name], category: lead.category, campaign }));
  };
  for (const s of skipped) {
    console.log(`SKIPPED (${s.reason}${s.with ? ` with ${s.with}` : ''}): ${s.lead.organization_name}`);
    if (s.reason === 'exclusion_lists') await logBlocked(s.lead, 'exclusion_lists');
  }
  const leadsToEnroll = [];
  for (const lead of enroll) {
    if (await isEmailSuppressed(supabase, lead.contact_email)) {
      console.log(`SKIPPED (suppressed email): ${lead.organization_name}`);
      await logBlocked(lead, 'suppressed_emails');
      continue;
    }
    leadsToEnroll.push(lead);
  }

  let prospects = []; // [{ prospect, shortlist }]
  let prospectsSkipped = [];
  if (withProspects) {
    let q = supabase
      .from('prospect_send_eligibility')
      .select('prospect_id, email_normalized, eligible, ineligible_reason')
      .eq('kind', 'job_seeker')
      .eq('eligible', true);
    if (only) q = q.in('email_normalized', only.map(normalizeEmail));
    const { data: eligible, error: eligibleError } = await q;
    if (eligibleError) throw new Error(`Failed to query prospect_send_eligibility: ${eligibleError.message}`);
    const ids = eligible.map((r) => r.prospect_id).filter((id) => !open.prospects.has(id));
    if (ids.length) {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, email_normalized, first_name, target_job_title')
        .in('id', ids)
        .eq('review_status', 'approved')
        .eq('status', 'new');
      if (error) throw new Error(`Failed to query prospects: ${error.message}`);
      const { data: shortlists, error: shortlistError } = await supabase
        .from('prospect_shortlists')
        .select('prospect_id, token, jobs, status, expires_at, created_at')
        .in('prospect_id', data.map((p) => p.id))
        .eq('status', 'ready')
        .gt('expires_at', new Date().toISOString());
      if (shortlistError) throw new Error(`Failed to query prospect_shortlists: ${shortlistError.message}`);
      const picked = pickProspectsWithShortlist(data, shortlists);
      prospects = picked.enroll;
      prospectsSkipped = picked.skipped;
    }
  }

  for (const lead of leadsToEnroll) {
    const email = renderOutreach({ subject: { kind: 'lead', lead }, stage: 1, campaign, senderName: SENDER_NAME });
    printStage1(`[${lead.category}] ${lead.organization_name} <${lead.contact_email}>`, email, footerFor(lead.contact_email));
  }
  for (const { prospect, shortlist } of prospects) {
    const email = renderOutreach({ subject: { kind: 'prospect', prospect, shortlist }, stage: 1, campaign, senderName: SENDER_NAME });
    printStage1(`[prospect] ${prospect.email_normalized}`, email, footerFor(prospect.email_normalized));
  }
  if (prospectsSkipped.length) console.log(`\n${prospectsSkipped.length} approved prospect(s) skipped: no ready, unexpired shortlist (run scripts/build-shortlists.mjs).`);

  if (preview) {
    console.log(`\nPreview complete: would enroll ${leadsToEnroll.length} lead(s) and ${prospects.length} prospect(s); ${skipped.length} lead(s) skipped.`);
    return;
  }
  const rows = enrollmentRows({ leadIds: leadsToEnroll.map((l) => l.id), prospectIds: prospects.map(({ prospect }) => prospect.id) }, campaign);
  for (const [column, subset] of [['institutional_lead_id', rows.filter((r) => r.institutional_lead_id)], ['prospect_id', rows.filter((r) => r.prospect_id)]]) {
    if (!subset.length) continue;
    const { error } = await supabase
      .from('followup_sequences')
      .upsert(subset, { onConflict: `${column},sequence_key,sequence_stage`, ignoreDuplicates: true });
    if (error) throw new Error(`Failed to enroll (${column}): ${error.message}`);
  }
  console.log(`\nEnrolled ${leadsToEnroll.length} lead(s) and ${prospects.length} prospect(s) in ${outreachSequenceKey(campaign)}; stage 1 is due now. The outreach-sequences run sends it.`);
}

function printStage1(label, email, footer) {
  console.log(`\n${label}${email.draft ? '  (DRAFT copy)' : ''}`);
  console.log(`From: ${email.fromName}  Reply-To: ${email.replyTo}`);
  console.log(`Subject: ${email.subject}`);
  console.log(email.body + footer.text);
  if (email.unfilled.length) console.log(`\n⚠ unfilled placeholders: ${email.unfilled.join(', ')}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
