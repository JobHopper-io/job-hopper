-- reply_events: raw capture for replies to outbound institutional-lead emails (Inbound
-- Reply Path build spec). Only stores and matches the raw reply -- classification is a
-- separate, already-spec'd build that reads from this table once populated.
--
-- Same RLS shape as institutional_leads (docs/db-schema-summary.md): enabled, no
-- policies -- inaccessible to anon/authenticated, all reads/writes go through
-- service-role code (the reply-ingestion Edge Function / cron job).
create table if not exists public.reply_events (
  id uuid primary key default gen_random_uuid(),
  institutional_lead_id uuid references public.institutional_leads(id),
  from_email text not null,
  raw_subject text,
  raw_body text,
  received_at timestamptz not null default now(),
  reply_class text,
  processed boolean not null default false
);

-- Lookups this table actually needs: matching an incoming reply's sender against
-- institutional_leads.contact_email (ingestion), and classification's future sweep of
-- unprocessed rows.
create index if not exists reply_events_from_email_idx on public.reply_events (lower(from_email));
create index if not exists reply_events_unprocessed_idx on public.reply_events (received_at) where processed = false;

alter table public.reply_events enable row level security;
