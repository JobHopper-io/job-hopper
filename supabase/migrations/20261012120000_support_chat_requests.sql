-- Per-IP rate limiting for the public support chat (support-chat edge function).
-- Stores a SHA-256 hash of the caller IP, never the raw address. Only the edge
-- function (service_role) reads/writes; rows older than a day are pruned by it.

create table if not exists public.support_chat_requests (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_chat_requests_ip_created
  on public.support_chat_requests (ip_hash, created_at desc);

alter table public.support_chat_requests enable row level security;
-- No policies: anon/authenticated have no access; service_role bypasses RLS.
grant select, insert, delete on public.support_chat_requests to service_role;
