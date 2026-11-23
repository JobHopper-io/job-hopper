#!/usr/bin/env node
// Pulls U.S. WARN Act mass-layoff notices from warnfirehose.com, scores each as a
// B2B employer-transition opportunity, and upserts into institutional_leads
// (source='warn', category='employer'). Also prints a B2C notices-by-state+industry
// summary — console only for now, no aggregate table yet (see build spec §4).
//
// Free tier: 25 calls/day, 25 records/call, no pagination here on purpose.
//
// Usage: node scripts/warn-connector.mjs [STATES] [DATE_FROM] [--days=N] [--dry-run]
//   (STATES: comma-separated, one API call each, default TX; --days=N sets DATE_FROM to N days ago; --dry-run fetches and
//   prints counts + samples, never writes)

import assert from 'node:assert/strict';
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

// Free-tier quota exhaustion. The exact status/body isn't documented in the repo:
// 429 is treated as the limit, as is any other 4xx whose body mentions a limit/quota.
export class WarnLimitError extends Error {}

async function fetchNotices(apiKey, state, dateFrom) {
  const url = new URL(WARN_API_URL);
  url.searchParams.set('state', state);
  url.searchParams.set('limit', '25');
  if (dateFrom) url.searchParams.set('date_from', dateFrom);

  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || (res.status >= 400 && res.status < 500 && /limit|quota/i.test(text))) {
      throw new WarnLimitError(`WARN Firehose limit hit on ${state}: ${res.status} ${text}`);
    }
    throw new Error(`WARN Firehose API request failed: ${res.status} ${text}`);
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

// One call per state, sequentially. On the free-tier limit, stop and keep what was
// already fetched; any other error still aborts the run.
export async function fetchAllStates(states, fetchOne) {
  const notices = [];
  const fetched = [];
  for (const state of states) {
    try {
      notices.push(...(await fetchOne(state)));
      fetched.push(state);
    } catch (err) {
      if (!(err instanceof WarnLimitError)) throw err;
      console.warn(`${err.message}\nStopping: not fetched: ${states.slice(fetched.length).join(', ')}`);
      return { notices, fetched, limited: true };
    }
  }
  return { notices, fetched, limited: false };
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

// A row's notices: the primary one (top-level signals) plus signals.merged_notices.
// Top-level workers_affected is the merged TOTAL, so the primary notice's own count is
// total minus the others. Top-level effective_date is the max across notices, so the
// primary's own date isn't recoverable; the max is what scoring uses anyway.
function noticesOf(row) {
  const { notice_id, workers_affected, layoff_type, effective_date, merged_notices = [] } = row.signals ?? {};
  const others = merged_notices.reduce((sum, n) => sum + (n.workers_affected ?? 0), 0);
  const own = workers_affected == null ? null : workers_affected - others;
  return [{ notice_id, city: row.city ?? null, workers_affected: own, layoff_type, effective_date }, ...merged_notices];
}

// Notices without an id fall back to city+date+workers so a re-run can't double-count them.
const noticeKey = (n) => n.notice_id ?? `${n.city}|${n.effective_date}|${n.workers_affected}`;

// Rebuilds one employer row from a list of notices: dedupes by notice_id, sums
// workers_affected across unique notices (a company with multiple rounds is a bigger
// opportunity), priority if any notice is a permanent layoff, freshest effective_date,
// and recomputes the score from those merged totals. The first notice stays primary.
export function combineNotices(base, notices) {
  const byKey = new Map();
  for (const n of notices) if (!byKey.has(noticeKey(n))) byKey.set(noticeKey(n), n); // first copy wins
  const unique = [...byKey.values()];
  const [primary, ...rest] = unique;
  const known = unique.filter((n) => n.workers_affected != null);
  const workers = known.length ? known.reduce((sum, n) => sum + n.workers_affected, 0) : null;
  const priority = unique.some((n) => isPermanentLayoff(n.layoff_type));
  const effectiveDate = unique.map((n) => n.effective_date).filter(Boolean).sort().at(-1) ?? null;
  const { score, package: pkg } = scoreFor(workers, priority, effectiveDate);
  return {
    ...base,
    city: primary.city,
    opportunity_score: score,
    recommended_package: pkg,
    signals: {
      ...base.signals,
      notice_id: primary.notice_id ?? null,
      workers_affected: workers,
      priority,
      layoff_type: primary.layoff_type ?? null,
      effective_date: effectiveDate,
      merged_notices: rest,
    },
  };
}

// institutional_leads is unique on (organization_name, source). Same company can file
// more than one notice in a pull (separate rounds/locations): collapse them into one row.
export function mergeDuplicateOrgNames(rows) {
  const byName = new Map();
  for (const row of rows) {
    const group = byName.get(row.organization_name);
    if (group) group.notices.push(...noticesOf(row));
    else byName.set(row.organization_name, { base: row, notices: noticesOf(row) });
  }
  return [...byName.values()].map(({ base, notices }) => combineNotices(base, notices));
}

// Re-run: fold in the notices already stored for that employer so earlier pulls aren't
// overwritten. Existing notices go first so the stored primary notice stays primary.
export function mergeWithExisting(rows, existingByName) {
  return rows.map((row) => {
    const existing = existingByName.get(row.organization_name);
    return existing ? combineNotices(row, [...noticesOf(existing), ...noticesOf(row)]) : row;
  });
}

const normName = (s) => (s ?? '').trim().toLowerCase();

// Case-insensitive, trimmed match against exclusion_lists.company_name.
export function splitExcluded(rows, exclusionNames) {
  const excluded = new Set(exclusionNames.map(normName));
  const kept = [];
  const skipped = [];
  for (const row of rows) (excluded.has(normName(row.organization_name)) ? skipped : kept).push(row);
  return { kept, skipped };
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

export function parseArgs(argv, today = new Date()) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const daysArg = argv.find((a) => a.startsWith('--days='));
  let dateFrom = positional[1];
  if (daysArg) {
    const days = Number(daysArg.slice('--days='.length));
    if (!Number.isInteger(days) || days < 1) throw new Error(`Invalid ${daysArg}`);
    dateFrom = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  }
  const states = [...new Set((positional[0] || 'TX').split(',').map((st) => st.trim().toUpperCase()).filter(Boolean))];
  for (const st of states) if (!/^[A-Z]{2}$/.test(st)) throw new Error(`Invalid state: ${st}`);
  return { states, dateFrom, dryRun: argv.includes('--dry-run') };
}

// PostgREST caps a response at 1000 rows; page through so a long exclusion list can't
// be silently truncated (that would fail open).
async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function main() {
  const { states, dateFrom, dryRun } = parseArgs(process.argv.slice(2));
  const apiKey = requireEnv('WARN_FIREHOSE_API_KEY');
  const hasDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  // A write needs exclusions + existing rows; a dry run may skip them.
  const supabase = !dryRun || hasDb
    ? createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    : null;

  console.log(`Fetching WARN notices for ${states.join(', ')}${dateFrom ? ` from ${dateFrom}` : ''} (limit 25, one call per state, free tier)...`);
  const { notices, fetched, limited } = await fetchAllStates(states, (st) => fetchNotices(apiKey, st, dateFrom));
  console.log(`Fetched ${notices.length} notices from ${fetched.length}/${states.length} states${limited ? ' (stopped at the free-tier limit)' : ''}.`);
  if (dryRun && notices[0]) console.log(`API record fields: ${Object.keys(notices[0]).join(', ')}`);

  const mappedRows = notices.map(toLeadRow);
  console.log('B2C signal — notices by state+industry (console only, no table write yet):');
  console.table(summarizeB2C(mappedRows));

  let rows = mergeDuplicateOrgNames(mappedRows);
  let skipped = [];
  if (supabase) {
    const exclusions = await selectAll(() => supabase.from('exclusion_lists').select('company_name'));
    const existing = await selectAll(() => supabase.from('institutional_leads').select('organization_name, city, signals').eq('source', 'warn'));
    const exclusionNames = exclusions.map((r) => r.company_name);

    // Read-only report: stored warn rows that are on the list. Left untouched.
    const storedExcluded = splitExcluded(existing, exclusionNames).skipped.map((r) => r.organization_name);
    console.log(`Existing warn rows on exclusion_lists (not changed): ${storedExcluded.length}${storedExcluded.length ? `\n  - ${storedExcluded.join('\n  - ')}` : ''}`);

    ({ kept: rows, skipped } = splitExcluded(rows, exclusionNames));
    const existingByName = new Map(existing.map((r) => [r.organization_name, r]));
    console.log(`Rows: ${rows.length} to write (${rows.filter((r) => existingByName.has(r.organization_name)).length} update, ${rows.filter((r) => !existingByName.has(r.organization_name)).length} new); skipped: excluded ${skipped.length}`);
    rows = mergeWithExisting(rows, existingByName);
  } else {
    console.log('(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset: exclusion and existing-row checks skipped)');
  }

  if (dryRun) {
    console.log('\nDRY RUN: nothing written.');
    const byCompany = new Map(notices.map((n) => [n.company_name, n]));
    console.table(rows.slice(0, 5).map((r) => ({
      company: r.organization_name,
      notice_date: byCompany.get(r.organization_name)?.notice_date ?? '(not in response)',
      effective_date: r.signals.effective_date,
      state: r.state,
      employees_affected: r.signals.workers_affected,
      score: r.opportunity_score,
    })));
    return;
  }

  if (!rows.length) return console.log('Nothing to upsert.');
  const { data, error } = await supabase
    .from('institutional_leads')
    .upsert(rows, { onConflict: 'organization_name,source' })
    .select('organization_name, city, state, opportunity_score, recommended_package, signals');
  if (error) throw new Error(`Failed to upsert institutional_leads: ${error.message}`);

  console.log(`Upserted ${data.length} rows into institutional_leads; skipped: excluded ${skipped.length}.`);
  console.table(data.map((r) => ({ ...r, signals: JSON.stringify(r.signals) })));
}

async function selfTest() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);

  assert.equal(scoreFor(null).score, null, 'missing workers_affected stays null, not a guessed score');
  assert.equal(scoreFor(1000, false, null).score, 90, 'no effective_date -> no recency modifier');
  assert.equal(scoreFor(1000, false, daysAgo(3)).score, 95, 'fresh (<=14d) gets +5');
  assert.equal(scoreFor(1000, false, daysAgo(20)).score, 92, 'recent (<=30d) gets +2');
  assert.equal(scoreFor(1000, false, daysAgo(60)).score, 90, 'mid-range (30-90d) gets no modifier');
  assert.equal(scoreFor(1000, false, daysAgo(120)).score, 87, 'stale (>90d) gets -3');
  // Recency's swing (+5/-3) must never flip the size-tier ranking.
  assert.ok(scoreFor(30, false, daysAgo(1)).score < scoreFor(200, false, daysAgo(200)).score, 'recency must not flip size-tier ranking');
  assert.equal(scoreFor(1000, true, daysAgo(1)).score, 100, 'priority + fresh caps at 100, not over');
  assert.equal(scoreFor(1000, false, 'not-a-real-date').score, 90, 'unparseable effective_date is a no-op, not a crash');

  // args: --days, --dry-run, multi-state
  const today = new Date('2026-11-23T12:00:00Z');
  const a = parseArgs(['ca, tx,NY,CA', '--days=60', '--dry-run'], today);
  assert.deepEqual(a, { states: ['CA', 'TX', 'NY'], dateFrom: '2026-09-24', dryRun: true }, 'multi-state, deduped, upper-cased; --days sets date_from');
  assert.deepEqual(parseArgs([], today), { states: ['TX'], dateFrom: undefined, dryRun: false }, 'defaults unchanged');
  assert.throws(() => parseArgs(['CAL']), /Invalid state/);

  // 1. exclusion: case-insensitive, trimmed
  const row = (name, id, workers, layout = null, eff = null, city = 'X') =>
    toLeadRow({ id, company_name: name, city, state: 'TX', employees_affected: workers, layoff_type: layout, effective_date: eff });
  const { kept, skipped } = splitExcluded([row('Acme Corp', 1, 10), row('Beta', 2, 10), row('  gamma inc ', 3, 10)], ['  ACME corp', 'Gamma Inc']);
  assert.deepEqual(kept.map((r) => r.organization_name), ['Beta']);
  assert.equal(skipped.length, 2, 'skipped: excluded counted');

  // 2. merge within a pull, then with an earlier run; dedupe by notice_id
  const first = mergeDuplicateOrgNames([row('Acme', 1, 100, null, '2026-10-01'), row('Acme', 2, 20, null, '2026-10-05', 'Y')])[0];
  assert.equal(first.signals.workers_affected, 120);
  assert.deepEqual(first.signals.merged_notices.map((n) => n.notice_id), [2]);
  assert.equal(first.opportunity_score, scoreFor(120, false, '2026-10-05').score);
  const existingByName = new Map([['Acme', first]]);
  // Re-run: notice 2 again (duplicate) plus new notice 3, a permanent closure.
  const pulled = mergeDuplicateOrgNames([row('Acme', 2, 20, null, '2026-10-05', 'Y'), row('Acme', 3, 400, 'Closure', '2026-11-01', 'Z')]);
  const [rerun] = mergeWithExisting(pulled, existingByName);
  assert.equal(rerun.signals.notice_id, 1, 'stored primary notice stays primary');
  assert.deepEqual(rerun.signals.merged_notices.map((n) => n.notice_id).sort(), [2, 3], 'deduped by notice_id, earlier data kept');
  assert.equal(rerun.signals.workers_affected, 520, 'sum across unique notices');
  assert.equal(rerun.signals.priority, true);
  assert.equal(rerun.signals.effective_date, '2026-11-01');
  assert.equal(rerun.opportunity_score, scoreFor(520, true, '2026-11-01').score, 'score recomputed from merged totals');
  assert.equal(rerun.recommended_package, '500+ seat custom cohort');
  // Running the same pull again changes nothing.
  assert.deepEqual(mergeWithExisting(pulled, new Map([['Acme', rerun]]))[0].signals, rerun.signals, 'idempotent re-run');
  // New employer passes through untouched.
  assert.equal(mergeWithExisting([row('New Co', 9, 30)], existingByName)[0].signals.workers_affected, 30);
  // Notices without ids dedupe on city+date+workers.
  const noId = mergeDuplicateOrgNames([row('NoId', null, 50, null, '2026-10-01'), row('NoId', null, 50, null, '2026-10-01')])[0];
  assert.equal(noId.signals.workers_affected, 50);

  // 3. multi-state: limit error stops cleanly with what was fetched; other errors throw
  const calls = [];
  const res = await fetchAllStates(['CA', 'TX', 'NY'], async (st) => {
    calls.push(st);
    if (st === 'TX') throw new WarnLimitError('limit');
    return [{ id: st }];
  });
  assert.deepEqual(calls, ['CA', 'TX'], 'no calls after the limit');
  assert.deepEqual(res, { notices: [{ id: 'CA' }], fetched: ['CA'], limited: true });
  await assert.rejects(fetchAllStates(['CA'], () => Promise.reject(new Error('500 boom'))), /500 boom/);
  const all = await fetchAllStates(['CA', 'TX'], async (st) => [{ id: st }]);
  assert.equal(all.notices.length, 2);
  assert.equal(all.limited, false);

  console.log('selfTest: all assertions passed');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  (process.argv.includes('--self-test') ? selfTest() : main()).catch((err) => {
      console.error(err.message);
    process.exit(1);
  });
}
