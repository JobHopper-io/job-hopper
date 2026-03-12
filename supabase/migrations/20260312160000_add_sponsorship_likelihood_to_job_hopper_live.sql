-- Add sponsorship_likelihood enum and column to job_hopper_live
-- Values: 'Low', 'Medium', 'High', 'N/A'

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'sponsorship_likelihood'
      and n.nspname = 'public'
  ) then
    create type public.sponsorship_likelihood as enum ('Low', 'Medium', 'High', 'N/A');
  end if;
end
$$;

alter table public.job_hopper_live
  add column if not exists sponsorship_likelihood public.sponsorship_likelihood not null default 'N/A';

-- Add requires_us_sponsorship preference to profiles for onboarding/profile flows
alter table public.profiles
  add column if not exists requires_us_sponsorship boolean;

