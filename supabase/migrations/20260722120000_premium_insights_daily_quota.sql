-- Per-UTC-day quota for the "unlimited" Premium Insights path (Premium base tier + the
-- premium_insights add-on), mirroring the Resume Advice daily-quota pattern
-- (resume_advice_daily_usage + redeem_daily_resume_advice + refund_daily_resume_advice).
--
-- Why: claim_premium_insights_for_addon previously had NO per-user cap, so a single Premium/
-- add-on account could draw down the shared Apollo credit budget without bound. This adds an
-- anti-abuse ceiling that "feels unlimited" to real users (historical peak is 2 requests per
-- user per UTC day; default cap is 20) while capping runaway cost. The free/Core-without-addon
-- path is unchanged — it keeps its lifetime quota via redeem_freemium_premium_insights.
--
-- Calendar-day reset at midnight UTC via a DATE-scoped counter: a new UTC day is simply a new
-- (profile_id, usage_date) key starting at 0 — self-resetting, no cron. Same design as the
-- Resume Advice daily counter.

-- ---------------------------------------------------------------------------
-- premium_insights_daily_usage
-- ---------------------------------------------------------------------------
create table if not exists public.premium_insights_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  count int not null default 0 check (count >= 0),
  primary key (profile_id, usage_date)
);

comment on table public.premium_insights_daily_usage is
  'Per-day Premium Insights (hiring-contacts) requests for the unlimited path (Premium base tier + premium_insights add-on). usage_date is the UTC calendar day; a new day starts a fresh row at 0. Free/Core-without-addon use the lifetime counter in freemium_usage instead.';

alter table public.premium_insights_daily_usage enable row level security;

-- Users may read their own daily usage (e.g. to show "N left today"); only the service role
-- (edge function) writes, via the security-definer RPCs.
drop policy if exists "Users can view their premium_insights_daily_usage" on public.premium_insights_daily_usage;
create policy "Users can view their premium_insights_daily_usage" on public.premium_insights_daily_usage
  for select
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

grant select on public.premium_insights_daily_usage to authenticated;
grant select, insert, update on public.premium_insights_daily_usage to service_role;

-- ---------------------------------------------------------------------------
-- freemium_settings: tunable daily cap for the unlimited insights path
-- ---------------------------------------------------------------------------
-- Default 20/day, matching premium_daily_resume_advice. Generous ceiling (~10x the all-time
-- observed daily peak of 2) so it never bites normal use, but bounds a runaway account.
alter table public.freemium_settings
  add column if not exists premium_daily_insights int not null default 20;

comment on column public.freemium_settings.premium_daily_insights is
  'Max Premium Insights (hiring-contacts) requests per UTC day for the unlimited path (Premium base tier + premium_insights add-on). Set 0 to disable the unlimited path.';

-- ---------------------------------------------------------------------------
-- job_hiring_contacts: stamp which day's credit a row consumed (for exact refunds)
-- ---------------------------------------------------------------------------
-- The daily counter is aggregate per (profile_id, usage_date), so a request must record WHICH
-- day's credit it consumed to refund the right bucket on failure. Mirrors
-- resume_products.daily_usage_date. NULL for freemium-path rows or after a refund.
alter table public.job_hiring_contacts
  add column if not exists daily_usage_date date null;

comment on column public.job_hiring_contacts.daily_usage_date is
  'For the unlimited insights path: the UTC day whose premium_insights_daily_usage credit this row consumed. NULL for freemium-path rows or after a refund. Used to reverse the exact daily bucket on failure.';

-- ---------------------------------------------------------------------------
-- refund_daily_premium_insights
-- ---------------------------------------------------------------------------
-- Reverses one daily credit for a hiring-contacts row, if it still holds one. Idempotent:
-- clears the stamp so a second call is a no-op, and a NULL stamp (freemium path / already
-- refunded) does nothing. Called when an unlimited-path generation fails so an Apollo/LLM
-- outage doesn't cost a real user part of their daily quota.
create or replace function public.refund_daily_premium_insights(
  p_hiring_contact_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_stamp date;
begin
  select jhc.profile_id, jhc.daily_usage_date into v_profile, v_stamp
  from public.job_hiring_contacts jhc
  where jhc.id = p_hiring_contact_id;

  if v_profile is null or v_stamp is null then
    return;
  end if;

  update public.premium_insights_daily_usage
  set count = greatest(count - 1, 0)
  where profile_id = v_profile and usage_date = v_stamp;

  update public.job_hiring_contacts
  set daily_usage_date = null
  where id = p_hiring_contact_id;
end;
$$;

revoke all on function public.refund_daily_premium_insights(uuid) from public;
grant execute on function public.refund_daily_premium_insights(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_premium_insights_for_addon (redefined with a per-UTC-day cap)
-- ---------------------------------------------------------------------------
-- Adds p_daily_limit and enforces it atomically via INSERT ... ON CONFLICT ... WHERE, mirroring
-- redeem_daily_resume_advice. Retry semantics match the Resume Advice path:
--   * complete row (this job)                    -> already_exists (nothing to claim)
--   * failed/cancelled row STILL holding a credit -> reuse, NO new charge, keep the stamp
--     (covers the race where a retry arrives before the failure refund runs)
--   * new row, or a refunded failure/cancel      -> consume one fresh daily credit (capped)
-- The existing one-pending-per-profile guard (partial unique index + the in_progress check
-- below) is preserved. New return columns daily_used/daily_limit surface remaining quota.
create or replace function public.claim_premium_insights_for_addon(
  p_profile_id uuid,
  p_job_match_id uuid,
  p_daily_limit int
)
returns table (
  ok boolean,
  hiring_contact_id uuid,
  daily_used int,
  daily_limit int,
  err text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used int;
  v_new_id uuid;
  v_existing_id uuid;
  v_existing_status public.job_hiring_contacts_status;
  v_existing_stamp date;
begin
  if p_daily_limit <= 0 then
    return query select false, null::uuid, 0, p_daily_limit, 'disabled'::text;
    return;
  end if;

  if not exists (
    select 1 from public.job_matches jm
    where jm.id = p_job_match_id and jm.profile_id = p_profile_id
  ) then
    return query select false, null::uuid, 0, p_daily_limit, 'not_found'::text;
    return;
  end if;

  -- Concurrency guard: only one insights job in flight per profile at a time.
  if exists (
    select 1 from public.job_hiring_contacts jhc
    where jhc.profile_id = p_profile_id and jhc.status = 'pending'
  ) then
    return query select false, null::uuid, 0, p_daily_limit, 'in_progress'::text;
    return;
  end if;

  select jhc.id, jhc.status, jhc.daily_usage_date
    into v_existing_id, v_existing_status, v_existing_stamp
  from public.job_hiring_contacts jhc
  where jhc.profile_id = p_profile_id and jhc.job_match_id = p_job_match_id;

  -- Already complete for this job: nothing to claim.
  if v_existing_id is not null and v_existing_status = 'complete' then
    return query select
      false, null::uuid,
      coalesce((select d.count from public.premium_insights_daily_usage d
                where d.profile_id = p_profile_id and d.usage_date = v_today), 0),
      p_daily_limit, 'already_exists'::text;
    return;
  end if;

  -- Failed/cancelled row that still holds a daily credit (not yet refunded): reuse it,
  -- no new charge, keep the existing stamp.
  if v_existing_id is not null and v_existing_stamp is not null then
    update public.job_hiring_contacts jhc
    set status = 'pending', contacts = null, company_summary = null,
        error_code = null, completed_at = null, updated_at = now()
    where jhc.id = v_existing_id;

    select coalesce(d.count, 0) into v_used
    from public.premium_insights_daily_usage d
    where d.profile_id = p_profile_id and d.usage_date = v_existing_stamp;

    return query select true, v_existing_id, coalesce(v_used, 0), p_daily_limit, null::text;
    return;
  end if;

  -- New row, or a failed/cancelled row whose credit was refunded: consume one fresh daily
  -- credit, capped atomically.
  insert into public.premium_insights_daily_usage (profile_id, usage_date, count)
  values (p_profile_id, v_today, 1)
  on conflict (profile_id, usage_date)
  do update set count = public.premium_insights_daily_usage.count + 1
  where public.premium_insights_daily_usage.count < p_daily_limit
  returning count into v_used;

  -- No row returned means the ON CONFLICT update was filtered out: cap already reached.
  if v_used is null then
    select coalesce(d.count, 0) into v_used
    from public.premium_insights_daily_usage d
    where d.profile_id = p_profile_id and d.usage_date = v_today;

    return query select false, null::uuid, coalesce(v_used, 0), p_daily_limit, 'quota_exceeded'::text;
    return;
  end if;

  if v_existing_id is not null then
    update public.job_hiring_contacts jhc
    set status = 'pending', contacts = null, company_summary = null,
        error_code = null, completed_at = null, daily_usage_date = v_today, updated_at = now()
    where jhc.id = v_existing_id;

    v_new_id := v_existing_id;
  else
    insert into public.job_hiring_contacts (profile_id, job_match_id, status, daily_usage_date)
    values (p_profile_id, p_job_match_id, 'pending', v_today)
    returning id into v_new_id;
  end if;

  return query select true, v_new_id, v_used, p_daily_limit, null::text;
end;
$$;

-- The signature changed (added p_daily_limit), so drop the old 2-arg overload to avoid an
-- ambiguous/stale function lingering.
drop function if exists public.claim_premium_insights_for_addon(uuid, uuid);

revoke all on function public.claim_premium_insights_for_addon(uuid, uuid, int) from public;
grant execute on function public.claim_premium_insights_for_addon(uuid, uuid, int) to service_role;
