-- Audit trail for any out-of-band correction of subscriptions rows against live Stripe:
-- the one-off reconciliation of the webhook-gap trials, and the ongoing scheduled drift
-- reconciliation (step 4). Every write records old -> new so status changes not driven by a
-- Stripe webhook are explainable after the fact.

create table if not exists public.subscription_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  stripe_subscription_id text not null,
  old_status text null,
  new_status text null,
  old_period_ends_at timestamptz null,
  new_period_ends_at timestamptz null,
  source text not null,
  note text null,
  reconciled_at timestamptz not null default now()
);

comment on table public.subscription_reconciliation_audit is
  'Records subscriptions-row corrections made from live Stripe state (manual reconciliation and scheduled drift self-correction), old value -> new value, for audit.';

create index if not exists idx_sub_reconciliation_audit_stripe_sub
  on public.subscription_reconciliation_audit(stripe_subscription_id, reconciled_at desc);

alter table public.subscription_reconciliation_audit enable row level security;
-- Service-role only (edge functions / operators). No anon/authenticated policies.
grant select, insert on public.subscription_reconciliation_audit to service_role;
