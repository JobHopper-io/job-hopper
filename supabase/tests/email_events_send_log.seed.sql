-- Fixture rows for the 20261120140200_email_events_send_log.sql backfill. Run BEFORE that
-- migration, in the same rolled-back transaction as email_events_send_log.test.sql.
insert into public.profiles (id, first_name, last_name, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'Old', 'Send', '  Old.Send@Example.com ');
insert into public.email_events (id, profile_id, type, subject, status) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000c1', 'job_match_digest', 'old digest', 'sent'),
  ('00000000-0000-4000-8000-00000000e002', null, 'subscription_update', 'no profile', 'sent');
