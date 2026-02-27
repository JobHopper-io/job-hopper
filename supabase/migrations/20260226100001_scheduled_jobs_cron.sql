-- Schedule run-scheduled-jobs edge function every 15 minutes via pg_cron + pg_net.
-- Prerequisite: Create Vault secrets before or after applying this migration:
--   - project_url: your Supabase project URL (e.g. https://xxx.supabase.co)
--   - cron_secret: same value as CRON_SECRET in edge function secrets
-- If these secrets are missing, the cron job will fail at runtime until they exist.

SELECT cron.schedule(
  'run-scheduled-jobs-every-15-min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/run-scheduled-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $$
);
