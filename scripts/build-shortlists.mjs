// Builds reverse-recruiting shortlists for approved job-seeker prospects (growth day 3).
//
//   deno run --allow-net --allow-env --allow-read --node-modules-dir=none \
//     --env-file=.env.local scripts/build-shortlists.mjs [--write] [--window-days=N] [--rebuild]
//
// Runs under Deno (the matcher imports location data from esm.sh). Needs SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY.
//
// For each approved job seeker with a career level: match (live config; --window-days
// overrides the live max age), verify candidates in score order until 5 are open, then
// apply the shortlist policy (open first, then likely_open posted within 21 days; never
// closed, unverified or Indeed; 3-5 jobs = 'ready'). 'too_few' shortlists are saved too,
// for reporting, but are never sent (scripts/outbound-live-send.mjs enrolls only ready,
// unexpired ones) or shown (the shortlist function 404s them).
//
// Vacancy results are cached in job_vacancy_checks: a job's latest check is reused for
// 24h, otherwise the job is rechecked (1 req/s per host).
//
// --dry-run is the default: it reads, checks vacancies and prints what it would save,
// writing nothing. --write inserts prospect_shortlists and job_vacancy_checks rows.
// Prospects that already have an unexpired shortlist are skipped unless --rebuild.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { fetchJobRecordsForMatching } from '../supabase/functions/_shared/fetch-jobs-for-matching.ts';
import { fetchMatchSynonymsForMatching } from '../supabase/functions/_shared/fetch-match-synonyms.ts';
import { configRowToOverride } from '../supabase/functions/_shared/matching-algorithm-config-row.ts';
import { mergeConfigOverrides } from '../supabase/functions/_shared/merge-match-config.ts';
import {
  PROSPECT_MATCHING_SELECT,
  configForWindow,
  matchJobsForProspect,
  matchingContext,
} from '../supabase/functions/_shared/prospect-matching.ts';
import { atsHost, createVacancyVerifier, isFreshCheck, latestCheckByJob } from '../supabase/functions/_shared/job-vacancy.ts';
import {
  assembleShortlist,
  newShortlistToken,
  shortlistSnapshot,
  verifyUntilEnough,
} from '../supabase/functions/_shared/prospect-shortlist.ts';

const arg = (name) => Deno.args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const write = Deno.args.includes('--write');
const rebuild = Deno.args.includes('--rebuild');
const windowDays = arg('window-days') ? Number(arg('window-days')) : undefined;
if (windowDays !== undefined && !(windowDays > 0)) throw new Error('--window-days must be a positive number');

const env = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

/** A stored job_vacancy_checks row as a VacancyResult. */
export function fromStoredCheck(row, applyLink) {
  let host = 'none';
  try {
    host = atsHost(new URL(applyLink ?? '').hostname);
  } catch { /* no usable link */ }
  return { status: row.status, method: row.method, httpStatus: row.http_status, checkedAt: row.checked_at, host, detail: 'cached' };
}

async function latestChecks(db, jobIds) {
  const rows = [];
  for (let i = 0; i < jobIds.length; i += 200) {
    rows.push(...must(
      await db.from('job_vacancy_checks').select('job_id, status, method, http_status, checked_at').in('job_id', jobIds.slice(i, i + 200)),
      'job_vacancy_checks',
    ));
  }
  return latestCheckByJob(rows);
}

async function main() {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const now = new Date();
  console.log(write ? 'WRITE mode: shortlists and vacancy checks will be saved.' : 'DRY RUN (default): nothing is written. Pass --write to save.');

  const prospects = must(
    await db.from('prospects').select(PROSPECT_MATCHING_SELECT).eq('kind', 'job_seeker').eq('review_status', 'approved').order('id'),
    'prospects',
  );
  const existing = must(
    await db.from('prospect_shortlists').select('prospect_id').gt('expires_at', now.toISOString()),
    'prospect_shortlists',
  );
  const hasLive = new Set(existing.map((r) => r.prospect_id));

  const cfgRow = must(await db.from('matching_algorithm_config').select('*').eq('active', true).eq('archived', false).maybeSingle(), 'matching_algorithm_config');
  const ctx = matchingContext(cfgRow ? mergeConfigOverrides(configRowToOverride(cfgRow), null) : null, await fetchMatchSynonymsForMatching(db));
  const window = windowDays ?? ctx.liveMaxAgeDays;
  console.log(`approved job seekers: ${prospects.length}; window: ${window} days${windowDays ? '' : ' (live max age)'}`);

  const results = [];
  const toBuild = [];
  for (const p of prospects) {
    if (!rebuild && hasLive.has(p.id)) results.push({ id: p.id, outcome: 'skipped_existing' });
    else toBuild.push(p);
  }

  const jobsByLevel = new Map();
  const matched = [];
  for (const p of toBuild) {
    if (p.career_level && !jobsByLevel.has(p.career_level)) {
      const prefs = {
        subscriptionTierProductKeys: [p.career_level], roles: [], targetJobTitle: null, currentJobTitle: null, currentIndustry: null,
        payRangeMin: null, payRangeMax: null, preferredLocations: [], openToRelocation: null, openToRemote: null, locationRadiusMiles: null,
      };
      jobsByLevel.set(p.career_level, await fetchJobRecordsForMatching(db, prefs, configForWindow(ctx, window)));
    }
    const m = matchJobsForProspect(p, jobsByLevel.get(p.career_level) ?? [], ctx, { windowDays: window });
    if (m.status === 'skipped') results.push({ id: p.id, outcome: `skipped_${m.reason}` });
    else matched.push({ p, m });
  }

  // Vacancy cache: reuse a check younger than 24h; otherwise check now (and store it with --write).
  const cached = await latestChecks(db, [...new Set(matched.flatMap(({ m }) => m.candidates.map((c) => c.id)))]);
  const verifier = createVacancyVerifier();
  const thisRun = new Map();
  const newChecks = [];
  let reused = 0;
  const verify = async (job) => {
    if (thisRun.has(job.id)) return thisRun.get(job.id);
    const stored = cached.get(job.id);
    let result;
    if (stored && isFreshCheck(stored, now.getTime())) {
      result = fromStoredCheck(stored, job.applyLink);
      reused += 1;
    } else {
      result = await verifier.verify(job.applyLink);
      newChecks.push({ job_id: job.id, status: result.status, method: result.method, http_status: result.httpStatus, checked_at: result.checkedAt });
      if (write) must(await db.from('job_vacancy_checks').insert(newChecks.at(-1)), 'insert job_vacancy_checks');
    }
    thisRun.set(job.id, result);
    return result;
  };

  const rows = [];
  for (const { p, m } of matched) {
    const shortlist = assembleShortlist(p, await verifyUntilEnough(m.candidates, verify), now.getTime());
    rows.push({ prospect_id: p.id, token: newShortlistToken(), jobs: shortlistSnapshot(shortlist.items), status: shortlist.status });
    results.push({ id: p.id, outcome: shortlist.status, matched: m.totalMatched, jobs: shortlist.items.length });
    console.log(`${p.id}  ${shortlist.status.padEnd(7)}  matched=${m.totalMatched}  shortlist=${shortlist.items.length}`);
  }

  if (write && rows.length) must(await db.from('prospect_shortlists').insert(rows), 'insert prospect_shortlists');

  const count = (o) => results.filter((r) => r.outcome === o).length;
  console.log(`\n${write ? 'Saved' : 'Would save'}: ${count('ready')} ready, ${count('too_few')} too_few.`);
  console.log(`Skipped: ${count('skipped_existing')} with an unexpired shortlist${rebuild ? '' : ' (--rebuild to redo)'}, ${count('skipped_no_level')} without a career level.`);
  console.log(`Vacancy checks: ${newChecks.length} new${write ? ' (stored)' : ' (not stored: dry run)'}, ${reused} reused from the last 24h.`);
}

if (import.meta.main) await main();
