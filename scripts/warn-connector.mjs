#!/usr/bin/env node
// Pulls U.S. WARN Act mass-layoff notices from the states' own public WARN files, scores
// each as a B2B employer-transition opportunity, and upserts into institutional_leads
// (source='warn', category='employer'). Also prints a B2C notices-by-state+industry
// summary — console only for now, no aggregate table yet (see build spec §4).
//
// Supported states: CA (EDD's weekly xlsx). The warnfirehose.com API this used before
// needs a paid plan since the free trial ended (2026-09-11); not used.
//
// Usage: node scripts/warn-connector.mjs [STATES] [DATE_FROM] [--days=N] [--min-workers=N] [--dry-run]
//   STATES: comma-separated, default CA. DATE_FROM (YYYY-MM-DD) or --days=N keeps only
//   notices with notice_date on/after it. --min-workers=N (default 25) skips employers
//   below N workers after merging. --dry-run prints counts + samples, never writes.

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const WARN_BUCKETS = [
  { min: 500, score: 90, package: '500+ seat custom cohort' },
  { min: 100, score: 70, package: '50-100 seats, bulk onboarding' },
  { min: 25, score: 50, package: '25 seats, 30-90 day Premium access' },
  // under 25: not a B2B package — flag for B2C geo-targeting instead (spec §3).
  { min: 0, score: 30, package: null },
];

// layoff_type "Closure"/"Layoff" means a permanent one (state parsers only emit these
// for permanent notices; temporary ones keep their raw text). null means "unknown", not
// "temporary" — it must NOT be deprioritized; nothing is scored down, only
// permanent-shaped values scored up.
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

// --- xlsx reading (stdlib only: an xlsx is a zip of XML parts) ---
// ponytail: no ZIP64 and regex XML parsing; fine for state WARN files (<1 MB, plain
// cells). Swap in a real xlsx library if a state ships something fancier.

function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip/xlsx file');
  const files = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}

const xmlText = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);
const runs = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('');
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// Returns the named sheet (name matched after trim) as an array of rows; each row is
// an object keyed by column letter.
export function readXlsxSheet(buf, sheetName) {
  const files = unzip(buf);
  const part = (name) => files.get(name)?.toString('utf8') ?? '';
  const shared = [...part('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  const sheet = [...part('xl/workbook.xml').matchAll(/<sheet\s([^>]*)\/>/g)].map((m) => m[1])
    .find((a) => xmlText(attr(a, 'name') ?? '').trim() === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  const rid = attr(sheet, 'r:id');
  const rel = [...part('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s([^>]*)\/>/g)].map((m) => m[1])
    .find((a) => attr(a, 'Id') === rid);
  const target = attr(rel, 'Target');
  const xml = part(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, row]) => {
    const cells = {};
    for (const [, attrs, inner = ''] of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = attr(attrs, 'r').replace(/\d+/g, '');
      const type = attr(attrs, 't');
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      cells[col] = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? runs(inner) : v == null ? null : xmlText(v);
    }
    return cells;
  });
}

// Excel date serial (or an m/d/yyyy string) -> YYYY-MM-DD.
export function toIsoDate(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// --- California (EDD) ---
// Weekly-updated workbook (Tue/Thu); "Detailed WARN Report" covers the fiscal year to
// date (Jul 1 ->). Columns found by header text so a reorder doesn't break it. No
// notice id in the file: one is built from state + notice date + company + address.

const CA_WARN_URL = 'https://edd.ca.gov/siteassets/files/jobs_and_training/warn/warn_report1.xlsx';
const CA_COLUMNS = {
  notice_date: /^notice date$/,
  effective_date: /^effective date$/,
  company: /^company$/,
  type: /^layoff\/ ?closure$/,
  employees: /^no\. of employees$/,
  address: /^address$/,
  industry: /^related industry$/,
};

// "1 DNA Way  South San Francisco CA 94080" -> "South San Francisco" (street and city
// are separated by two spaces in EDD's file).
const cityFromAddress = (address) => address?.match(/\s{2,}(.+?)\s+CA\s+\d{5}(?:-\d{4})?\s*$/)?.[1] ?? null;

export function parseCaliforniaRows(rows) {
  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headerIdx = rows.findIndex((r) => Object.values(r).some((v) => norm(v) === 'company'));
  if (headerIdx < 0) throw new Error('CA WARN: header row with "Company" not found; file format changed?');
  const col = {};
  for (const [key, re] of Object.entries(CA_COLUMNS)) {
    col[key] = Object.keys(rows[headerIdx]).find((c) => re.test(norm(rows[headerIdx][c])));
    if (!col[key]) throw new Error(`CA WARN: column "${key}" not found; file format changed?`);
  }
  return rows.slice(headerIdx + 1).filter((r) => r[col.company]?.trim()).map((r) => {
    const type = norm(r[col.type]); // e.g. "layoff permanent", "closure temporary"
    const permanent = type.endsWith('permanent');
    const kind = type.startsWith('closure') ? 'Closure' : type.startsWith('layoff') ? 'Layoff' : null;
    const employees = Number.parseInt(r[col.employees], 10);
    const noticeDate = toIsoDate(r[col.notice_date]);
    const address = r[col.address]?.trim() || null;
    const company = r[col.company].trim();
    return {
      id: `CA|${noticeDate}|${company}|${address}`,
      company_name: company,
      city: cityFromAddress(address),
      state: 'CA',
      employees_affected: Number.isNaN(employees) ? null : employees,
      layoff_type: permanent && kind ? kind : r[col.type]?.trim() || null,
      temporary_permanent: permanent ? 'Permanent' : type.endsWith('temporary') ? 'Temporary' : null,
      industry: r[col.industry]?.trim() || null,
      effective_date: toIsoDate(r[col.effective_date]),
      notice_date: noticeDate,
    };
  });
}

async function fetchCalifornia() {
  const res = await fetch(CA_WARN_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (warn-connector)' } });
  if (!res.ok) throw new Error(`CA WARN download failed: ${res.status}`);
  return parseCaliforniaRows(readXlsxSheet(Buffer.from(await res.arrayBuffer()), 'Detailed WARN Report'));
}

export const STATE_SOURCES = { CA: fetchCalifornia };

// One source per state, sequentially. A state that fails (download error, format
// change) is reported and skipped; the others still run.
export async function fetchAllStates(states, fetchOne) {
  const notices = [];
  const fetched = [];
  const failed = [];
  for (const state of states) {
    try {
      notices.push(...(await fetchOne(state)));
      fetched.push(state);
    } catch (err) {
      console.warn(`${state}: ${err.message} (skipped)`);
      failed.push(state);
    }
  }
  return { notices, fetched, failed };
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

// Notices without a notice_date are kept only when there's no window.
export const filterByNoticeDate = (notices, dateFrom) =>
  dateFrom ? notices.filter((n) => n.notice_date && n.notice_date >= dateFrom) : notices;

// Unknown size (null) can't be shown to meet the minimum, so it's skipped too.
export function splitBelowMin(rows, minWorkers) {
  const kept = [];
  const skipped = [];
  for (const row of rows) ((row.signals.workers_affected ?? -1) >= minWorkers ? kept : skipped).push(row);
  return { kept, skipped };
}

export function parseArgs(argv, today = new Date()) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const minArg = argv.find((a) => a.startsWith('--min-workers='));
  const minWorkers = minArg ? Number(minArg.slice('--min-workers='.length)) : 25;
  if (!Number.isInteger(minWorkers) || minWorkers < 0) throw new Error(`Invalid ${minArg}`);
  const daysArg = argv.find((a) => a.startsWith('--days='));
  let dateFrom = positional[1];
  if (daysArg) {
    const days = Number(daysArg.slice('--days='.length));
    if (!Number.isInteger(days) || days < 1) throw new Error(`Invalid ${daysArg}`);
    dateFrom = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  }
  const states = [...new Set((positional[0] || 'CA').split(',').map((st) => st.trim().toUpperCase()).filter(Boolean))];
  for (const st of states) {
    if (!STATE_SOURCES[st]) throw new Error(`Unsupported state: ${st} (supported: ${Object.keys(STATE_SOURCES).join(', ')})`);
  }
  return { states, dateFrom, minWorkers, dryRun: argv.includes('--dry-run') };
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
  const { states, dateFrom, minWorkers, dryRun } = parseArgs(process.argv.slice(2));
  const hasDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  // A write needs exclusions + existing rows; a dry run may skip them.
  const supabase = !dryRun || hasDb
    ? createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    : null;

  console.log(`Fetching WARN notices for ${states.join(', ')}${dateFrom ? `, notice date on/after ${dateFrom}` : ''}...`);
  const { notices: all, fetched, failed } = await fetchAllStates(states, (st) => STATE_SOURCES[st]());
  const notices = filterByNoticeDate(all, dateFrom);
  console.log(`Fetched ${all.length} notices from ${fetched.length}/${states.length} states${failed.length ? ` (failed: ${failed.join(', ')})` : ''}; ${notices.length} in the date window.`);

  const mappedRows = notices.map(toLeadRow);
  console.log('B2C signal — notices by state+industry (console only, no table write yet):');
  console.table(summarizeB2C(mappedRows));

  let rows = mergeDuplicateOrgNames(mappedRows);
  let excluded = [];
  let existingByName = new Map();
  if (supabase) {
    const exclusions = await selectAll(() => supabase.from('exclusion_lists').select('company_name'));
    const existing = await selectAll(() => supabase.from('institutional_leads').select('organization_name, city, signals, status, created_at').eq('source', 'warn'));
    const exclusionNames = exclusions.map((r) => r.company_name);

    // Read-only report: stored warn rows that are on the list. Left untouched.
    const storedExcluded = splitExcluded(existing, exclusionNames).skipped.map((r) => r.organization_name);
    console.log(`Existing warn rows on exclusion_lists (not changed): ${storedExcluded.length}${storedExcluded.length ? `\n  - ${storedExcluded.join('\n  - ')}` : ''}`);

    ({ kept: rows, skipped: excluded } = splitExcluded(rows, exclusionNames));
    existingByName = new Map(existing.map((r) => [r.organization_name, r]));
    rows = mergeWithExisting(rows, existingByName);
  } else {
    console.log('(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset: exclusion and existing-row checks skipped)');
  }
  // After merging with stored notices, so a re-run can lift an employer over the line.
  const { kept, skipped: belowMin } = splitBelowMin(rows, minWorkers);
  rows = kept;

  const updates = rows.filter((r) => existingByName.has(r.organization_name));
  console.log(`\nRows to write: ${rows.length} (${rows.length - updates.length} new, ${updates.length} update)`);
  console.log(`Skipped: excluded ${excluded.length}, below_min_workers ${belowMin.length} (min ${minWorkers})`);
  if (updates.length) {
    console.log('Existing rows that would be updated:');
    console.table(updates.map((r) => {
      const e = existingByName.get(r.organization_name);
      return { company: r.organization_name, created_at: e.created_at, status: e.status, stored_notices: noticesOf(e).length, notices_after: noticesOf(r).length };
    }));
  }

  const top = (n) => [...rows].sort((x, y) => y.opportunity_score - x.opportunity_score || y.signals.workers_affected - x.signals.workers_affected).slice(0, n)
    .map((r) => ({ company: r.organization_name, city: r.city, workers: r.signals.workers_affected, notices: noticesOf(r).length, effective_date: r.signals.effective_date, score: r.opportunity_score, package: r.recommended_package }));

  if (dryRun) {
    console.log('\nDRY RUN: nothing written. Top 5 by score:');
    console.table(top(5));
    return;
  }

  if (!rows.length) return console.log('Nothing to upsert.');
  // status/contact fields are not in the payload: new rows get the column default
  // ('new'), existing rows keep theirs.
  const { data, error } = await supabase
    .from('institutional_leads')
    .upsert(rows, { onConflict: 'organization_name,source' })
    .select('organization_name');
  if (error) throw new Error(`Failed to upsert institutional_leads: ${error.message}`);

  console.log(`\nUpserted ${data.length} rows (${rows.length - updates.length} inserted, ${updates.length} updated). Top 10 by score:`);
  console.table(top(10));
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

  // args: --days, --dry-run, states
  const today = new Date('2026-11-23T12:00:00Z');
  const a = parseArgs(['ca, CA', '--days=60', '--min-workers=100', '--dry-run'], today);
  assert.deepEqual(a, { states: ['CA'], dateFrom: '2026-09-24', minWorkers: 100, dryRun: true }, 'states deduped, upper-cased; --days sets date_from');
  assert.deepEqual(parseArgs([], today), { states: ['CA'], dateFrom: undefined, minWorkers: 25, dryRun: false }, 'defaults: CA, min 25');
  assert.throws(() => parseArgs(['--min-workers=abc']), /Invalid --min-workers/);
  assert.throws(() => parseArgs(['TX']), /Unsupported state: TX/);

  // CA parser: header found by text, serial dates, permanent vs temporary, city from address
  assert.equal(toIsoDate('46344'), '2026-11-18');
  assert.equal(toIsoDate('11/18/2026'), '2026-11-18');
  assert.equal(toIsoDate('soon'), null);
  const ca = parseCaliforniaRows([
    { A: 'WARN REPORT - 07/01/26 to 11/18/2026' },
    { A: 'County/Parish', B: 'Notice\nDate', C: 'Processed\nDate', D: 'Effective \nDate', E: 'Company', F: 'Layoff/\nClosure', G: 'No. Of\nEmployees', H: 'Address', I: 'Related Industry' },
    { A: 'San Mateo County', B: '46199', C: '46204', D: '46232', E: 'Genentech, Inc. ', F: 'Layoff Permanent', G: '103', H: '1 DNA Way  South San Francisco CA 94080', I: '54 Professional Scientific and Technical Services' },
    { A: 'Kern County', B: '46300', D: '46330', E: 'Temp Co', F: 'Layoff Temporary', G: 'n/a', H: 'no city here' },
    { A: '', E: '  ' },
  ]);
  assert.equal(ca.length, 2, 'blank rows dropped');
  assert.deepEqual(ca[0], {
    id: 'CA|2026-06-26|Genentech, Inc.|1 DNA Way  South San Francisco CA 94080',
    company_name: 'Genentech, Inc.', city: 'South San Francisco', state: 'CA', employees_affected: 103,
    layoff_type: 'Layoff', temporary_permanent: 'Permanent', industry: '54 Professional Scientific and Technical Services',
    effective_date: '2026-07-29', notice_date: '2026-06-26',
  });
  assert.equal(toLeadRow(ca[0]).signals.priority, true, 'permanent layoff gets priority');
  assert.equal(ca[1].layoff_type, 'Layoff Temporary', 'temporary keeps raw text, so no priority');
  assert.equal(toLeadRow(ca[1]).signals.priority, false);
  assert.equal(ca[1].employees_affected, null);
  assert.equal(ca[1].city, null);
  assert.throws(() => parseCaliforniaRows([{ A: 'Company', B: 'Address' }]), /column "notice_date" not found/);
  assert.deepEqual(filterByNoticeDate(ca, '2026-07-01').map((n) => n.company_name), ['Temp Co'], 'window filters on notice_date');
  assert.equal(filterByNoticeDate(ca, undefined).length, 2);

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

  // --min-workers: applied to merged totals; null size is skipped
  const sized = mergeDuplicateOrgNames([row('Two Rounds', 'a', 15), row('Two Rounds', 'b', 15), row('Small', 'c', 24), row('Exact', 'd', 25), row('Unknown', 'e', null)]);
  const mw = splitBelowMin(sized, 25);
  assert.deepEqual(mw.kept.map((r) => r.organization_name), ['Two Rounds', 'Exact'], '15+15 merged clears 25; 25 is inclusive');
  assert.deepEqual(mw.skipped.map((r) => r.organization_name), ['Small', 'Unknown']);
  // A re-run can lift a stored small employer over the line.
  const lifted = mergeWithExisting([row('Small', 'f', 10)], new Map([['Small', mw.skipped[0]]]));
  assert.equal(splitBelowMin(lifted, 25).kept.length, 1);

  // 3. multi-state: a failing state is skipped, the rest still run
  const res = await fetchAllStates(['CA', 'TX', 'NY'], async (st) => {
    if (st === 'TX') throw new Error('format changed');
    return [{ id: st }];
  });
  assert.deepEqual(res, { notices: [{ id: 'CA' }, { id: 'NY' }], fetched: ['CA', 'NY'], failed: ['TX'] });

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
