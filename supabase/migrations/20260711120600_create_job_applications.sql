-- Job application tracking: inline status tagging for job cards.
-- Enables the Saved → Applied → Interviewing → Rejected / Ghosted pipeline.

-- 1. Application status enum (single source of truth for the tracker).
create type public.application_status as enum (
  'saved',
  'applied',
  'interviewing',
  'rejected',
  'ghosted'
);

-- 2. job_applications: one row per profile/match (upserted from the job card).
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.job_matches(id) on delete cascade,
  status public.application_status not null default 'saved',
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One application row per profile/match pair.
create unique index if not exists job_applications_profile_match_key
  on public.job_applications(profile_id, match_id);

create index if not exists idx_job_applications_profile_status
  on public.job_applications(profile_id, status);

-- 3. RLS: users manage their own application rows (same pattern as saved_jobs).
alter table public.job_applications enable row level security;

drop policy if exists "Users can view their job_applications rows" on public.job_applications;
create policy "Users can view their job_applications rows" on public.job_applications
  for select
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

drop policy if exists "Users can insert their job_applications rows" on public.job_applications;
create policy "Users can insert their job_applications rows" on public.job_applications
  for insert
  to authenticated
  with check (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

drop policy if exists "Users can update their job_applications rows" on public.job_applications;
create policy "Users can update their job_applications rows" on public.job_applications
  for update
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
  with check (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

drop policy if exists "Users can delete their job_applications rows" on public.job_applications;
create policy "Users can delete their job_applications rows" on public.job_applications
  for delete
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

-- 4. Grants: full CRUD for authenticated users.
grant select, insert, update, delete on public.job_applications to authenticated;
