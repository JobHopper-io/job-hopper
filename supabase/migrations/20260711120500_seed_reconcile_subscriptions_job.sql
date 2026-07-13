-- Kick off the recurring subscription drift reconciliation. reconcile-subscriptions
-- self-enqueues its next run, so a single seed row starts the chain; run-scheduled-jobs
-- (pg_cron every 15 min) picks it up. Idempotent: only seed if no reconcile job is queued.

insert into public.scheduled_jobs (function_name, payload, run_at)
select 'reconcile-subscriptions', '{}'::jsonb, now() + interval '5 minutes'
where not exists (
  select 1 from public.scheduled_jobs
  where function_name = 'reconcile-subscriptions' and status in ('pending', 'running')
);
