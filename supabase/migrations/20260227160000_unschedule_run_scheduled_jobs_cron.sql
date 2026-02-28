-- Unschedule the run-scheduled-jobs cron job. Create it manually via Dashboard
-- (Integrations -> Cron) using type "Supabase Edge Function" and selecting run-scheduled-jobs.
SELECT cron.unschedule('run-scheduled-jobs-every-15-min');
