#!/usr/bin/env node
// Classifies prospects from their latest evidence snippet with one LLM call each:
// segments, needs_sponsorship, intent_score (0-100), intent_reason, and, only where the
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

export const SYSTEM_PROMPT = `You classify one public post in which a person describes themselves to potential employers.
Return ONLY a JSON object, no prose, no code fences, with exactly these keys:

{
  "segments": string[],                 // zero or more of: ${SEGMENTS.join(', ')}
  "needs_sponsorship": true | false | null,
  "intent_score": integer 0-100,
  "intent_reason": string,              // one sentence, max 160 characters
  "target_job_title": string | null,
  "years_of_experience": integer | null,
  "target_role_categories": string[],   // zero or more of: ${ROLE_CATEGORIES.join(', ')}
  "career_level": string | null         // one of: ${CAREER_LEVELS.join(', ')}, or null
}

Segments (use only these exact values; include each that clearly applies):
- active_job_seeker: says they are looking for a job / their next role now
- recent_graduate: graduated or finishing a degree/bootcamp within about the last year
- remote_seeker: wants remote work
- career_changer: moving into a different field than their past work
- laid_off: says they were laid off or their role was eliminated
- experienced_professional: 5+ years of professional experience

needs_sponsorship: true ONLY if the post says they need a visa or sponsorship; false ONLY if it says they are authorized to work, a citizen or a permanent resident; otherwise null. Do not infer it from location or name.

intent_score rubric (how actively and concretely they are seeking a job):
- 80-100: explicitly looking for work now, with specifics (target role, availability or start date, location/remote preference, stack)
- 50-79: clearly looking, but fewer specifics
- 25-49: vague, or only "open to offers / opportunities"
- 0-24: freelance or contract only, an agency or company advertising services, or not actually seeking a job

intent_reason: one neutral sentence about their job-seeking intent. No names, emails, links, employers or other personal details.

target_job_title: the role they want, as a short job title, or null if not stated.
years_of_experience: only if stated or directly derivable (e.g. "10+ years" -> 10); otherwise null.
target_role_categories: the categories their target role falls in (software and other technical roles -> engineering); [] if unclear.
career_level: entry_mid for junior to senior individual contributors; senior_management for managers / senior leaders; director_vp_c_level for director, VP or C-level; null if unclear.`;

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
  if (!Number.isInteger(raw.intent_score) || raw.intent_score < 0 || raw.intent_score > 100) errors.push('intent_score must be an integer 0-100');
  if (typeof raw.intent_reason !== 'string' || !raw.intent_reason.trim() || raw.intent_reason.length > 160) {
    errors.push('intent_reason must be a non-empty string of at most 160 characters');
  } else if (/@|https?:\/\/|www\./i.test(raw.intent_reason)) {
    errors.push('intent_reason must not contain emails or links');
  }
  if (raw.target_job_title !== null && (typeof raw.target_job_title !== 'string' || !raw.target_job_title.trim() || raw.target_job_title.length > 120)) {
    errors.push('target_job_title must be a short string or null');
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
      intent_score: raw.intent_score,
      intent_reason: raw.intent_reason.trim(),
      target_job_title: raw.target_job_title?.trim() ?? null,
      years_of_experience: raw.years_of_experience,
      target_role_categories: [...new Set(raw.target_role_categories)],
      career_level: raw.career_level,
    },
  };
}

/**
 * One classification: call, validate, retry once on invalid output (with the errors fed back),
 * then give up. callModel(messages) -> { text, usage? }. Returns { ok, value?, errors?, calls, usage }.
 */
export async function classifySnippet(callModel, snippet) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(snippet) }];
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await callModel(messages);
    usage.prompt_tokens += res.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += res.usage?.completion_tokens ?? 0;
    const parsed = extractJson(res.text);
    const result = parsed ? validateClassification(parsed) : { ok: false, errors: ['invalid JSON'] };
    if (result.ok) return { ok: true, value: result.value, calls: attempt, usage };
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
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
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

  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const callModel = makeModelCaller({ baseUrl: requireEnv('LLM_BASE_URL'), apiKey: requireEnv('LLM_API_KEY'), model });

  const totalTarget = await countTarget(supabase, reclassify);
  const prospects = await loadProspects(supabase, { reclassify, limit });
  console.log(`${write ? 'WRITE' : 'DRY RUN (nothing written; pass --write)'}: ${prospects.length} of ${totalTarget} ${reclassify ? 'prospects (reclassify)' : 'unclassified prospects'}, model "${model}"`);

  const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  const counts = { classified: 0, written: 0, skipped_invalid: 0, skipped_no_evidence: 0, llm_errors: 0 };
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
      result = await classifySnippet(callModel, snippet);
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
    const update = buildUpdate(prospect, result.value, model);
    if (!write) {
      console.log(`  #${index} ${JSON.stringify({ ...result.value, would_fill: Object.keys(update).filter((k) => ['target_job_title', 'years_of_experience', 'target_role_categories', 'career_level'].includes(k)) })}`);
      continue;
    }
    const { error } = await supabase.from('prospects').update(update).eq('id', prospect.id);
    if (error) throw new Error(`Failed to update prospect ${prospect.id}: ${error.message}`);
    counts.written += 1;
  }

  console.log('\nCounts:', JSON.stringify(counts));
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
