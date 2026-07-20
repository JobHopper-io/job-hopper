-- D46-50 (§3 decision 11): job postings have no existing link to the new `employers` table -
-- `job_hopper_live.company_name` is freeform scraped text, and naive normalized-name matching
-- against it is measurably lossy the same way §3 decision 4 found across DOL/USCIS (tested
-- against the live table: missed 'McKinsey & Company' and 'JPMorgan Chase Bank, N.A.', both
-- real top-374 sponsors, under obvious spelling variants).
--
-- Fix: match on domain, not name. job_processor/pipeline.py already resolves a company domain
-- for every ingested job (resolve_company_domain - Brave + LLM, no Apollo credits) but was
-- silently discarding it before this insert. This column lets it persist that value going
-- forward; employers.domain (backfilled separately for the 374 scored employers) is the other
-- side of the join. Nullable - unmatched/pre-fix postings simply fall back to the heuristic
-- badge, same as any employer with no LCA data.

alter table public.job_hopper_live
  add column company_domain text;
