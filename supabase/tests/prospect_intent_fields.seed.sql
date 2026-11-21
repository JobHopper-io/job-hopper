-- Optional: recreate the hosted-only outreach_leads table (with the default API grants) so
-- the migration's guarded branch runs. Run before the migration, inside the rolled-back test.
create table public.outreach_leads (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  found_at timestamptz not null default now(), post_snippet text, post_url text not null,
  poster_name text, signal_type text, source text not null, status text not null default 'new');
grant all on table public.outreach_leads to anon, authenticated;
