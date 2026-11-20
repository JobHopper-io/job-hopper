-- Checks for 20261120140200_email_events_send_log.sql. The two enum migrations
-- (20261120140000, 20261120140100) must already be applied: ADD VALUE can't share a
-- transaction with code that uses the value. Then, rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/tests/email_events_send_log.seed.sql \
--     -f supabase/migrations/20261120140200_email_events_send_log.sql \
--     -f supabase/tests/email_events_send_log.test.sql -c 'rollback'
--
-- The seed (and migration -f) are optional once the migration is applied locally.

do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000c1') then
    assert (select to_email_normalized from public.email_events where id = '00000000-0000-4000-8000-00000000e001')
      = 'old.send@example.com', 'backfill from profiles.email';
    assert (select to_email_normalized from public.email_events where id = '00000000-0000-4000-8000-00000000e002') is null,
      'row without a profile stays null';
    raise notice 'PASS backfill';
  end if;
end;
$$;

do $$
declare
  v_lead uuid;
begin
  insert into public.institutional_leads (organization_name, source, contact_email)
  values ('Send Log U', 'seed_test', 'dean@sendlog.edu') returning id into v_lead;

  insert into public.email_events (type, subject, status, provider_message_id, institutional_lead_id, to_email_normalized, campaign)
  values ('outbound', 'hello', 'sent', 'msg-1', v_lead, 'dean@sendlog.edu', 'camp-a'),
         ('outbound', 'hello', 'sent', 'msg-2', v_lead, 'dean@sendlog.edu', 'camp-a');

  -- delivery -> delivered + delivered_at; repeat keeps the first timestamp
  assert public.record_email_delivery_event('msg-1', 'delivered', '2026-11-20 10:00+00') = 1;
  assert public.record_email_delivery_event('msg-1', 'delivered', '2026-11-20 11:00+00') = 1;
  assert (select status::text from public.email_events where provider_message_id = 'msg-1') = 'delivered';
  assert (select delivered_at from public.email_events where provider_message_id = 'msg-1') = '2026-11-20 10:00+00';

  -- spam after delivery -> complained; a late delivery event can't regress it
  perform public.record_email_delivery_event('msg-1', 'complained', '2026-11-20 12:00+00');
  perform public.record_email_delivery_event('msg-1', 'delivered', '2026-11-20 13:00+00');
  assert (select status::text from public.email_events where provider_message_id = 'msg-1') = 'complained', 'status regressed';
  assert (select complained_at from public.email_events where provider_message_id = 'msg-1') is not null;

  -- bounce on the other message
  perform public.record_email_delivery_event('msg-2', 'bounced');
  assert (select status::text from public.email_events where provider_message_id = 'msg-2') = 'bounced';
  assert (select bounced_at from public.email_events where provider_message_id = 'msg-2') is not null;

  -- unknown message id: no error, 0 rows
  assert public.record_email_delivery_event('no-such-message', 'delivered') = 0;
  raise notice 'PASS record_email_delivery_event';

  -- invalid status raises
  begin
    perform public.record_email_delivery_event('msg-1', 'sent');
    raise exception 'FAIL: invalid status accepted';
  exception when raise_exception then
    if sqlerrm not like 'record_email_delivery_event: invalid status%' then raise; end if;
  end;

  -- to_email_normalized must be normalized; lead delete nulls the FK
  begin
    insert into public.email_events (type, status, to_email_normalized) values ('outbound', 'sent', 'Upper@X.com');
    raise exception 'FAIL: non-normalized to_email_normalized accepted';
  exception when check_violation then null;
  end;
  delete from public.institutional_leads where id = v_lead;
  assert (select count(*) from public.email_events where provider_message_id in ('msg-1', 'msg-2') and institutional_lead_id is null) = 2,
    'lead delete should set institutional_lead_id null';
  raise notice 'PASS constraints';

  assert not has_function_privilege('authenticated', 'public.record_email_delivery_event(text, text, timestamptz)', 'execute');
  assert not has_function_privilege('anon', 'public.record_email_delivery_event(text, text, timestamptz)', 'execute');
  assert has_function_privilege('service_role', 'public.record_email_delivery_event(text, text, timestamptz)', 'execute');
  raise notice 'PASS privileges';
end;
$$;
