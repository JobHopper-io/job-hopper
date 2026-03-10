-- Fix job_hopper_live.id and job_matches.job_id for uuid migration.
-- Run after 20260310212317_remote_schema.sql; that migration no longer touches these columns.

drop policy if exists "Users can read only matched jobs" on public.job_hopper_live;

-- 2) Drop FK that ties job_matches.job_id to job_hopper_live.id so we can change both types safely.
alter table public.job_matches drop constraint if exists job_matches_job_id_fkey;

-- 3) Conditionally migrate job_hopper_live.id to uuid.
--    On databases where it's already uuid (e.g. the remote source of the dump), this block is a no-op.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_hopper_live'
      and column_name = 'id'
      and data_type <> 'uuid'
  ) then
    -- If it's an identity integer, drop identity first.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'job_hopper_live'
        and column_name = 'id'
        and is_identity = 'YES'
    ) then
      execute 'alter table public.job_hopper_live alter column id drop identity';
    end if;

    -- Then convert to uuid and set default.
    execute 'alter table public.job_hopper_live alter column id set data type uuid using gen_random_uuid()';
    execute 'alter table public.job_hopper_live alter column id set default gen_random_uuid()';
  end if;
end
$$;

-- 4) Conditionally migrate job_matches.job_id to uuid.
--    On databases where it's already uuid, this block is a no-op.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_matches'
      and column_name = 'job_id'
      and data_type <> 'uuid'
  ) then
    -- Existing integer links cannot be preserved safely; clear them.
    execute 'alter table public.job_matches alter column job_id drop not null';
    execute 'alter table public.job_matches alter column job_id set data type uuid using (null::uuid)';
  end if;
end
$$;

-- 5) Re-add FK now that both columns are uuid (or were already uuid).
alter table public.job_matches add constraint job_matches_job_id_fkey
  foreign key (job_id) references public.job_hopper_live(id) on delete cascade;

-- 6) Recreate the policy "Users can read only matched jobs" with the new uuid-based schema.
create policy "Users can read only matched jobs"
on public.job_hopper_live
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.job_matches jm
      on jm.profile_id = p.id
    where
      p.auth_user_id = auth.uid()
      and jm.job_id = job_hopper_live.id
  )
);
