-- Phase 6 bullet 3: per-employer daily rate limits on search + reveal requests, so a bad
-- actor can't mass-search or spam reveal requests. One table with two counters (not two
-- copy-pasted tables) since both are keyed the same way; same self-resetting
-- (employer_account_id, usage_date) shape as resume_advice_daily_usage (20260711120000) -
-- a new UTC day is just a new row, no cron needed.
create table public.employer_daily_usage (
  employer_account_id uuid not null references public.employer_accounts(id) on delete cascade,
  usage_date date not null,
  search_count int not null default 0 check (search_count >= 0),
  reveal_count int not null default 0 check (reveal_count >= 0),
  primary key (employer_account_id, usage_date)
);

comment on table public.employer_daily_usage is
  'Per-day search/reveal-request counts per employer account. usage_date is the UTC calendar day; a new day starts a fresh row at 0.';

alter table public.employer_daily_usage enable row level security;
grant select, insert, update on public.employer_daily_usage to service_role;

-- Tunable per the plan's "generous ceiling, admin-tunable" defaults, same UX as the other
-- freemium_settings caps (edited via AdminSettings.vue).
alter table public.freemium_settings
  add column employer_daily_searches int not null default 20,
  add column employer_daily_reveal_requests int not null default 10;

comment on column public.freemium_settings.employer_daily_searches is
  'Max candidate-search requests per UTC day for a single employer account.';
comment on column public.freemium_settings.employer_daily_reveal_requests is
  'Max reveal requests per UTC day for a single employer account.';

-- Direct copies of redeem_daily_resume_advice's atomic-upsert shape: INSERT ... ON CONFLICT
-- DO UPDATE ... WHERE count < limit RETURNING count. NULL return = cap already hit; the row
-- lock on the upsert serialises concurrent increments so the cap can't be exceeded by a race.
create or replace function public.bump_employer_daily_search_count(
  p_employer_account_id uuid,
  p_daily_limit int
)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.employer_daily_usage (employer_account_id, usage_date, search_count)
  values (p_employer_account_id, (now() at time zone 'utc')::date, 1)
  on conflict (employer_account_id, usage_date)
  do update set search_count = public.employer_daily_usage.search_count + 1
  where public.employer_daily_usage.search_count < p_daily_limit
  returning search_count;
$$;

create or replace function public.bump_employer_daily_reveal_count(
  p_employer_account_id uuid,
  p_daily_limit int
)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.employer_daily_usage (employer_account_id, usage_date, reveal_count)
  values (p_employer_account_id, (now() at time zone 'utc')::date, 1)
  on conflict (employer_account_id, usage_date)
  do update set reveal_count = public.employer_daily_usage.reveal_count + 1
  where public.employer_daily_usage.reveal_count < p_daily_limit
  returning reveal_count;
$$;

revoke all on function public.bump_employer_daily_search_count(uuid, int) from public;
revoke all on function public.bump_employer_daily_reveal_count(uuid, int) from public;
grant execute on function public.bump_employer_daily_search_count(uuid, int) to service_role;
grant execute on function public.bump_employer_daily_reveal_count(uuid, int) to service_role;
