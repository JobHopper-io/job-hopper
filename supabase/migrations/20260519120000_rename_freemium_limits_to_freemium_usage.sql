-- Rename freemium_limits -> freemium_usage (per-profile counters + selected tier).

alter table if exists public.freemium_limits rename to freemium_usage;

alter table public.freemium_usage
  rename constraint freemium_limits_profile_id_fkey to freemium_usage_profile_id_fkey;

drop trigger if exists set_freemium_limits_updated_at on public.freemium_usage;

drop function if exists public.set_freemium_limits_updated_at();

create or replace function public.set_freemium_usage_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_freemium_usage_updated_at
before update on public.freemium_usage
for each row
execute function public.set_freemium_usage_updated_at();

drop policy if exists "Users can read own freemium_limits" on public.freemium_usage;
create policy "Users can read own freemium_usage"
on public.freemium_usage
for select
to authenticated
using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

-- RPC bodies reference table names literally; recreate against freemium_usage.
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
    select fu.job_searches_used into v_current
    from public.freemium_usage fu
    where fu.profile_id = p_profile_id;

    return query
    select false, coalesce(v_current, 0), v_max;
    return;
  end if;

  update public.freemium_usage fu
  set
    job_searches_used = fu.job_searches_used + 1,
    updated_at = now()
  where
    fu.profile_id = p_profile_id
    and fu.job_searches_used < v_max
  returning fu.job_searches_used into v_new_used;

  if found then
    return query
    select true, v_new_used, v_max;
    return;
  end if;

  select fu.job_searches_used into v_current
  from public.freemium_usage fu
  where fu.profile_id = p_profile_id;

  return query
  select false, coalesce(v_current, 0), v_max;
end;
$$;

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

  update public.freemium_usage fu
  set
    resume_advice_used = fu.resume_advice_used + 1,
    updated_at = now()
  where
    fu.profile_id = p_profile_id
    and fu.resume_advice_used < v_max
  returning fu.resume_advice_used into v_used;

  if not found then
    select fu.resume_advice_used into v_used
    from public.freemium_usage fu
    where fu.profile_id = p_profile_id;

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
