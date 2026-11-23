-- Fixture rows for the 20261120120000_suppressed_emails.sql backfill. Run BEFORE the
-- migration, in the same rolled-back transaction as suppressed_emails.test.sql:
--
--   psql ... -c 'begin' -f supabase/tests/suppressed_emails.seed.sql \
--     -f supabase/migrations/20261120120000_suppressed_emails.sql \
--     -f supabase/tests/suppressed_emails.test.sql -c 'rollback'

insert into public.profiles (id, first_name, last_name, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'Unsub', 'One', '  Unsub.One@Example.com '),
  ('00000000-0000-4000-8000-0000000000a2', 'Still', 'Subscribed', 'still.subscribed@example.com');

insert into public.notification_settings (profile_id, email_unsubscribed_at) values
  ('00000000-0000-4000-8000-0000000000a1', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000a2', null);

-- Two bounced leads sharing one address in different case: must collapse to one row.
insert into public.institutional_leads (organization_name, source, status, contact_email) values
  ('Seed Bounce U', 'seed_test', 'bounced', 'Dead.Inbox@Example.edu'),
  ('Seed Bounce U Satellite', 'seed_test', 'bounced', 'dead.inbox@example.edu '),
  ('Seed Live U', 'seed_test', 'new', 'live.inbox@example.edu');
