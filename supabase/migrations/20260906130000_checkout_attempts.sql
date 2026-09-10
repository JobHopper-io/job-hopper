-- Checkout-start instrumentation (Revenue Automation sprint). Closes the gap flagged in
-- 20260906120000_revenue_automation_schema.sql / docs/revenue-automation-schema.md:
-- stripe-webhook only ever saw checkout.session.completed, so an abandoned Stripe
-- Checkout session was invisible. This table is written at session creation
-- (create-checkout-session), then updated by stripe-webhook on completion or expiry.
--
-- Write pattern: upsert on stripe_checkout_session_id, same "try create, fall back to
-- update on conflict" shape as institutional_leads/freemium_usage elsewhere in this
-- codebase. RLS: admin/super_admin SELECT via current_user_has_role(), no
-- insert/update/delete policy for authenticated -- service-role-only writes, same as
-- the other revenue-automation tables from this sprint.
create table if not exists public.checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  status text not null default 'started' check (status in ('started', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists checkout_attempts_profile_id_idx on public.checkout_attempts (profile_id);
-- The "abandoned in the last N days" query filters on exactly this shape.
create index if not exists checkout_attempts_abandoned_idx
  on public.checkout_attempts (created_at) where status = 'started';

alter table public.checkout_attempts enable row level security;

drop policy if exists "Admins can read checkout_attempts" on public.checkout_attempts;
create policy "Admins can read checkout_attempts"
on public.checkout_attempts
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.checkout_attempts to authenticated;
grant all on public.checkout_attempts to service_role;
