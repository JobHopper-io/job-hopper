#!/usr/bin/env node
// Live send: fires real emails via Mailtrap's Email Sending API (send.api.mailtrap.io —
// this is Mailtrap's real send endpoint, not a sandbox) to institutional_leads that
// already have a real contact_email. Imports template/dedup logic from
// outbound-dry-run.mjs so the dry-run preview and the live send always render the same
// content from the same code path — no separate copy to drift.
//
// Query: status='new', category in (university, employer), opportunity_score >= 50,
// contact_email is not null. Same shape as the dry run's default query, restricted to
// leads that already have a contact (no enrichment happens here).
//
// Safety:
// - Same contact_email dedup as the dry run — one email per real inbox, generic wording
//   when multiple leads share a contact (see outbound-dry-run.mjs's buildDedupedSends).
// - exclusion_lists is checked once up front (to keep dedup groups clean) AND re-checked
//   fresh immediately before each individual send, so a suppression added mid-run still
//   takes effect for sends later in the batch. suppressed_emails (per address, via the
//   is_email_suppressed RPC) is checked at the same two points; an RPC error stops the run.
// - Every email ends with the postal address (OUTBOUND_POSTAL_ADDRESS) and a signed
//   per-recipient unsubscribe link, and carries List-Unsubscribe / List-Unsubscribe-Post
//   one-click headers (outbound-unsubscribe.mjs). A real send refuses to start if
//   OUTBOUND_POSTAL_ADDRESS or UNSUBSCRIBE_EMAIL_SECRET is missing.
// - Every attempt (sent, failed, or blocked by suppression) writes one email_events row
//   (type 'outbound', campaign, institutional_lead_id, provider_message_id), the send log;
//   institutional_leads' last-send columns stay as a cache. Preview writes nothing.
// - institutional_leads.status -> 'contacted' and campaign -> the given tag are written
//   ONLY after a confirmed-successful send, for every lead folded into that send (not
//   just the primary one whose template was used). A failed send leaves status
//   untouched, so it's naturally retried on a future run (query only pulls status=new).
// - --preview runs the full query + suppression + dedup + render pipeline and prints
//   exactly what would be sent, without calling Mailtrap and without writing anything.
//
// Usage: node scripts/outbound-live-send.mjs --preview
//        node scripts/outbound-live-send.mjs --campaign=first-batch-2026-08-14
//        node scripts/outbound-live-send.mjs --campaign=... --delay-ms=3000

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { CANDIDATE_CATEGORIES, MIN_OPPORTUNITY_SCORE, buildDedupedSends, requireEnv } from './outbound-dry-run.mjs';
import { listUnsubscribeHeaders, makeFooterFor, normalizeEmail, readFooterConfig } from './outbound-unsubscribe.mjs';

const DEFAULT_DELAY_MS = 2000;
const MAILTRAP_BASE = 'https://send.api.mailtrap.io/api/send';
const DEFAULT_FROM_NAME = 'Job-Hopper';

// Duplicated from _shared/email-provider.ts's parseFromAddress -- that file is Deno-only
// and this script runs under plain Node (see outbound-dry-run.mjs's own note on why its
// enrichment logic is duplicated rather than imported). MAILTRAP_FROM may be a bare
// address or an RFC 5322-style "Display Name <email>"; Mailtrap's API wants those as
// separate from.email/from.name fields, not one combined string -- feeding the raw
// combined string into from.email 400s with "'from' address is invalid" (confirmed
// against a real send).
function parseFromAddress(raw, fallbackName) {
  const match = raw.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^"(.*)"$/, '$1').trim();
    return { email: match[2].trim(), name: name || fallbackName };
  }
  return { email: raw.trim(), name: fallbackName };
}

async function sendEmailViaMailtrap({ apiToken, from, fromName, to, subject, text, html, replyTo, headers }) {
  // The display name is set per lead category by fromNameForCategory (Job-Hopper
  // University Partnerships / Job-Hopper Partnerships) -- it always wins over whatever
  // name MAILTRAP_FROM might embed. Only the *address* is extracted from `from`; the
  // fallback name passed to parseFromAddress here is unused in practice since
  // fromName is never empty, but keeping it non-null avoids a stray "undefined" name
  // on a bare address with no embedded name.
  const { email: fromEmail } = parseFromAddress(from, fromName || DEFAULT_FROM_NAME);
  const fromAddress = { email: fromEmail, name: fromName || DEFAULT_FROM_NAME };
  const payload = { from: fromAddress, to: [{ email: to.trim() }], subject, text, html };
  // reply_to is set per lead category by replyToForCategory (partnerships@ /
  // university-partnerships@ job-hopper.co, both routed into reply-ingest). Guarded
  // anyway so a caller passing null still produces a valid payload.
  if (replyTo) {
    payload.reply_to = { email: replyTo.trim() };
  }
  // Mailtrap's `headers` field (Record<string, string>, per the mailtrap-nodejs SDK types):
  // List-Unsubscribe + List-Unsubscribe-Post for one-click unsubscribe.
  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }
  const res = await fetch(MAILTRAP_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    const truncated = bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText;
    return { success: false, error: `Mailtrap error ${res.status}: ${truncated || res.statusText}` };
  }
  let messageId = null;
  try {
    // Mailtrap's real response shape is { success, message_ids: [...] } (plural,
    // array) -- confirmed against a live send; a singular `message_id` field never
    // matches, which is why this was always coming back null before.
    const parsed = bodyText ? JSON.parse(bodyText) : null;
    if (parsed && Array.isArray(parsed.message_ids) && typeof parsed.message_ids[0] === 'string') {
      messageId = parsed.message_ids[0];
    }
  } catch {
    // non-JSON response body; leave messageId null
  }
  return { success: true, messageId };
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const preview = process.argv.includes('--preview');

  const campaignArg = process.argv.find((a) => a.startsWith('--campaign='));
  const campaign = campaignArg ? campaignArg.slice('--campaign='.length) : null;
  if (!preview && !campaign) {
    throw new Error('--campaign=<tag> is required for a real send (e.g. --campaign=first-batch-2026-08-14)');
  }

  // Every email carries the postal address and a signed per-recipient unsubscribe link
  // (outbound-unsubscribe.mjs). A real send refuses to start without them; the preview
  // still renders, with a visible placeholder footer.
  const { config: footerConfig, missing: footerMissing } = readFooterConfig();
  if (!footerConfig) {
    if (!preview) {
      throw new Error(`Refusing to send: missing ${footerMissing.join(', ')} (needed for the unsubscribe footer and headers)`);
    }
    console.warn(`WARNING: footer not configured (${footerMissing.join(', ')}); preview shows a placeholder footer.`);
  }

  const delayArg = process.argv.find((a) => a.startsWith('--delay-ms='));
  const delayMs = delayArg ? Number(delayArg.slice('--delay-ms='.length)) : DEFAULT_DELAY_MS;

  // --limit=27 caps the batch to the top N leads (same opportunity_score-desc,
  // organization_name-asc order already used everywhere else) -- lets a first real
  // batch stay small on purpose. --exclude="Name1,Name2" drops specific orgs by exact
  // organization_name before that cap is applied, so excluding one bad lead doesn't
  // just shrink the batch by one -- the next-highest lead backfills its slot.
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : null;
  const excludeArg = process.argv.find((a) => a.startsWith('--exclude='));
  const excludeNames = excludeArg ? new Set(excludeArg.slice('--exclude='.length).split(',').map((s) => s.trim())) : null;

  const mailtrapToken = preview ? null : requireEnv('MAILTRAP_API_TOKEN');
  const mailtrapFrom = process.env.MAILTRAP_FROM || 'no-reply@job-hopper.io';
  // Just the address, for printing "From:" in preview/rendered output -- the display
  // name itself always comes from fromNameForCategory, per send, not from here.
  const mailtrapFromEmail = parseFromAddress(mailtrapFrom, '').email;

  console.log(
    preview
      ? `PREVIEW (no sends, no writes): querying leads (status=new, category in [${CANDIDATE_CATEGORIES.join(', ')}], opportunity_score >= ${MIN_OPPORTUNITY_SCORE}, contact_email not null)...`
      : `LIVE SEND — campaign="${campaign}", ${delayMs}ms between sends. Querying leads...`,
  );

  const { data: leads, error: leadsError } = await supabase
    .from('institutional_leads')
    .select(
      'id, organization_name, category, contact_email, decision_maker_name, opportunity_score, signals, city, state, student_size, recommended_package',
    )
    .eq('status', 'new')
    .in('category', CANDIDATE_CATEGORIES)
    .gte('opportunity_score', MIN_OPPORTUNITY_SCORE)
    .not('contact_email', 'is', null)
    .order('opportunity_score', { ascending: false })
    .order('organization_name', { ascending: true });
  if (leadsError) throw new Error(`Failed to query institutional_leads: ${leadsError.message}`);
  console.log(`Found ${leads.length} candidate leads.`);

  let scopedLeads = leads;
  if (excludeNames) {
    const before = scopedLeads.length;
    scopedLeads = scopedLeads.filter((l) => !excludeNames.has(l.organization_name));
    console.log(`Excluded ${before - scopedLeads.length} lead(s) by name: ${[...excludeNames].join(', ')}`);
  }
  if (limit != null) {
    scopedLeads = scopedLeads.slice(0, limit);
    console.log(`Capped to top ${scopedLeads.length} leads (--limit=${limit}).`);
  }

  // This pass filters obviously-suppressed leads out up front so dedup groups don't get
  // built around a lead that won't send anyway. Each send still gets its own fresh check
  // below immediately before it fires.
  const { data: exclusions, error: exclusionsError } = await supabase.from('exclusion_lists').select('company_name');
  if (exclusionsError) throw new Error(`Failed to query exclusion_lists: ${exclusionsError.message}`);
  const suppressedNames = new Set(exclusions.map((r) => r.company_name));

  const candidateRenders = [];
  let suppressedCount = 0;
  let logFailures = 0;
  // Preview writes nothing, including the send log.
  const logEvent = async (row) => {
    if (!preview && !(await logOutboundEvent(supabase, row))) logFailures += 1;
  };
  const logBlocked = async (row) => {
    if (!preview && !(await logBlockedOnce(supabase, row))) logFailures += 1;
  };
  const blockedLeadRow = (lead, reason) =>
    blockedEventRow({ reason, toEmail: lead.contact_email, leadIds: [lead.id], orgNames: [lead.organization_name], category: lead.category, campaign });
  for (const lead of scopedLeads) {
    if (suppressedNames.has(lead.organization_name)) {
      suppressedCount += 1;
      console.log(`SKIPPED (suppressed): ${lead.organization_name}`);
      await logBlocked(blockedLeadRow(lead, 'exclusion_lists'));
      continue;
    }
    if (await isEmailSuppressed(supabase, lead.contact_email)) {
      suppressedCount += 1;
      console.log(`SKIPPED (suppressed email): ${lead.organization_name}`);
      await logBlocked(blockedLeadRow(lead, 'suppressed_emails'));
      continue;
    }
    candidateRenders.push({ lead, category: lead.category, contact_email: lead.contact_email.toLowerCase().trim() });
  }

  const { sends } = buildDedupedSends(candidateRenders, campaign, makeFooterFor(footerConfig, footerMissing));

  let sentCount = 0;
  let failedCount = 0;
  let reSuppressedCount = 0;
  const rendered = [];

  for (const s of sends) {
    const leadIds = candidateRenders.filter((c) => c.contact_email === s.contact_email).map((c) => c.lead.id);
    const sendFields = { toEmail: s.contact_email, leadIds, orgNames: s.orgNames, category: s.category, merged: s.merged, subject: s.subject, campaign };
    const sendRow = (fields) => outboundEventRow({ ...sendFields, ...fields });

    // Immediate pre-send re-check: the batch can take minutes, so re-fetch
    // exclusion_lists fresh for THIS send rather than trusting the top-of-run snapshot.
    const { data: freshExclusions, error: freshExclusionsError } = await supabase
      .from('exclusion_lists')
      .select('company_name');
    if (freshExclusionsError) throw new Error(`Failed to re-check exclusion_lists: ${freshExclusionsError.message}`);
    const freshSuppressed = new Set(freshExclusions.map((r) => r.company_name));
    if (s.orgNames.some((name) => freshSuppressed.has(name))) {
      reSuppressedCount += 1;
      console.log(`SKIPPED (suppressed at send time): ${s.orgNames.join(', ')}`);
      await logBlocked(blockedEventRow({ ...sendFields, reason: 'exclusion_lists', atSendTime: true }));
      continue;
    }
    if (await isEmailSuppressed(supabase, s.contact_email)) {
      reSuppressedCount += 1;
      console.log(`SKIPPED (email suppressed at send time): ${s.orgNames.join(', ')}`);
      await logBlocked(blockedEventRow({ ...sendFields, reason: 'suppressed_emails', atSendTime: true }));
      continue;
    }

    if (s.merged) {
      console.log(`Deduped send (${s.orgNames.length} leads -> one email, ${s.contact_email}): ${s.orgNames.join(', ')}`);
    }

    if (preview) {
      console.log(`[PREVIEW] Would send to ${s.contact_email}: "${s.subject}"`);
      rendered.push(s);
      continue;
    }

    const result = await sendEmailViaMailtrap({
      apiToken: mailtrapToken,
      from: mailtrapFrom,
      fromName: s.fromName,
      to: s.contact_email,
      subject: s.subject,
      text: s.body,
      html: s.html,
      replyTo: s.replyTo,
      headers: listUnsubscribeHeaders(s.unsubscribeUrl),
    });

    if (!result.success) {
      failedCount += 1;
      console.log(`  -> FAILED (${s.contact_email}): ${result.error}`);
      await logEvent(sendRow({ status: 'failed', error: result.error }));
      // Failure reason is durable on the lead row, not just this run's console output --
      // status stays 'new' so the lead is naturally retried on a future run, but the
      // reason for last time doesn't just vanish when the terminal session ends.
      const { error: failUpdateError } = await supabase
        .from('institutional_leads')
        .update({ last_send_error: result.error, last_send_attempted_at: new Date().toISOString() })
        .in('id', leadIds);
      if (failUpdateError) {
        console.log(`  -> also failed to record the failure reason on institutional_leads: ${failUpdateError.message}`);
      }
      await sleep(delayMs);
      continue;
    }

    sentCount += 1;
    rendered.push(s);
    console.log(`  -> sent (${s.contact_email}, messageId=${result.messageId ?? 'null'})`);
    // Logged before the lead update below, which throws on failure: the send log must
    // record every email that actually went out.
    await logEvent(sendRow({ status: 'sent', messageId: result.messageId }));

    const { error: updateError } = await supabase
      .from('institutional_leads')
      .update({
        status: 'contacted',
        campaign,
        provider_message_id: result.messageId,
        last_send_error: null,
        last_send_attempted_at: new Date().toISOString(),
      })
      .in('id', leadIds);
    if (updateError) {
      throw new Error(
        `Sent to ${s.contact_email} but failed to update institutional_leads (${leadIds.join(',')}): ${updateError.message}`,
      );
    }

    await sleep(delayMs);
  }

  console.log(
    preview
      ? `\nPreview complete: ${sends.length} would-be sends (${suppressedCount} pre-filtered suppressed), covering ${candidateRenders.length} leads.`
      : `\nLive send complete: ${sentCount} sent, ${suppressedCount + reSuppressedCount} suppressed (${suppressedCount} upfront, ${reSuppressedCount} at send time), ${failedCount} failed.` +
          (logFailures ? ` WARNING: ${logFailures} email_events row(s) failed to write -- see above.` : ''),
  );

  console.log(`\n--- Rendered output (${rendered.length}) ---`);
  for (const r of rendered) {
    console.log(`\n[${r.category}] ${r.orgNames.join('; ')}  (contact_email: ${r.contact_email})`);
    console.log(`From: "${r.fromName}" <${mailtrapFromEmail}>`);
    console.log(`Reply-To: ${r.replyTo}`);
    console.log(`List-Unsubscribe: ${r.unsubscribeUrl ? `<${r.unsubscribeUrl}>` : '(not configured)'}`);
    console.log(`Subject: ${r.subject}`);
    console.log(r.body);
    if (r.unfilled.length) console.log(`\n⚠ unfilled placeholders: ${r.unfilled.join(', ')}`);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
