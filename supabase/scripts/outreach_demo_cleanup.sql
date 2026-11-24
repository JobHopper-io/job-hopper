-- LOCAL ONLY. Removes everything outreach_demo_seed.sql and the demo created.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -f supabase/scripts/outreach_demo_cleanup.sql

begin;

create temp table demo_leads as select id from public.institutional_leads where source = 'demo_outreach';
create temp table demo_prospects as select id from public.prospects where source = 'demo_outreach';

delete from public.followup_sequences
  where institutional_lead_id in (select id from demo_leads) or prospect_id in (select id from demo_prospects);
delete from public.email_events
  where institutional_lead_id in (select id from demo_leads) or prospect_id in (select id from demo_prospects)
     or to_email_normalized like '%@example.test';
delete from public.reply_events
  where institutional_lead_id in (select id from demo_leads) or prospect_id in (select id from demo_prospects)
     or from_email like '%@example.test';
delete from public.suppressed_emails where email_normalized like '%@example.test';
delete from public.consent_records where email_normalized like '%@example.test';
delete from public.institutional_leads where id in (select id from demo_leads);
delete from public.prospects where id in (select id from demo_prospects);
-- The demo's outreach-sequences runs enqueue the next daily run; drop it locally.
delete from public.scheduled_jobs where function_name = 'outreach-sequences' and status = 'pending';
update public.growth_settings set outreach_auto_send = false where id = 1;

commit;

select (select count(*) from public.institutional_leads where source = 'demo_outreach') as leads_left,
       (select count(*) from public.prospects where source = 'demo_outreach') as prospects_left,
       (select count(*) from public.followup_sequences where sequence_key like 'outreach\_%') as outreach_rows_left,
       (select outreach_auto_send from public.growth_settings where id = 1) as auto_send;
