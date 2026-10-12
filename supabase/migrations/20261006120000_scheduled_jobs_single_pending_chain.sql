-- Recurring self-rescheduling functions (daily-job-matching, reconcile-subscriptions,
-- sponsor-watch-check) enqueue their next run as a payload-less row. Any extra manual
-- invocation used to add a second permanent chain (double matching + digest emails
-- forever). Allow at most one pending payload-less row per function; inserts that hit
-- the index (23505) are treated as "already scheduled" by the functions.

-- 1. Collapse existing duplicate chains: keep the earliest pending row per function.
UPDATE public.scheduled_jobs sj
SET status = 'failed',
    error_message = 'Duplicate recurring chain removed by migration 20261006120000',
    finished_at = now()
WHERE sj.status = 'pending'
  AND sj.payload = '{}'::jsonb
  AND EXISTS (
    SELECT 1 FROM public.scheduled_jobs other
    WHERE other.function_name = sj.function_name
      AND other.status = 'pending'
      AND other.payload = '{}'::jsonb
      AND (other.run_at, other.id) < (sj.run_at, sj.id)
  );

-- 2. Enforce a single pending chain row per function from now on.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_jobs_single_pending_chain
  ON public.scheduled_jobs (function_name)
  WHERE status = 'pending' AND payload = '{}'::jsonb;
