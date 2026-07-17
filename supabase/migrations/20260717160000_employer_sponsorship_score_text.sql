-- D41-45 (§3 decision 7): the Real Sponsorship Score uses the same Low/Medium/High scale as the
-- existing inferSponsorshipLikelihood heuristic badge, not a new 0-100 or A-F system - no new
-- scale for job seekers to learn, and the LCA-only v1 data can't support false precision anyway.
--
-- `score` was created as `int` (20260716200000) back when the scale was still TBD; `confidence`
-- already uses text + a check constraint. This aligns `score` to the same pattern. Table has 0
-- rows, so this is a pure type change, no backfill.

alter table public.employer_sponsorship_scores
  alter column score type text using score::text;

alter table public.employer_sponsorship_scores
  add constraint employer_sponsorship_scores_score_check
  check (score in ('Low', 'Medium', 'High'));
