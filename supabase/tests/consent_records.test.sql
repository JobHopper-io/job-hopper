-- Checks for 20261121120000_consent_records.sql. Needs the earlier growth migrations
-- applied. Runs in one rolled-back transaction:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261121120000_consent_records.sql \
--     -f supabase/tests/consent_records.test.sql -c 'rollback'
--
-- Drop the migration -f once it's applied locally (the backfill check then compares the
-- backfill against profiles that existed when it ran).

-- Backfill: one legacy row per signed-up profile, captured_at = created_at, no SMS rows.
do $$
begin
  assert (select count(*) from public.consent_records where source = 'backfill_legacy_signup')
       = (select count(*) from public.profiles where auth_user_id is not null and public.normalize_email(email) <> ''),
    'backfill row count != signed-up profiles';
  assert not exists (
    select 1 from public.consent_records r join public.profiles p on p.id = r.profile_id
    where r.source = 'backfill_legacy_signup'
      and (r.captured_at is distinct from coalesce(p.created_at, r.captured_at) or r.wording_version <> 'legacy_bundled_v0'
           or not r.granted or r.channel <> 'email' or r.purpose <> 'marketing')
  ), 'backfill row shape';
  assert not exists (select 1 from public.consent_records where source = 'backfill_legacy_signup' and channel = 'sms'), 'sms backfilled';
  assert not exists (
    select 1 from public.consent_records r join public.profiles p on p.id = r.profile_id
    where r.source = 'backfill_legacy_signup' and p.auth_user_id is null
  ), 'profile without an auth user was backfilled';
  raise notice 'PASS backfill (% rows)', (select count(*) from public.consent_records where source = 'backfill_legacy_signup');
end;
$$;

-- Signups through auth.users: handle_new_user creates the profile, then the consent trigger runs.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'Opted.In@Example.com',
   '{"first_name":"Opted","marketing_email_consent":true,"consent_wording_version":"marketing_email_v1","sms_consent":true,"sms_consent_wording_version":"sms_v1"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'declined@example.com',
   '{"first_name":"Declined","marketing_email_consent":false,"consent_wording_version":"marketing_email_v1","sms_consent":false,"sms_consent_wording_version":"sms_v1"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'old.client@example.com', '{"first_name":"Old"}'),
  ('00000000-0000-4000-8000-0000000000d4', 'no.meta@example.com', null),
  ('00000000-0000-4000-8000-0000000000d5', 'bad.meta@example.com',
   '{"first_name":"Bad","marketing_email_consent":"maybe","consent_wording_version":"marketing_email_v1"}'),
  ('00000000-0000-4000-8000-0000000000d6', 'unknown.wording@example.com',
   '{"first_name":"Unknown","marketing_email_consent":true,"consent_wording_version":"made_up_v9"}'),
  ('00000000-0000-4000-8000-0000000000d7', 'hr@employer.example',
   '{"account_type":"employer","company_name":"Emp Co","marketing_email_consent":true,"consent_wording_version":"marketing_email_v1"}');

do $$
declare
  pid uuid;
begin
  -- signup with consent: one marketing row + one SMS row, from the signup form
  pid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d1');
  assert pid is not null, 'profile not created';
  assert (select count(*) from public.consent_records where profile_id = pid) = 2;
  assert (select granted from public.consent_records where profile_id = pid and channel = 'email') = true;
  assert (select wording_version from public.consent_records where profile_id = pid and channel = 'email') = 'marketing_email_v1';
  assert (select email_normalized from public.consent_records where profile_id = pid and channel = 'email') = 'opted.in@example.com';
  assert (select source from public.consent_records where profile_id = pid and channel = 'email') = 'signup_form';
  assert (select purpose || '/' || wording_version from public.consent_records where profile_id = pid and channel = 'sms') = 'job_alerts/sms_v1';
  assert public.current_marketing_consent(pid), 'v1 opt-in should count';

  -- declined: rows recorded as granted = false; no consent
  pid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d2');
  assert (select count(*) from public.consent_records where profile_id = pid and not granted) = 2;
  assert not public.current_marketing_consent(pid);

  -- no consent metadata (old client / admin-created / null metadata): signup works, no row
  for pid in select id from public.profiles where auth_user_id in ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4') loop
    assert not exists (select 1 from public.consent_records where profile_id = pid), 'row written without metadata';
    assert not public.current_marketing_consent(pid);
  end loop;
  assert (select count(*) from public.profiles where auth_user_id in ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4')) = 2,
    'signup without metadata failed';

  -- bad metadata (non-boolean) or unknown wording: signup still works, no row
  for pid in select id from public.profiles where auth_user_id in ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000d6') loop
    assert not exists (select 1 from public.consent_records where profile_id = pid), 'row written for bad metadata';
  end loop;
  assert (select count(*) from public.profiles where auth_user_id in ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000d6')) = 2;

  -- employer signup: no profile, no consent row, signup works
  assert exists (select 1 from public.employer_accounts where auth_user_id = '00000000-0000-4000-8000-0000000000d7');
  assert not exists (select 1 from public.consent_records where email_normalized = 'hr@employer.example');
  raise notice 'PASS signup trigger (consent, declined, no metadata, bad metadata, employer)';
end;
$$;

-- current_marketing_consent: legacy vs v1 vs later revoke, and the "Nick says legacy counts" switch
do $$
declare
  pid uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d3');
begin
  insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
  values (pid, 'old.client@example.com', 'email', 'marketing', true, 'legacy_bundled_v0', 'test');
  assert not public.current_marketing_consent(pid), 'legacy must not count while not accepted';

  insert into public.accepted_marketing_wordings (wording_version) values ('legacy_bundled_v0');
  assert public.current_marketing_consent(pid), 'accepting legacy should be one insert';
  delete from public.accepted_marketing_wordings where wording_version = 'legacy_bundled_v0';

  insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
  values (pid, 'old.client@example.com', 'email', 'marketing', true, 'marketing_email_v1', 'test');
  assert public.current_marketing_consent(pid), 'v1 should count';

  insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
  values (pid, 'old.client@example.com', 'email', 'marketing', false, null, 'test');
  assert not public.current_marketing_consent(pid), 'a later revoke must win';
  raise notice 'PASS current_marketing_consent (legacy, accepted legacy, v1, revoke)';

  begin
    insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
    values (pid, 'old.client@example.com', 'email', 'marketing', true, null, 'test');
    raise exception 'FAIL: grant without wording accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Profile toggle appends (never updates) and drives the marketing suppression row
do $$
declare
  pid uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d2');
  v_before bigint;
  v_first_id bigint;
  v_first jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
  v_before := (select count(*) from public.consent_records where profile_id = pid);
  select id, to_jsonb(r) into v_first_id, v_first from public.consent_records r where profile_id = pid order by id limit 1;

  perform public.set_own_marketing_consent(true, 'marketing_email_v1');
  assert public.current_marketing_consent(pid);
  perform public.set_own_marketing_consent(false, null);
  assert not public.current_marketing_consent(pid);
  assert public.is_email_suppressed('declined@example.com', 'marketing'), 'toggle off should suppress marketing';
  assert not public.is_email_suppressed('declined@example.com', 'transactional');
  perform public.set_own_marketing_consent(true, 'marketing_email_v1');
  assert not public.is_email_suppressed('declined@example.com', 'marketing'), 'toggle on should clear the marketing suppression';

  assert (select count(*) from public.consent_records where profile_id = pid) = v_before + 3, 'toggle should append 3 rows';
  assert (select to_jsonb(r) from public.consent_records r where id = v_first_id) = v_first, 'earlier row changed';
  assert (select array_agg(source order by id) from public.consent_records where profile_id = pid and id > v_first_id and source = 'profile_settings')
       = array['profile_settings', 'profile_settings', 'profile_settings'];

  -- toggle on never clears a scope-all unsubscribe or a bounce
  perform public.suppress_email('declined@example.com', 'hard_bounce', 'all', 'test');
  perform public.set_own_marketing_consent(true, 'marketing_email_v1');
  assert public.is_email_suppressed('declined@example.com', 'transactional'), 'opt-in cleared a bounce';

  begin
    perform public.set_own_marketing_consent(true, 'made_up_v9');
    raise exception 'FAIL: unknown wording accepted';
  exception when raise_exception then
    if sqlerrm not like 'set_own_marketing_consent: unknown marketing wording%' then raise; end if;
  end;
  raise notice 'PASS profile toggle appends, drives marketing suppression, keeps bounce';
end;
$$;

-- unsubscribe-email appends a revoke (once), for scope marketing and scope all
do $$
declare
  pid uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d1');
begin
  assert public.current_marketing_consent(pid);
  perform public.apply_unsubscribe('opted.in@example.com', 'marketing', pid, 'unsubscribe-email');
  assert not public.current_marketing_consent(pid), 'unsubscribe should revoke';
  assert (select granted from public.consent_records where profile_id = pid and channel = 'email' order by id desc limit 1) = false;
  perform public.apply_unsubscribe('opted.in@example.com', 'marketing', pid, 'unsubscribe-email');
  assert (select count(*) from public.consent_records where profile_id = pid and channel = 'email' and not granted) = 1, 'double unsubscribe duplicated the revoke';

  -- scope all (v1 token: profile only) also revokes; a prospect with no profile gets an email-only revoke
  pid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000d3');
  insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
  values (pid, 'old.client@example.com', 'email', 'marketing', true, 'marketing_email_v1', 'test');
  perform public.apply_unsubscribe(null, 'all', pid, 'unsubscribe-email');
  assert not public.current_marketing_consent(pid), 'scope all should revoke';
  perform public.apply_unsubscribe('prospect.only@example.com', 'marketing', null, 'unsubscribe-email');
  assert (select granted from public.consent_records where email_normalized = 'prospect.only@example.com') = false;
  raise notice 'PASS unsubscribe appends a revoke (marketing, all, no profile), once';
end;
$$;

-- Append-only + read access
do $$
begin
  assert not has_table_privilege('service_role', 'public.consent_records', 'update'), 'service_role can update';
  assert not has_table_privilege('service_role', 'public.consent_records', 'delete'), 'service_role can delete';
  assert not has_table_privilege('service_role', 'public.consent_records', 'truncate'), 'service_role can truncate';
  assert has_table_privilege('service_role', 'public.consent_records', 'insert');
  assert not has_table_privilege('authenticated', 'public.consent_records', 'insert'), 'authenticated can insert';
  assert not has_table_privilege('authenticated', 'public.consent_records', 'update');
  assert not has_table_privilege('authenticated', 'public.consent_records', 'delete');
  assert has_table_privilege('authenticated', 'public.consent_records', 'select');
  assert not has_table_privilege('anon', 'public.consent_records', 'select');
  assert not has_function_privilege('anon', 'public.set_own_marketing_consent(boolean, text)', 'execute');
  assert not has_function_privilege('anon', 'public.current_marketing_consent(uuid)', 'execute');
  raise notice 'PASS append-only grants';
end;
$$;

-- RLS: a signed-in user reads only their own rows, and gets false for someone else's consent
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
  assert (select count(*) from public.consent_records) > 0, 'own rows not visible';
  assert not exists (select 1 from public.consent_records r where r.email_normalized <> 'opted.in@example.com'), 'saw another user''s rows';
  assert not public.current_marketing_consent((select id from public.profiles where email = 'declined@example.com' limit 1)),
    'answered for another user';
  raise notice 'PASS RLS own rows only';
end;
$$;
reset role;
