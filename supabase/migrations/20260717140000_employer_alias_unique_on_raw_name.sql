-- Corrects the uniqueness constraint on employer_name_aliases. Third and final attempt; the
-- first two were wrong because they were reasoned about rather than measured against the data.
-- Verified against the real FY2026 LCA rows already in lca_filings (400 FEINs, 642 distinct
-- (FEIN, raw_name) pairs):
--
--   (employer_fein)                  -> caps at 400 rows; need 642. Discards 242 spellings.
--   (employer_fein, normalized_name) -> caps at 517 rows; need 642. Discards 125 spellings.
--   (employer_fein, raw_name)        -> caps at 642 rows; need 642. Correct.
--
-- Why the middle option fails: distinct raw spellings routinely normalize to one string, e.g.
-- FEIN 84-1496755 files as "Charter Communications Inc." / "Charter Communications, Inc" /
-- "Charter Communications, Inc." - all three normalize to "charter communications". The alias
-- table's job is to record every raw spelling actually observed, so raw_name is the thing that
-- must be unique per filer, not its normalized form. (Multiple aliases sharing a normalized_name
-- is fine and expected: they all resolve to the same employer_id, which is the point.)
--
-- Safe: employer_name_aliases is 0 rows.

drop index if exists public.employer_name_aliases_fein_name_key;

create unique index employer_name_aliases_fein_raw_name_key
  on public.employer_name_aliases (employer_fein, raw_name)
  where employer_fein is not null;

-- normalized_name stays indexed (non-unique) - it's the lookup path for name-based matching in
-- D38-39, where many raw spellings intentionally collapse onto one normalized form.
