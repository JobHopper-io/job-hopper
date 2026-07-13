-- Allow a free resume-advice retry after a failed fulfillment.
--
-- Previously any row whose status was `distinct from 'cancelled'` returned
-- 'already_purchased', so once fulfillment failed the job was permanently stuck:
-- the user had already been charged a freemium credit (usage is incremented before
-- the insert) and could never redeem the advice they paid for.
--
-- Two changes:
--   1. A 'failed' row is reset to 'pending' and reused. No additional credit is
--      consumed, because the original attempt already consumed one.
--   2. A 'cancelled' row is likewise reused rather than re-inserted. The old code
--      fell through to INSERT, which would violate
--      UNIQUE (profile_id, job_match_id, product_id). A cancellation is a fresh
--      purchase, so it does consume a credit.

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
  v_existing_id uuid;
  v_existing_status public.resume_product_status;
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
    select false, null::uuid, 0, v_max, 'already_purchased'::text;
    return;
  end if;

  -- Retry after failure: reuse the row, credit already spent.
  if v_existing_status = 'failed' then
    update public.resume_products rp
    set
      status = 'pending',
      error_message = null,
      completed_at = null,
      improvements_text = null
    where rp.id = v_existing_id;

    select fu.resume_advice_used into v_used
    from public.freemium_usage fu
    where fu.profile_id = p_profile_id;

    return query
    select true, v_existing_id, coalesce(v_used, 0), v_max, null::text;
    return;
  end if;

  -- New purchase (no row, or a cancelled one): consume a credit.
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

  if v_existing_id is not null then
    update public.resume_products rp
    set
      status = 'pending',
      error_message = null,
      completed_at = null,
      improvements_text = null
    where rp.id = v_existing_id;

    v_new_id := v_existing_id;
  else
    insert into public.resume_products (profile_id, product_id, job_match_id, status)
    values (p_profile_id, p_product_id, p_job_match_id, 'pending')
    returning id into v_new_id;
  end if;

  return query
  select true, v_new_id, v_used, v_max, null::text;
end;
$$;

grant execute on function public.redeem_freemium_resume_advice(uuid, uuid, uuid) to service_role;
