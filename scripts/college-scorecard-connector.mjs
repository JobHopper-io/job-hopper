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

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function scoreFor(size) {
  if (size === null || size === undefined) return { score: null, package: null };
  const bucket = OPPORTUNITY_BUCKETS.find((b) => size >= b.min);
  return { score: bucket.score, package: bucket.package };
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
  const { score, package: pkg } = scoreFor(size);
  return {
    source: 'college_scorecard',
    scorecard_id: String(school.id),
    organization_name: school['school.name'],
    category: 'university',
    city: school['school.city'] || null,
    state: school['school.state'] || null,
    website: school['school.school_url'] || null,
    ownership: OWNERSHIP_LABELS[school['school.ownership']] || null,
    student_size: size,
    opportunity_score: score,
    recommended_package: pkg,
    signals: { degrees_awarded_predominant: school['school.degrees_awarded.predominant'] ?? null },
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
    const { score, package: pkg } = scoreFor(totalSize);
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

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
