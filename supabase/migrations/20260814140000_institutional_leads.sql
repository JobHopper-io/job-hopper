-- institutional_leads was created directly against the remote database (predates
-- tracked migrations here), so it has no CREATE TABLE anywhere in migration history.
-- That's broken local migration replay twice (most recently during the
-- checkout_attempts work in 20260906130000_checkout_attempts.sql), each time worked
-- around with an uncommitted local-only fixture instead of a real fix. This is the
-- real fix: the shape below was pulled directly from the live remote schema via
-- `supabase db dump --linked --schema public` (schema-only, no data) and transcribed
-- exactly -- not reconstructed from docs or from memory of how the table is used.
--
-- Timestamped to land immediately before 20260814150000_acquisition_campaign_medium_
-- and_lead_linkage.sql, the earliest migration that actually references this table
-- (profiles.referred_by_institutional_lead_id FK) -- migrations apply in timestamp
-- order, so this has to exist before its first real reference, not just before
-- present-day.
--
-- CREATE TABLE IF NOT EXISTS makes this a no-op on remote (the table already exists
-- there in this exact shape) and a real create on a fresh local stack. Every other
-- statement below is independently idempotent (CREATE INDEX IF NOT EXISTS, ENABLE ROW
-- LEVEL SECURITY, GRANT) so nothing here can fail or double-apply against remote --
-- confirmed with `supabase db push --dry-run` before this was ever applied for real.
--
-- RLS is enabled with ZERO policies on the real table -- matches the convention
-- already documented in docs/db-schema-summary.md: all reads/writes are service-role
-- only (submit-partner-lead, the outbound connector scripts in scripts/*.mjs,
-- admin-institutional-leads). GRANT ALL to anon/authenticated is real and present on
-- remote too, but RLS-with-no-policies means it's inert in practice for those roles --
-- included here for fidelity to the actual schema, not as an endorsement of the grant.
create table if not exists public.institutional_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'college_scorecard',
  scorecard_id text,
  organization_name text not null,
  category text not null default 'university',
  city text,
  state text,
  website text,
  ownership text,
  student_size integer,
  opportunity_score integer,
  recommended_package text,
  decision_maker_name text,
  decision_maker_title text,
  contact_email text,
  status text not null default 'new',
  lead_score integer,
  campaign text,
  reply_class text,
  next_action text,
  estimated_seats integer,
  opportunity_value numeric,
  signals jsonb default '{}'::jsonb,
  provider_message_id text,
  last_send_error text,
  last_send_attempted_at timestamptz,
  unique (organization_name, source)
);

create index if not exists idx_institutional_leads_category on public.institutional_leads (category);
create index if not exists idx_institutional_leads_status on public.institutional_leads (status);

alter table public.institutional_leads enable row level security;

grant all on public.institutional_leads to anon;
grant all on public.institutional_leads to authenticated;
grant all on public.institutional_leads to service_role;
