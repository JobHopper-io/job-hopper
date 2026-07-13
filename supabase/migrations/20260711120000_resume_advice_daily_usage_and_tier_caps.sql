-- Core/Premium resume-advice daily quota — a genuinely separate path from the free-tier
-- lifetime counter (freemium_usage.resume_advice_used + redeem_freemium_resume_advice),
-- which is what silently capped Core at the free lifetime limit.
--
-- Calendar-day reset at midnight UTC, implemented as a DATE-scoped counter rather than a
-- cron-zeroed counter (the Apollo pattern). A new UTC day is simply a new (profile_id,
-- usage_date) key whose count starts at 0 — self-resetting, no scheduled job to fail. This
-- honours the same midnight-UTC boundary Apollo uses without depending on pg_cron/Vault.

create table if not exists public.resume_advice_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  count int not null default 0 check (count >= 0),
  primary key (profile_id, usage_date)
);

comment on table public.resume_advice_daily_usage is
  'Per-day resume-advice generations for subscribed tiers (Core/Premium). usage_date is the UTC calendar day; a new day starts a fresh row at 0. Free tier uses the lifetime counter in freemium_usage instead.';

alter table public.resume_advice_daily_usage enable row level security;

-- Users may read their own daily usage (e.g. to show "N left today"); only the service
-- role (edge function) writes, via the security-definer RPC.
drop policy if exists "Users can view their resume_advice_daily_usage" on public.resume_advice_daily_usage;
create policy "Users can view their resume_advice_daily_usage" on public.resume_advice_daily_usage
  for select
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

grant select on public.resume_advice_daily_usage to authenticated;
grant select, insert, update on public.resume_advice_daily_usage to service_role;

-- Tunable per-tier daily caps, alongside the existing free-tier max_resume_advice.
-- Defaults: Core 5/day; Premium 20/day (generous ceiling — feels unlimited to real users,
-- but caps runaway LLM cost from a single account).
alter table public.freemium_settings
  add column if not exists core_daily_resume_advice int not null default 5,
  add column if not exists premium_daily_resume_advice int not null default 20;

comment on column public.freemium_settings.core_daily_resume_advice is
  'Max resume-advice generations per UTC day for Core-tier subscribers.';
comment on column public.freemium_settings.premium_daily_resume_advice is
  'Max resume-advice generations per UTC day for Premium-tier subscribers.';
