-- ---------------------------------------------------------------------------
-- pg_cron: sweep reply_events for classification every 15 minutes, same cadence
-- as run-scheduled-jobs (20260226100001_scheduled_jobs_cron.sql). Reuses the
-- same vault secrets (project_url, cron_secret) already required by that job
-- and by reset-apollo-limits -- no new secrets needed.
-- Guarded like reset-apollo-limits-monthly's schedule (20260601120000): only
-- runs if pg_cron is actually enabled (local dev may not have it), and
-- unschedules any prior run of this job first so the migration is re-runnable.
-- ---------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('classify-replies-every-15-min');
    exception
      when others then
        null;
    end;
    perform cron.schedule(
      'classify-replies-every-15-min',
      '*/15 * * * *',
      $body$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/classify-replies',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := jsonb_build_object('scheduled_at', now())
      ) as request_id;
      $body$
    );
  end if;
end;
$cron$;
