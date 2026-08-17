#!/usr/bin/env node
// Deletes stale apollo_career_partner rows left behind by retuning career_coach and
// training_provider's search keyword tags. The upsert-by-organization_name pattern
// only ever inserts/updates — it never removes a row that no longer matches under
// retuned tags, so rows found only by the pre-retune keyword set were still sitting in
// institutional_leads alongside the fresh ones (confirmed: "Helix Tech IT Services",
// excluded under the new career_coach tags, was still present with its original
// pre-retune keyword_tags).
//
// Staleness is determined by direct content comparison: a row is stale if its
// signals.keyword_tags doesn't match CATEGORY_KEYWORDS[category] (imported directly
// from career-partner-connector.mjs, so this can't drift out of sync with whatever the
// current tags actually are).
//
// NOT timestamp-based, despite that being the original plan. Verified directly against
// the live schema (`select * from pg_trigger where tgrelid = 'institutional_leads'::
// regclass` -> zero rows): institutional_leads has no update trigger, so updated_at is
// only set once at INSERT and never bumped by a later upsert UPDATE. A row inserted by
// the original unfiltered run and later content-overwritten by a retuned search
// carries fresh keyword_tags but a stale updated_at — the two signals disagree, and
// updated_at is the wrong one to trust. (An earlier version of this script computed a
// timestamp cutoff and cross-checked it against tag comparison; the two disagreed on
// the very first run, which is what surfaced this.)
//
// Dry-run by default: lists every row that would be deleted. Pass --confirm to actually
// delete. Only ever touches source='apollo_career_partner', category in the two
// retuned categories — nothing else in institutional_leads is in scope.
//
// Usage: node scripts/career-partner-cleanup.mjs           (dry run)
//        node scripts/career-partner-cleanup.mjs --confirm  (actually deletes)

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { CATEGORY_KEYWORDS } from './career-partner-connector.mjs';

const RETUNED_CATEGORIES = ['career_coach', 'training_provider'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sameTags(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const confirm = process.argv.includes('--confirm');

  const { data: rows, error } = await supabase
    .from('institutional_leads')
    .select('id, organization_name, signals, updated_at')
    .eq('source', 'apollo_career_partner')
    .eq('category', 'career_partner');
  if (error) throw new Error(`Failed to query institutional_leads: ${error.message}`);

  const toDelete = [];

  for (const category of RETUNED_CATEGORIES) {
    const currentTags = CATEGORY_KEYWORDS[category];
    const categoryRows = rows.filter((r) => r.signals?.search_category === category);
    const fresh = categoryRows.filter((r) => sameTags(r.signals?.keyword_tags, currentTags));
    const stale = categoryRows.filter((r) => !sameTags(r.signals?.keyword_tags, currentTags));

    console.log(
      `"${category}": ${categoryRows.length} total, ${fresh.length} match current tags ` +
        `${JSON.stringify(currentTags)}, ${stale.length} stale (old tags)`,
    );

    toDelete.push(...stale.map((r) => ({ ...r, _category: category })));
  }

  if (!toDelete.length) {
    console.log('\nNothing to delete.');
    return;
  }

  console.log(`\n--- ${toDelete.length} row(s) would be deleted ---`);
  for (const r of toDelete) {
    console.log(
      `[${r._category}] ${r.organization_name} — updated_at=${r.updated_at} — old tags: ${JSON.stringify(r.signals?.keyword_tags)}`,
    );
  }

  if (!confirm) {
    console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to actually delete these ${toDelete.length} row(s).`);
    return;
  }

  const { error: deleteError } = await supabase
    .from('institutional_leads')
    .delete()
    .in('id', toDelete.map((r) => r.id));
  if (deleteError) throw new Error(`Failed to delete rows: ${deleteError.message}`);

  console.log(`\nDeleted ${toDelete.length} row(s).`);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
