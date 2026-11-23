-- Checks for 20261119120000_profiles_column_grants.sql, run as the authenticated / anon roles.
-- Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/tests/profiles_column_grants.seed.sql \
--     -f supabase/migrations/20261119120000_profiles_column_grants.sql \
--     -f supabase/tests/profiles_column_grants.test.sql -c 'rollback'
--
-- The seed recreates the state found on the hosted DB (UPDATE on every column, table-level
-- and per-column, for anon and authenticated; own-row policy on role public with no WITH
-- CHECK), so the test shows the migration removes all of it.

-- Two signed-up users (handle_new_user creates their profiles).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000003a1', 'self@grants.test', '{"first_name":"Self"}'),
  ('00000000-0000-4000-8000-0000000003b2', 'other@grants.test', '{"first_name":"Other"}');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true); end $$;

-- 1. Each of the 19 allowed columns can be updated, on its own, on the caller's own row.
do $$
declare
  allowed jsonb := jsonb_build_object(
    'first_name', 'Self', 'last_name', 'User', 'current_job_title', 'Engineer',
    'career_level', 'entry_mid', 'target_job_title', 'Staff Engineer', 'years_of_experience', '4',
    'current_industry', 'Software', 'target_role_categories', '{engineering}',
    'desired_salary_min', '100000', 'desired_salary_max', '150000', 'preferred_locations', '{Austin}',
    'open_to_relocation', 'true', 'open_to_remote', 'true', 'location_radius_miles', '25',
    'requires_us_sponsorship', 'true', 'recruiter_visible', 'true', 'current_employer', 'Acme',
    'resume_bucket_key', 'resumes/00000000-0000-4000-8000-0000000003a1-1763700000000.pdf',
    'has_seen_walkthrough', 'true');
  col text;
  n int;
begin
  for col in select jsonb_object_keys(allowed) loop
    execute format('update public.profiles set %I = %L where auth_user_id = auth.uid()', col, allowed ->> col);
    get diagnostics n = row_count;
    assert n = 1, format('%s: expected 1 row updated, got %s', col, n);
  end loop;
  assert (select count(*) from jsonb_object_keys(allowed)) = 19;
  raise notice 'PASS all 19 allowed columns update the own row';
end;
$$;

-- 2. Sensitive columns are refused with permission denied.
do $$
declare
  forbidden jsonb := jsonb_build_object(
    'stripe_customer_id', 'cus_someone_else',
    'org_account_id', gen_random_uuid()::text,
    'trial_grant_id', gen_random_uuid()::text,
    'onboarding_completed', 'true',
    'email', 'attacker@example.com',
    'phone_number', '5555550100',
    'referred_by_institutional_lead_id', gen_random_uuid()::text,
    'auth_user_id', '00000000-0000-4000-8000-0000000003b2');
  col text;
begin
  for col in select jsonb_object_keys(forbidden) loop
    begin
      execute format('update public.profiles set %I = %L where auth_user_id = auth.uid()', col, forbidden ->> col);
      raise exception 'FAIL: % was updatable', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS 8 sensitive columns refused (permission denied)';
end;
$$;

-- 3. Another user's row: RLS hides it, so 0 rows change.
do $$
declare
  n int;
begin
  update public.profiles set first_name = 'Hacked' where auth_user_id = '00000000-0000-4000-8000-0000000003b2';
  get diagnostics n = row_count;
  assert n = 0, format('updated %s rows of another user', n);
  raise notice 'PASS another user''s row: 0 rows affected';
end;
$$;

-- 4. touch_last_active() still sets last_active_at (SECURITY DEFINER).
do $$
begin
  perform public.touch_last_active();
  assert (select last_active_at from public.profiles where auth_user_id = auth.uid()) > now() - interval '1 minute',
    'touch_last_active did not update last_active_at';
  begin
    update public.profiles set last_active_at = now() where auth_user_id = auth.uid();
    raise exception 'FAIL: last_active_at directly updatable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS touch_last_active() works; last_active_at not directly writable';
end;
$$;

-- 5. resume_bucket_key pointing at another user's upload path is rejected.
do $$
begin
  begin
    update public.profiles
    set resume_bucket_key = 'resumes/00000000-0000-4000-8000-0000000003b2-1763700000000.pdf'
    where auth_user_id = auth.uid();
    raise exception 'FAIL: another user''s resume path accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set resume_bucket_key = 'other-bucket/anything.pdf' where auth_user_id = auth.uid();
    raise exception 'FAIL: a non-resumes path accepted';
  exception when check_violation then null;
  end;
  update public.profiles set resume_bucket_key = null where auth_user_id = auth.uid();
  raise notice 'PASS resume_bucket_key limited to the caller''s own path (null allowed)';
end;
$$;

reset role;

-- 6. anon can't update anything.
set local role anon;
do $$
declare
  col text;
begin
  for col in select unnest(array['first_name', 'stripe_customer_id', 'org_account_id', 'email']) loop
    begin
      execute format('update public.profiles set %I = null', col);
      raise exception 'FAIL: anon could update %', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS anon cannot update profiles';
end;
$$;
reset role;

-- 7. Privilege snapshot: exactly the 19 columns are UPDATE-able by authenticated, none by anon.
do $$
begin
  assert (select count(*) from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
            and privilege_type = 'UPDATE') = 19, 'authenticated UPDATE column count';
  assert not exists (select 1 from information_schema.column_privileges
                     where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon'
                       and privilege_type = 'UPDATE'), 'anon has column UPDATE';
  assert not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'public' and table_name = 'profiles'
                       and grantee in ('anon', 'authenticated') and privilege_type = 'UPDATE'), 'table-level UPDATE remains';
  assert (select roles::text from pg_policies where tablename = 'profiles' and policyname = 'Users can update own profile') = '{authenticated}';
  assert (select with_check is not null from pg_policies where tablename = 'profiles' and policyname = 'Users can update own profile');
  raise notice 'PASS privilege snapshot (19 columns, no anon, no table-level UPDATE, policy authenticated + WITH CHECK)';
end;
$$;
