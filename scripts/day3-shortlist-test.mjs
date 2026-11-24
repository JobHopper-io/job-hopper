// Growth day 3 dry run: reverse-recruiting shortlists for approved prospects.
//
//   deno run --allow-net --allow-env --allow-read --allow-write --node-modules-dir=none \
//     --env-file=.env.local scripts/day3-shortlist-test.mjs
//
// Runs under Deno (not Node): the matcher imports location data from esm.sh, like the edge
// functions it shares code with. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// READ-ONLY on hosted: it selects prospects, jobs, the live matching config and synonyms, and
// writes nothing back. Vacancy checks go to the employers' ATS (1 req/s per host, 10s timeout).
// Results: docs/growth/day3-test-results.md (prospect ids only, no names or emails).
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { fetchJobRecordsForMatching } from '../supabase/functions/_shared/fetch-jobs-for-matching.ts';
import { fetchMatchSynonymsForMatching } from '../supabase/functions/_shared/fetch-match-synonyms.ts';
import { configRowToOverride } from '../supabase/functions/_shared/matching-algorithm-config-row.ts';
import { mergeConfigOverrides } from '../supabase/functions/_shared/merge-match-config.ts';
import {
  PROSPECT_MATCHING_SELECT,
  configForWindow,
  matchingContext,
  matchJobsForProspect,
} from '../supabase/functions/_shared/prospect-matching.ts';
import { createVacancyVerifier } from '../supabase/functions/_shared/job-vacancy.ts';
import { SHORTLIST_MIN, assembleShortlist, verifyUntilEnough } from '../supabase/functions/_shared/prospect-shortlist.ts';

const SAMPLE_SIZE = 20;
const WINDOW_DAYS = 60;
const OUT = 'docs/growth/day3-test-results.md';

const env = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

/** Up to `size` prospects, alternating levels and preferring titles not yet picked. */
export function pickVaried(prospects, size) {
  const norm = (t) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const byLevel = new Map();
  for (const p of [...prospects].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byLevel.has(p.career_level)) byLevel.set(p.career_level, []);
    byLevel.get(p.career_level).push(p);
  }
  const levels = [...byLevel.keys()].sort();
  const picked = [];
  const seenTitles = new Set();
  for (const pass of ['new_titles', 'any']) {
    let progress = true;
    while (picked.length < size && progress) {
      progress = false;
      for (const level of levels) {
        if (picked.length >= size) break;
        const queue = byLevel.get(level);
        const i = queue.findIndex((p) => pass === 'any' || !seenTitles.has(norm(p.target_job_title)));
        if (i === -1) continue;
        const [p] = queue.splice(i, 1);
        seenTitles.add(norm(p.target_job_title));
        picked.push(p);
        progress = true;
      }
    }
  }
  return picked;
}

async function main() {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const { data: approved, error } = await db
    .from('prospects')
    .select(PROSPECT_MATCHING_SELECT)
    .eq('kind', 'job_seeker')
    .eq('review_status', 'approved')
    .not('career_level', 'is', null);
  if (error) throw new Error(`prospects: ${error.message}`);
  const sample = pickVaried(approved, SAMPLE_SIZE);
  console.log(`approved with a level: ${approved.length}; sampled ${sample.length}`);

  const { data: cfgRow, error: cfgError } = await db
    .from('matching_algorithm_config').select('*').eq('active', true).eq('archived', false).maybeSingle();
  if (cfgError) throw new Error(`matching_algorithm_config: ${cfgError.message}`);
  const ctx = matchingContext(cfgRow ? mergeConfigOverrides(configRowToOverride(cfgRow), null) : null, await fetchMatchSynonymsForMatching(db));

  const jobsByLevel = new Map();
  for (const level of new Set(sample.map((p) => p.career_level))) {
    const prefs = {
      subscriptionTierProductKeys: [level], roles: [], targetJobTitle: null, currentJobTitle: null, currentIndustry: null,
      payRangeMin: null, payRangeMax: null, preferredLocations: [], openToRelocation: null, openToRemote: null, locationRadiusMiles: null,
    };
    jobsByLevel.set(level, await fetchJobRecordsForMatching(db, prefs, configForWindow(ctx, WINDOW_DAYS)));
  }

  const verifier = createVacancyVerifier();
  const cache = new Map(); // apply link -> VacancyResult (one check per job across prospects)
  const verify = async (job) => {
    const key = job.applyLink ?? `no-link:${job.id}`;
    if (!cache.has(key)) cache.set(key, await verifier.verify(job.applyLink));
    return cache.get(key);
  };

  const rows = [];
  for (const p of sample) {
    const match = matchJobsForProspect(p, jobsByLevel.get(p.career_level), ctx, { windowDays: WINDOW_DAYS });
    if (match.status === 'skipped') {
      rows.push({ p, skipped: match.reason });
      continue;
    }
    const checked = await verifyUntilEnough(match.candidates, verify);
    const count = (s) => checked.filter((c) => c.vacancy.status === s).length;
    const shortlist = assembleShortlist(p, checked);
    rows.push({ p, matched: match.totalMatched, candidates: match.candidates.length, checked: checked.length, open: count('open'), closed: count('closed'), unverified: count('unverified'), shortlist });
    console.log(`${p.id}  matched=${match.totalMatched} open=${count('open')} closed=${count('closed')} unverified=${count('unverified')} shortlist=${shortlist.items.length}`);
  }

  const hostStats = new Map();
  for (const r of cache.values()) {
    const h = hostStats.get(r.host) ?? { open: 0, closed: 0, unverified: 0 };
    h[r.status]++;
    hostStats.set(r.host, h);
  }

  const md = render({ sample, rows, hostStats, ctx, jobsByLevel, approvedCount: approved.length });
  await Deno.writeTextFile(OUT, md);
  console.log(`\nwrote ${OUT}\n`);
  console.log(md.split('## Per prospect')[0]);
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');

export function render({ sample, rows, hostStats, ctx, jobsByLevel, approvedCount }) {
  const done = rows.filter((r) => !r.skipped);
  const sum = (k) => done.reduce((a, r) => a + r[k], 0);
  const reach3 = done.filter((r) => r.open >= SHORTLIST_MIN).length;
  const lines = [];
  lines.push('# Day 3 reverse-recruiting dry run', '');
  lines.push(`Generated ${new Date().toISOString()} by \`scripts/day3-shortlist-test.mjs\` (read-only against hosted; nothing written back).`, '');
  lines.push(`- Sample: ${sample.length} of ${approvedCount} approved job-seeker prospects that have a career level, picked for variety in title and level.`);
  lines.push(`- Matcher: live \`matching_algorithm_config\` (min score ${configForWindow(ctx, WINDOW_DAYS).thresholds?.minTotalScore ?? 'default'}) with a ${WINDOW_DAYS}-day window; top 10 candidates per prospect.`);
  lines.push(`- Jobs in the window by level: ${[...jobsByLevel].map(([l, j]) => `${l} ${j.length}`).join(', ')}. Note: job ingestion has been stopped since 2026-11-12 (LLM provider outage), so recent weeks are thin.`);
  lines.push('- Verification: candidates checked in score order until 5 are verified open or candidates run out. Indeed, Workday, ADP and unknown hosts are not checkable and count as unverified, so they never reach a shortlist.', '');
  lines.push('## Summary', '');
  lines.push('| | Total |', '|---|---|');
  lines.push(`| Prospects run | ${done.length} (skipped ${rows.length - done.length}) |`);
  lines.push(`| Jobs matched (all, before top-10 cut) | ${sum('matched')} |`);
  lines.push(`| Candidates verified | ${sum('checked')} |`);
  lines.push(`| Verified open | ${sum('open')} |`);
  lines.push(`| Closed | ${sum('closed')} |`);
  lines.push(`| Unverified | ${sum('unverified')} |`);
  lines.push(`| Prospects with 3+ verified-open jobs | **${reach3} / ${done.length}** |`);
  lines.push(`| Shortlist sizes | ${[0, 1, 2, 3, 4, 5].map((k) => `${k}: ${done.filter((r) => r.shortlist.items.length === k).length}`).join(', ')} |`, '');
  lines.push('## Closed-job rate by host', '', 'Unique apply links checked (a job shared by several prospects is checked once). Closed rate = closed / (open + closed).', '');
  lines.push('| Host | Open | Closed | Unverified | Closed rate |', '|---|---|---|---|---|');
  for (const [h, s] of [...hostStats].sort((a, b) => (b[1].open + b[1].closed + b[1].unverified) - (a[1].open + a[1].closed + a[1].unverified))) {
    lines.push(`| ${h} | ${s.open} | ${s.closed} | ${s.unverified} | ${pct(s.closed, s.open + s.closed)} |`);
  }
  lines.push('', '## Per prospect', '');
  lines.push('| Prospect | Level | Target title | Matched | Checked | Open | Closed | Unverified | Shortlist |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const t = (r.p.target_job_title ?? '').replace(/\|/g, '/');
    if (r.skipped) lines.push(`| \`${r.p.id}\` | ${r.p.career_level ?? '–'} | ${t} | skipped: ${r.skipped} | | | | | |`);
    else lines.push(`| \`${r.p.id}\` | ${r.p.career_level} | ${t} | ${r.matched} | ${r.checked} | ${r.open} | ${r.closed} | ${r.unverified} | ${r.shortlist.items.length} |`);
  }
  lines.push('', '## Shortlists', '');
  for (const r of done.filter((x) => x.shortlist.items.length)) {
    lines.push(`### \`${r.p.id}\` (${r.p.target_job_title}, ${r.p.career_level}) — ${r.shortlist.status}`, '');
    for (const i of r.shortlist.items) {
      lines.push(`- **${i.title}** — ${i.company}, ${i.location ?? 'location not listed'} · posted ${i.postedDate?.slice(0, 10) ?? 'unknown'} · [apply](${i.applyLink}) · verified ${i.vacancy.method} ${i.vacancy.httpStatus}`);
      for (const b of i.bullets) lines.push(`  - ${b}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (import.meta.main) await main();
