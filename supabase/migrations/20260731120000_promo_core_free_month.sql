-- "First 25 Core subscribers get a free month" promo. Atomic claim, same pattern as
-- try_consume_freemium_job_search (20260519120000): a single-row counter with the guard
-- predicate inside the UPDATE's WHERE clause, so concurrent claims serialize on Postgres's
-- row lock instead of racing (no claim #26 can slip through under concurrency).

create table public.promo_core_free_month (
  id integer primary key default 1,
  claimed_count integer not null default 0,
  max_claims integer not null default 25,
  constraint promo_core_free_month_singleton check (id = 1)
);
insert into public.promo_core_free_month (id) values (1);

-- Idempotency + audit: one claim per profile, ever - so a retried/duplicate checkout
-- attempt by the same person doesn't burn a second slot.
create table public.promo_core_free_month_claims (
  profile_id uuid primary key references public.profiles(id),
  claimed_at timestamptz not null default now()
);

create or replace function public.try_claim_core_free_month(p_profile_id uuid)
returns table(success boolean, claimed_count integer, max_claims integer)
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

-- Public read of the counter only (no PII), so logged-out visitors on /pricing see a live
-- remaining-spots count too - same shape as freemium_settings being readable.
alter table public.promo_core_free_month enable row level security;
create policy "Anyone can read the promo counter"
on public.promo_core_free_month
for select
to anon, authenticated
using (true);
grant select on public.promo_core_free_month to anon, authenticated;

-- promo_core_free_month_claims: RLS enabled, NO policies for anon/authenticated (same
-- shape as sponsor_watch_events, 20260718130000) - claims are an internal/audit record,
-- not user-facing, only written via the service-role RPC above.
alter table public.promo_core_free_month_claims enable row level security;
