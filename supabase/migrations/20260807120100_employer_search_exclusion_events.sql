-- Phase 6 bullet 2: append-only record of every candidate an employer's own search/reveal
-- attempt excluded (same-company match), so a seeker's "was my current employer actually
-- excluded" question is eventually answerable from data instead of "trust us" - same shape as
-- stripe_webhook_events (20260711120400).
--
-- Service-role-only for now: nothing reads this as an end user this phase. Add an
-- authenticated SELECT policy + GRANT together the moment a seeker-facing view exists, not
-- before (same footgun 20260805140000 fixed).
create table public.employer_search_exclusion_events (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid not null references public.employer_accounts(id) on delete cascade,
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('search', 'reveal_request')),
  occurred_at timestamptz not null default now()
);

comment on table public.employer_search_exclusion_events is
  'Append-only log of candidates excluded from an employer''s search/reveal results due to a same-company match. Audit trail only - no end-user-facing reader yet.';

create index idx_employer_search_exclusion_events_candidate
  on public.employer_search_exclusion_events(candidate_profile_id, occurred_at desc);

alter table public.employer_search_exclusion_events enable row level security;
grant select, insert on public.employer_search_exclusion_events to service_role;
