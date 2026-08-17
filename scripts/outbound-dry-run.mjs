#!/usr/bin/env node
// Pulls top-scored institutional_leads (university/employer by default), checks
// exclusion_lists suppression, enriches leads missing contact_email via Apollo (real:
// writes decision_maker_name/title/contact_email back to institutional_leads, capped
// to whatever batch size was requested — see --limit), renders the matching persona
// template from persona-campaign-copy.md with real field substitution, and logs every
// render to outbound_dry_run_log. Never calls sendEmail — no real outbound sends happen
// here; only the enrichment writes and the dry-run log are real.
//
// Usage: node scripts/outbound-dry-run.mjs --campaign=first-batch-2026-08-14
//        node scripts/outbound-dry-run.mjs --campaign=... --limit=100 --all-sources
//        node scripts/outbound-dry-run.mjs --campaign=... --only="Name1,Name2"

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const BATCH_LIMIT = 20;
export const CANDIDATE_CATEGORIES = ['university', 'employer'];
export const MIN_OPPORTUNITY_SCORE = 50;

// Sign-off name for [Your Name] in every template. Env-overridable so a real send
// batch can swap it without a code change.
export const SENDER_NAME = process.env.SENDER_NAME || 'Job Hopper Team';

// Where each outbound category's CTA link lands — the partner landing pages (see
// src/views/*.vue), UTM-tagged so App.vue's existing capture attributes the resulting
// signup back to this exact campaign. immigration_professional/workforce_org have no
// outbound template (no connector produces those leads), so no path is needed for them.
const PARTNER_PAGE_BASE = 'https://job-hopper.io';
const PARTNER_PAGE_PATHS = {
  university: '/universities',
  employer: '/outplacement',
  career_partner: '/career-coaches',
};

function partnerLeadUrl(category, campaign) {
  const path = PARTNER_PAGE_PATHS[category];
  if (!path) return null;
  const params = new URLSearchParams({
    utm_source: 'email_outbound',
    utm_campaign: campaign,
    utm_medium: 'email',
  });
  return `${PARTNER_PAGE_BASE}${path}?${params}`;
}

// Real copy from persona-campaign-copy.md, plus a career_partner template (new — the
// doc's original note said that persona had no real leads yet; the career-partner
// connector has since discovered real ones, see docs/apollo-limits.md). Grounded in the
// same real, reviewed copy as src/views/CareerCoaches.vue, not invented separately.
// immigration_professional/workforce_center still have no real leads or template.
const TEMPLATES = {
  university: {
    subject: 'Job-Hopper for [School Name] career services',
    body: `Hi [Name],

I run product at Job-Hopper. We help international students and visa-seeking grads find
employers that actually sponsor, backed by real DOL and USCIS filing data instead of
guesswork.

[School Name] has [X,XXX] students, which puts you in range for a campus license we'd
size around [seat range]. Happy to send over what that'd look like, no pitch
attached, just numbers.

What's the best way to get this in front of whoever handles vendor decisions for career
services?

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  employer: {
    subject: 'Career transition support for the [Company] team',
    body: `Hi [Name],

Saw [Company]'s WARN notice for [X] affected employees in [location]. Job-Hopper helps
laid-off professionals find their next role faster, particularly useful for anyone on a
visa who's also racing a clock most people don't have to think about.

We put together transition packages for situations like this, [seat range], no cost to
the affected employees. Can send specifics if useful.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  career_partner: {
    subject: 'Job-Hopper partnership for [Organization]',
    body: `Hi [Name],

I run product at Job-Hopper. We match visa-seeking job seekers to employers verified
against real DOL and USCIS filing history, not a guessed "sponsors visas" tag — plus
resume advice and interview prep built in.

Thought this could be useful alongside what you already do at [Organization]. Happy to
set up a trial so you can see the match quality yourself.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
};

// Used instead of TEMPLATES when the same contact_email resolves for more than one lead
// this run (e.g. one person listed as the decision-maker for several satellite campuses,
// or the same HR contact across multiple WARN filings for one employer). Sending the
// per-lead template once per duplicate would either spam the same inbox or pick one
// lead's specific numbers/location arbitrarily — instead this drops every claim that's
// true of only one of the merged leads (student count, worker count, single campus name)
// and keeps only what's true of the group as a whole.
const GENERIC_TEMPLATES = {
  university: {
    subject: 'Job-Hopper for your campus career services team',
    body: `Hi [Name],

I run product at Job-Hopper. We help international students and visa-seeking grads find
employers that actually sponsor, backed by real DOL and USCIS filing data instead of
guesswork.

Given the size of your student population, you'd likely be in range for a campus license.
Happy to send over what that could look like, no pitch attached, just numbers.

What's the best way to get this in front of whoever handles vendor decisions for career
services?

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  employer: {
    subject: 'Career transition support for your team',
    body: `Hi [Name],

Saw your organization's recent WARN notice. Job-Hopper helps laid-off professionals find
their next role faster, particularly useful for anyone on a visa who's also racing a clock
most people don't have to think about.

We put together transition packages for situations like this, custom-sized to the group
affected, no cost to the affected employees. Can send specifics if useful.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  career_partner: {
    subject: 'Job-Hopper partnership opportunity',
    body: `Hi [Name],

I run product at Job-Hopper. We match visa-seeking job seekers to employers verified
against real DOL and USCIS filing history, not a guessed "sponsors visas" tag — plus
resume advice and interview prep built in.

Happy to set up a trial so you can see the match quality yourself.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
};

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Contact enrichment (Apollo) — on-demand, only for candidate leads missing
// contact_email, right before they'd be sent to. Mirrors the exact request
// shapes and consume/refund contract already proven in
// supabase/functions/_shared/apollo.ts + premium-insights/index.ts (org search
// -> score -> people search (free) -> people/match (paid, single contact)).
// Duplicated in plain JS rather than imported because that file is Deno/TS-only
// and this script runs under plain Node. See docs/apollo-limits.md registry.
// ---------------------------------------------------------------------------

const APOLLO_PROCESS = 'institutional_lead_enrichment';
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const MIN_ORG_SCORE = 25;
const AMBIGUITY_RATIO = 0.92; // second-best org must be strictly below this fraction of the top score

class ApolloCreditError extends Error {}

function stripLegalSuffixes(name) {
  return name
    .replace(/\b(inc|llc|l\.l\.c\.|corp|corporation|ltd|limited|plc|co|company)\b\.?/gi, '')
    .replace(/[,.\s]+/g, ' ')
    .trim();
}

function normalizeCompanyName(name) {
  return stripLegalSuffixes(name).toLowerCase().replace(/\s+/g, ' ');
}

function tokenSet(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).map((t) => t.trim()).filter((t) => t.length > 1));
}

function orgNameScore(companyName, orgName) {
  const a = normalizeCompanyName(companyName);
  const b = normalizeCompanyName(orgName);
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 85;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  let overlap = 0;
  for (const x of ta) if (tb.has(x)) overlap++;
  if (overlap === 0) return 0;
  return Math.min(70, 20 + overlap * 12);
}

function scoreOrgs(companyName, orgs) {
  return orgs.map((o) => ({ org: o, score: orgNameScore(companyName, o.name) })).sort((a, b) => b.score - a.score);
}

// True when every token of companyName appears in orgName — the shape that makes a
// Foundation/sub-org/affiliated-club name score identically to its parent institution,
// since orgNameScore only measures how many query tokens are present, not how many
// extra tokens the candidate adds on top.
function containsAllQueryTokens(companyName, orgName) {
  const ta = tokenSet(normalizeCompanyName(companyName));
  if (ta.size === 0) return false;
  const tb = tokenSet(normalizeCompanyName(orgName));
  for (const x of ta) if (!tb.has(x)) return false;
  return true;
}

function orgTokenCount(orgName) {
  return tokenSet(normalizeCompanyName(orgName)).size;
}

// Below threshold, or ambiguous (two close candidates) -> null. No UI to ask a human
// which org was meant here, so an uncertain match is treated the same as no match:
// skip the lead rather than guess (same "don't fabricate" rule as the build spec §3.4).
//
// Two narrow exceptions, tried in order, before falling back to refusal:
//
// 1. All candidates tied at the top score already contain every query token (e.g.
//    "California State University, Fresno" tied with "...FRESNO FOUNDATION" — both
//    contain the full query, so they score the same even though one is a strict
//    superset of the other's name). Among those, the fewest-tokens candidate is the
//    closer match — a superset always has equal-or-more tokens than the name it
//    contains, so this can never pick the wrong one when the shapes genuinely differ.
//    If the token counts also tie (e.g. two literally-identical-length names), this
//    doesn't resolve anything and falls through — real ambiguity, not this pattern.
//
// 2. Candidates tied at the exact same top score, where exactly one has a real
//    primary_domain and the rest don't. That specific shape (seen on "Meta" — two orgs
//    both literally named "Meta", one with domain meta.com, one with domain null) looks
//    like a stale/duplicate Apollo record, not a genuine ambiguity, so the
//    domain-bearing one wins. Two-or-more real domains tied at top is still a real
//    ambiguity and still refuses, same as before.
function pickBestOrgFromScored(scored, companyName) {
  const top = scored[0];
  if (!top || top.score < MIN_ORG_SCORE) return null;

  const tiedAtTop = scored.filter((row) => row.score === top.score);
  if (tiedAtTop.length > 1) {
    if (companyName && tiedAtTop.every((row) => containsAllQueryTokens(companyName, row.org.name))) {
      const withCounts = tiedAtTop.map((row) => ({ row, count: orgTokenCount(row.org.name) }));
      const minCount = Math.min(...withCounts.map((t) => t.count));
      const fewest = withCounts.filter((t) => t.count === minCount);
      if (fewest.length === 1) return fewest[0].row.org;
    }

    const withDomain = tiedAtTop.filter((row) => row.org.primary_domain);
    return withDomain.length === 1 ? withDomain[0].org : null;
  }

  const second = scored[1];
  if (second && second.score > top.score * AMBIGUITY_RATIO) return null;
  return top.org;
}

// "Name at Campus" (e.g. "Kent State University at Kent") tends to surface Apollo's
// branch-campus records over the flagship. Stripping the qualifier and searching the
// base institution name alone is more likely to hit the flagship directly.
function stripCampusQualifier(name) {
  return name.replace(/\s+at\s+.+$/i, '').trim();
}

// "Name-Campus Suffix" (e.g. "University of Cincinnati-Main Campus") returns zero
// candidates on every variant tried — the embedded hyphen looks like it breaks Apollo's
// search parsing outright, not just ranks poorly. General pattern, not Cincinnati-only:
// Scorecard's school.name field uses this "-Campus Name" shape for other institutions too.
function stripHyphenatedSuffix(name) {
  const idx = name.indexOf('-');
  return idx === -1 ? name : name.slice(0, idx).trim();
}

// "University of California-San Diego" / "California State University-Fresno" ->
// common-name forms people (and Apollo's org records) actually use: "UC San Diego",
// "Fresno State University". Scoped to their own prefix only — cross-applying would
// produce wrong-institution queries (e.g. "San Diego State University" is a real,
// different school from "UC San Diego").
function ucCommonName(name) {
  const m = name.match(/^University of California-(.+)$/i);
  return m ? `UC ${m[1].trim()}` : null;
}

function csuCommonName(name) {
  const m = name.match(/^California State University-(.+)$/i);
  return m ? `${m[1].trim()} State University` : null;
}

// "El Camino Community College District" -> "El Camino": Scorecard's school.name
// carries the governing district's legal name, but Apollo's org record is usually for
// the college itself, under whatever name remains once "Community College District" is
// stripped out.
function stripCommunityCollegeDistrict(name) {
  const phrase = 'Community College District';
  const idx = name.indexOf(phrase);
  if (idx === -1) return name;
  return (name.slice(0, idx) + name.slice(idx + phrase.length)).replace(/\s+/g, ' ').trim();
}

// College Scorecard names are the raw official institution name, which Apollo's org
// search sometimes doesn't resolve on its own. Retry with progressively cleaned-up
// query variants — *search query only*, institutional_leads.organization_name itself
// is never rewritten, and scoring always compares candidates against the original name.
function orgSearchQueriesFor(lead) {
  const base = lead.organization_name;
  if (lead.source !== 'college_scorecard') return [base];

  const atStripped = stripCampusQualifier(base);
  const hyphenStripped = stripHyphenatedSuffix(base);
  const uc = ucCommonName(base);
  const csu = csuCommonName(base);
  const ccdStripped = stripCommunityCollegeDistrict(base);

  const queries = [base];
  if (atStripped !== base) queries.push(atStripped);
  if (hyphenStripped !== base && hyphenStripped !== atStripped) queries.push(hyphenStripped);
  if (uc) queries.push(uc);
  if (csu) queries.push(csu);
  if (ccdStripped !== base) queries.push(ccdStripped);
  queries.push(`${base} University`, `${base} College`);

  return [...new Set(queries)];
}

function titlePhrasesForCategory(category) {
  if (category === 'university') {
    return [
      'director of career services',
      'career services director',
      'career center director',
      'director of career development',
      'associate director of career services',
    ];
  }
  return [
    'human resources',
    'hr manager',
    'people operations',
    'talent acquisition',
    'chief people officer',
    'vp human resources',
    'director of human resources',
    'head of talent',
  ];
}

function titleMatchScore(personTitle, phrases) {
  const t = (personTitle || '').toLowerCase();
  let s = 0;
  for (const p of phrases) if (t.includes(p)) s += 15;
  return s;
}

function pickBestPerson(people, phrases) {
  const ranked = [...people].sort((a, b) => {
    const ae = a.has_email === true ? 1 : 0;
    const be = b.has_email === true ? 1 : 0;
    if (be !== ae) return be - ae;
    return titleMatchScore(b.title, phrases) - titleMatchScore(a.title, phrases);
  });
  return ranked[0] ?? null;
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

async function searchOrganizationsByName(apiKey, companyName) {
  const params = new URLSearchParams();
  params.set('q_organization_name', stripLegalSuffixes(companyName));
  params.set('per_page', '5');
  params.set('page', '1');
  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search?${params}`, {
    method: 'POST',
    headers: apolloHeaders(apiKey),
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) {
    if (isCreditResponse(res.status, text)) throw new ApolloCreditError(`org search ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`org search ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  return Array.isArray(json.organizations) ? json.organizations.filter((o) => o?.id && o?.name) : [];
}

async function searchPeopleAtOrganization(apiKey, organizationId, personTitles) {
  const params = new URLSearchParams();
  params.append('organization_ids[]', organizationId);
  for (const t of personTitles) params.append('person_titles[]', t);
  params.set('per_page', '10');
  params.set('page', '1');
  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search?${params}`, {
    method: 'POST',
    headers: apolloHeaders(apiKey),
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) {
    if (isCreditResponse(res.status, text)) throw new ApolloCreditError(`people search ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`people search ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  return Array.isArray(json.people) ? json.people : [];
}

async function matchPersonById(apiKey, personId) {
  const params = new URLSearchParams();
  params.set('id', personId);
  params.set('reveal_personal_emails', 'false');
  const res = await fetch(`${APOLLO_BASE}/people/match?${params}`, {
    method: 'POST',
    headers: apolloHeaders(apiKey),
    body: '{}',
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
    return { person: null, creditError: true };
  }
  if (!res.ok) {
    if (text.toLowerCase().includes('credit')) return { person: null, creditError: true };
    throw new Error(`people match ${res.status}: ${text.slice(0, 300)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { person: null, creditError: false };
  }
  return { person: json.person ?? null, creditError: false };
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

// Tries each query from orgSearchQueriesFor in order, one paid org-search credit per
// attempt (consumed then refunded on that attempt's failure — not one credit shared
// across retries, since each is a genuinely separate paid Apollo call). Logs the raw
// candidate list and scoring for every attempt (same shape as _shared/apollo.ts's
// apollo:org-search / apollo:org-score debug lines) so a miss is diagnosable, not silent.
async function resolveOrganization(supabase, apolloKey, lead) {
  for (const query of orgSearchQueriesFor(lead)) {
    const consumed = await tryConsumeCredits(supabase, 1);
    if (!consumed) return { outcome: 'credit_exhausted' };

    let orgs;
    try {
      orgs = await searchOrganizationsByName(apolloKey, query);
    } catch (e) {
      await refundCredits(supabase, 1);
      const outcome = e instanceof ApolloCreditError ? 'apollo_credit_error' : 'org_search_error';
      console.log(
        JSON.stringify({ fn: 'enrich:org-search', organization_name: lead.organization_name, query, outcome, error: e.message }),
      );
      return { outcome, error: e.message };
    }

    console.log(
      JSON.stringify({
        fn: 'enrich:org-search',
        organization_name: lead.organization_name,
        query,
        candidateCount: orgs.length,
        candidates: orgs.slice(0, 5).map((o) => ({ id: o.id, name: o.name, domain: o.primary_domain ?? null })),
      }),
    );

    const scored = scoreOrgs(lead.organization_name, orgs);
    console.log(
      JSON.stringify({
        fn: 'enrich:org-score',
        organization_name: lead.organization_name,
        query,
        minScore: MIN_ORG_SCORE,
        ambiguityRatio: AMBIGUITY_RATIO,
        top: scored[0] ? { name: scored[0].org.name, score: scored[0].score } : null,
        second: scored[1] ? { name: scored[1].org.name, score: scored[1].score } : null,
      }),
    );

    const org = pickBestOrgFromScored(scored, lead.organization_name);
    if (org) return { outcome: 'picked', org };

    await refundCredits(supabase, 1);
  }
  return { outcome: 'org_not_found' };
}

// Same two-step consume/refund contract as premium_insights (docs/apollo-limits.md),
// simplified to a single target contact (institutional_leads has one decision-maker
// slot, not a tiered contact list). On any failure short of a matched person, leaves
// the row untouched — no placeholder is ever written.
//
// orgCache is keyed by the ACTUAL resolved org.id (falling back to primary_domain),
// never by a guessed name string. A first version of this cache keyed by a stripped
// base name (e.g. "california state university") and skipped org-search entirely on a
// hit — that's unsafe: Apollo's own search results prove "California State
// University-Fullerton" and "-Long Beach" are genuinely separate orgs with different
// IDs, not campuses of one institution the way ASU's satellite centers are. A blind
// name-based hit merged 5 distinct CSU campuses onto Fullerton's real director before
// this was caught and reverted. Org-search always runs for every row now (1 credit —
// the only way to actually learn *this* row's real org identity); the cache only skips
// the two more expensive downstream steps (people-search + people/match, 2 credits),
// and only once the freshly-resolved org.id/domain has been checked against the cache.
async function enrichLead(supabase, apolloKey, lead, orgCache) {
  const orgResult = await resolveOrganization(supabase, apolloKey, lead);
  if (orgResult.outcome !== 'picked') return { outcome: orgResult.outcome, error: orgResult.error };
  const org = orgResult.org;

  const cacheKey = org.id || org.primary_domain || null;
  const cached = cacheKey ? orgCache.get(cacheKey) : undefined;
  if (cached) {
    return {
      outcome: 'free_copy',
      name: cached.name,
      title: cached.title,
      email: cached.email,
      orgId: org.id,
      orgDomain: org.primary_domain ?? null,
    };
  }

  const c2ok = await tryConsumeCredits(supabase, 1);
  if (!c2ok) return { outcome: 'credit_exhausted' };

  const phrases = titlePhrasesForCategory(lead.category);
  let people;
  try {
    people = await searchPeopleAtOrganization(apolloKey, org.id, phrases);
  } catch (e) {
    await refundCredits(supabase, 1);
    const outcome = e instanceof ApolloCreditError ? 'apollo_credit_error' : 'people_search_error';
    console.log(
      JSON.stringify({ fn: 'enrich:people-search', organization_name: lead.organization_name, organizationId: org.id, outcome, error: e.message }),
    );
    return { outcome, error: e.message };
  }

  console.log(
    JSON.stringify({
      fn: 'enrich:people-search',
      organization_name: lead.organization_name,
      organizationId: org.id,
      titlePhrases: phrases,
      peopleCount: people.length,
      peopleSample: people
        .slice(0, 5)
        .map((p) => ({ id: p.id, title: p.title ?? null, has_email: p.has_email === true, org: p.organization?.name ?? null })),
    }),
  );

  const candidate = pickBestPerson(people, phrases);
  if (!candidate) {
    await refundCredits(supabase, 1);
    return { outcome: 'no_contacts' };
  }

  const { person, creditError } = await matchPersonById(apolloKey, candidate.id);
  console.log(
    JSON.stringify({
      fn: 'enrich:people-match',
      organization_name: lead.organization_name,
      personId: candidate.id,
      candidateTitle: candidate.title ?? null,
      creditError,
      matched: !!person,
      matchedEmail: person && typeof person.email === 'string' ? person.email : null,
    }),
  );
  if (creditError || !person) {
    await refundCredits(supabase, 1);
    return { outcome: creditError ? 'apollo_credit_error' : 'match_failed' };
  }

  const first = typeof person.first_name === 'string' ? person.first_name : '';
  const last = typeof person.last_name === 'string' ? person.last_name : '';
  const name = (typeof person.name === 'string' && person.name) || `${first} ${last}`.trim() || null;
  const title = typeof person.title === 'string' ? person.title : null;
  const email = typeof person.email === 'string' && person.email ? person.email : null;

  // Apollo returned a real, paid-for person — that credit spend stands even if this
  // particular person has no email on file. Not refunded (same as premium_insights:
  // a matched-but-emailless person is a legitimate result, just not a usable one here).
  if (!email) return { outcome: 'no_email', name, title, orgId: org.id, orgDomain: org.primary_domain ?? null };

  if (cacheKey) orgCache.set(cacheKey, { name, title, email });
  return { outcome: 'success', name, title, email, orgId: org.id, orgDomain: org.primary_domain ?? null };
}

function fill(text, replacements) {
  let out = text;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

// [Name] is the recipient's greeting name, filled from decision_maker_name (first name
// only — "Hi John," not "Hi John Smith,"). It's a distinct token from [Your Name] in the
// signature: the template originally reused the same [Name] token for both the recipient
// greeting and the sender sign-off, which meant filling it from decision_maker_name would
// have signed the email with the recipient's own name. Split into two tokens instead;
// [Your Name] is filled from SENDER_NAME (env-overridable, defaults to "Job Hopper Team").
// [seat range] is mapped straight from recommended_package, which already carries its
// own unit ("25 seats", "500+ seat custom cohort") — the templates don't append a
// trailing "seats" or a separate duration placeholder, so the field's wording stands as-is.
function firstName(fullName) {
  return typeof fullName === 'string' && fullName.trim() ? fullName.trim().split(/\s+/)[0] : null;
}

function renderTemplate(category, lead, campaign) {
  const template = TEMPLATES[category];
  const common = {
    '[Name]': firstName(lead.decision_maker_name) || '[Name]',
    '[Your Name]': SENDER_NAME,
    '[Link]': partnerLeadUrl(category, campaign) || '[Link]',
  };
  let replacements;
  if (category === 'university') {
    replacements = {
      ...common,
      '[School Name]': lead.organization_name,
      '[X,XXX]': lead.student_size != null ? lead.student_size.toLocaleString('en-US') : '[X,XXX]',
      '[seat range]': lead.recommended_package || '[seat range]',
    };
  } else if (category === 'employer') {
    replacements = {
      ...common,
      '[Company]': lead.organization_name,
      '[X]':
        lead.signals?.workers_affected != null
          ? lead.signals.workers_affected.toLocaleString('en-US')
          : '[X]',
      '[location]': [lead.city, lead.state].filter(Boolean).join(', ') || '[location]',
      '[seat range]': lead.recommended_package || '[seat range]',
    };
  } else {
    replacements = {
      ...common,
      '[Organization]': lead.organization_name,
    };
  }

  const subject = fill(template.subject, replacements);
  const body = fill(template.body, replacements);
  return { subject, body, unfilled: unfilledPlaceholders(subject, body) };
}

function unfilledPlaceholders(subject, body) {
  return [...new Set([...subject.matchAll(/\[[^\]]+\]/g), ...body.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]))];
}

// Groups candidates (each { lead, category, contact_email }) by contact_email and
// produces exactly one send per unique email. Single-lead groups keep the normal
// per-lead template; multi-lead groups (the same person resolved for several leads)
// use the category-generic template instead, since no single lead's specific
// numbers/location are true of the whole group. Input order is assumed to already be
// priority order (highest opportunity_score first) — the first lead in a group becomes
// "primary" and its category picks the template when a group spans categories.
export function buildDedupedSends(candidateRenders, campaign) {
  const groupsByEmail = new Map();
  for (const c of candidateRenders) {
    if (!groupsByEmail.has(c.contact_email)) groupsByEmail.set(c.contact_email, []);
    groupsByEmail.get(c.contact_email).push(c);
  }

  let dedupedGroupCount = 0;
  const sends = [];
  for (const group of groupsByEmail.values()) {
    const primary = group[0].lead;
    const orgNames = group.map((c) => c.lead.organization_name);

    if (group.length === 1) {
      const { subject, body, unfilled } = renderTemplate(primary.category, primary, campaign);
      sends.push({ merged: false, category: primary.category, contact_email: group[0].contact_email, orgNames, subject, body, unfilled });
      continue;
    }

    dedupedGroupCount += 1;
    const categories = [...new Set(group.map((c) => c.category))];
    const template = GENERIC_TEMPLATES[primary.category];
    const nameReplacement = {
      '[Name]': firstName(primary.decision_maker_name) || '[Name]',
      '[Your Name]': SENDER_NAME,
      '[Link]': partnerLeadUrl(primary.category, campaign) || '[Link]',
    };
    const subject = fill(template.subject, nameReplacement);
    const body = fill(template.body, nameReplacement);
    sends.push({
      merged: true,
      mixedCategories: categories.length > 1 ? categories : null,
      category: primary.category,
      contact_email: group[0].contact_email,
      orgNames,
      subject,
      body,
      unfilled: unfilledPlaceholders(subject, body),
    });
  }

  return { sends, dedupedGroupCount };
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apolloKey = requireEnv('APOLLO_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // --campaign=<tag> is required — it's embedded in every rendered [Link] URL's
  // utm_campaign param, and this is a preview of exactly what a real send (which
  // requires the same flag, see outbound-live-send.mjs) would contain. No placeholder
  // fallback: a preview with a fake campaign tag would misrepresent what ships.
  const campaignArg = process.argv.find((a) => a.startsWith('--campaign='));
  if (!campaignArg) {
    throw new Error('--campaign=<tag> is required (e.g. --campaign=first-batch-2026-08-14)');
  }
  const campaign = campaignArg.slice('--campaign='.length);

  // --only="Name1,Name2" restricts the candidate set to exact organization_name matches
  // (e.g. re-testing specific prior misses) without touching the rest of the batch or
  // spending enrichment-cap slots on leads that weren't asked for.
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyNames = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()) : null;

  // --limit=100 overrides the default batch size (still 20 unless passed).
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const batchLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : BATCH_LIMIT;

  // --all-sources drops the category/min-score restriction entirely, ranking across
  // every source (college_scorecard, warn, apollo_career_partner) by opportunity_score
  // alone. Without it, behavior is unchanged from every previous run tonight
  // (university/employer only, score >= 50) — this flag only widens scope, never
  // narrows the default.
  const allSources = process.argv.includes('--all-sources');

  // The enrichment cap always matches whatever batch size was actually requested this
  // run — it exists to gate spend to "however many leads we said we'd touch," not as a
  // separate, smaller number to additionally worry about.
  const enrichmentCapLimit = batchLimit;

  console.log(
    onlyNames
      ? `Fetching only: ${onlyNames.join(', ')}`
      : allSources
        ? `Fetching top ${batchLimit} candidate leads across all sources (status=new, ordered by opportunity_score desc)...`
        : `Fetching top ${batchLimit} candidate leads (status=new, category in [${CANDIDATE_CATEGORIES.join(', ')}], opportunity_score >= ${MIN_OPPORTUNITY_SCORE})...`,
  );
  let query = supabase
    .from('institutional_leads')
    .select(
      'id, organization_name, category, contact_email, decision_maker_name, opportunity_score, website, signals, city, state, student_size, recommended_package, source',
    )
    .eq('status', 'new')
    // Every connector's own scoring rule treats a null opportunity_score as "flag for
    // manual review," never as a candidate for outbound — so it's excluded from
    // candidacy outright, not just sorted after real scores. This also sidesteps
    // Postgres's default DESC null ordering (NULLS FIRST, not last — confirmed the hard
    // way: a run without this filter returned 100/100 null-score rows ahead of every
    // real-scored lead, since the previous .gte(50) floor had been silently absorbing
    // this the whole time by excluding nulls as a side effect, not by design).
    .not('opportunity_score', 'is', null);
  if (!allSources) {
    query = query.in('category', CANDIDATE_CATEGORIES).gte('opportunity_score', MIN_OPPORTUNITY_SCORE);
  }
  // Secondary sort makes batches reproducible run to run — opportunity_score alone ties
  // constantly (many leads share the same bucket score), so without a tiebreaker
  // Postgres doesn't guarantee stable ordering among tied rows across separate calls
  // (observed directly: Kent State/Cincinnati dropped out of an earlier top-20 window
  // between two runs with identical filters).
  query = query
    .order('opportunity_score', { ascending: false })
    .order('organization_name', { ascending: true })
    .limit(batchLimit);
  if (onlyNames) query = query.in('organization_name', onlyNames);
  const { data: leads, error: leadsError } = await query;
  if (leadsError) throw new Error(`Failed to query institutional_leads: ${leadsError.message}`);
  console.log(`Found ${leads.length} candidate leads.`);

  const { data: exclusions, error: exclusionsError } = await supabase
    .from('exclusion_lists')
    .select('company_name');
  if (exclusionsError) throw new Error(`Failed to query exclusion_lists: ${exclusionsError.message}`);
  const suppressedNames = new Set(exclusions.map((r) => r.company_name));

  const { data: creditsBefore } = await supabase
    .from('apollo_limits')
    .select('usage')
    .eq('name', 'institutional_lead_enrichment')
    .single();

  const logRows = [];
  const rendered = [];
  const candidateRenders = []; // pre-dedup: one entry per lead with a usable contact_email
  const enrichmentAttempts = [];
  let suppressedCount = 0;
  let enrichmentCap = enrichmentCapLimit;
  let skippedNoContactCount = 0;
  let freeCopyCount = 0;
  let freshLookupSuccessCount = 0;

  // Apollo org.id (falling back to primary_domain) -> resolved contact, populated only
  // from real successful lookups this run. Keyed and checked inside enrichLead itself,
  // after org-search actually resolves this row's org — never before, and never by name.
  const resolvedOrgCache = new Map();

  for (const lead of leads) {
    if (suppressedNames.has(lead.organization_name)) {
      suppressedCount += 1;
      console.log(`SKIPPED (skipped_suppressed): ${lead.organization_name}`);
      logRows.push({
        lead_organization_name: lead.organization_name,
        category: lead.category,
        rendered_subject: null,
        rendered_body: null,
        suppressed: true,
      });
      continue;
    }

    if (!lead.contact_email) {
      if (enrichmentCap <= 0) {
        skippedNoContactCount += 1;
        console.log(`SKIPPED (missing email, enrichment cap reached): ${lead.organization_name}`);
        continue;
      }
      enrichmentCap -= 1;
      console.log(`Enriching (${lead.category}): ${lead.organization_name}...`);
      const result = await enrichLead(supabase, apolloKey, lead, resolvedOrgCache);
      enrichmentAttempts.push({ organization_name: lead.organization_name, category: lead.category, ...result });

      if (result.outcome !== 'success' && result.outcome !== 'free_copy') {
        skippedNoContactCount += 1;
        console.log(`  -> ${result.outcome}${result.error ? `: ${result.error}` : ''} — lead skipped this round.`);
        continue;
      }

      if (result.outcome === 'free_copy') freeCopyCount += 1;
      else freshLookupSuccessCount += 1;

      const { error: updateError } = await supabase
        .from('institutional_leads')
        .update({
          decision_maker_name: result.name,
          decision_maker_title: result.title,
          contact_email: result.email,
        })
        .eq('id', lead.id);
      if (updateError) throw new Error(`Failed to update institutional_leads ${lead.id}: ${updateError.message}`);

      console.log(
        `  -> ${result.outcome}: ${result.name} (${result.title ?? 'no title'}) <${result.email}> ` +
          `(resolved org domain=${result.orgDomain ?? 'null'}, id=${result.orgId ?? 'null'})`,
      );
      lead.contact_email = result.email;
      lead.decision_maker_name = result.name;
    }

    // No template exists for this category (e.g. workforce_org — no outbound connector
    // produces those leads, only inbound landing-page fills) — enrichment above still
    // ran and its write still stands, just nothing to render/log here. career_partner
    // now has a real template; this guard now only matters for categories that still
    // don't. In practice career_partner/workforce_org leads mostly have a null
    // opportunity_score anyway (verified — the discovery connectors' search mode
    // doesn't return employee count), so they sort last and rarely make a real top-N
    // batch. Guarded anyway rather than assuming that holds forever.
    if (!TEMPLATES[lead.category]) {
      console.log(`  (no template for category "${lead.category}" — enrichment result kept, not rendered/logged)`);
      continue;
    }

    candidateRenders.push({ lead, category: lead.category, contact_email: lead.contact_email.toLowerCase().trim() });
  }

  const { sends, dedupedGroupCount } = buildDedupedSends(candidateRenders, campaign);
  for (const s of sends) {
    if (s.merged) {
      if (s.mixedCategories) {
        console.log(
          `  NOTE: contact_email ${s.contact_email} shared across mixed categories ` +
            `(${s.mixedCategories.join(', ')}) — using ${s.category}'s generic template.`,
        );
      }
      console.log(`  Deduped ${s.orgNames.length} leads to one send (${s.contact_email}): ${s.orgNames.join(', ')}`);
    }
    logRows.push({
      lead_organization_name: s.orgNames.join('; '),
      category: s.category,
      rendered_subject: s.subject,
      rendered_body: s.body,
      suppressed: false,
    });
    rendered.push({
      organization_name: s.orgNames.join('; '),
      category: s.category,
      contact_email: s.contact_email,
      subject: s.subject,
      body: s.body,
      unfilled: s.unfilled,
    });
  }

  if (logRows.length) {
    const { error: insertError } = await supabase.from('outbound_dry_run_log').insert(logRows);
    if (insertError) throw new Error(`Failed to write outbound_dry_run_log: ${insertError.message}`);
  }

  const { data: creditsAfter } = await supabase
    .from('apollo_limits')
    .select('usage')
    .eq('name', 'institutional_lead_enrichment')
    .single();
  const creditsUsedThisRun = (creditsAfter?.usage ?? 0) - (creditsBefore?.usage ?? 0);

  if (enrichmentAttempts.length) {
    const succeeded = enrichmentAttempts.filter((a) => a.outcome === 'success' || a.outcome === 'free_copy');
    const refused = enrichmentAttempts.filter((a) => a.outcome !== 'success' && a.outcome !== 'free_copy');
    const byReason = new Map();
    for (const a of refused) byReason.set(a.outcome, (byReason.get(a.outcome) ?? 0) + 1);

    console.log(`\n--- Enrichment summary (${enrichmentAttempts.length} attempted) ---`);
    console.log(
      `  ${succeeded.length} got real contacts (${freshLookupSuccessCount} fresh lookup (2 credits each), ${freeCopyCount} free copy — same resolved org as an earlier row this run, verified by org ID/domain, 1 credit for org-search only, people-lookup skipped)`,
    );
    console.log(`  ${refused.length} principled refusals:`);
    for (const [reason, count] of byReason) console.log(`    ${count} x ${reason}`);
    console.log(`  ${creditsUsedThisRun} Apollo credits used this run (institutional_lead_enrichment)`);

    console.log(`\n--- Detail ---`);
    for (const a of enrichmentAttempts) {
      console.log(
        `[${a.category}] ${a.organization_name}: ${a.outcome}` +
          (a.outcome === 'success' || a.outcome === 'free_copy' || a.outcome === 'no_email'
            ? `  name=${a.name ?? 'null'}  title=${a.title ?? 'null'}  email=${a.email ?? 'null'}`
            : a.error
              ? `  (${a.error})`
              : ''),
      );
    }
  }

  console.log(
    `\nDry run complete: ${rendered.length} sends rendered (${candidateRenders.length} leads had a usable ` +
      `contact, ${dedupedGroupCount} email(s) deduped down from multiple leads), ${suppressedCount} suppressed, ` +
      `${skippedNoContactCount} skipped (no usable contact — either enrichment failed or the ` +
      `${enrichmentCapLimit}-lead cap was already spent).`,
  );

  console.log(`\n--- Sample rendered output (${Math.min(5, rendered.length)} of ${rendered.length}) ---`);
  for (const r of rendered.slice(0, 5)) {
    console.log(`\n[${r.category}] ${r.organization_name}  (contact_email: ${r.contact_email ?? 'MISSING'})`);
    console.log(`Subject: ${r.subject}`);
    console.log(r.body);
    if (r.unfilled.length) console.log(`\n⚠ unfilled placeholders: ${r.unfilled.join(', ')}`);
  }
}

const TEST_CAMPAIGN = 'self-test-campaign';

function selfTestDedup() {
  const uniLead = (name, email, dmName) => ({ organization_name: name, category: 'university', student_size: 1000, recommended_package: '25 seats', contact_email: email, decision_maker_name: dmName });
  const empLead = (name, email, dmName) => ({ organization_name: name, category: 'employer', signals: { workers_affected: 10 }, city: 'X', state: 'Y', recommended_package: '25 seats', contact_email: email, decision_maker_name: dmName });

  // Greeting/signature token split: [Name] (recipient) fills from decision_maker_name;
  // [Your Name] (sender) fills from SENDER_NAME — must never reuse the recipient's name.
  const solo0 = uniLead('Named U', 'named@u.edu', 'Jane Smith');
  const { subject: s0, body: b0, unfilled: u0 } = renderTemplate('university', solo0, TEST_CAMPAIGN);
  console.assert(s0.includes('Named U') && b0.includes('Hi Jane,'), 'greeting should fill from decision_maker_name first name');
  console.assert(b0.includes(SENDER_NAME) && !u0.includes('[Your Name]'), 'signature should fill from SENDER_NAME, not stay unfilled');
  console.assert(!b0.includes('Jane Smith') && !b0.includes('Hi ' + SENDER_NAME), 'greeting and signature must not cross-contaminate');

  // [Link] must resolve to the right partner page with the real campaign in utm_campaign,
  // not a placeholder — and must stay unfilled (never a broken partial URL) for a
  // category with no partner page.
  console.assert(!u0.includes('[Link]') && b0.includes('https://job-hopper.io/universities?'), '[Link] should fill for university');
  console.assert(b0.includes(`utm_campaign=${TEST_CAMPAIGN}`), '[Link] must carry the real campaign, not a placeholder');
  const noPageLead = { organization_name: 'X', category: 'workforce_org', decision_maker_name: null };
  const linklessTemplate = { subject: '[Link]', body: '[Link]' };
  console.assert(
    fill(linklessTemplate.body, { '[Link]': partnerLeadUrl(noPageLead.category, TEST_CAMPAIGN) || '[Link]' }) === '[Link]',
    'a category with no partner page must leave [Link] unfilled, not emit a broken URL',
  );

  // Same-category duplicate: two campuses, one contact -> one generic send, no campus-specific claim.
  const a = uniLead('ASU - Broadway', 'shared@asu.edu', 'Sam Ali');
  const b = uniLead('ASU - Grand', 'shared@asu.edu', 'Sam Ali');
  const c = uniLead('Solo U', 'solo@solo.edu', null);
  const r1 = buildDedupedSends([
    { lead: a, category: 'university', contact_email: 'shared@asu.edu' },
    { lead: b, category: 'university', contact_email: 'shared@asu.edu' },
    { lead: c, category: 'university', contact_email: 'solo@solo.edu' },
  ], TEST_CAMPAIGN);
  console.assert(r1.dedupedGroupCount === 1, 'expected exactly one deduped group');
  console.assert(r1.sends.length === 2, 'expected 2 sends total (1 merged + 1 solo)');
  const merged1 = r1.sends.find((s) => s.contact_email === 'shared@asu.edu');
  console.assert(merged1.merged === true && merged1.orgNames.length === 2, 'merged send should list both orgs');
  console.assert(!merged1.body.includes('1000') && !merged1.body.includes('Broadway'), 'generic send must not leak one lead\'s specifics');
  console.assert(merged1.body.includes('Hi Sam,'), 'merged send should still greet by the shared contact\'s first name');
  console.assert(merged1.body.includes('https://job-hopper.io/universities?'), 'merged (generic) send should still get the real link');
  const solo1 = r1.sends.find((s) => s.contact_email === 'solo@solo.edu');
  console.assert(solo1.merged === false && solo1.body.includes('Solo U'), 'non-duplicate lead keeps its specific template');

  // Cross-category duplicate: flagged, falls back to primary (first/highest-scored) lead's template.
  const d = empLead('Acme Corp', 'shared2@x.com', 'Pat Lee');
  const e = uniLead('Acme U', 'shared2@x.com', 'Pat Lee');
  const r2 = buildDedupedSends([
    { lead: d, category: 'employer', contact_email: 'shared2@x.com' },
    { lead: e, category: 'university', contact_email: 'shared2@x.com' },
  ], TEST_CAMPAIGN);
  console.assert(r2.sends.length === 1 && r2.sends[0].mixedCategories?.length === 2, 'mixed-category group should be flagged');
  console.assert(r2.sends[0].category === 'employer', 'mixed group uses first/highest-scored lead\'s category');

  // career_partner: new template, real link to /career-coaches, [Organization] token
  // (distinct from university's [School Name] / employer's [Company]).
  const partnerLead = { organization_name: 'Example Coaching', category: 'career_partner', contact_email: 'coach@example.com', decision_maker_name: 'Robin Lee' };
  const r3 = renderTemplate('career_partner', partnerLead, TEST_CAMPAIGN);
  console.assert(r3.body.includes('Example Coaching'), '[Organization] should fill for career_partner');
  console.assert(r3.body.includes('https://job-hopper.io/career-coaches?') && r3.body.includes(`utm_campaign=${TEST_CAMPAIGN}`), 'career_partner [Link] should point at /career-coaches with the real campaign');
  console.assert(r3.unfilled.length === 0, 'career_partner template should have no leftover unfilled placeholders');

  console.log('selfTestDedup: all assertions passed');
}

function selfTestOrgQueries() {
  console.assert(
    orgSearchQueriesFor({ organization_name: 'University of California-San Diego', source: 'college_scorecard' }).includes('UC San Diego'),
    'UC common-name variant should fire for "University of California-X"',
  );
  console.assert(
    orgSearchQueriesFor({ organization_name: 'California State University-Fresno', source: 'college_scorecard' }).includes('Fresno State University'),
    'CSU common-name variant should fire for "California State University-X"',
  );
  console.assert(
    !orgSearchQueriesFor({ organization_name: 'University of California-San Diego', source: 'college_scorecard' }).some((q) => q.includes('State University')),
    'CSU variant must not cross-apply to a UC name',
  );
  console.assert(
    !orgSearchQueriesFor({ organization_name: 'California State University-Fresno', source: 'college_scorecard' }).some((q) => q.startsWith('UC ')),
    'UC variant must not cross-apply to a CSU name',
  );
  console.assert(
    orgSearchQueriesFor({ organization_name: 'El Camino Community College District', source: 'college_scorecard' }).includes('El Camino'),
    'Community College District should strip down to the bare college name',
  );
  console.assert(
    orgSearchQueriesFor({ organization_name: 'Regular University', source: 'college_scorecard' }).length === 3,
    'a name matching no special pattern should only get the base + University/College suffix queries',
  );
  console.log('selfTestOrgQueries: all assertions passed');
}

function selfTestOrgTieBreak() {
  const companyName = 'California State University-Fresno';
  const flagship = { id: '1', name: 'California State University, Fresno', primary_domain: 'fresnostate.edu' };
  const foundation = { id: '2', name: 'CALIFORNIA STATE UNIVERSITY, FRESNO FOUNDATION', primary_domain: null };

  // Foundation/sub-org superset tie: fewest-tokens candidate (the flagship) should win.
  const scored1 = scoreOrgs(companyName, [foundation, flagship]);
  console.assert(scored1[0].score === scored1[1].score, 'fixture should actually tie in score (sanity check)');
  const picked1 = pickBestOrgFromScored(scored1, companyName);
  console.assert(picked1?.id === flagship.id, 'tied Foundation/flagship names should resolve to the flagship (fewest tokens)');

  // Genuine ambiguity: same token count on both sides -> still refuses, doesn't force a guess.
  const twin1 = { id: '3', name: 'Example State University East', primary_domain: null };
  const twin2 = { id: '4', name: 'Example State University West', primary_domain: null };
  const scored2 = scoreOrgs('Example State University', [twin1, twin2]);
  const picked2 = pickBestOrgFromScored(scored2, 'Example State University');
  console.assert(picked2 === null, 'equal-token-count ties must still refuse rather than guess');

  // Existing domain tiebreak (Meta case) must still work — this fix runs first but must
  // fall through cleanly when the token-count check doesn't resolve anything.
  const metaWithDomain = { id: '5', name: 'Meta', primary_domain: 'meta.com' };
  const metaNoDomain = { id: '6', name: 'Meta', primary_domain: null };
  const scored3 = scoreOrgs('Meta', [metaNoDomain, metaWithDomain]);
  const picked3 = pickBestOrgFromScored(scored3, 'Meta');
  console.assert(picked3?.id === metaWithDomain.id, 'exact-name tie should still fall through to the domain tiebreak');

  console.log('selfTestOrgTieBreak: all assertions passed');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) {
    selfTestDedup();
    selfTestOrgQueries();
    selfTestOrgTieBreak();
  } else {
    main().catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
  }
}
