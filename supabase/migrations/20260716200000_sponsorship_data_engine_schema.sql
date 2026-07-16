-- Real Sponsorship Data Engine (Phase 5, Days 31-35). See docs/sponsorship-data-engine.md §4.
-- All tables are service-role-written/read only (RLS enabled, no policies) - ingestion runs from
-- job-processor-service via the service-role key; the frontend doesn't read these tables yet.
--
-- employers.employer_fein / lca_filings.employer_fein: DOL LCA disclosure files include a
-- populated EMPLOYER_FEIN column (confirmed on the real FY2026 Q2 file), which corrects the
-- original "no FEIN" assumption. Captured now as the future primary employer-resolution key
-- (D36-40); this migration does not perform resolution - employer_id stays null until then.

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  employer_fein text,
  domain text,
  primary_naics text,
  hq_city text,
  hq_state text,
  tax_id_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index employers_employer_fein_key
  on public.employers (employer_fein)
  where employer_fein is not null;

create index employers_normalized_name_idx on public.employers (normalized_name);

create or replace function public.set_employers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_employers_updated_at
  before update on public.employers
  for each row
  execute function public.set_employers_updated_at();

create table public.employer_name_aliases (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  raw_name text not null,
  normalized_name text not null,
  source text not null check (source in ('dol_lca', 'uscis_hub', 'apollo', 'posting')),
  source_fiscal_year int,
  created_at timestamptz not null default now()
);

create index employer_name_aliases_employer_id_idx on public.employer_name_aliases (employer_id);
create index employer_name_aliases_normalized_name_idx on public.employer_name_aliases (normalized_name);

create table public.lca_filings (
  id uuid primary key default gen_random_uuid(),
  case_number text not null,
  employer_id uuid references public.employers (id) on delete set null,
  employer_name_raw text not null,
  employer_fein text,
  case_status text,
  visa_class text,
  received_date date,
  decision_date date,
  soc_code text,
  soc_title text,
  job_title text,
  total_worker_positions int,
  wage_from numeric,
  wage_to numeric,
  wage_unit text,
  prevailing_wage numeric,
  worksite_city text,
  worksite_state text,
  worksite_postal_code text,
  fiscal_year int not null,
  source_file text not null,
  created_at timestamptz not null default now()
);

create unique index lca_filings_case_number_key on public.lca_filings (case_number);
create index lca_filings_employer_id_idx on public.lca_filings (employer_id);
create index lca_filings_employer_fein_idx on public.lca_filings (employer_fein);
create index lca_filings_employer_name_raw_idx on public.lca_filings (employer_name_raw);
create index lca_filings_fiscal_year_idx on public.lca_filings (fiscal_year);

create table public.uscis_h1b_hub (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid references public.employers (id) on delete set null,
  employer_name_raw text not null,
  fiscal_year int not null,
  tax_id_last4 text,
  naics_code text,
  city text,
  state text,
  zip text,
  initial_approvals int,
  initial_denials int,
  continuing_approvals int,
  continuing_denials int,
  created_at timestamptz not null default now()
);

-- naics_code is part of the key: the same employer/location legitimately files under
-- more than one NAICS code (confirmed against the real USCIS Hub file - ~490 of 665
-- collisions on the narrower key were resolved by this alone). A residual few dozen
-- rows still share an identical key even with naics_code included; those are summed
-- in sponsorship_ingest.py before upsert since the table can't hold two rows per key.
create unique index uscis_h1b_hub_natural_key
  on public.uscis_h1b_hub (fiscal_year, employer_name_raw, tax_id_last4, city, state, zip, naics_code);
create index uscis_h1b_hub_employer_id_idx on public.uscis_h1b_hub (employer_id);
create index uscis_h1b_hub_fiscal_year_idx on public.uscis_h1b_hub (fiscal_year);

create table public.employer_sponsorship_scores (
  employer_id uuid primary key references public.employers (id) on delete cascade,
  score int,
  confidence text check (confidence in ('Low', 'Medium', 'High')),
  rationale text,
  data_coverage jsonb not null default '{}'::jsonb,
  fiscal_years_used int[] not null default '{}'::int[],
  algorithm_version text,
  computed_at timestamptz
);

create table public.sponsor_watch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  employer_id uuid not null references public.employers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, employer_id)
);

create index sponsor_watch_subscriptions_employer_id_idx on public.sponsor_watch_subscriptions (employer_id);

create table public.sponsor_watch_events (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  event_type text not null,
  delta jsonb not null default '{}'::jsonb,
  fiscal_period text not null,
  detected_at timestamptz not null default now(),
  notified boolean not null default false
);

create index sponsor_watch_events_employer_id_idx on public.sponsor_watch_events (employer_id);
create index sponsor_watch_events_notified_idx on public.sponsor_watch_events (notified) where not notified;

alter table public.employers enable row level security;
alter table public.employer_name_aliases enable row level security;
alter table public.lca_filings enable row level security;
alter table public.uscis_h1b_hub enable row level security;
alter table public.employer_sponsorship_scores enable row level security;
alter table public.sponsor_watch_subscriptions enable row level security;
alter table public.sponsor_watch_events enable row level security;
