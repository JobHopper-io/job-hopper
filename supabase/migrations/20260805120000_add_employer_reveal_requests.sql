-- Phase 4 of Recruiter-Visible Mode (docs/recruiter-visible-mode-build-plan.md): reveal &
-- approval flow. An employer requests to learn more about a specific anonymized candidate
-- found via employer-candidate-search (20260803...); the seeker approves or declines.
--
-- Snapshots everything each side needs to display, instead of granting either side RLS access
-- to the other's tables: employer_company_name is captured at request time, the candidate_*
-- columns mirror the anonymized fields employer-candidate-search already returned, and the
-- revealed_* columns are filled in only on approval. This means the table only ever needs
-- SELECT policies - all writes happen via service-role edge functions (employer-request-reveal,
-- seeker-respond-reveal-request), so there's no client-side insert/update policy to get wrong
-- for a table with two distinct actor types touching the same rows.
create table public.employer_reveal_requests (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid not null references public.employer_accounts(id) on delete cascade,
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  employer_company_name text not null,
  candidate_job_title text,
  candidate_career_level text,
  candidate_years_of_experience int,
  candidate_target_role_categories text[],
  candidate_preferred_locations text[],
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  revealed_first_name text,
  revealed_last_name text,
  revealed_email text,
  revealed_phone_number text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (employer_account_id, candidate_profile_id)
);

alter table public.employer_reveal_requests enable row level security;

create policy "Employers can view their own reveal requests"
on public.employer_reveal_requests
for select
to authenticated
using (
  employer_account_id in (select id from public.employer_accounts where auth_user_id = auth.uid())
);

create policy "Candidates can view reveal requests about them"
on public.employer_reveal_requests
for select
to authenticated
using (
  candidate_profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

grant select on public.employer_reveal_requests to authenticated;
