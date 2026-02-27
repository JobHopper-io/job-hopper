-- Function scheduling: table for pending jobs and extensions for pg_cron + pg_net.
-- Only the run-scheduled-jobs edge function (service_role) reads/updates this table.

-- 1. Extensions for cron-triggered invocation of the scheduler edge function (default schemas: cron, net)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Enum for job status
DO $$ BEGIN
  CREATE TYPE public.scheduled_job_status AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Table: scheduled_jobs
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_at timestamptz NOT NULL,
  status public.scheduled_job_status NOT NULL DEFAULT 'pending',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes for scheduler query and stale-job recovery
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status_run_at
  ON public.scheduled_jobs(status, run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status_started_at
  ON public.scheduled_jobs(status, started_at)
  WHERE status = 'running';

-- 5. RLS: only service_role (scheduler) should access; no policies for anon/authenticated
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated have no SELECT/INSERT/UPDATE; service_role bypasses RLS.

-- 6. Grants
GRANT SELECT, INSERT, UPDATE ON public.scheduled_jobs TO service_role;
