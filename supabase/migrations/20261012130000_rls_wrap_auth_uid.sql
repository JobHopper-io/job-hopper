-- Performance (Supabase advisor auth_rls_initplan): a bare auth.uid() in an RLS policy
-- can be re-evaluated per row; (select auth.uid()) is evaluated once per statement.
-- Same semantics. Rewrites every live policy in public instead of hand-editing the 66
-- historical occurrences across migrations, so it covers whatever the current set is.
-- Idempotent: already-wrapped calls are skipped by the negative lookbehind.

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)')
  loop
    new_qual := regexp_replace(pol.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'gi');
    new_check := regexp_replace(pol.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'gi');

    if new_qual is not distinct from pol.qual and new_check is not distinct from pol.with_check then
      continue;
    end if;

    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if pol.qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if pol.with_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
  end loop;
end $$;
