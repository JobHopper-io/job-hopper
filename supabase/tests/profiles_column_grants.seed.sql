-- The hosted state 20261119120000 has to undo. Run before the migration, inside the
-- rolled-back test transaction.
grant update on public.profiles to anon, authenticated;
do $$
declare
  c record;
begin
  for c in select attname from pg_attribute
           where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped loop
    execute format('grant update (%I) on public.profiles to anon, authenticated', c.attname);
  end loop;
end;
$$;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth_user_id = (select auth.uid()));
-- sanity: the bad state is really in place
do $$
begin
  assert has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'UPDATE');
  assert has_column_privilege('anon', 'public.profiles', 'email', 'UPDATE');
end;
$$;
