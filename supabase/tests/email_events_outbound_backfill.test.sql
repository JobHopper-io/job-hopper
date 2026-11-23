-- Checks for 20261120140300_email_events_outbound_backfill.sql. Needs 20261120140000 /
-- 140100 / 140200 applied locally. Seeds its own fixtures, runs the backfill twice (the
-- second run must add nothing), rolls everything back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/tests/email_events_outbound_backfill.seed.sql \
--     -f supabase/migrations/20261120140300_email_events_outbound_backfill.sql \
--     -f supabase/migrations/20261120140300_email_events_outbound_backfill.sql \
--     -f supabase/tests/email_events_outbound_backfill.test.sql -c 'rollback'

do $$
declare
  v_l1 uuid := (select id from public.institutional_leads where organization_name = 'BF One U');
  v_l4 uuid := (select id from public.institutional_leads where organization_name = 'BF NoMsg U');
  v_hi uuid := (select id from public.institutional_leads where organization_name = 'BF Merged Main');
begin
  -- contacted -> sent, with message id, campaign, send time, normalized address, backfilled flag
  assert (select count(*) from public.email_events where provider_message_id = 'bf-1') = 1, 'bf-1 row count';
  assert (select status::text from public.email_events where provider_message_id = 'bf-1') = 'sent';
  assert (select institutional_lead_id from public.email_events where provider_message_id = 'bf-1') = v_l1;
  assert (select campaign from public.email_events where provider_message_id = 'bf-1') = 'camp-1';
  assert (select to_email_normalized from public.email_events where provider_message_id = 'bf-1') = 'one@uni.edu';
  assert (select sent_at from public.email_events where provider_message_id = 'bf-1') = '2026-09-01 12:00+00';
  assert (select payload ->> 'backfilled' from public.email_events where provider_message_id = 'bf-1') = 'true';
  assert (select type::text from public.email_events where provider_message_id = 'bf-1') = 'outbound';

  -- bounced -> bounced with bounced_at
  assert (select status::text from public.email_events where provider_message_id = 'bf-2') = 'bounced';
  assert (select bounced_at from public.email_events where provider_message_id = 'bf-2') is not null;

  -- merged send: two leads, one message id -> one row, highest-scored lead as primary
  assert (select count(*) from public.email_events where provider_message_id = 'bf-3') = 1, 'merged send duplicated';
  assert (select institutional_lead_id from public.email_events where provider_message_id = 'bf-3') = v_hi;
  assert (select jsonb_array_length(payload -> 'institutional_lead_ids') from public.email_events where provider_message_id = 'bf-3') = 2;
  assert (select template_key from public.email_events where provider_message_id = 'bf-3') = 'outbound_university_generic';

  -- no message id: one row for the lead, not duplicated by the second run
  assert (select count(*) from public.email_events where institutional_lead_id = v_l4 and type = 'outbound') = 1, 'null-message lead';

  -- already logged: the pre-existing outbound row for bf-5 is the only one
  assert (select count(*) from public.email_events where provider_message_id = 'bf-5') = 1, 'bf-5 duplicated';
  assert (select payload ->> 'backfilled' from public.email_events where provider_message_id = 'bf-5') is null, 'bf-5 overwritten';

  -- not contacted/bounced: nothing
  assert not exists (select 1 from public.email_events e join public.institutional_leads l on l.id = e.institutional_lead_id
                     where l.organization_name in ('BF New U', 'BF Dead U')), 'new/dead lead backfilled';
  assert not exists (select 1 from public.email_events where provider_message_id = 'bf-7'), 'dead lead backfilled';

  -- exactly the expected seeded rows, after two runs
  assert (select count(*) from public.email_events e join public.institutional_leads l on l.id = e.institutional_lead_id
          where l.source = 'seed_bf' and e.payload ->> 'backfilled' = 'true') = 4, 'expected 4 backfilled rows';
  raise notice 'PASS outbound backfill (contacted, bounced, merged, no message id, skip existing, idempotent)';
end;
$$;
