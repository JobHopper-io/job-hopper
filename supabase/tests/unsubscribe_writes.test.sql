-- Checks for 20261120130000_unsubscribe_writes.sql. Same pattern as suppressed_emails.test.sql:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261120120000_suppressed_emails.sql \
--     -f supabase/migrations/20261120130000_unsubscribe_writes.sql \
--     -f supabase/tests/unsubscribe_writes.test.sql -c 'rollback'
--
-- Drop any migration -f that is already applied locally. Any failed assert aborts.

-- Fixture: a real signup through auth.users, so handle_new_user() creates the profile.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000b1', 'Reader.One@Example.com',
        '{"first_name":"Reader","last_name":"One"}'::jsonb);

do $$
declare
  v_profile uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000b1');
  v_first_ts timestamptz;
begin
  assert v_profile is not null, 'fixture profile not created by handle_new_user';

  -- suppress_email: idempotent, widens marketing -> all, never narrows
  perform public.suppress_email('Twice@Example.com', 'unsubscribe', 'marketing', 'test');
  perform public.suppress_email(' twice@example.com ', 'unsubscribe', 'marketing', 'test');
  assert (select count(*) from public.suppressed_emails where email_normalized = 'twice@example.com') = 1, 'duplicate row';
  perform public.suppress_email('twice@example.com', 'unsubscribe', 'all', 'test');
  assert (select scope from public.suppressed_emails where email_normalized = 'twice@example.com') = 'all', 'scope not widened';
  perform public.suppress_email('twice@example.com', 'unsubscribe', 'marketing', 'test');
  assert (select scope from public.suppressed_emails where email_normalized = 'twice@example.com') = 'all', 'scope narrowed';
  raise notice 'PASS suppress_email idempotent + widen-only';

  -- apply_unsubscribe, v2 marketing token: suppression only, profile settings untouched
  assert public.apply_unsubscribe('prospect@example.com', 'marketing', null, 'unsubscribe-email') = 'prospect@example.com';
  assert public.is_email_suppressed('prospect@example.com', 'marketing');
  assert not public.is_email_suppressed('prospect@example.com', 'transactional');

  -- apply_unsubscribe, v1 token (profile id only, scope all): looks up the email, sets
  -- notification_settings; a repeat is a no-op (same row count, same timestamp)
  assert public.apply_unsubscribe(null, 'all', v_profile, 'unsubscribe-email') = 'reader.one@example.com';
  v_first_ts := (select email_unsubscribed_at from public.notification_settings where profile_id = v_profile);
  assert v_first_ts is not null, 'email_unsubscribed_at not set';
  perform pg_sleep(0.01);
  perform public.apply_unsubscribe(null, 'all', v_profile, 'unsubscribe-email');
  assert (select count(*) from public.suppressed_emails where email_normalized = 'reader.one@example.com') = 1, 'double apply duplicated';
  assert (select email_unsubscribed_at from public.notification_settings where profile_id = v_profile) = v_first_ts,
    'double apply moved the timestamp';
  assert public.is_email_suppressed('reader.one@example.com', 'transactional'), 'v1 should be scope all';
  raise notice 'PASS apply_unsubscribe v1/v2 + idempotent';

  -- unknown profile on a v1 token raises
  begin
    perform public.apply_unsubscribe(null, 'all', '00000000-0000-4000-8000-00000000dead', 'unsubscribe-email');
    raise exception 'FAIL: unknown profile accepted';
  exception when raise_exception then
    if sqlerrm not like 'apply_unsubscribe: no email%' then raise; end if;
  end;
  raise notice 'PASS apply_unsubscribe rejects unknown profile';
end;
$$;

-- set_own_email_unsubscribed as the signed-in fixture user
do $$
declare
  v_profile uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000b1');
begin
  -- start clean for this block: drop the rows the previous block created for this address
  delete from public.suppressed_emails where email_normalized = 'reader.one@example.com';
  update public.notification_settings set email_unsubscribed_at = null where profile_id = v_profile;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
  perform public.suppress_email('reader.one@example.com', 'hard_bounce', 'all', 'mailtrap-webhook');

  perform public.set_own_email_unsubscribed(true);
  assert (select source from public.suppressed_emails
          where email_normalized = 'reader.one@example.com' and reason = 'unsubscribe') = 'profile', 'profile row missing';
  assert (select email_unsubscribed_at from public.notification_settings where profile_id = v_profile) is not null;

  perform public.set_own_email_unsubscribed(false);
  assert not exists (select 1 from public.suppressed_emails
                     where email_normalized = 'reader.one@example.com' and source = 'profile'), 'profile row not deleted';
  assert exists (select 1 from public.suppressed_emails
                 where email_normalized = 'reader.one@example.com' and reason = 'hard_bounce'), 're-subscribe cleared the bounce';
  assert (select email_unsubscribed_at from public.notification_settings where profile_id = v_profile) is null;
  assert public.is_email_suppressed('reader.one@example.com', 'transactional'), 'bounce should still block';
  raise notice 'PASS profile toggle; re-subscribe keeps hard bounce';

  -- re-enable after an email-link unsubscribe (source unsubscribe-email, scope all) works;
  -- spam_complaint and hard_bounce rows survive it
  delete from public.suppressed_emails where email_normalized = 'reader.one@example.com';
  perform public.apply_unsubscribe('reader.one@example.com', 'all', v_profile, 'unsubscribe-email');
  perform public.suppress_email('reader.one@example.com', 'spam_complaint', 'all', 'mailtrap-webhook');
  perform public.suppress_email('reader.one@example.com', 'hard_bounce', 'all', 'mailtrap-webhook');
  perform public.set_own_email_unsubscribed(false);
  assert not exists (select 1 from public.suppressed_emails
                     where email_normalized = 'reader.one@example.com' and reason = 'unsubscribe'), 'link unsubscribe not cleared';
  assert (select email_unsubscribed_at from public.notification_settings where profile_id = v_profile) is null;
  assert (select array_agg(reason order by reason) from public.suppressed_emails
          where email_normalized = 'reader.one@example.com') = array['hard_bounce', 'spam_complaint'],
    're-enable touched bounce/spam rows';
  raise notice 'PASS re-enable clears email-link unsubscribe, keeps bounce + spam';

  -- re-enable never clears a scope 'marketing' unsubscribe (that needs marketing consent)
  delete from public.suppressed_emails where email_normalized = 'reader.one@example.com';
  perform public.suppress_email('reader.one@example.com', 'unsubscribe', 'marketing', 'unsubscribe-email');
  perform public.set_own_email_unsubscribed(false);
  assert exists (select 1 from public.suppressed_emails
                 where email_normalized = 'reader.one@example.com' and reason = 'unsubscribe' and scope = 'marketing'),
    're-enable cleared a marketing-scope row';
  assert public.is_email_suppressed('reader.one@example.com', 'marketing');
  assert not public.is_email_suppressed('reader.one@example.com', 'transactional');
  raise notice 'PASS re-enable keeps marketing-scope unsubscribe';

  -- re-enable only touches the caller's own address
  perform public.suppress_email('someone.else@example.com', 'unsubscribe', 'all', 'unsubscribe-email');
  perform public.set_own_email_unsubscribed(false);
  assert public.is_email_suppressed('someone.else@example.com', 'transactional'), 'cleared another address';
  raise notice 'PASS re-enable is limited to own address';

  -- no signed-in user
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.set_own_email_unsubscribed(true);
    raise exception 'FAIL: anonymous call accepted';
  exception when raise_exception then
    if sqlerrm not like 'set_own_email_unsubscribed: no profile%' then raise; end if;
  end;
  raise notice 'PASS set_own_email_unsubscribed requires a user';
end;
$$;

-- privileges
do $$
begin
  assert not has_function_privilege('authenticated', 'public.suppress_email(text, text, text, text, uuid, text)', 'execute');
  assert not has_function_privilege('anon', 'public.suppress_email(text, text, text, text, uuid, text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.apply_unsubscribe(text, text, uuid, text)', 'execute');
  assert not has_function_privilege('anon', 'public.apply_unsubscribe(text, text, uuid, text)', 'execute');
  assert has_function_privilege('service_role', 'public.apply_unsubscribe(text, text, uuid, text)', 'execute');
  assert has_function_privilege('authenticated', 'public.set_own_email_unsubscribed(boolean)', 'execute');
  assert not has_function_privilege('anon', 'public.set_own_email_unsubscribed(boolean)', 'execute');
  raise notice 'PASS privileges';
end;
$$;
