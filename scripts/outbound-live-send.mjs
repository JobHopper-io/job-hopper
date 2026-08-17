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
//   takes effect for sends later in the batch.
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

const DEFAULT_DELAY_MS = 2000;
const MAILTRAP_BASE = 'https://send.api.mailtrap.io/api/send';

async function sendEmailViaMailtrap({ apiToken, from, to, subject, text, html }) {
  const res = await fetch(MAILTRAP_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: { email: from, name: 'Job-Hopper' }, to: [{ email: to.trim() }], subject, text, html }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    const truncated = bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText;
    return { success: false, error: `Mailtrap error ${res.status}: ${truncated || res.statusText}` };
  }
  let messageId = null;
  try {
    const parsed = bodyText ? JSON.parse(bodyText) : null;
    if (parsed && typeof parsed.message_id === 'string') messageId = parsed.message_id;
  } catch {
    // non-JSON response body; leave messageId null
  }
  return { success: true, messageId };
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

  const delayArg = process.argv.find((a) => a.startsWith('--delay-ms='));
  const delayMs = delayArg ? Number(delayArg.slice('--delay-ms='.length)) : DEFAULT_DELAY_MS;

  const mailtrapToken = preview ? null : requireEnv('MAILTRAP_API_TOKEN');
  const mailtrapFrom = process.env.MAILTRAP_FROM || 'no-reply@job-hopper.io';

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

  // This pass filters obviously-suppressed leads out up front so dedup groups don't get
  // built around a lead that won't send anyway. Each send still gets its own fresh check
  // below immediately before it fires.
  const { data: exclusions, error: exclusionsError } = await supabase.from('exclusion_lists').select('company_name');
  if (exclusionsError) throw new Error(`Failed to query exclusion_lists: ${exclusionsError.message}`);
  const suppressedNames = new Set(exclusions.map((r) => r.company_name));

  const candidateRenders = [];
  let suppressedCount = 0;
  for (const lead of leads) {
    if (suppressedNames.has(lead.organization_name)) {
      suppressedCount += 1;
      console.log(`SKIPPED (suppressed): ${lead.organization_name}`);
      continue;
    }
    candidateRenders.push({ lead, category: lead.category, contact_email: lead.contact_email.toLowerCase().trim() });
  }

  const { sends } = buildDedupedSends(candidateRenders);

  let sentCount = 0;
  let failedCount = 0;
  let reSuppressedCount = 0;
  const rendered = [];

  for (const s of sends) {
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
      to: s.contact_email,
      subject: s.subject,
      text: s.body,
      html: s.html,
    });

    if (!result.success) {
      failedCount += 1;
      console.log(`  -> FAILED (${s.contact_email}): ${result.error}`);
      await sleep(delayMs);
      continue;
    }

    sentCount += 1;
    rendered.push(s);
    console.log(`  -> sent (${s.contact_email}, messageId=${result.messageId ?? 'null'})`);

    const leadIds = candidateRenders.filter((c) => c.contact_email === s.contact_email).map((c) => c.lead.id);
    const { error: updateError } = await supabase
      .from('institutional_leads')
      .update({ status: 'contacted', campaign })
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
      : `\nLive send complete: ${sentCount} sent, ${suppressedCount + reSuppressedCount} suppressed (${suppressedCount} upfront, ${reSuppressedCount} at send time), ${failedCount} failed.`,
  );

  console.log(`\n--- Rendered output (${rendered.length}) ---`);
  for (const r of rendered) {
    console.log(`\n[${r.category}] ${r.orgNames.join('; ')}  (contact_email: ${r.contact_email})`);
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
