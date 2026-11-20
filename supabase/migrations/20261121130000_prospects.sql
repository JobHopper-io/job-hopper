-- Growth step 5 (docs/growth/lead-system-design.md §1): person-level leads.
--
--   institutional_leads (organization) -> prospects (person) -> profiles (signed-up user)
--
-- A job seeker found online has no organization; an institutional decision maker is a
-- prospect linked to their organization. prospect_evidence keeps every place a person
-- was found. Service role only: RLS on, no policies.

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('job_seeker', 'institution_contact')),
  institutional_lead_id uuid references public.institutional_leads (id) on delete set null,
  profile_id uuid unique references public.profiles (id) on delete set null,
  email text,
  -- null when email is null or blank, so blanks can't collide on the unique index
  email_normalized text generated always as (nullif(public.normalize_email(email), '')) stored,
  first_name text,
  last_name text,
  linkedin_url text,
  -- ISO 3166-1 alpha-2 ('US'). Decides which law applies; unknown = not eligible.
  country text,
  source text not null,
  source_ref text,
  -- preferences: same names/types as profiles, so they copy across at signup
  target_job_title text,
  target_role_categories public.role_category[],
  preferred_locations text[],
  open_to_remote boolean,
  years_of_experience int check (years_of_experience is null or years_of_experience >= 0),
  career_level public.career_level,
  requires_us_sponsorship boolean,
  consent_status text not null default 'none'
    check (consent_status in ('none', 'legitimate_interest', 'opted_in', 'opted_out')),
  do_not_contact boolean not null default false,
  fit_score numeric(5, 2) check (fit_score is null or (fit_score >= 0 and fit_score <= 100)),
  fit_scored_at timestamptz,
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'converted', 'dead')),
  unique (source, source_ref)
);

create unique index prospects_email_normalized_key on public.prospects (email_normalized) where email_normalized is not null;
create index prospects_institutional_lead_id_idx on public.prospects (institutional_lead_id) where institutional_lead_id is not null;

create or replace function public.set_prospects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_prospects_updated_at
before update on public.prospects
for each row execute function public.set_prospects_updated_at();

create table public.prospect_evidence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  url text not null,
  snippet text,
  found_at timestamptz not null,
  source text not null,
  unique (prospect_id, url)
);

alter table public.prospects enable row level security;
alter table public.prospect_evidence enable row level security;
revoke all on table public.prospects, public.prospect_evidence from anon, authenticated;
grant all on table public.prospects, public.prospect_evidence to service_role;

-- ---------------------------------------------------------------------------
-- Link the tables that were waiting for prospects
-- ---------------------------------------------------------------------------
alter table public.email_events
  add constraint email_events_prospect_id_fkey
  foreign key (prospect_id) references public.prospects (id) on delete set null;
comment on column public.email_events.prospect_id is 'Person-level lead the email went to (public.prospects).';

alter table public.reply_events
  add column prospect_id uuid references public.prospects (id) on delete set null;
create index reply_events_prospect_id_idx on public.reply_events (prospect_id) where prospect_id is not null;

alter table public.lead_scores
  add column prospect_id uuid references public.prospects (id) on delete cascade;
alter table public.lead_scores drop constraint lead_scores_has_subject;
alter table public.lead_scores add constraint lead_scores_has_subject
  check (profile_id is not null or institutional_lead_id is not null or prospect_id is not null);
create index lead_scores_prospect_id_computed_at_idx on public.lead_scores (prospect_id, computed_at desc)
  where prospect_id is not null;

-- ---------------------------------------------------------------------------
-- prospect_send_eligibility: whether a prospect may get a marketing email right now.
-- Computed at read time (never stored), so a new suppression takes effect immediately.
-- ineligible_reason is the first failing check, in this order; null when eligible.
-- security_invoker so the caller's own privileges apply: service role only, like the
-- tables (and is_email_suppressed is service-role only too).
-- ---------------------------------------------------------------------------
create view public.prospect_send_eligibility
with (security_invoker = true)
as
select
  p.id as prospect_id,
  p.email_normalized,
  p.kind,
  p.source,
  p.status,
  p.consent_status,
  p.country,
  r.ineligible_reason,
  r.ineligible_reason is null as eligible
from public.prospects p
cross join lateral (
  select case
    when p.email_normalized is null then 'no_email'
    when p.do_not_contact then 'do_not_contact'
    when p.consent_status not in ('legitimate_interest', 'opted_in') then 'no_consent'
    when nullif(btrim(p.country), '') is null then 'unknown_country'
    when upper(btrim(p.country)) <> 'US' then 'non_us'
    when public.is_email_suppressed(p.email_normalized, 'marketing') then 'suppressed'
  end as ineligible_reason
) r;

revoke all on public.prospect_send_eligibility from anon, authenticated;
grant select on public.prospect_send_eligibility to service_role;

-- ---------------------------------------------------------------------------
-- Signup: link a matching prospect to the new profile. A separate trigger from
-- handle_new_user() (same approach as on_auth_user_created_record_consent), named to fire
-- after on_auth_user_created so the profile exists; handle_new_user() itself is untouched.
-- Never blocks a signup: no profile (employer signups), no match, or any error -> nothing
-- linked, signup proceeds.
-- ---------------------------------------------------------------------------
create or replace function public.link_signup_prospect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where auth_user_id = new.id;
  if v_profile_id is null or nullif(public.normalize_email(new.email), '') is null then
    return new;
  end if;

  begin
    update public.prospects
    set profile_id = v_profile_id, status = 'converted'
    where email_normalized = public.normalize_email(new.email)
      and profile_id is null;
  exception when others then
    raise warning 'link_signup_prospect: prospect not linked for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.link_signup_prospect() from public, anon, authenticated;

create trigger on_auth_user_created_link_prospect
after insert on auth.users
for each row execute function public.link_signup_prospect();
