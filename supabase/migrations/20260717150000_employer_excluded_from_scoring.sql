-- D37 (reduced scope, §3 decision 7): flags genuine umbrella FEINs rather than splitting them.
-- See docs/sponsorship-data-engine.md §4 (employers block) and the review CSVs under
-- job-processor-service/data/review_umbrella_feins.csv.
--
-- true  => this employer's filing history spans multiple genuinely distinct organizations
--          under one shared FEIN (e.g. New York State + 21 SUNY campuses). No score is shown
--          for these at all - not degraded, not a guess - the UI falls back to the existing
--          inferSponsorshipLikelihood heuristic badge instead (§3 decision 7).
-- false (default) => normal scoring path.
--
-- Additive, default false, no backfill required by the migration itself - the review-confirmed
-- set of true rows is applied by job_processor.sponsorship_resolution.apply_scoring_exclusions.

alter table public.employers
  add column excluded_from_scoring boolean not null default false;
