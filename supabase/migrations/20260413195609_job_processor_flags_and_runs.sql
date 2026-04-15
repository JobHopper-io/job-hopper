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

-- Add enum value in this migration only. PostgreSQL forbids using a new enum value
-- in the same transaction it was added (55P04). claim_scraper_raw_jobs() lives in
-- the following migration so it runs after commit.
do $$ begin
  alter type public.scraper_raw_job_status add value 'processing';
exception
  when duplicate_object then null;
end $$;
