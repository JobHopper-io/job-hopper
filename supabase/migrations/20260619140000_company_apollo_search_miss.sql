-- Negative cache for Apollo org/contact resolution failures (same cache_key as company_apollo_cache).
-- Short-circuits premium-insights before freemium redeem / Apollo spend when a recent miss exists.

create table if not exists public.company_apollo_search_miss (
  cache_key text primary key,
  reason text not null default 'resolution_failed',
  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists company_apollo_search_miss_expires_at_idx
  on public.company_apollo_search_miss (expires_at);

alter table public.company_apollo_search_miss enable row level security;

grant all on public.company_apollo_search_miss to service_role;
