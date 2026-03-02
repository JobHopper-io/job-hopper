-- Seed an initial scheduled job for the daily-job-matching edge function.
-- This relies on public.scheduled_jobs and the scheduled_job_status enum
-- having been created by earlier migrations.

INSERT INTO public.scheduled_jobs (function_name, payload, run_at)
VALUES (
  'daily-job-matching',
  '{}'::jsonb,
  now() + interval '5 minutes'
);

