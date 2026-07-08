-- Security: enable RLS on public.enriched_lead.
--
-- The table is exposed through PostgREST and had RLS disabled while anon/authenticated
-- held full DML grants -- i.e. anyone with the public anon key could read/modify/delete
-- every lead. It is only written by the backend/n8n via the service-role key (which
-- bypasses RLS), and no frontend/edge-function code queries it as anon/authenticated,
-- so enabling RLS with no policies closes the hole without breaking any flow.

alter table public.enriched_lead enable row level security;

-- Defense in depth: anon/authenticated should have no access to this table at all.
revoke all on table public.enriched_lead from anon, authenticated;
