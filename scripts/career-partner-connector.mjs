#!/usr/bin/env node
// Searches Apollo's organization database by keyword + metro (career coaching,
// immigration law, bootcamp, outplacement) and upserts normalized business leads into
// institutional_leads (source='apollo_career_partner', category='career_partner').
// Apollo-based per v2 of the build spec — Google Places was blocked on billing infra
// unrelated to the task; Apollo reuses the credential already proven in the enrichment
// build, zero new setup.
//
// Usage: node scripts/career-partner-connector.mjs

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

// First test batch: 2 metros, all 4 categories (build spec §7 — small batch before scale).
const METROS = ['Austin, TX', 'Houston, TX'];

// career_coach retuned 2026-08-13: "career coaching" alone was too generic and pulled
// in staffing/recruiting agencies (keyword overlap, not real career coaches). Swapped
// for more specific phrases; "life coach career" is a single combined tag (not two
// separate ones) so it's scoped to career-context life coaching, not general wellness
// life coaches.
// training_provider retuned 2026-08-13: "certification programs" alone was too generic
// and pulled in oil & gas / industrial companies (KBR, Bray International, Mitsubishi
// Heavy Industries, Key Energy Services) whose own descriptions mention employee
// certification programs — not real training providers. Dropped in favor of more
// specific phrases.
export const CATEGORY_KEYWORDS = {
  career_coach: ['career coach', 'life coach career', 'resume writing service'],
  immigration_professional: ['immigration law', 'immigration attorney', 'visa services'],
  training_provider: ['vocational school', 'technical training school', 'bootcamp', 'professional certification training'],
  outplacement_firm: ['outplacement', 'career transition services', 'hr consulting'],
};

// No confirmed Apollo negative-keyword-tag parameter for this endpoint (unlike e.g.
// person_not_titles on the people-search side) — rather than guess at an unverified
// param name that might silently do nothing, filtering unwanted results out happens in
// code instead. org.industry is verified always null for this search mode (see
// toLeadRow comment), so only organization_name is checked — that's the only
// reliably-populated text field available to filter on. For training_provider this is
// a weaker backstop than it was for career_coach: staffing/recruiting agencies spell
// their category out in their own name, but most of the oil & gas noise above doesn't
// contain "oil"/"gas"/"mining"/"industrial machinery" in the company name itself — it
// was matched via Apollo's internal industry classification, which isn't visible here.
// The real fix for that noise is the tag change above; this only catches names that
// happen to say so directly.
const EXCLUDE_NAME_PATTERNS = {
  career_coach: /\b(staffing|recruiting)\b/i,
  // Same staffing/recruiting exclusion as career_coach, added after "The Staffing
  // Ninjas (TSN Partners)" showed the same noise bleeds into this category too —
  // plus the oil & gas / industrial / mining terms already in use here.
  training_provider: /(oil\s*(&|and)\s*gas|industrial machinery|\bmining\b|\b(staffing|recruiting)\b)/i,
  // Same staffing/recruiting bleed seen in the other two categories (Murray Resources,
  // CGL Recruiting, Nexxo Staffing & Recruiting were all present in the unfiltered pull).
  outplacement_firm: /\b(staffing|recruiting)\b/i,
};

const PER_PAGE = 100; // Apollo's max
// Every combo tested pre-pagination hit PER_PAGE on page 1 (e.g. immigration_professional
// + Austin: 73 real results at per_page=100, vs. only 25 surfaced at the old per_page=25 —
// meaning real candidates were being silently truncated). Hard safety cap prevents one
// broad keyword from pulling thousands of rows / burning credits on a single combo.
const MAX_PAGES = 10;

const APOLLO_PROCESS = 'career_partner_discovery';
const APOLLO_BASE = 'https://api.apollo.io/api/v1';

class ApolloCreditError extends Error {}

// VERIFIED against a live call: mixed_companies/search (keyword+location, JSON body)
// does not return estimated_num_employees, city, state, or industry at all — only id,
// name, website_url, primary_domain, revenue fields, and headcount *growth rates* (not
// headcount itself). The build spec's documented response shape assumed those fields
// exist; they don't for this search mode. Every career_partner lead's opportunity_score
// is therefore null (not a bug — the same "missing -> null, flag for manual review"
// pattern as the other two connectors), until a decision is made to either spend a
// second per-org Apollo call (organizations/enrich, same endpoint job_processor uses)
// or score off a field that actually is present (e.g. organization_revenue — untested
// for reliability; a clearly solo/home-based org in the first test batch showed $100M).
const OPPORTUNITY_BUCKETS = [
  { min: 50, score: 70 },
  { min: 10, score: 50 },
  { min: 0, score: 30 },
];

function scoreFor(employees) {
  if (employees === null || employees === undefined) return null;
  const bucket = OPPORTUNITY_BUCKETS.find((b) => employees >= b.min);
  return bucket.score;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function apolloHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
}

function isCreditResponse(status, bodyText) {
  if (status === 401 || status === 402 || status === 403 || status === 429) return true;
  return bodyText.toLowerCase().includes('credit');
}

// VERIFIED against a live call: response.pagination = { page, per_page, total_entries,
// total_pages } — matches the spec's assumed shape exactly (unlike several other
// assumptions tonight that didn't pan out).
async function searchOrganizationsByKeywordPage(apiKey, keywordTags, metro, page) {
  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
    method: 'POST',
    headers: apolloHeaders(apiKey),
    body: JSON.stringify({
      q_organization_keyword_tags: keywordTags,
      organization_locations: [metro],
      per_page: PER_PAGE,
      page,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (isCreditResponse(res.status, text)) throw new ApolloCreditError(`org search ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`org search ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  return {
    organizations: Array.isArray(json.organizations) ? json.organizations : [],
    totalPages: json.pagination?.total_pages ?? 1,
  };
}

async function tryConsumeCredits(supabase, amount) {
  const { data, error } = await supabase.rpc('try_consume_apollo_credits', {
    p_name: APOLLO_PROCESS,
    p_amount: amount,
  });
  if (error) throw new Error(`try_consume_apollo_credits failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.ok === true;
}

async function refundCredits(supabase, amount) {
  const { error } = await supabase.rpc('refund_apollo_credits', { p_name: APOLLO_PROCESS, p_amount: amount });
  if (error) console.error(`refund_apollo_credits failed: ${error.message}`);
}

// Paginates one category/metro combo up to MAX_PAGES. Each page is a genuinely separate
// paid Apollo call, so credits are consumed/refunded per page, not once per combo —
// stopping early (total_pages reached, safety cap hit, credit exhaustion, or an error)
// keeps whatever pages were already fetched rather than discarding them.
async function searchAllPages(supabase, apolloKey, keywordTags, metro) {
  const organizations = [];
  let pagesFetched = 0;
  let page = 1;
  while (page <= MAX_PAGES) {
    const consumed = await tryConsumeCredits(supabase, 1);
    if (!consumed) return { organizations, pagesFetched, creditsExhausted: true };

    let result;
    try {
      result = await searchOrganizationsByKeywordPage(apolloKey, keywordTags, metro, page);
    } catch (e) {
      await refundCredits(supabase, 1);
      return { organizations, pagesFetched, error: e };
    }

    organizations.push(...result.organizations);
    pagesFetched += 1;
    if (page >= result.totalPages) break;
    page += 1;
  }
  return { organizations, pagesFetched, creditsExhausted: false };
}

// org.city/state/industry/estimated_num_employees are read defensively but verified
// absent from every real response so far (see OPPORTUNITY_BUCKETS comment) — kept as
// field reads rather than hardcoded null in case Apollo ever populates them for some
// org, not because they're expected to work today.
function toLeadRow(org, searchCategory, searchMetro, keywordTags) {
  const employees = org.estimated_num_employees ?? null;
  return {
    source: 'apollo_career_partner',
    category: 'career_partner',
    organization_name: org.name,
    website: org.website_url || org.primary_domain || null,
    city: org.city || null,
    state: org.state || null,
    opportunity_score: scoreFor(employees),
    // No package concept defined for career-partner leads in the build spec (unlike
    // seat-license packages for university/employer) — left null, not guessed.
    recommended_package: null,
    signals: {
      industry: org.industry ?? null,
      estimated_num_employees: employees,
      search_category: searchCategory,
      search_metro: searchMetro,
      keyword_tags: keywordTags,
    },
  };
}

// institutional_leads is unique on (organization_name, source). The same business can
// legitimately surface under more than one category/metro search (e.g. an org tagged
// both "career coaching" and "executive coaching", or one with offices in both metros).
// estimated_num_employees is a fixed company fact, not additive like enrollment/workers
// in the other two connectors, so merging here just keeps the first hit's score and
// records every other search that also found it — no re-scoring needed.
function mergeDuplicateOrgNames(rows) {
  const byName = new Map();
  for (const row of rows) {
    const existing = byName.get(row.organization_name);
    if (!existing) {
      byName.set(row.organization_name, { ...row, signals: { ...row.signals, merged_matches: [] } });
      continue;
    }
    existing.signals.merged_matches.push({
      search_category: row.signals.search_category,
      search_metro: row.signals.search_metro,
      keyword_tags: row.signals.keyword_tags,
    });
  }
  const merged = [...byName.values()];
  const collapsed = merged.filter((r) => r.signals.merged_matches.length > 0);
  if (collapsed.length) {
    console.warn(`Merged ${collapsed.length} org(s) matched by more than one category/metro search:`);
    for (const r of collapsed) {
      console.warn(`  - ${r.organization_name} (${r.signals.merged_matches.length + 1} total matches)`);
    }
  }
  return merged;
}

async function main() {
  const apolloKey = requireEnv('APOLLO_API_KEY');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // --categories="career_coach" restricts which categories get searched this run —
  // for re-testing a retuned category without re-spending credits (and re-upserting
  // identical rows) on categories that didn't change.
  const categoriesArg = process.argv.find((a) => a.startsWith('--categories='));
  const onlyCategories = categoriesArg ? categoriesArg.slice('--categories='.length).split(',').map((s) => s.trim()) : null;
  const categoryEntries = Object.entries(CATEGORY_KEYWORDS).filter(
    ([category]) => !onlyCategories || onlyCategories.includes(category),
  );

  // --metro=Austin restricts to metros whose name contains the given substring (not a
  // comma split — metro strings like "Austin, TX" already contain a comma).
  const metroArg = process.argv.find((a) => a.startsWith('--metro='));
  const metrosToRun = metroArg
    ? METROS.filter((m) => m.toLowerCase().includes(metroArg.slice('--metro='.length).toLowerCase()))
    : METROS;

  const rows = [];
  let excludedCount = 0;
  let creditsExhausted = false;

  for (const metro of metrosToRun) {
    if (creditsExhausted) break;
    for (const [category, keywordTags] of categoryEntries) {
      console.log(`Searching "${category}" in ${metro} (tags: ${keywordTags.join(', ')})...`);

      const { organizations: orgs, pagesFetched, creditsExhausted: exhausted, error } = await searchAllPages(
        supabase,
        apolloKey,
        keywordTags,
        metro,
      );

      if (error) {
        console.warn(`  -> failed after ${pagesFetched} page(s): ${error.message}`);
      } else {
        console.log(`  -> ${orgs.length} result(s) across ${pagesFetched} page(s)`);
      }

      const excludePattern = EXCLUDE_NAME_PATTERNS[category];
      for (const org of orgs) {
        if (!org?.name) continue;
        if (excludePattern && excludePattern.test(org.name)) {
          excludedCount += 1;
          console.log(`  -> excluded (staffing/recruiting): ${org.name}`);
          continue;
        }
        rows.push(toLeadRow(org, category, metro, keywordTags));
      }

      if (exhausted) {
        console.warn('Apollo credit limit reached for career_partner_discovery — stopping.');
        creditsExhausted = true;
        break;
      }
    }
  }

  if (excludedCount) console.log(`\n${excludedCount} result(s) excluded by name-pattern filter.`);

  const merged = mergeDuplicateOrgNames(rows);
  console.log(`\n${rows.length} raw results, ${merged.length} distinct organizations after dedup.`);

  if (!merged.length) {
    console.log('Nothing to upsert.');
    return;
  }

  const { data, error } = await supabase
    .from('institutional_leads')
    .upsert(merged, { onConflict: 'organization_name,source' })
    .select('organization_name, website, city, state, opportunity_score, signals');
  if (error) throw new Error(`Failed to upsert institutional_leads: ${error.message}`);

  console.log(`Upserted ${data.length} rows into institutional_leads.\n`);

  const byCategory = new Map();
  for (const row of data) {
    const cat = row.signals?.search_category ?? 'unknown';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(row);
  }
  for (const [cat, catRows] of byCategory) {
    console.log(`--- ${cat} (${catRows.length}) ---`);
    console.table(
      catRows.map((r) => ({
        organization_name: r.organization_name,
        website: r.website,
        city: r.city,
        state: r.state,
        industry: r.signals?.industry ?? null,
        employees: r.signals?.estimated_num_employees ?? null,
        opportunity_score: r.opportunity_score,
      })),
    );
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
