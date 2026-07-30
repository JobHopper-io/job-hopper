-- Bug fix: try_claim_core_free_month's RETURNS TABLE output columns were named
-- claimed_count/max_claims, colliding with promo_core_free_month's real column names of the
-- same name (a classic PL/pgSQL RETURNS TABLE gotcha - those names become implicit variables
-- in the function body). This made the UPDATE's "claimed_count < max_claims" guard raise
-- "column reference is ambiguous" (42702) on every call, which the edge function's try/catch
-- silently swallowed - every checkout fell back to the normal 7-day trial, promo never fired.
-- Renaming the output columns (the edge function only reads `success`, never the counts,
-- so this doesn't require any frontend/edge-function change) removes the collision.
-- CREATE OR REPLACE cannot rename RETURNS TABLE output columns - must drop first.
drop function if exists public.try_claim_core_free_month(uuid);

create function public.try_claim_core_free_month(p_profile_id uuid)
returns table(success boolean, new_claimed_count integer, new_max_claims integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed_count integer;
  v_max_claims integer;
begin
  if exists (
    select 1 from public.promo_core_free_month_claims where profile_id = p_profile_id
  ) then
    select pcf.claimed_count, pcf.max_claims into v_claimed_count, v_max_claims
    from public.promo_core_free_month pcf where pcf.id = 1;
    return query select true, v_claimed_count, v_max_claims;
    return;
  end if;

  update public.promo_core_free_month
  set claimed_count = claimed_count + 1
  where id = 1 and claimed_count < max_claims
  returning promo_core_free_month.claimed_count, promo_core_free_month.max_claims
  into v_claimed_count, v_max_claims;

  if found then
    insert into public.promo_core_free_month_claims (profile_id) values (p_profile_id);
    return query select true, v_claimed_count, v_max_claims;
    return;
  end if;

  select pcf.claimed_count, pcf.max_claims into v_claimed_count, v_max_claims
  from public.promo_core_free_month pcf where pcf.id = 1;
  return query select false, v_claimed_count, v_max_claims;
end;
$$;

revoke all on function public.try_claim_core_free_month(uuid) from public;
grant execute on function public.try_claim_core_free_month(uuid) to service_role;
