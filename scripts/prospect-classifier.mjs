#!/usr/bin/env node
// Classifies prospects from their latest evidence snippet with one LLM call each:
// segments, needs_sponsorship, intent_score (0-100 lead quality, with code-side caps and
// clamping), intent_reason, and, only where the
// prospect has none yet, target_job_title / years_of_experience / target_role_categories /
// career_level. Never touches review_status, consent_status or email.
//
// Privacy: email addresses and URLs are stripped from the snippet before it is sent; no
// name, email or other prospect field is sent, only the stripped post text. Output is
// validated in code (allowed segments, real enum values, sizes); invalid JSON is retried
// once, then the prospect is skipped and counted.
//
// LLM: any OpenAI-compatible endpoint, the same one the app uses (LLM_BASE_URL,
// LLM_API_KEY). Model: --model, else LLM_MODEL_PROSPECT_CLASSIFIER, else LLM_MODEL_ENRICH.
// At most 2 requests per second.
//
// Usage: node scripts/prospect-classifier.mjs                  # dry run, 10 unclassified
//        node scripts/prospect-classifier.mjs --limit=25       # dry run, 25
//        node scripts/prospect-classifier.mjs --write          # classify + write all unclassified
//        node scripts/prospect-classifier.mjs --write --limit=50 --reclassify
//   Cost estimate: pass --price-input=<USD per 1M tokens> --price-output=<USD per 1M tokens>
//   (or LLM_PRICE_INPUT_PER_MTOK / LLM_PRICE_OUTPUT_PER_MTOK); otherwise tokens only.
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM_BASE_URL, LLM_API_KEY.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { Agent, setGlobalDispatcher } from 'undici';

// Node's fetch tries IPv6 first and doesn't fall back cleanly on a machine with no IPv6
// route (the LLM host resolves to both and times out with ETIMEDOUT); same documented fix
// as scripts/outbound-dry-run.mjs (nodejs/node#54359, nodejs/undici#2777).
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

/** fetch that retries network-level failures ("fetch failed": connect timeouts, resets) twice
 * with a short backoff. HTTP error statuses are returned as-is, never retried. */
export function withNetworkRetry(fetchImpl, { retries = 2, backoffMs = 1000 } = {}) {
  return async (input, init) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetchImpl(input, init);
      } catch (err) {
        const network = err instanceof TypeError && /fetch failed/i.test(err.message);
        if (!network || attempt >= retries) throw err;
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    }
  };
}
const fetchWithRetry = withNetworkRetry((input, init) => fetch(input, init));

export const SEGMENTS = ['active_job_seeker', 'recent_graduate', 'remote_seeker', 'career_changer', 'laid_off', 'experienced_professional'];
// Must match the DB enums (public.role_category, public.career_level).
export const ROLE_CATEGORIES = ['operations', 'maintenance', 'engineering', 'management', 'executive', 'other'];
export const CAREER_LEVELS = ['entry_mid', 'senior_management', 'director_vp_c_level'];
const REQUEST_INTERVAL_MS = 500; // 2 requests per second
const DRY_RUN_DEFAULT_LIMIT = 10;

// ---------------------------------------------------------------------------
// Snippet sanitizing: the model gets the post text, never contact details or links
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
// "name [at] host [dot] com", "name (at) host.com", "name at-sign host dot net", ":at:"
const OBFUSCATED_EMAIL_RE =
  /[a-z0-9._%+-]+\s*(?:[[({<]\s*(?:at|@|at[- ]?sign|at[- ]?symbol)\s*[\])}>]|:\s*at\s*:|\s(?:at|at[- ]?sign|at[- ]?symbol)\s)\s*[a-z0-9-]+(?:\s*(?:[[({<]\s*(?:dot|\.)\s*[\])}>]|\s+dot\s+|\.)\s*[a-z0-9-]+)+/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
// Lowercase only, so tech names like "ASP.NET" survive; real links in HN posts are full URLs anyway.
const BARE_DOMAIN_LINK_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|me|co|app|ai|xyz|tech|site|page|info)(?:\/[^\s<>"')\]]*)?/g;

export function sanitizeSnippet(text) {
  if (!text) return '';
  return text
    .replace(URL_RE, '[link]')
    .replace(EMAIL_RE, '[email]')
    .replace(OBFUSCATED_EMAIL_RE, '[email]')
    .replace(BARE_DOMAIN_LINK_RE, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * The prompt. demand = [{ category, jobs }] for role categories with many recent jobs in
 * job_hopper_live (computed at startup), so the score reflects what Job-Hopper can match.
 */
export function buildSystemPrompt(demand = []) {
  const demandLine = demand.length
    ? demand.map((d) => `${d.category} (${d.jobs} jobs in the last 30 days)`).join(', ')
    : '(no recent job data; give no demand bonus)';
  return `You assess one public post in which a person describes themselves to potential employers, as a lead for Job-Hopper, a job-matching service.
Return ONLY a JSON object, no prose, no code fences, with exactly these keys:

{
  "segments": string[],
  "needs_sponsorship": true | false | null,
  "contract_or_freelance_only": boolean,
  "clear_target_role": boolean,
  "intent_score": integer,
  "intent_reason": string,
  "target_job_title": string | null,
  "years_of_experience": integer | null,
  "target_role_categories": string[],
  "career_level": string | null
}

segments: zero or more of these exact values, each that clearly applies:
- active_job_seeker: says they are looking for a job / their next role now
- recent_graduate: graduated or finishing a degree/bootcamp within about the last year
- remote_seeker: wants remote work
- career_changer: moving into a different field than their past work
- laid_off: says they were laid off or their role was eliminated
- experienced_professional: 5+ years of professional experience

needs_sponsorship: true ONLY if the post says they need a visa or sponsorship; false ONLY if it says they are authorized to work, a citizen or a permanent resident; otherwise null. Never infer it from location or name.

contract_or_freelance_only: true only if they want contract / freelance / consulting work and NOT a full-time job; false if full-time is acceptable.
clear_target_role: true if the post names a specific kind of role they want (e.g. backend engineer, data analyst); false if it is vague ("open to anything", "any interesting role").

intent_score: lead quality for Job-Hopper. Start at 50, then:
- +15 explicitly wants full-time work and is available now or soon
- +10 laid off, or says the search is urgent
- +15 the target role falls in a role category with many recent Job-Hopper jobs: ${demandLine}
- -10 vague target ("open to anything", unclear role)
- -15 only wants roles outside the US, or only very niche roles
Add up the applicable adjustments and return the integer.

intent_reason: one neutral sentence (max 160 characters) naming the main factors behind the score, e.g. "Full-time, available now, backend engineering role in high demand." No names, emails, links, employers or other personal details.

target_job_title: a normalized, standard job title of 2-4 words, e.g. "Software Engineer", "Backend Engineer", "Embedded Engineer", "Engineering Manager", "Data Scientist", "Product Designer". Map what they want to the closest standard title. Never copy slogans or the poster's own phrasing (not "digital problem solver", not "builder of things"). Include a seniority word only if it's a standard title ("Senior Software Engineer", "Staff Engineer"). null if no role is identifiable.

years_of_experience: only if stated or directly derivable (e.g. "10+ years" -> 10); otherwise null.

target_role_categories: zero or more of: ${ROLE_CATEGORIES.join(', ')} (software and other technical roles -> engineering).

career_level: the Job-Hopper job tier they should be matched to (they only see jobs of this tier):
- entry_mid: entry-level to mid-level individual contributors (roughly under 8 years, no senior/staff/principal/lead title)
- senior_management: senior, staff, principal and lead individual contributors, and managers / team leads
- director_vp_c_level: director, head of, VP and C-level roles
null if unclear.`;
}

/** min / median / max and counts per band (0-39, 40-59, 60-79, 80-100). */
export function scoreDistribution(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const band = (lo, hi) => sorted.filter((x) => x >= lo && x <= hi).length;
  return { n: sorted.length, min: sorted[0], median, max: sorted.at(-1), '0-39': band(0, 39), '40-59': band(40, 59), '60-79': band(60, 79), '80-100': band(80, 100) };
}

export function userMessage(snippet) {
  return `Post:\n"""\n${snippet}\n"""`;
}

// ---------------------------------------------------------------------------
// Validation (the model's output is never trusted)
// ---------------------------------------------------------------------------

/** JSON object from model text: tolerates code fences / text around one object. */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const isStringArrayOf = (v, allowed) => Array.isArray(v) && v.every((x) => typeof x === 'string' && allowed.includes(x));

/** { ok: true, value } with a normalized classification, or { ok: false, errors }. */
export function validateClassification(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['not a JSON object'] };

  if (!isStringArrayOf(raw.segments, SEGMENTS)) errors.push(`segments must only contain: ${SEGMENTS.join(', ')}`);
  if (![true, false, null].includes(raw.needs_sponsorship)) errors.push('needs_sponsorship must be true, false or null');
  if (typeof raw.contract_or_freelance_only !== 'boolean') errors.push('contract_or_freelance_only must be true or false');
  if (typeof raw.clear_target_role !== 'boolean') errors.push('clear_target_role must be true or false');
  // Any integer is accepted here; finalizeClassification clamps it to 0-100.
  if (!Number.isInteger(raw.intent_score)) errors.push('intent_score must be an integer');
  if (typeof raw.intent_reason !== 'string' || !raw.intent_reason.trim() || raw.intent_reason.length > 160) {
    errors.push('intent_reason must be a non-empty string of at most 160 characters');
  } else if (/@|https?:\/\/|www\./i.test(raw.intent_reason)) {
    errors.push('intent_reason must not contain emails or links');
  }
  if (raw.target_job_title !== null) {
    const words = typeof raw.target_job_title === 'string' ? raw.target_job_title.trim().split(/\s+/).filter(Boolean) : [];
    if (words.length < 2 || words.length > 4 || raw.target_job_title.length > 60) {
      errors.push('target_job_title must be a standard job title of 2-4 words, or null');
    }
  }
  if (raw.years_of_experience !== null && (!Number.isInteger(raw.years_of_experience) || raw.years_of_experience < 0 || raw.years_of_experience > 60)) {
    errors.push('years_of_experience must be an integer 0-60 or null');
  }
  if (!isStringArrayOf(raw.target_role_categories, ROLE_CATEGORIES)) errors.push(`target_role_categories must only contain: ${ROLE_CATEGORIES.join(', ')}`);
  if (raw.career_level !== null && !CAREER_LEVELS.includes(raw.career_level)) errors.push(`career_level must be one of ${CAREER_LEVELS.join(', ')} or null`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      segments: [...new Set(raw.segments)],
      needs_sponsorship: raw.needs_sponsorship,
      contract_or_freelance_only: raw.contract_or_freelance_only,
      clear_target_role: raw.clear_target_role,
      intent_score: raw.intent_score,
      intent_reason: raw.intent_reason.trim(),
      target_job_title: raw.target_job_title === null ? null : titleCase(raw.target_job_title.trim().replace(/\s+/g, ' ')),
      years_of_experience: raw.years_of_experience,
      target_role_categories: [...new Set(raw.target_role_categories)],
      career_level: raw.career_level,
    },
  };
}

const SMALL_WORDS = new Set(['of', 'and', 'for', 'the', 'in', 'to', 'a']);
const KEEP_UPPER = /^(?:AI|ML|QA|UX|UI|iOS|SRE|DevOps|IT|VP|CTO|CEO|CFO|COO|CPO|SDET|GIS)$/i;
/** "embedded engineer" -> "Embedded Engineer"; keeps acronyms (ML, QA, SRE, iOS, DevOps). */
export function titleCase(title) {
  return title
    .split(' ')
    .map((w, i) => {
      const known = w.match(KEEP_UPPER);
      if (known) return { ios: 'iOS', devops: 'DevOps' }[w.toLowerCase()] ?? w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export const CONTRACT_ONLY_CAP = 30;
export const NO_TARGET_CAP = 60;
const SENIOR_TITLE_RE = /\b(?:senior|sr\.?|staff|principal|lead|head|director)\b/i;

function withNote(reason, note) {
  const suffix = ` (${note})`;
  return reason.length + suffix.length <= 160 ? reason + suffix : `${reason.slice(0, 160 - suffix.length - 1).trimEnd()}…${suffix}`;
}

/**
 * Code-side rules applied after the model answers (the model's own score and level are not
 * trusted on these points): contract/freelance only caps the score at 30; no clear target
 * role (flagged false, or no title) caps it at 60; the score is clamped to 0-100; and 8+ years
 * or a senior/staff/principal/lead/head/director title can't be the lowest tier (entry_mid ->
 * senior_management). Returns the adjusted value and the rules that fired.
 */
export function finalizeClassification(value) {
  const applied = [];
  let score = Math.max(0, Math.min(100, value.intent_score));
  if (score !== value.intent_score) applied.push('clamped');
  if (value.contract_or_freelance_only && score > CONTRACT_ONLY_CAP) {
    score = CONTRACT_ONLY_CAP;
    applied.push('contract_cap');
  }
  if ((!value.clear_target_role || value.target_job_title == null) && score > NO_TARGET_CAP) {
    score = NO_TARGET_CAP;
    applied.push('no_target_cap');
  }
  let careerLevel = value.career_level;
  const seniorSignal = (value.years_of_experience ?? 0) >= 8 || SENIOR_TITLE_RE.test(value.target_job_title ?? '');
  if (seniorSignal && careerLevel === 'entry_mid') {
    careerLevel = 'senior_management';
    applied.push('seniority_floor');
  }
  let reason = value.intent_reason;
  if (applied.includes('contract_cap')) reason = withNote(reason, 'capped: contract/freelance only');
  else if (applied.includes('no_target_cap')) reason = withNote(reason, 'capped: no clear target role');
  return { value: { ...value, intent_score: score, career_level: careerLevel, intent_reason: reason }, applied };
}

/**
 * One classification: call, validate, retry once on invalid output (with the errors fed back),
 * then give up. callModel(messages) -> { text, usage? }. Returns { ok, value?, errors?, calls, usage }.
 */
export async function classifySnippet(callModel, snippet, { demand = [] } = {}) {
  const messages = [{ role: 'system', content: buildSystemPrompt(demand) }, { role: 'user', content: userMessage(snippet) }];
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await callModel(messages);
    usage.prompt_tokens += res.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += res.usage?.completion_tokens ?? 0;
    const parsed = extractJson(res.text);
    const result = parsed ? validateClassification(parsed) : { ok: false, errors: ['invalid JSON'] };
    if (result.ok) {
      const { value, applied } = finalizeClassification(result.value);
      return { ok: true, value, applied, calls: attempt, usage };
    }
    lastErrors = result.errors;
    messages.push(
      { role: 'assistant', content: String(res.text ?? '') },
      { role: 'user', content: `That output was invalid (${lastErrors.join('; ')}). Return ONLY the corrected JSON object.` },
    );
  }
  return { ok: false, errors: lastErrors, calls: 2, usage };
}

/** Update for one prospect: classification fields always; profile-ish fields only where null. */
export function buildUpdate(prospect, value, model, now = new Date().toISOString()) {
  const update = {
    segments: value.segments,
    needs_sponsorship: value.needs_sponsorship,
    intent_score: value.intent_score,
    intent_reason: value.intent_reason,
    classified_at: now,
    classifier_model: model,
  };
  if (prospect.target_job_title == null && value.target_job_title) update.target_job_title = value.target_job_title;
  if (prospect.years_of_experience == null && value.years_of_experience != null) update.years_of_experience = value.years_of_experience;
  if ((prospect.target_role_categories == null || prospect.target_role_categories.length === 0) && value.target_role_categories.length) {
    update.target_role_categories = value.target_role_categories;
  }
  if (prospect.career_level == null && value.career_level) update.career_level = value.career_level;
  return update;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function argValue(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

function makeModelCaller({ baseUrl, apiKey, model }) {
  let lastRequestAt = 0;
  return async (messages) => {
    const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const res = await fetchWithRetry(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 500 }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
    const data = JSON.parse(body);
    return { text: data.choices?.[0]?.message?.content ?? '', usage: data.usage };
  };
}

async function loadProspects(supabase, { reclassify, limit }) {
  let query = supabase
    .from('prospects')
    .select('id, target_job_title, years_of_experience, target_role_categories, career_level, classified_at')
    .order('created_at', { ascending: true });
  if (!reclassify) query = query.is('classified_at', null);
  if (limit != null) query = query.limit(limit);
  const { data: prospects, error } = await query;
  if (error) throw new Error(`Failed to load prospects: ${error.message}`);
  if (!prospects.length) return [];

  const latest = new Map();
  for (let i = 0; i < prospects.length; i += 200) {
    const ids = prospects.slice(i, i + 200).map((p) => p.id);
    const { data, error: evError } = await supabase
      .from('prospect_evidence')
      .select('prospect_id, snippet, found_at')
      .in('prospect_id', ids)
      .order('found_at', { ascending: false });
    if (evError) throw new Error(`Failed to load evidence: ${evError.message}`);
    for (const e of data) if (!latest.has(e.prospect_id)) latest.set(e.prospect_id, e.snippet);
  }
  return prospects.map((p) => ({ ...p, snippet: latest.get(p.id) ?? null }));
}

/** Role categories with many recent jobs: job_hopper_live rows created in the last 30 days, per
 * category; "many" = at least half the busiest category's count. */
export function topDemandCategories(counts) {
  const max = Math.max(0, ...counts.map((c) => c.jobs));
  if (max === 0) return [];
  return counts.filter((c) => c.jobs > 0 && c.jobs >= max / 2).sort((a, b) => b.jobs - a.jobs);
}

async function loadDemand(supabase) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const counts = [];
  for (const category of ROLE_CATEGORIES) {
    const { count, error } = await supabase
      .from('job_hopper_live')
      .select('id', { count: 'exact', head: true })
      .eq('role_category', category)
      .gte('created_at', since);
    if (error) throw new Error(`Failed to count job_hopper_live (${category}): ${error.message}`);
    counts.push({ category, jobs: count ?? 0 });
  }
  return { counts, top: topDemandCategories(counts) };
}

async function countTarget(supabase, reclassify) {
  let query = supabase.from('prospects').select('id', { count: 'exact', head: true });
  if (!reclassify) query = query.is('classified_at', null);
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count prospects: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const write = process.argv.includes('--write');
  const reclassify = process.argv.includes('--reclassify');
  const limitArg = argValue('limit');
  const limit = limitArg != null ? Number(limitArg) : write ? null : DRY_RUN_DEFAULT_LIMIT;
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  const model = argValue('model') ?? process.env.LLM_MODEL_PROSPECT_CLASSIFIER ?? process.env.LLM_MODEL_ENRICH;
  if (!model) throw new Error('No model: pass --model or set LLM_MODEL_PROSPECT_CLASSIFIER');
  const priceIn = Number(argValue('price-input') ?? process.env.LLM_PRICE_INPUT_PER_MTOK ?? NaN);
  const priceOut = Number(argValue('price-output') ?? process.env.LLM_PRICE_OUTPUT_PER_MTOK ?? NaN);

  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
    global: { fetch: fetchWithRetry },
  });
  const callModel = makeModelCaller({ baseUrl: requireEnv('LLM_BASE_URL'), apiKey: requireEnv('LLM_API_KEY'), model });

  const demand = await loadDemand(supabase);
  console.log(`Recent jobs per role category (job_hopper_live, last 30 days): ${demand.counts.map((c) => `${c.category} ${c.jobs}`).join(', ')}`);
  console.log(`High-demand categories passed to the prompt: ${demand.top.map((c) => c.category).join(', ') || '(none)'}`);
  const totalTarget = await countTarget(supabase, reclassify);
  const prospects = await loadProspects(supabase, { reclassify, limit });
  console.log(`${write ? 'WRITE' : 'DRY RUN (nothing written; pass --write)'}: ${prospects.length} of ${totalTarget} ${reclassify ? 'prospects (reclassify)' : 'unclassified prospects'}, model "${model}"`);

  const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  const counts = { classified: 0, written: 0, skipped_invalid: 0, skipped_no_evidence: 0, llm_errors: 0 };
  const scores = [];
  let index = 0;
  for (const prospect of prospects) {
    index += 1;
    const snippet = sanitizeSnippet(prospect.snippet);
    if (!snippet) {
      counts.skipped_no_evidence += 1;
      continue;
    }
    let result;
    try {
      result = await classifySnippet(callModel, snippet, { demand: demand.top });
    } catch (err) {
      counts.llm_errors += 1;
      console.log(`  #${index}: LLM error: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    usage.prompt_tokens += result.usage.prompt_tokens;
    usage.completion_tokens += result.usage.completion_tokens;
    usage.calls += result.calls;
    if (!result.ok) {
      counts.skipped_invalid += 1;
      console.log(`  #${index}: skipped, invalid output after retry (${result.errors.join('; ')})`);
      continue;
    }
    counts.classified += 1;
    scores.push(result.value.intent_score);
    const update = buildUpdate(prospect, result.value, model);
    if (!write) {
      const v = result.value;
      console.log(`  #${index} ${JSON.stringify({
        score: v.intent_score, rules: result.applied, title: v.target_job_title, years: v.years_of_experience,
        level: v.career_level, roles: v.target_role_categories, segments: v.segments, sponsorship: v.needs_sponsorship,
        contract_only: v.contract_or_freelance_only, clear_target: v.clear_target_role, reason: v.intent_reason,
      })}`);
      continue;
    }
    const { error } = await supabase.from('prospects').update(update).eq('id', prospect.id);
    if (error) throw new Error(`Failed to update prospect ${prospect.id}: ${error.message}`);
    counts.written += 1;
  }

  console.log('\nCounts:', JSON.stringify(counts));
  if (scores.length) console.log('Score distribution:', JSON.stringify(scoreDistribution(scores)));
  const attempted = counts.classified + counts.skipped_invalid;
  if (attempted > 0) {
    const perIn = usage.prompt_tokens / attempted;
    const perOut = usage.completion_tokens / attempted;
    const estIn = Math.round(perIn * totalTarget);
    const estOut = Math.round(perOut * totalTarget);
    console.log(`Tokens this run: ${usage.prompt_tokens} in / ${usage.completion_tokens} out over ${usage.calls} calls` +
      (usage.prompt_tokens === 0 ? ' (the endpoint returned no usage data)' : ''));
    console.log(`Estimate for all ${totalTarget} ${reclassify ? '' : 'unclassified '}prospects: ~${estIn} in / ~${estOut} out tokens`);
    if (Number.isFinite(priceIn) && Number.isFinite(priceOut)) {
      const cost = (estIn * priceIn + estOut * priceOut) / 1e6;
      console.log(`Estimated cost: $${cost.toFixed(4)} (at $${priceIn}/1M in, $${priceOut}/1M out)`);
    } else {
      console.log('Estimated cost: price unknown (pass --price-input / --price-output in USD per 1M tokens)');
    }
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
