-- Freemium per-profile usage and global caps (admin-configurable singleton).

-- ---------------------------------------------------------------------------
-- freemium_settings (singleton id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.freemium_settings (
  id smallint primary key default 1,
  max_job_searches int not null default 3 check (max_job_searches >= 0),
  max_resume_advice int not null default 3 check (max_resume_advice >= 0),
  updated_at timestamptz not null default now(),
  constraint freemium_settings_singleton_chk check (id = 1)
);

insert into public.freemium_settings (id, max_job_searches, max_resume_advice)
values (1, 3, 3)
on conflict (id) do nothing;

create or replace function public.set_freemium_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_freemium_settings_updated_at on public.freemium_settings;
create trigger set_freemium_settings_updated_at
before update on public.freemium_settings
for each row
execute function public.set_freemium_settings_updated_at();

alter table public.freemium_settings enable row level security;

drop policy if exists "Authenticated can read freemium_settings" on public.freemium_settings;
create policy "Authenticated can read freemium_settings"
on public.freemium_settings
for select
to authenticated
using (true);

drop policy if exists "Admins can update freemium_settings" on public.freemium_settings;
create policy "Admins can update freemium_settings"
on public.freemium_settings
for update
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
)
with check (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select, update on public.freemium_settings to authenticated;
grant all on public.freemium_settings to service_role;

-- ---------------------------------------------------------------------------
-- freemium_limits (one row per profile)
-- ---------------------------------------------------------------------------
create table if not exists public.freemium_limits (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  selected_tier_key text not null,
  job_searches_used int not null default 0 check (job_searches_used >= 0),
  resume_advice_used int not null default 0 check (resume_advice_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_freemium_limits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_freemium_limits_updated_at on public.freemium_limits;
create trigger set_freemium_limits_updated_at
before update on public.freemium_limits
for each row
execute function public.set_freemium_limits_updated_at();

alter table public.freemium_limits enable row level security;

drop policy if exists "Users can read own freemium_limits" on public.freemium_limits;
create policy "Users can read own freemium_limits"
on public.freemium_limits
for select
to authenticated
using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

grant select on public.freemium_limits to authenticated;
grant all on public.freemium_limits to service_role;

-- ---------------------------------------------------------------------------
-- Backfill freemium_limits for already-onboarded profiles
-- ---------------------------------------------------------------------------
insert into public.freemium_limits (profile_id, selected_tier_key, job_searches_used, resume_advice_used)
select p.id, 'entry_mid', 0, 0
from public.profiles p
where p.onboarding_completed = true
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- RPC: atomic job-search consumption (reads max from freemium_settings)
-- ---------------------------------------------------------------------------
create or replace function public.try_consume_freemium_job_search(p_profile_id uuid)
returns table (
  success boolean,
  job_searches_used int,
  max_job_searches int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_new_used int;
  v_current int;
begin
  select coalesce(fs.max_job_searches, 3) into v_max
  from public.freemium_settings fs
  where fs.id = 1;

  if v_max is null then
    v_max := 3;
  end if;

  if v_max <= 0 then
    select fl.job_searches_used into v_current
    from public.freemium_limits fl
    where fl.profile_id = p_profile_id;

    return query
    select false, coalesce(v_current, 0), v_max;
    return;
  end if;

  update public.freemium_limits fl
  set
    job_searches_used = fl.job_searches_used + 1,
    updated_at = now()
  where
    fl.profile_id = p_profile_id
    and fl.job_searches_used < v_max
  returning fl.job_searches_used into v_new_used;

  if found then
    return query
    select true, v_new_used, v_max;
    return;
  end if;

  select fl.job_searches_used into v_current
  from public.freemium_limits fl
  where fl.profile_id = p_profile_id;

  return query
  select false, coalesce(v_current, 0), v_max;
end;
$$;

revoke all on function public.try_consume_freemium_job_search(uuid) from public;
grant execute on function public.try_consume_freemium_job_search(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: redeem one free resume advice (increment quota + insert resume_products)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_freemium_resume_advice(
  p_profile_id uuid,
  p_job_match_id uuid,
  p_product_id uuid
)
returns table (
  ok boolean,
  resume_product_id uuid,
  resume_advice_used int,
  max_resume_advice int,
  err text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_used int;
  v_new_id uuid;
begin
  select coalesce(fs.max_resume_advice, 3) into v_max
  from public.freemium_settings fs
  where fs.id = 1;

  if v_max is null then
    v_max := 3;
  end if;

  if v_max <= 0 then
    return query
    select false, null::uuid, 0, v_max, 'disabled'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.job_matches jm
    where jm.id = p_job_match_id
      and jm.profile_id = p_profile_id
  ) then
    return query
    select false, null::uuid, 0, v_max, 'not_found'::text;
    return;
  end if;

  if exists (
    select 1
    from public.resume_products rp
    where
      rp.profile_id = p_profile_id
      and rp.job_match_id = p_job_match_id
      and rp.product_id = p_product_id
      and rp.status is distinct from 'cancelled'
  ) then
    return query
    select false, null::uuid, 0, v_max, 'already_purchased'::text;
    return;
  end if;

  update public.freemium_limits fl
  set
    resume_advice_used = fl.resume_advice_used + 1,
    updated_at = now()
  where
    fl.profile_id = p_profile_id
    and fl.resume_advice_used < v_max
  returning fl.resume_advice_used into v_used;

  if not found then
    select fl.resume_advice_used into v_used
    from public.freemium_limits fl
    where fl.profile_id = p_profile_id;

    return query
    select false, null::uuid, coalesce(v_used, 0), v_max, 'quota_exceeded'::text;
    return;
  end if;

  insert into public.resume_products (profile_id, product_id, job_match_id, status)
  values (p_profile_id, p_product_id, p_job_match_id, 'pending')
  returning id into v_new_id;

  return query
  select true, v_new_id, v_used, v_max, null::text;
end;
$$;

revoke all on function public.redeem_freemium_resume_advice(uuid, uuid, uuid) from public;
grant execute on function public.redeem_freemium_resume_advice(uuid, uuid, uuid) to service_role;
