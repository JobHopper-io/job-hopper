-- Refund the daily resume-advice credit when a Core/Premium generation fails, so an n8n
-- outage or transient error doesn't cost a real user part of their daily quota.
--
-- The daily counter is aggregate per (profile_id, usage_date), so a generation must record
-- WHICH day's credit it consumed to refund the right bucket. resume_products.daily_usage_date
-- is that stamp: set when a daily credit is consumed, cleared (NULL) when refunded or for the
-- free tier (which uses the lifetime counter and is untouched here).

alter table public.resume_products
  add column if not exists daily_usage_date date null;

comment on column public.resume_products.daily_usage_date is
  'For Core/Premium daily-quota generations: the UTC day whose resume_advice_daily_usage credit this row consumed. NULL for free-tier rows or after a refund. Used to reverse the exact daily bucket on failure.';

-- Reverses one daily credit for a resume_products row, if it still holds one. Idempotent:
-- clears the stamp so a second call (e.g. sweeper after markResumeProductFailed) is a no-op,
-- and a NULL stamp (free tier / already refunded) does nothing.
create or replace function public.refund_daily_resume_advice(
  p_resume_product_id uuid
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
  select rp.profile_id, rp.daily_usage_date into v_profile, v_stamp
  from public.resume_products rp
  where rp.id = p_resume_product_id;

  if v_profile is null or v_stamp is null then
    return;
  end if;

  update public.resume_advice_daily_usage
  set count = greatest(count - 1, 0)
  where profile_id = v_profile and usage_date = v_stamp;

  update public.resume_products
  set daily_usage_date = null
  where id = p_resume_product_id;
end;
$$;

revoke all on function public.refund_daily_resume_advice(uuid) from public;
grant execute on function public.refund_daily_resume_advice(uuid) to service_role;

-- Replace redeem to stamp daily_usage_date on consume, and to reuse (not re-charge) a
-- failed/cancelled row that STILL holds a credit (stamp set) — covering the race where a
-- retry arrives before the refund runs. A refunded failure (stamp NULL) consumes fresh.
create or replace function public.redeem_daily_resume_advice(
  p_profile_id uuid,
  p_job_match_id uuid,
  p_product_id uuid,
  p_daily_limit int
)
returns table (
  ok boolean,
  resume_product_id uuid,
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
  v_existing_id uuid;
  v_existing_status public.resume_product_status;
  v_existing_stamp date;
  v_new_id uuid;
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

  select rp.id, rp.status, rp.daily_usage_date
    into v_existing_id, v_existing_status, v_existing_stamp
  from public.resume_products rp
  where rp.profile_id = p_profile_id
    and rp.job_match_id = p_job_match_id
    and rp.product_id = p_product_id;

  -- Pending or complete: nothing to redeem.
  if v_existing_id is not null
     and v_existing_status not in ('failed', 'cancelled') then
    return query select
      false, null::uuid,
      coalesce((select rd.count from public.resume_advice_daily_usage rd
                where rd.profile_id = p_profile_id and rd.usage_date = v_today), 0),
      p_daily_limit, 'already_purchased'::text;
    return;
  end if;

  -- Failed/cancelled row that still holds a daily credit (not yet refunded): reuse it,
  -- no new charge, keep the existing stamp.
  if v_existing_id is not null and v_existing_stamp is not null then
    update public.resume_products rp
    set status = 'pending', error_message = null, completed_at = null, improvements_text = null
    where rp.id = v_existing_id;

    select coalesce(rd.count, 0) into v_used
    from public.resume_advice_daily_usage rd
    where rd.profile_id = p_profile_id and rd.usage_date = v_existing_stamp;

    return query select true, v_existing_id, coalesce(v_used, 0), p_daily_limit, null::text;
    return;
  end if;

  -- New row, cancelled row, or a refunded failure: consume one fresh daily credit (capped).
  insert into public.resume_advice_daily_usage (profile_id, usage_date, count)
  values (p_profile_id, v_today, 1)
  on conflict (profile_id, usage_date)
  do update set count = public.resume_advice_daily_usage.count + 1
  where public.resume_advice_daily_usage.count < p_daily_limit
  returning count into v_used;

  if v_used is null then
    select coalesce(rd.count, 0) into v_used
    from public.resume_advice_daily_usage rd
    where rd.profile_id = p_profile_id and rd.usage_date = v_today;

    return query select false, null::uuid, coalesce(v_used, 0), p_daily_limit, 'quota_exceeded'::text;
    return;
  end if;

  if v_existing_id is not null then
    update public.resume_products rp
    set status = 'pending', error_message = null, completed_at = null,
        improvements_text = null, daily_usage_date = v_today
    where rp.id = v_existing_id;

    v_new_id := v_existing_id;
  else
    insert into public.resume_products (profile_id, product_id, job_match_id, status, daily_usage_date)
    values (p_profile_id, p_product_id, p_job_match_id, 'pending', v_today)
    returning id into v_new_id;
  end if;

  return query select true, v_new_id, v_used, p_daily_limit, null::text;
end;
$$;

revoke all on function public.redeem_daily_resume_advice(uuid, uuid, uuid, int) from public;
grant execute on function public.redeem_daily_resume_advice(uuid, uuid, uuid, int) to service_role;
