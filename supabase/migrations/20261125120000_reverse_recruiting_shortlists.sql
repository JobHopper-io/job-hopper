-- Reverse recruiting (growth day 3): job shortlists for approved job-seeker prospects.
--
--   1. job_vacancy_checks: every vacancy check (_shared/job-vacancy.ts); the latest per
--      job is a cache, rechecked after 24h (scripts/build-shortlists.mjs)
--   2. prospect_shortlists: a frozen snapshot of 3-5 jobs per prospect, opened by an
--      unguessable token at /s/:token (shortlist edge function); expires after 14 days
--   3. shortlist_events: page views (job_id null) and tracked apply clicks
--   4. reverse_recruiting_funnel(): built / viewed / clicked / signups for the dashboard
--
-- All service role only: the public page reads through the shortlist edge function.

-- 1 -------------------------------------------------------------------------------------

create table public.job_vacancy_checks (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.job_hopper_live (id) on delete cascade,
  status text not null check (status in ('open', 'likely_open', 'closed', 'unverified')),
  method text not null,
  http_status integer,
  checked_at timestamptz not null default now()
);

create index job_vacancy_checks_job_latest_idx on public.job_vacancy_checks (job_id, checked_at desc);

-- 2 -------------------------------------------------------------------------------------

-- jobs: [{ job_id, title, company, location, apply_link, posted_date, bullets[], vacancy_status }]
-- token: 32 random bytes, base64url without padding (43 chars), made by the builder.
create table public.prospect_shortlists (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  jobs jsonb not null check (jsonb_typeof(jobs) = 'array'),
  status text not null check (status in ('ready', 'too_few')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  first_viewed_at timestamptz,
  check (status = 'too_few' or jsonb_array_length(jobs) between 3 and 5),
  check (jsonb_array_length(jobs) <= 5)
);

create index prospect_shortlists_prospect_idx on public.prospect_shortlists (prospect_id, created_at desc);

-- 3 -------------------------------------------------------------------------------------

-- job_id has no FK: it points into the shortlist's own jobs snapshot, which outlives the
-- live job row.
create table public.shortlist_events (
  id bigint generated always as identity primary key,
  shortlist_id uuid not null references public.prospect_shortlists (id) on delete cascade,
  job_id uuid,
  event text not null check (event in ('view', 'click')),
  created_at timestamptz not null default now(),
  check ((event = 'view' and job_id is null) or (event = 'click' and job_id is not null))
);

create index shortlist_events_shortlist_idx on public.shortlist_events (shortlist_id, event);

alter table public.job_vacancy_checks enable row level security;
alter table public.prospect_shortlists enable row level security;
alter table public.shortlist_events enable row level security;
revoke all on table public.job_vacancy_checks, public.prospect_shortlists, public.shortlist_events from anon, authenticated;
grant all on table public.job_vacancy_checks, public.prospect_shortlists, public.shortlist_events to service_role;

-- 4 -------------------------------------------------------------------------------------

-- Each step is its own all-time count (like the outbound funnel), not a cohort.
-- signups: profiles first-touched by the shortlist page CTA (utm_campaign set by App.vue
-- capture -> handle_new_user()).
create or replace function public.reverse_recruiting_funnel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'built', (select count(*) from public.prospect_shortlists),
    'ready', (select count(*) from public.prospect_shortlists where status = 'ready'),
    'too_few', (select count(*) from public.prospect_shortlists where status = 'too_few'),
    'viewed', (select count(*) from public.prospect_shortlists where first_viewed_at is not null),
    'clicked', (select count(distinct shortlist_id) from public.shortlist_events where event = 'click'),
    'clicks', (select count(*) from public.shortlist_events where event = 'click'),
    'signups', (select count(*) from public.profiles where utm_campaign = 'reverse_recruiting')
  );
$$;
revoke execute on function public.reverse_recruiting_funnel() from public, anon, authenticated;
grant execute on function public.reverse_recruiting_funnel() to service_role;
