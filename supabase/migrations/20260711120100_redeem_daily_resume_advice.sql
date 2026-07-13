-- Core/Premium daily resume-advice redemption — the tier-scoped counterpart to
-- redeem_freemium_resume_advice (which is the FREE lifetime path). Enforces a per-UTC-day
-- cap against resume_advice_daily_usage and reserves the resume_products row, mirroring the
-- free path's retry semantics:
--   * pending/complete existing row -> already_purchased (nothing to redeem)
--   * failed existing row           -> reset to pending, NO daily credit consumed (retry)
--   * cancelled / no row            -> consume one daily credit, (re)create the pending row
--
-- The daily cap is enforced atomically via INSERT ... ON CONFLICT DO UPDATE ... WHERE, so
-- concurrent requests can't exceed the limit (the row lock serialises increments).

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
  v_new_id uuid;
begin
  if p_daily_limit <= 0 then
    return query select false, null::uuid, 0, p_daily_limit, 'disabled'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.job_matches jm
    where jm.id = p_job_match_id
      and jm.profile_id = p_profile_id
  ) then
    return query select false, null::uuid, 0, p_daily_limit, 'not_found'::text;
    return;
  end if;

  select rp.id, rp.status into v_existing_id, v_existing_status
  from public.resume_products rp
  where
    rp.profile_id = p_profile_id
    and rp.job_match_id = p_job_match_id
    and rp.product_id = p_product_id;

  -- Pending or complete: nothing to redeem.
  if v_existing_id is not null
     and v_existing_status not in ('failed', 'cancelled') then
    return query
    select
      false,
      null::uuid,
      coalesce(
        (select rd.count from public.resume_advice_daily_usage rd
         where rd.profile_id = p_profile_id and rd.usage_date = v_today),
        0
      ),
      p_daily_limit,
      'already_purchased'::text;
    return;
  end if;

  -- Retry after failure: reuse the row, no daily credit consumed.
  if v_existing_status = 'failed' then
    update public.resume_products rp
    set status = 'pending', error_message = null, completed_at = null, improvements_text = null
    where rp.id = v_existing_id;

    select coalesce(rd.count, 0) into v_used
    from public.resume_advice_daily_usage rd
    where rd.profile_id = p_profile_id and rd.usage_date = v_today;

    return query select true, v_existing_id, coalesce(v_used, 0), p_daily_limit, null::text;
    return;
  end if;

  -- New (or cancelled) generation: consume one daily credit, capped atomically.
  insert into public.resume_advice_daily_usage (profile_id, usage_date, count)
  values (p_profile_id, v_today, 1)
  on conflict (profile_id, usage_date)
  do update set count = public.resume_advice_daily_usage.count + 1
  where public.resume_advice_daily_usage.count < p_daily_limit
  returning count into v_used;

  -- No row returned means the ON CONFLICT update was filtered out: cap already reached.
  if v_used is null then
    select coalesce(rd.count, 0) into v_used
    from public.resume_advice_daily_usage rd
    where rd.profile_id = p_profile_id and rd.usage_date = v_today;

    return query select false, null::uuid, coalesce(v_used, 0), p_daily_limit, 'quota_exceeded'::text;
    return;
  end if;

  if v_existing_id is not null then
    update public.resume_products rp
    set status = 'pending', error_message = null, completed_at = null, improvements_text = null
    where rp.id = v_existing_id;

    v_new_id := v_existing_id;
  else
    insert into public.resume_products (profile_id, product_id, job_match_id, status)
    values (p_profile_id, p_product_id, p_job_match_id, 'pending')
    returning id into v_new_id;
  end if;

  return query select true, v_new_id, v_used, p_daily_limit, null::text;
end;
$$;

revoke all on function public.redeem_daily_resume_advice(uuid, uuid, uuid, int) from public;
grant execute on function public.redeem_daily_resume_advice(uuid, uuid, uuid, int) to service_role;
