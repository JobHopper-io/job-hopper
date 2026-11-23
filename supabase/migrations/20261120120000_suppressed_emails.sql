-- Global email suppression list (growth step 1, docs/growth/lead-system-design.md §2).
--
-- One row per (email, reason). A send is blocked when any row for the address covers it:
-- scope 'all' blocks every send; scope 'marketing' blocks marketing sends only.
-- Checked by sendEmail (_shared/email.ts) and scripts/outbound-live-send.mjs through
-- is_email_suppressed(). exclusion_lists stays the company-level list; this is per address.
--
-- Service-role only: RLS on with no policies, and anon/authenticated lose the default
-- grants entirely, same posture as enriched_lead (20260708140000).

-- Single definition of "normalized email" for the table, the check function and the
-- backfill: lowercased, leading/trailing whitespace (spaces, tabs, newlines) removed.
create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(p_email, '^\s+|\s+$', '', 'g'));
$$;

create table public.suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email_normalized text not null
    check (email_normalized <> '' and email_normalized = public.normalize_email(email_normalized)),
  reason text not null check (reason in ('unsubscribe', 'hard_bounce', 'spam_complaint', 'manual')),
  scope text not null check (scope in ('marketing', 'all')),
  source text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  provider_event_id text,
  unique (email_normalized, reason)
);

comment on table public.suppressed_emails is
  'Per-address do-not-send list. scope all = block every send (bounces, complaints, global unsubscribe); scope marketing = block marketing sends only. Checked via is_email_suppressed(); service role only.';

alter table public.suppressed_emails enable row level security;
revoke all on table public.suppressed_emails from anon, authenticated;
grant all on table public.suppressed_emails to service_role;

-- p_kind: 'transactional' or 'marketing'. Anything else raises, so a typo can never
-- silently read as "not suppressed".
create or replace function public.is_email_suppressed(p_email text, p_kind text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if p_kind is null or p_kind not in ('transactional', 'marketing') then
    raise exception 'is_email_suppressed: invalid kind %', coalesce(p_kind, 'null');
  end if;

  return exists (
    select 1
    from public.suppressed_emails s
    where s.email_normalized = public.normalize_email(p_email)
      and (s.scope = 'all' or p_kind = 'marketing')
  );
end;
$$;

revoke execute on function public.is_email_suppressed(text, text) from public, anon, authenticated;
grant execute on function public.is_email_suppressed(text, text) to service_role;

-- Backfill 1: profiles that already unsubscribed from everything (notification_settings).
insert into public.suppressed_emails (created_at, email_normalized, reason, scope, source, profile_id)
select distinct on (public.normalize_email(p.email))
  ns.email_unsubscribed_at,
  public.normalize_email(p.email),
  'unsubscribe',
  'all',
  'backfill_notification_settings',
  p.id
from public.notification_settings ns
join public.profiles p on p.id = ns.profile_id
where ns.email_unsubscribed_at is not null
  and public.normalize_email(p.email) <> ''
order by public.normalize_email(p.email), ns.email_unsubscribed_at
on conflict (email_normalized, reason) do nothing;

-- Backfill 2: outbound contacts that hard-bounced (mailtrap-bounce-webhook sets status).
insert into public.suppressed_emails (created_at, email_normalized, reason, scope, source)
select distinct on (public.normalize_email(l.contact_email))
  l.updated_at,
  public.normalize_email(l.contact_email),
  'hard_bounce',
  'all',
  'backfill_institutional_leads'
from public.institutional_leads l
where l.status = 'bounced'
  and l.contact_email is not null
  and public.normalize_email(l.contact_email) <> ''
order by public.normalize_email(l.contact_email), l.updated_at
on conflict (email_normalized, reason) do nothing;
