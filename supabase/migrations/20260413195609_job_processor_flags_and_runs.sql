-- Runtime flags for the FastAPI job processor (replaces n8n Data Table JOB_PROCESSOR_HIT_APOLLO_LIMIT).

create table public.job_processor_flags (
  id smallint primary key check (id = 1),
  apollo_credits_exhausted boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.job_processor_flags (id, apollo_credits_exhausted) values (1, false);

create type public.job_processor_run_status as enum ('queued', 'running', 'completed', 'failed');

create table public.job_processor_runs (
  id uuid primary key default gen_random_uuid(),
  status public.job_processor_run_status not null default 'queued',
  options jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index job_processor_runs_status_created_idx
  on public.job_processor_runs (status, created_at desc);

alter table public.job_processor_flags enable row level security;
alter table public.job_processor_runs enable row level security;

-- Allow concurrent workers to claim pending rows without double-processing.
do $$ begin
  alter type public.scraper_raw_job_status add value 'processing';
exception
  when duplicate_object then null;
end $$;

create or replace function public.claim_scraper_raw_jobs(p_limit integer)
returns setof public.scraper_raw_jobs
language sql
as $$
  with cte as (
    select id
    from public.scraper_raw_jobs
    where status = 'pending'::public.scraper_raw_job_status
    order by date_scraped asc, id asc
    limit p_limit
    for update skip locked
  )
  update public.scraper_raw_jobs j
  set status = 'processing'::public.scraper_raw_job_status
  from cte
  where j.id = cte.id
  returning j.*;
$$;

revoke all on function public.claim_scraper_raw_jobs(integer) from public;
grant execute on function public.claim_scraper_raw_jobs(integer) to service_role;
