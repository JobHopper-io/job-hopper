-- Correction #2 (2026-07-16) - see docs/sponsorship-data-engine.md.
-- The real USCIS H-1B Employer Data Hub export ("Employer Information" / Line-by-line, FY2026)
-- reports 6 approval/denial category pairs, not the 4-bucket initial/continuing summary
-- originally modeled in 20260716200000. Confirmed against the real file - its header is:
--   Line by line, Fiscal Year, Employer (Petitioner) Name, Tax ID, Industry (NAICS) Code,
--   Petitioner City, Petitioner State, Petitioner Zip Code, New Employment Approval/Denial,
--   Continuation Approval/Denial, Change with Same Employer Approval/Denial,
--   New Concurrent Approval/Denial, Change of Employer Approval/Denial, Amended Approval/Denial
--
-- 20260716200000 is already applied to the remote project, so this is a follow-up migration
-- rather than an edit to that file. uscis_h1b_hub has 0 rows at this point (no ingestion has
-- run against the old shape), so this is a plain drop+add with no backfill needed.
--
-- Collapsing these 12 columns into a 4-bucket initial/continuing summary is a scoring-layer
-- decision for later (D41-45), not something ingestion should decide by discarding data now.

alter table public.uscis_h1b_hub
  drop column initial_approvals,
  drop column initial_denials,
  drop column continuing_approvals,
  drop column continuing_denials,
  add column new_employment_approvals int,
  add column new_employment_denials int,
  add column continuation_approvals int,
  add column continuation_denials int,
  add column change_same_employer_approvals int,
  add column change_same_employer_denials int,
  add column new_concurrent_approvals int,
  add column new_concurrent_denials int,
  add column change_employer_approvals int,
  add column change_employer_denials int,
  add column amended_approvals int,
  add column amended_denials int;
