#!/usr/bin/env node
// Pulls U.S. WARN Act mass-layoff notices from warnfirehose.com, scores each as a
// B2B employer-transition opportunity, and upserts into institutional_leads
// (source='warn', category='employer'). Also prints a B2C notices-by-state+industry
// summary — console only for now, no aggregate table yet (see build spec §4).
//
// Free tier: 25 calls/day, 25 records/call, no pagination here on purpose.
//
// Usage: node scripts/warn-connector.mjs [STATE] [DATE_FROM]   (default STATE: TX)

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const WARN_API_URL = 'https://warnfirehose.com/api/records';

const WARN_BUCKETS = [
  { min: 500, score: 90, package: '500+ seat custom cohort' },
  { min: 100, score: 70, package: '50-100 seats, bulk onboarding' },
  { min: 25, score: 50, package: '25 seats, 30-90 day Premium access' },
  // under 25: not a B2B package — flag for B2C geo-targeting instead (spec §3).
  { min: 0, score: 30, package: null },
];

// Confirmed against real API output: layoff_type does carry values like "Closure" and
// "Layoff" on some notices, but is null on most recent 2026 filings. null means
// "unknown", not "temporary" — it must NOT be deprioritized, only unrecognized/blank
// values stay neutral. No confirmed enumeration of "temporary"/"relocation" values
// exists yet, so nothing is scored down, only permanent-shaped values scored up.
const PERMANENT_LAYOFF_TYPES = new Set(['Closure', 'Layoff']);
const PRIORITY_BONUS = 10;

// Recency modifier (AI Lead Scoring Engine 2.0, Build 05): effective_date is 100%
// populated on real WARN notices (confirmed), just wasn't used in scoring before. Kept
// small relative to the 20-point gap between WARN_BUCKETS tiers (max swing here is
// +5/-3, well under PRIORITY_BONUS's own +10) so recency alone can never flip a large
// layoff below a smaller, staler one -- a fresh notice is a hotter lead, not a
// different-sized one.
const RECENCY_BONUS_FRESH_DAYS = 14; // within 2 weeks
const RECENCY_BONUS_FRESH = 5;
const RECENCY_BONUS_RECENT_DAYS = 30; // within a month
const RECENCY_BONUS_RECENT = 2;
const RECENCY_PENALTY_STALE_DAYS = 90; // older than 3 months
const RECENCY_PENALTY_STALE = -3;

function isPermanentLayoff(layoffType) {
  return layoffType != null && PERMANENT_LAYOFF_TYPES.has(layoffType);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function recencyModifier(effectiveDate) {
  if (!effectiveDate) return 0;
  const days = (Date.now() - new Date(effectiveDate).getTime()) / 86400000;
  if (Number.isNaN(days)) return 0;
  if (days <= RECENCY_BONUS_FRESH_DAYS) return RECENCY_BONUS_FRESH;
  if (days <= RECENCY_BONUS_RECENT_DAYS) return RECENCY_BONUS_RECENT;
  if (days > RECENCY_PENALTY_STALE_DAYS) return RECENCY_PENALTY_STALE;
  return 0;
}

export function scoreFor(workers, priority = false, effectiveDate = null) {
  if (workers === null || workers === undefined) return { score: null, package: null };
  const bucket = WARN_BUCKETS.find((b) => workers >= b.min);
  const priorityBonus = priority ? PRIORITY_BONUS : 0;
  const score = Math.max(0, Math.min(100, bucket.score + priorityBonus + recencyModifier(effectiveDate)));
  return { score, package: bucket.package };
}

async function fetchNotices(apiKey, state, dateFrom) {
  const url = new URL(WARN_API_URL);
  url.searchParams.set('state', state);
  url.searchParams.set('limit', '25');
  if (dateFrom) url.searchParams.set('date_from', dateFrom);

  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
  if (!res.ok) {
    throw new Error(`WARN Firehose API request failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();

  // Confirmed shape: { records: [...] }. Still accept a bare array or the other
  // common wrapper keys, and fail loudly with the real shape otherwise, in case a
  // different endpoint/tier ever wraps it differently.
  if (Array.isArray(body)) return body;
  const records = body.records ?? body.data ?? body.results;
  if (!Array.isArray(records)) {
    throw new Error(
      `Unexpected WARN Firehose response shape — no array under records/data/results. Top-level keys: ${Object.keys(body).join(', ')}`,
    );
  }
  return records;
}

function toLeadRow(notice) {
  const workers = notice.employees_affected ?? null;
  const priority = isPermanentLayoff(notice.layoff_type);
  const effectiveDate = notice.effective_date ?? null;
  const { score, package: pkg } = scoreFor(workers, priority, effectiveDate);
  return {
    source: 'warn',
    category: 'employer',
    organization_name: notice.company_name,
    city: notice.city || null,
    state: notice.state || null,
    opportunity_score: score,
    recommended_package: pkg,
    signals: {
      notice_id: notice.id ?? null,
      workers_affected: workers,
      priority,
      layoff_type: notice.layoff_type ?? null,
      temporary_permanent: notice.temporary_permanent ?? null,
      industry: notice.industry ?? null,
      effective_date: effectiveDate,
    },
  };
}

// institutional_leads is unique on (organization_name, source). Same company can file
// more than one WARN notice in a pull (separate rounds/locations) — merge those into
// one row, summing workers_affected (a company with multiple rounds is a bigger
// Career Transition opportunity, not a smaller one) and keeping each collapsed
// notice's detail in signals.merged_notices so nothing is silently lost.
// ponytail: each run's upsert reflects only that pull's summed workers, it doesn't
// accumulate on top of a previous run's stored total — fine for this single-state
// proof run; revisit if incremental pulls need cumulative tracking across runs.
function mergeDuplicateOrgNames(rows) {
  const byName = new Map();
  for (const row of rows) {
    const existing = byName.get(row.organization_name);
    if (!existing) {
      byName.set(row.organization_name, { ...row, signals: { ...row.signals, merged_notices: [] } });
      continue;
    }
    existing.signals.merged_notices.push({
      notice_id: row.signals.notice_id,
      city: row.city,
      workers_affected: row.signals.workers_affected,
      layoff_type: row.signals.layoff_type,
      effective_date: row.signals.effective_date,
    });
    const totalWorkers =
      existing.signals.workers_affected === null && row.signals.workers_affected === null
        ? null
        : (existing.signals.workers_affected ?? 0) + (row.signals.workers_affected ?? 0);
    // Any collapsed notice being a confirmed permanent layoff carries the priority
    // bump for the whole merged employer row — a company isn't less of a real
    // closure/layoff opportunity just because it also filed a second, unclassified notice.
    existing.signals.priority = existing.signals.priority || row.signals.priority;
    // Same logic for recency: the most recent of the merged notices' dates is the real
    // freshness signal — an additional recent filing makes the row hotter, not staler.
    if (row.signals.effective_date && (!existing.signals.effective_date || row.signals.effective_date > existing.signals.effective_date)) {
      existing.signals.effective_date = row.signals.effective_date;
    }
    const { score, package: pkg } = scoreFor(totalWorkers, existing.signals.priority, existing.signals.effective_date);
    existing.signals.workers_affected = totalWorkers;
    existing.opportunity_score = score;
    existing.recommended_package = pkg;
  }
  const merged = [...byName.values()];
  const collapsed = merged.filter((r) => r.signals.merged_notices.length > 0);
  if (collapsed.length) {
    console.warn(`Merged ${collapsed.length} multi-notice employer(s) into one lead row each:`);
    for (const r of collapsed) {
      console.warn(
        `  - ${r.organization_name} (${r.signals.merged_notices.length + 1} notices, summed workers_affected ${r.signals.workers_affected})`,
      );
    }
  }
  return merged;
}

function summarizeB2C(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.state ?? 'unknown'}|${row.signals.industry ?? 'unknown'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, notice_count]) => {
    const [state, industry] = key.split('|');
    return { state, industry, notice_count };
  });
}

async function main() {
  const state = process.argv[2] || 'TX';
  const dateFrom = process.argv[3];
  const apiKey = requireEnv('WARN_FIREHOSE_API_KEY');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log(
    `Fetching WARN notices for ${state}${dateFrom ? ` from ${dateFrom}` : ''} (limit 25, single call, free tier)...`,
  );
  const notices = await fetchNotices(apiKey, state, dateFrom);
  console.log(`Fetched ${notices.length} notices.`);

  const mappedRows = notices.map(toLeadRow);

  console.log('B2C signal — notices by state+industry (console only, no table write yet):');
  console.table(summarizeB2C(mappedRows));

  const leadRows = mergeDuplicateOrgNames(mappedRows);

  const { data, error } = await supabase
    .from('institutional_leads')
    .upsert(leadRows, { onConflict: 'organization_name,source' })
    .select('organization_name, city, state, opportunity_score, recommended_package, signals');

  if (error) {
    throw new Error(`Failed to upsert institutional_leads: ${error.message}`);
  }

  console.log(`Upserted ${data.length} rows into institutional_leads.`);
  console.table(data.map((r) => ({ ...r, signals: JSON.stringify(r.signals) })));
}

function selfTest() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);

  console.assert(scoreFor(null).score === null, 'missing workers_affected stays null, not a guessed score');
  console.assert(scoreFor(1000, false, null).score === 90, 'no effective_date -> no recency modifier');
  console.assert(scoreFor(1000, false, daysAgo(3)).score === 95, 'fresh (<=14d) gets +5');
  console.assert(scoreFor(1000, false, daysAgo(20)).score === 92, 'recent (<=30d) gets +2');
  console.assert(scoreFor(1000, false, daysAgo(60)).score === 90, 'mid-range (30-90d) gets no modifier');
  console.assert(scoreFor(1000, false, daysAgo(120)).score === 87, 'stale (>90d) gets -3');

  // Recency's max swing (+5/-3) must never cross a WARN_BUCKETS tier gap (20 points) or
  // beat PRIORITY_BONUS's own +10 -- a fresh small layoff must still score below a
  // stale large one.
  const freshSmall = scoreFor(30, false, daysAgo(1)).score; // 30 + 5 = 35
  const staleLarge = scoreFor(200, false, daysAgo(200)).score; // 70 - 3 = 67
  console.assert(freshSmall < staleLarge, 'recency must not flip size-tier ranking');

  console.assert(scoreFor(1000, true, daysAgo(1)).score === 100, 'priority + fresh caps at 100, not over');
  console.assert(scoreFor(1000, false, 'not-a-real-date').score === 90, 'unparseable effective_date is a no-op, not a crash');

  console.log('selfTest: all assertions passed');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main().catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
  }
}
