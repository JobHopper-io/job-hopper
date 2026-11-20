-- Checks for 20261120120000_suppressed_emails.sql. Runs against a local DB inside one
-- transaction that applies the migration and rolls everything back, so nothing persists:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/tests/suppressed_emails.seed.sql \
--     -f supabase/migrations/20261120120000_suppressed_emails.sql \
--     -f supabase/tests/suppressed_emails.test.sql -c 'rollback'
--
-- The seed is optional (it exercises the backfill). Drop the migration -f if it is
-- already applied locally, and the seed with it. Any failed assert aborts.

do $$
begin
  insert into public.suppressed_emails (email_normalized, reason, scope, source)
  values ('mkt-only@example.com', 'unsubscribe', 'marketing', 'test'),
         ('everything@example.com', 'hard_bounce', 'all', 'test');

  -- scope marketing: blocks marketing, allows transactional
  assert public.is_email_suppressed('mkt-only@example.com', 'marketing'), 'marketing scope should block marketing';
  assert not public.is_email_suppressed('mkt-only@example.com', 'transactional'), 'marketing scope should allow transactional';

  -- scope all: blocks both
  assert public.is_email_suppressed('everything@example.com', 'marketing'), 'all scope should block marketing';
  assert public.is_email_suppressed('everything@example.com', 'transactional'), 'all scope should block transactional';

  -- unknown address: never suppressed
  assert not public.is_email_suppressed('nobody@example.com', 'marketing'), 'unlisted address should not be suppressed';

  -- normalization: case and surrounding whitespace (space, tab, newline)
  assert public.normalize_email(E'  Mixed.Case@Example.COM \t\n') = 'mixed.case@example.com', 'normalize_email';
  assert public.is_email_suppressed(E'  EVERYTHING@Example.com\t', 'transactional'), 'lookup should normalize input';
  raise notice 'PASS scope + normalization';
end;
$$;

-- table rejects non-normalized and empty addresses
do $$
begin
  begin
    insert into public.suppressed_emails (email_normalized, reason, scope, source)
    values ('Upper@Example.com', 'manual', 'all', 'test');
    raise exception 'FAIL: non-normalized email was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.suppressed_emails (email_normalized, reason, scope, source)
    values ('', 'manual', 'all', 'test');
    raise exception 'FAIL: empty email was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS check constraint';
end;
$$;

-- invalid kind raises instead of reading as "not suppressed"
do $$
begin
  begin
    perform public.is_email_suppressed('everything@example.com', 'promo');
    raise exception 'FAIL: invalid kind did not raise';
  exception when raise_exception then
    if sqlerrm not like 'is_email_suppressed: invalid kind%' then raise; end if;
  end;
  raise notice 'PASS invalid kind';
end;
$$;

-- privileges: service_role only
do $$
begin
  assert not has_function_privilege('anon', 'public.is_email_suppressed(text, text)', 'execute'), 'anon can execute';
  assert not has_function_privilege('authenticated', 'public.is_email_suppressed(text, text)', 'execute'), 'authenticated can execute';
  assert has_function_privilege('service_role', 'public.is_email_suppressed(text, text)', 'execute'), 'service_role cannot execute';
  assert not has_table_privilege('anon', 'public.suppressed_emails', 'select'), 'anon can select';
  assert not has_table_privilege('authenticated', 'public.suppressed_emails', 'select'), 'authenticated can select';
  assert (select relrowsecurity from pg_class where oid = 'public.suppressed_emails'::regclass), 'RLS off';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressed_emails'), 'unexpected policy';
  raise notice 'PASS privileges';
end;
$$;

-- backfill: every source row is covered
do $$
begin
  assert not exists (
    select 1
    from public.notification_settings ns
    join public.profiles p on p.id = ns.profile_id
    where ns.email_unsubscribed_at is not null
      and public.normalize_email(p.email) <> ''
      and not exists (
        select 1 from public.suppressed_emails s
        where s.email_normalized = public.normalize_email(p.email) and s.reason = 'unsubscribe' and s.scope = 'all'
      )
  ), 'unsubscribed profile missing from suppressed_emails';
  assert not exists (
    select 1
    from public.institutional_leads l
    where l.status = 'bounced'
      and public.normalize_email(l.contact_email) <> ''
      and not exists (
        select 1 from public.suppressed_emails s
        where s.email_normalized = public.normalize_email(l.contact_email) and s.reason = 'hard_bounce' and s.scope = 'all'
      )
  ), 'bounced lead missing from suppressed_emails';
  -- seeded fixtures (suppressed_emails.seed.sql), when present
  if exists (select 1 from public.institutional_leads where source = 'seed_test') then
    assert (select count(*) from public.suppressed_emails where email_normalized = 'dead.inbox@example.edu') = 1,
      'duplicate bounced address should collapse to one row';
    assert public.is_email_suppressed('unsub.one@example.com', 'transactional'), 'seeded unsubscribe should be scope all';
    assert not public.is_email_suppressed('still.subscribed@example.com', 'marketing'), 'subscribed profile suppressed';
    assert not public.is_email_suppressed('live.inbox@example.edu', 'marketing'), 'non-bounced lead suppressed';
    raise notice 'PASS seeded backfill';
  end if;
  raise notice 'PASS backfill coverage (% unsubscribe, % hard_bounce rows)',
    (select count(*) from public.suppressed_emails where source = 'backfill_notification_settings'),
    (select count(*) from public.suppressed_emails where source = 'backfill_institutional_leads');
end;
$$;
