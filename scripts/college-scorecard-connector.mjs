#!/usr/bin/env node
// Pulls U.S. university data from the College Scorecard public API, scores each
// school as an institutional sales opportunity, and upserts into
// institutional_leads. See docs/ College Scorecard Connector build spec.
//
// Usage: node scripts/college-scorecard-connector.mjs [STATE]   (default: TX)

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const SCORECARD_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const FIELDS = [
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.school_url',
  'school.ownership',
  'latest.student.size',
  'school.degrees_awarded.predominant',
].join(',');

const OPPORTUNITY_BUCKETS = [
  { min: 15000, score: 90, package: '500-1000 seats' },
  { min: 5000, score: 70, package: '100-500 seats' },
  { min: 1000, score: 50, package: '25-100 seats' },
  { min: 0, score: 30, package: '25 seats' },
];

const OWNERSHIP_LABELS = { 1: 'public', 2: 'private_nonprofit', 3: 'private_for_profit' };

// Secondary modifiers on top of the student_size bucket score (AI Lead Scoring Engine
// 2.0, Build 05). Deliberately small relative to the 20-point gap between adjacent
// OPPORTUNITY_BUCKETS tiers (max combined swing here is +8/-5) so a secondary factor
// can never flip a school below one a full size-tier smaller -- confirmed real signals
// only (see docs audit): international-student relevance, career-center presence, and
// program list have no field anywhere in College Scorecard's response and are not
// approximated here.
//
// ownership: private nonprofits may have different budget/decision patterns than
// public institutions -- a soft signal, small weight only. private_for_profit isn't
// bumped either direction; no basis for a specific weight was given.
const OWNERSHIP_MODIFIER = { private_nonprofit: 5, public: 0, private_for_profit: 0 };

// degrees_awarded_predominant is College Scorecard's raw numeric code: 0 = not
// classified, 1 = predominantly certificate-granting, 2 = predominantly
// associate's-granting, 3 = predominantly bachelor's-granting, 4 = entirely
// graduate-degree granting (verified against known 4-year schools: UT Austin, Texas
// A&M, Rice, SMU all return 3). Bachelor's+ is a better campus-license fit than
// certificate-only; associate's and "not classified" are left neutral rather than
// guessed.
const DEGREE_LEVEL_MODIFIER = { 0: 0, 1: -5, 2: 0, 3: 3, 4: 3 };

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// recommended_package is deliberately driven by student_size alone (unchanged) -- it's
// already embedded in outbound email copy that's been sent, so a secondary factor
// nudging opportunity_score must never also silently reassign the seat package.
export function scoreFor(size, ownership = null, degreesAwardedPredominant = null) {
  if (size === null || size === undefined) return { score: null, package: null };
  const bucket = OPPORTUNITY_BUCKETS.find((b) => size >= b.min);
  const ownershipModifier = OWNERSHIP_MODIFIER[ownership] ?? 0;
  const degreeModifier = DEGREE_LEVEL_MODIFIER[degreesAwardedPredominant] ?? 0;
  const score = Math.max(0, Math.min(100, bucket.score + ownershipModifier + degreeModifier));
  return { score, package: bucket.package };
}

async function fetchAllSchools(apiKey, state) {
  const results = [];
  let page = 0;
  for (;;) {
    const url = new URL(SCORECARD_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('school.operating', '1');
    url.searchParams.set('school.state', state);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`College Scorecard API request failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    const pageResults = body.results ?? [];
    results.push(...pageResults);

    if (pageResults.length < 100) break;
    page += 1;
  }
  return results;
}

function toLeadRow(school) {
  const size = school['latest.student.size'] ?? null;
  const ownership = OWNERSHIP_LABELS[school['school.ownership']] || null;
  const degreesAwardedPredominant = school['school.degrees_awarded.predominant'] ?? null;
  const { score, package: pkg } = scoreFor(size, ownership, degreesAwardedPredominant);
  return {
    source: 'college_scorecard',
    scorecard_id: String(school.id),
    organization_name: school['school.name'],
    category: 'university',
    city: school['school.city'] || null,
    state: school['school.state'] || null,
    website: school['school.school_url'] || null,
    ownership,
    student_size: size,
    opportunity_score: score,
    recommended_package: pkg,
    signals: { degrees_awarded_predominant: degreesAwardedPredominant },
  };
}

// institutional_leads is unique on (organization_name, source), but the same name can
// legitimately cover multiple physical campuses (distinct Scorecard ids) — e.g. two
// "Trend Barber College" locations in Houston. A single ON CONFLICT DO UPDATE can't
// touch the same target row twice in one statement, so merge same-named rows into one
// before upserting: sum student_size (the fairest single "opportunity size" for a brand
// with several campuses) and keep every collapsed campus's raw id/city/size in `signals`
// so nothing is silently lost and it can be split back out manually if that ever matters.
function mergeDuplicateOrgNames(rows) {
  const byName = new Map();
  for (const row of rows) {
    const existing = byName.get(row.organization_name);
    if (!existing) {
      byName.set(row.organization_name, { ...row, signals: { ...row.signals, merged_campuses: [] } });
      continue;
    }
    existing.signals.merged_campuses.push({
      scorecard_id: row.scorecard_id,
      city: row.city,
      student_size: row.student_size,
    });
    const totalSize =
      existing.student_size === null && row.student_size === null
        ? null
        : (existing.student_size ?? 0) + (row.student_size ?? 0);
    // Merged campuses keep the primary (first-seen) campus's ownership/degree level for
    // the secondary modifiers -- these are soft, small-weight factors, not worth a
    // majority-vote merge across campuses for the rare multi-campus-same-name case.
    const { score, package: pkg } = scoreFor(totalSize, existing.ownership, existing.signals.degrees_awarded_predominant);
    existing.student_size = totalSize;
    existing.opportunity_score = score;
    existing.recommended_package = pkg;
  }
  const merged = [...byName.values()];
  const collapsed = merged.filter((r) => r.signals.merged_campuses.length > 0);
  if (collapsed.length) {
    console.warn(`Merged ${collapsed.length} multi-campus org name(s) into one lead row each:`);
    for (const r of collapsed) {
      console.warn(`  - ${r.organization_name} (${r.signals.merged_campuses.length + 1} campuses, summed student_size ${r.student_size})`);
    }
  }
  return merged;
}

async function main() {
  const state = process.argv[2] || 'TX';
  const apiKey = requireEnv('COLLEGE_SCORECARD_API_KEY');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log(`Fetching operating schools in ${state} from College Scorecard...`);
  const schools = await fetchAllSchools(apiKey, state);
  console.log(`Fetched ${schools.length} schools.`);

  const rows = mergeDuplicateOrgNames(schools.map(toLeadRow));

  const { data, error } = await supabase
    .from('institutional_leads')
    .upsert(rows, { onConflict: 'organization_name,source' })
    .select('organization_name, city, state, student_size, opportunity_score, recommended_package');

  if (error) {
    throw new Error(`Failed to upsert institutional_leads: ${error.message}`);
  }

  console.log(`Upserted ${data.length} rows into institutional_leads.`);
  console.table(data.slice(0, 15));
}

function selfTest() {
  // Secondary modifiers must never cross an OPPORTUNITY_BUCKETS tier gap (20 points):
  // a bachelor's-granting private nonprofit in the smallest size bucket must still
  // score below a public certificate-only school one size bucket up.
  const smallPrivateBachelors = scoreFor(500, 'private_nonprofit', 3).score; // 30 + 5 + 3 = 38
  const midPublicCertificate = scoreFor(1000, 'public', 1).score; // 50 - 5 + 0 = 45
  console.assert(smallPrivateBachelors < midPublicCertificate, 'secondary modifiers must not flip size-tier ranking');

  console.assert(scoreFor(null).score === null, 'missing student_size stays null, not a guessed score');
  console.assert(scoreFor(20000, 'private_nonprofit', 3).score === 98, 'modifiers stack: 90 + 5 + 3 = 98');
  console.assert(scoreFor(20000, 'public', 4).score === 93, 'grad-only bump applies same as bachelor\'s');
  console.assert(scoreFor(20000, 'unknown_value', 99).score === 90, 'unrecognized ownership/degree code defaults to no modifier, not a crash');
  console.assert(scoreFor(20000).package === '500-1000 seats', 'recommended_package stays purely size-driven regardless of modifiers');

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
