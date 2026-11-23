-- Undo 20261121120000_consent_records.sql inside a test transaction, so the migration
-- (including its backfill) can be re-run against seeded profiles when it's already applied
-- locally. Only ever run inside 'begin' ... 'rollback'. apply_unsubscribe is redefined by
-- the migration itself, so it needs no reset.
drop trigger if exists on_auth_user_created_record_consent on auth.users;
drop function if exists public.record_signup_consent();
drop function if exists public.current_marketing_consent(uuid);
drop function if exists public.set_own_marketing_consent(boolean, text);
drop table if exists public.consent_records;
drop table if exists public.accepted_marketing_wordings;
drop table if exists public.consent_wordings;
