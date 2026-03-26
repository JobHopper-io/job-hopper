-- Staging table for scraped job rows before promotion to job_hopper_live.
-- Column types match job_hopper_live where those columns exist; job_hopper_live has no status,
-- so status is text for pipeline state (e.g. pending, promoted, rejected).

create table public.scraper_raw_jobs (
  id uuid primary key default gen_random_uuid(),
  job_title text not null,
  company_name text not null,
  location text,
  is_remote boolean not null default false,
  pay_min real,
  pay_max real,
  pay_type public.pay_type,
  schedules text[],
  employment_types text[],
  description text,
  apply_link text,
  posted_date timestamptz,
  date_scraped timestamptz not null default now(),
  status text not null default 'pending'
);

alter table public.scraper_raw_jobs enable row level security;

-- Backend / service_role only (no client policies).
grant delete, insert, references, select, trigger, truncate, update on table public.scraper_raw_jobs to service_role;

revoke all privileges on table public.scraper_raw_jobs from anon;
revoke all privileges on table public.scraper_raw_jobs from authenticated;
