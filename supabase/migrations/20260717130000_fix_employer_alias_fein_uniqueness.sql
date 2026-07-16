-- Fixes a wrong constraint introduced by 20260717120000 (same-day bug fix, caught during the
-- D36 seed run). See docs/sponsorship-data-engine.md §3 decision 5.
--
-- 20260717120000 created:
--     create unique index employer_name_aliases_employer_fein_key
--       on public.employer_name_aliases (employer_fein) where employer_fein is not null;
--
-- The intent was the invariant "one FEIN belongs to exactly one brand". What the index actually
-- enforces is "one FEIN => one alias ROW", which is strictly stronger and contradicts the whole
-- point of the alias table: recording every name variant a filer files under.
--
-- The real data proves it. One tax ID routinely covers many distinct org names - these are
-- state/city umbrella FEINs, not spelling noise:
--   14-6013200 -> 22 names (New York State + SUNY Stony Brook/Albany/Buffalo/Binghamton/...)
--   52-6002033 -> 13 names (University of Maryland system + Bowie/Frostburg/Morgan State/...)
--   13-6400434 ->  7 names (NYC Dept of Education / Correction / Health / Medical Examiner)
-- Under the old index, seeding 22 alias rows for 14-6013200 was impossible: rows 2..22 would
-- violate uniqueness, so 21 of SUNY's 22 known name variants would have to be discarded.
--
-- Correct constraint: unique on (employer_fein, normalized_name) - one row per (filer, name)
-- observation. Prevents genuine duplicates (so seeding stays re-runnable) while allowing a
-- filer to have many names.
--
-- NOTE the "one FEIN => one employer_id" invariant is NOT expressible as a unique index here and
-- is currently enforced in code (sponsorship_resolution.build_seed_plan assigns one employer_id
-- per FEIN). If that needs DB-level enforcement, it wants a separate employer_feins
-- (employer_fein pk -> employer_id) table - deliberately not done now; revisit in D37 if brand
-- grouping makes it worth the normalization.
--
-- Safe: employer_name_aliases is 0 rows (the failed seed run inserted none, and its 400 orphaned
-- employers rows were deleted).

drop index if exists public.employer_name_aliases_employer_fein_key;

create unique index employer_name_aliases_fein_name_key
  on public.employer_name_aliases (employer_fein, normalized_name)
  where employer_fein is not null;

-- Kept for lookups by filer: resolution's hot path is FEIN -> employer_id.
create index employer_name_aliases_employer_fein_idx
  on public.employer_name_aliases (employer_fein)
  where employer_fein is not null;
