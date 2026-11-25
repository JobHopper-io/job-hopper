-- LOCAL ONLY. Removes everything recovery_demo_seed.sql and the demo created.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -f supabase/scripts/recovery_demo_cleanup.sql

create temp table demo_profiles as
select id from public.profiles where email like '%@example.test';

delete from public.followup_sequences where profile_id in (select id from demo_profiles);
delete from public.email_events where profile_id in (select id from demo_profiles) or to_email_normalized like '%@example.test';
delete from public.consent_records where email_normalized like '%@example.test';
delete from public.suppressed_emails where email_normalized like '%@example.test';
delete from public.partner_staff where email like '%@example.test';
delete from public.institutional_leads where id = '00000000-0000-4000-8000-0000000007ff';
-- Cascades to profiles and their subscriptions, checkout_attempts, freemium_usage,
-- notification_settings and roles.
delete from auth.users where email like '%@example.test';
-- The demo's recovery-sequences runs enqueue the next daily run; drop it locally.
delete from public.scheduled_jobs where function_name = 'recovery-sequences' and status = 'pending';
-- Back to the default.
update public.growth_settings set recovery_auto_send = false where id = 1;

select (select count(*) from public.profiles where email like '%@example.test') as profiles_left,
       (select count(*) from public.consent_records where email_normalized like '%@example.test') as consent_left,
       (select recovery_auto_send from public.growth_settings where id = 1) as auto_send;
