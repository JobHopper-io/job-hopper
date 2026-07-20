-- D51-55: Sponsor Watch quarterly diff-alert worker. See docs/sponsorship-data-engine.md D51-55
-- for the full design + the threshold decision (bucket-cross OR >=25% relative change in summed
-- positions, measured against the real 367-employer distribution on 2026-07-20).
--
-- 1. Watch state lives on employer_sponsorship_scores (already one row per scored employer, and
--    watching is only ever offered in the UI for employers that have a real score row - see §3
--    decision 11's Premium gating). Kept separate in intent from the score columns themselves:
--    job_processor.sponsorship_scoring's upsert (compute-scores) only ever sends
--    employer_id/score/confidence/rationale/data_coverage/fiscal_years_used/algorithm_version/
--    computed_at in its payload, so PostgREST's merge-duplicates upsert leaves these columns
--    untouched on every re-run - only the sponsor-watch-check edge function ever writes them.
alter table public.employer_sponsorship_scores
  add column watch_last_checked_positions bigint,
  add column watch_last_checked_score text,
  add column watch_last_checked_at timestamptz;

-- 2. Aggregate helper: sum(total_worker_positions) per employer, Certified/Certified-Withdrawn
--    only - same COUNTED_STATUSES rule as job_processor/sponsorship_scoring.py's score_bucket
--    input (keep these two in sync if that set ever changes). PostgREST's REST interface can't
--    express a GROUP BY, so this is a plain SQL function the edge function calls via .rpc() for
--    just the actively-watched employer_ids, rather than re-scanning all of lca_filings the way
--    the Python scorer does for the full 367-employer sweep.
create or replace function public.sum_counted_lca_positions(p_employer_ids uuid[])
returns table (employer_id uuid, counted_positions bigint)
language sql
stable
as $$
  select employer_id, sum(total_worker_positions)::bigint as counted_positions
  from public.lca_filings
  where employer_id = any(p_employer_ids)
    and case_status in ('Certified', 'Certified - Withdrawn')
  group by employer_id;
$$;

-- service_role only - same access shape as the rest of the sponsorship engine's tables (see
-- 20260716200000's header comment on why: ingestion/worker code runs with the service-role key,
-- the frontend never calls this directly). Table grants and RPC EXECUTE grants are separate in
-- Postgres - the D46-50 employers/employer_sponsorship_scores incident (RLS policy present, no
-- underlying GRANT SELECT, silently unreadable) is exactly the failure mode this line prevents
-- for the RPC path.
grant execute on function public.sum_counted_lca_positions(uuid[]) to service_role;
