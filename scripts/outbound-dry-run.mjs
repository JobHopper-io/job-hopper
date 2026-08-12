#!/usr/bin/env node
// Pulls top-scored institutional_leads (university/employer), checks exclusion_lists
// suppression, enriches leads missing contact_email via Apollo (real: writes
// decision_maker_name/title/contact_email back to institutional_leads, capped to a
// small dry-run batch — see ENRICHMENT_DRY_RUN_CAP), renders the matching persona
// template from persona-campaign-copy.md with real field substitution, and logs every
// render to outbound_dry_run_log. Never calls sendEmail — no real outbound sends happen
// here; only the enrichment writes and the dry-run log are real.
//
// Usage: node scripts/outbound-dry-run.mjs

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const BATCH_LIMIT = 20;
const CANDIDATE_CATEGORIES = ['university', 'employer'];
const MIN_OPPORTUNITY_SCORE = 50;

// Real copy from persona-campaign-copy.md. Only university/employer are wired —
// the other three personas (Career Coach, Immigration Attorney, Workforce Center)
// have no real leads yet, per the doc's own note.
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

[Name]
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

[Name]
Job-Hopper`,
  },
};

function requireEnv(name) {
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

// Below threshold, or ambiguous (two close candidates) -> null. No UI to ask a human
// which org was meant here, so an uncertain match is treated the same as no match:
// skip the lead rather than guess (same "don't fabricate" rule as the build spec §3.4).
//
// One narrow exception: candidates tied at the exact same top score, where exactly one
// has a real primary_domain and the rest don't. That specific shape (seen on "Meta" —
// two orgs both literally named "Meta", one with domain meta.com, one with domain null)
// looks like a stale/duplicate Apollo record, not a genuine ambiguity, so the
// domain-bearing one wins. Two-or-more real domains tied at top is still a real
// ambiguity and still refuses, same as before.
function pickBestOrgFromScored(scored) {
  const top = scored[0];
  if (!top || top.score < MIN_ORG_SCORE) return null;

  const tiedAtTop = scored.filter((row) => row.score === top.score);
  if (tiedAtTop.length > 1) {
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

// College Scorecard names are the raw official institution name, which Apollo's org
// search sometimes doesn't resolve on its own. Retry with progressively cleaned-up
// query variants — *search query only*, institutional_leads.organization_name itself
// is never rewritten, and scoring always compares candidates against the original name.
function orgSearchQueriesFor(lead) {
  const base = lead.organization_name;
  if (lead.source !== 'college_scorecard') return [base];

  const atStripped = stripCampusQualifier(base);
  const hyphenStripped = stripHyphenatedSuffix(base);

  const queries = [base];
  if (atStripped !== base) queries.push(atStripped);
  if (hyphenStripped !== base && hyphenStripped !== atStripped) queries.push(hyphenStripped);
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

    const org = pickBestOrgFromScored(scored);
    if (org) return { outcome: 'picked', org };

    await refundCredits(supabase, 1);
  }
  return { outcome: 'org_not_found' };
}

// Same two-step consume/refund contract as premium_insights (docs/apollo-limits.md),
// simplified to a single target contact (institutional_leads has one decision-maker
// slot, not a tiered contact list). On any failure short of a matched person, leaves
// the row untouched — no placeholder is ever written.
async function enrichLead(supabase, apolloKey, lead) {
  const orgResult = await resolveOrganization(supabase, apolloKey, lead);
  if (orgResult.outcome !== 'picked') return { outcome: orgResult.outcome, error: orgResult.error };
  const org = orgResult.org;

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
  if (!email) return { outcome: 'no_email', name, title };

  return { outcome: 'success', name, title, email };
}

function fill(text, replacements) {
  let out = text;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

// [Name] (sender/recipient name) is never mapped — decision_maker_name isn't populated
// for any lead yet (same Apollo-enrichment gap the build spec flags for contact_email).
// [seat range] is mapped straight from recommended_package, which already carries its
// own unit ("25 seats", "500+ seat custom cohort") — the templates don't append a
// trailing "seats" or a separate duration placeholder, so the field's wording stands as-is.
function renderTemplate(category, lead) {
  const template = TEMPLATES[category];
  const replacements =
    category === 'university'
      ? {
          '[School Name]': lead.organization_name,
          '[X,XXX]': lead.student_size != null ? lead.student_size.toLocaleString('en-US') : '[X,XXX]',
          '[seat range]': lead.recommended_package || '[seat range]',
        }
      : {
          '[Company]': lead.organization_name,
          '[X]':
            lead.signals?.workers_affected != null
              ? lead.signals.workers_affected.toLocaleString('en-US')
              : '[X]',
          '[location]': [lead.city, lead.state].filter(Boolean).join(', ') || '[location]',
          '[seat range]': lead.recommended_package || '[seat range]',
        };

  const subject = fill(template.subject, replacements);
  const body = fill(template.body, replacements);
  const unfilled = [...new Set([...subject.matchAll(/\[[^\]]+\]/g), ...body.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]))];
  return { subject, body, unfilled };
}

// Was capped to 5 for the initial small-batch verification (build spec §5); raised to
// cover the full top-20 batch now that the 3-lead re-test confirmed the fixes work.
const ENRICHMENT_DRY_RUN_CAP = BATCH_LIMIT;

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apolloKey = requireEnv('APOLLO_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // --only="Name1,Name2" restricts the candidate set to exact organization_name matches
  // (e.g. re-testing specific prior misses) without touching the rest of the top-20 or
  // spending enrichment-cap slots on leads that weren't asked for.
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyNames = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()) : null;

  console.log(
    onlyNames
      ? `Fetching only: ${onlyNames.join(', ')}`
      : `Fetching top ${BATCH_LIMIT} candidate leads (status=new, category in [${CANDIDATE_CATEGORIES.join(', ')}], opportunity_score >= ${MIN_OPPORTUNITY_SCORE})...`,
  );
  let query = supabase
    .from('institutional_leads')
    .select(
      'id, organization_name, category, contact_email, opportunity_score, website, signals, city, state, student_size, recommended_package, source',
    )
    .eq('status', 'new')
    .in('category', CANDIDATE_CATEGORIES)
    .gte('opportunity_score', MIN_OPPORTUNITY_SCORE)
    .order('opportunity_score', { ascending: false })
    .limit(BATCH_LIMIT);
  if (onlyNames) query = query.in('organization_name', onlyNames);
  const { data: leads, error: leadsError } = await query;
  if (leadsError) throw new Error(`Failed to query institutional_leads: ${leadsError.message}`);
  console.log(`Found ${leads.length} candidate leads.`);

  const { data: exclusions, error: exclusionsError } = await supabase
    .from('exclusion_lists')
    .select('company_name');
  if (exclusionsError) throw new Error(`Failed to query exclusion_lists: ${exclusionsError.message}`);
  const suppressedNames = new Set(exclusions.map((r) => r.company_name));

  const logRows = [];
  const rendered = [];
  const enrichmentAttempts = [];
  let suppressedCount = 0;
  let enrichmentCap = ENRICHMENT_DRY_RUN_CAP;
  let skippedNoContactCount = 0;

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
        console.log(`SKIPPED (missing email, enrichment dry-run cap reached): ${lead.organization_name}`);
        continue;
      }
      enrichmentCap -= 1;
      console.log(`Enriching (${lead.category}): ${lead.organization_name}...`);
      const result = await enrichLead(supabase, apolloKey, lead);
      enrichmentAttempts.push({ organization_name: lead.organization_name, category: lead.category, ...result });

      if (result.outcome !== 'success') {
        skippedNoContactCount += 1;
        console.log(`  -> ${result.outcome}${result.error ? `: ${result.error}` : ''} — lead skipped this round.`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('institutional_leads')
        .update({
          decision_maker_name: result.name,
          decision_maker_title: result.title,
          contact_email: result.email,
        })
        .eq('id', lead.id);
      if (updateError) throw new Error(`Failed to update institutional_leads ${lead.id}: ${updateError.message}`);

      console.log(`  -> found: ${result.name} (${result.title ?? 'no title'}) <${result.email}>`);
      lead.contact_email = result.email;
    }

    const { subject, body, unfilled } = renderTemplate(lead.category, lead);

    logRows.push({
      lead_organization_name: lead.organization_name,
      category: lead.category,
      rendered_subject: subject,
      rendered_body: body,
      suppressed: false,
    });
    rendered.push({
      organization_name: lead.organization_name,
      category: lead.category,
      contact_email: lead.contact_email,
      subject,
      body,
      unfilled,
    });
  }

  if (logRows.length) {
    const { error: insertError } = await supabase.from('outbound_dry_run_log').insert(logRows);
    if (insertError) throw new Error(`Failed to write outbound_dry_run_log: ${insertError.message}`);
  }

  if (enrichmentAttempts.length) {
    console.log(`\n--- Enrichment results (${enrichmentAttempts.length} attempted, dry-run cap ${ENRICHMENT_DRY_RUN_CAP}) ---`);
    for (const a of enrichmentAttempts) {
      console.log(
        `[${a.category}] ${a.organization_name}: ${a.outcome}` +
          (a.outcome === 'success' || a.outcome === 'no_email'
            ? `  name=${a.name ?? 'null'}  title=${a.title ?? 'null'}  email=${a.email ?? 'null'}`
            : ''),
      );
    }
  }

  console.log(
    `\nDry run complete: ${rendered.length} rendered, ${suppressedCount} suppressed, ` +
      `${skippedNoContactCount} skipped (no usable contact — either enrichment failed or the ` +
      `${ENRICHMENT_DRY_RUN_CAP}-lead dry-run cap was already spent).`,
  );

  console.log(`\n--- Sample rendered output (${Math.min(5, rendered.length)} of ${rendered.length}) ---`);
  for (const r of rendered.slice(0, 5)) {
    console.log(`\n[${r.category}] ${r.organization_name}  (contact_email: ${r.contact_email ?? 'MISSING'})`);
    console.log(`Subject: ${r.subject}`);
    console.log(r.body);
    if (r.unfilled.length) console.log(`\n⚠ unfilled placeholders: ${r.unfilled.join(', ')}`);
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
