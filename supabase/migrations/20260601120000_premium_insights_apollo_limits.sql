-- Premium Insights: apollo_limits, hiring contacts cache, freemium column, RPCs.

-- ---------------------------------------------------------------------------
-- apollo_limits: per-process Apollo credit budget (usage resets monthly via cron)
-- ---------------------------------------------------------------------------
create table if not exists public.apollo_limits (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  usage int not null default 0 check (usage >= 0),
  credit_limit int not null default 0 check (credit_limit >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.apollo_limits is
  'Per-backend-process counters for Apollo API credits. usage increments before paid calls; refunds on failure. credit_limit=0 disables that process.';

insert into public.apollo_limits (name, usage, credit_limit)
values
  ('premium_insights', 0, 500),
  ('job_processor', 0, 5000)
on conflict (name) do nothing;

create or replace function public.set_apollo_limits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_apollo_limits_updated_at on public.apollo_limits;
create trigger set_apollo_limits_updated_at
before update on public.apollo_limits
for each row
execute function public.set_apollo_limits_updated_at();

alter table public.apollo_limits enable row level security;

drop policy if exists "Authenticated can read apollo_limits" on public.apollo_limits;
create policy "Authenticated can read apollo_limits"
on public.apollo_limits
for select
to authenticated
using (true);

drop policy if exists "Admins can update apollo_limits credit_limit" on public.apollo_limits;
create policy "Admins can update apollo_limits credit_limit"
on public.apollo_limits
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

grant select on public.apollo_limits to authenticated;
grant update (credit_limit) on public.apollo_limits to authenticated;
grant all on public.apollo_limits to service_role;

-- ---------------------------------------------------------------------------
-- RPC: try_consume_apollo_credits (atomic, row lock)
-- ---------------------------------------------------------------------------
create or replace function public.try_consume_apollo_credits(p_name text, p_amount int)
returns table (
  ok boolean,
  usage_after int,
  credit_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.apollo_limits%rowtype;
  v_usage int;
  v_limit int;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  select * into v_row
  from public.apollo_limits al
  where al.name = p_name
  for update;

  if not found then
    return query select false, 0, 0;
    return;
  end if;

  if v_row.credit_limit <= 0 or v_row.usage + p_amount > v_row.credit_limit then
    return query select false, v_row.usage, v_row.credit_limit;
    return;
  end if;

  update public.apollo_limits al
  set usage = al.usage + p_amount
  where al.name = p_name
  returning al.usage, al.credit_limit into v_usage, v_limit;

  return query select true, v_usage, v_limit;
end;
$$;

revoke all on function public.try_consume_apollo_credits(text, int) from public;
grant execute on function public.try_consume_apollo_credits(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: refund_apollo_credits
-- ---------------------------------------------------------------------------
create or replace function public.refund_apollo_credits(p_name text, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  update public.apollo_limits al
  set usage = greatest(0, al.usage - p_amount)
  where al.name = p_name;
end;
$$;

revoke all on function public.refund_apollo_credits(text, int) from public;
grant execute on function public.refund_apollo_credits(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: reset_apollo_limits_usage (cron / service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.reset_apollo_limits_usage()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.apollo_limits set usage = 0;
end;
$$;

revoke all on function public.reset_apollo_limits_usage() from public;
grant execute on function public.reset_apollo_limits_usage() to service_role;

-- ---------------------------------------------------------------------------
-- freemium_settings: max_premium_insights
-- ---------------------------------------------------------------------------
alter table public.freemium_settings
  add column if not exists max_premium_insights int not null default 3 check (max_premium_insights >= 0);

update public.freemium_settings
set max_premium_insights = 3
where id = 1 and max_premium_insights is null;

-- ---------------------------------------------------------------------------
-- freemium_usage: premium_insights_used
-- ---------------------------------------------------------------------------
alter table public.freemium_usage
  add column if not exists premium_insights_used int not null default 0 check (premium_insights_used >= 0);

-- ---------------------------------------------------------------------------
-- job_hiring_contacts_status
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'job_hiring_contacts_status'
  ) then
    create type public.job_hiring_contacts_status as enum (
      'pending',
      'complete',
      'failed',
      'cancelled'
    );
  end if;
end;
$$;

create table if not exists public.job_hiring_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_match_id uuid not null references public.job_matches (id) on delete cascade,
  status public.job_hiring_contacts_status not null default 'pending',
  contacts jsonb,
  company_summary jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (profile_id, job_match_id)
);

create unique index if not exists job_hiring_contacts_one_pending_per_profile
  on public.job_hiring_contacts (profile_id)
  where status = 'pending';

create or replace function public.set_job_hiring_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_job_hiring_contacts_updated_at on public.job_hiring_contacts;
create trigger set_job_hiring_contacts_updated_at
before update on public.job_hiring_contacts
for each row
execute function public.set_job_hiring_contacts_updated_at();

alter table public.job_hiring_contacts enable row level security;

drop policy if exists "Users can read own job_hiring_contacts" on public.job_hiring_contacts;
create policy "Users can read own job_hiring_contacts"
on public.job_hiring_contacts
for select
to authenticated
using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

grant select on public.job_hiring_contacts to authenticated;
grant all on public.job_hiring_contacts to service_role;

-- ---------------------------------------------------------------------------
-- company_apollo_cache (service_role writes only)
-- ---------------------------------------------------------------------------
create table if not exists public.company_apollo_cache (
  cache_key text primary key,
  company_name text not null,
  location_region text,
  apollo_organization_id text not null,
  primary_domain text,
  resolved_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.company_apollo_cache enable row level security;

grant all on public.company_apollo_cache to service_role;

-- ---------------------------------------------------------------------------
-- redeem_freemium_premium_insights
-- ---------------------------------------------------------------------------
create or replace function public.redeem_freemium_premium_insights(p_profile_id uuid, p_job_match_id uuid)
returns table (
  ok boolean,
  hiring_contact_id uuid,
  premium_insights_used int,
  max_premium_insights int,
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
  select coalesce(fs.max_premium_insights, 3) into v_max
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
    from public.job_hiring_contacts jhc
    where jhc.profile_id = p_profile_id
      and jhc.status = 'pending'
  ) then
    return query
    select false, null::uuid, 0, v_max, 'in_progress'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status = 'complete'
  ) then
    return query
    select false, null::uuid, 0, v_max, 'already_exists'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status = 'pending'
  ) then
    return query
    select false, null::uuid, 0, v_max, 'already_exists'::text;
    return;
  end if;

  update public.freemium_usage fu
  set
    premium_insights_used = fu.premium_insights_used + 1,
    updated_at = now()
  where
    fu.profile_id = p_profile_id
    and fu.premium_insights_used < v_max
  returning fu.premium_insights_used into v_used;

  if not found then
    select fu.premium_insights_used into v_used
    from public.freemium_usage fu
    where fu.profile_id = p_profile_id;

    return query
    select false, null::uuid, coalesce(v_used, 0), v_max, 'quota_exceeded'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status in ('failed', 'cancelled')
  ) then
    update public.job_hiring_contacts jhc
    set
      status = 'pending',
      contacts = null,
      company_summary = null,
      error_code = null,
      completed_at = null,
      updated_at = now()
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status in ('failed', 'cancelled')
    returning jhc.id into v_new_id;

    return query
    select true, v_new_id, v_used, v_max, null::text;
    return;
  end if;

  insert into public.job_hiring_contacts (profile_id, job_match_id, status)
  values (p_profile_id, p_job_match_id, 'pending')
  returning id into v_new_id;

  return query
  select true, v_new_id, v_used, v_max, null::text;
end;
$$;

revoke all on function public.redeem_freemium_premium_insights(uuid, uuid) from public;
grant execute on function public.redeem_freemium_premium_insights(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_premium_insights_for_addon
-- ---------------------------------------------------------------------------
create or replace function public.claim_premium_insights_for_addon(p_profile_id uuid, p_job_match_id uuid)
returns table (
  ok boolean,
  hiring_contact_id uuid,
  err text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  if not exists (
    select 1
    from public.job_matches jm
    where jm.id = p_job_match_id
      and jm.profile_id = p_profile_id
  ) then
    return query
    select false, null::uuid, 'not_found'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where jhc.profile_id = p_profile_id
      and jhc.status = 'pending'
  ) then
    return query
    select false, null::uuid, 'in_progress'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status = 'complete'
  ) then
    return query
    select false, null::uuid, 'already_exists'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status = 'pending'
  ) then
    return query
    select false, null::uuid, 'already_exists'::text;
    return;
  end if;

  if exists (
    select 1
    from public.job_hiring_contacts jhc
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status in ('failed', 'cancelled')
  ) then
    update public.job_hiring_contacts jhc
    set
      status = 'pending',
      contacts = null,
      company_summary = null,
      error_code = null,
      completed_at = null,
      updated_at = now()
    where
      jhc.profile_id = p_profile_id
      and jhc.job_match_id = p_job_match_id
      and jhc.status in ('failed', 'cancelled')
    returning jhc.id into v_new_id;

    return query
    select true, v_new_id, null::text;
    return;
  end if;

  insert into public.job_hiring_contacts (profile_id, job_match_id, status)
  values (p_profile_id, p_job_match_id, 'pending')
  returning id into v_new_id;

  return query
  select true, v_new_id, null::text;
end;
$$;

revoke all on function public.claim_premium_insights_for_addon(uuid, uuid) from public;
grant execute on function public.claim_premium_insights_for_addon(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- refund_freemium_premium_insights (rollback quota if pipeline fails after redeem)
-- ---------------------------------------------------------------------------
create or replace function public.refund_freemium_premium_insights(p_profile_id uuid, p_hiring_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.job_hiring_contacts jhc
  where
    jhc.id = p_hiring_contact_id
    and jhc.profile_id = p_profile_id
    and jhc.status = 'pending';

  if found then
    update public.freemium_usage fu
    set
      premium_insights_used = greatest(0, fu.premium_insights_used - 1),
      updated_at = now()
    where fu.profile_id = p_profile_id;
  end if;
end;
$$;

revoke all on function public.refund_freemium_premium_insights(uuid, uuid) from public;
grant execute on function public.refund_freemium_premium_insights(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Monthly pg_cron: reset Apollo usage on the 10th (UTC midnight)
-- Requires vault secrets project_url + cron_secret (same as run-scheduled-jobs).
-- ---------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('reset-apollo-limits-monthly');
    exception
      when others then
        null;
    end;
    perform cron.schedule(
      'reset-apollo-limits-monthly',
      '0 0 10 * *',
      $body$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/reset-apollo-limits',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := jsonb_build_object('scheduled_at', now())
      ) as request_id;
      $body$
    );
  end if;
end;
$cron$;
