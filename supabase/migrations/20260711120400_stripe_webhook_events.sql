-- Log every Stripe webhook event we receive, so "did event X actually arrive?" is answerable
-- from our own data — the question we couldn't answer during the customer.subscription.updated
-- gap. PK is the Stripe event id, so redeliveries upsert rather than duplicate.

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  outcome text not null,
  received_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Append log of Stripe webhook events received by the stripe-webhook function. outcome = handled (a case processed it) or ignored (no case for this type). Answers webhook delivery/coverage questions without the Stripe dashboard.';

create index if not exists idx_stripe_webhook_events_type_received
  on public.stripe_webhook_events(type, received_at desc);

alter table public.stripe_webhook_events enable row level security;
grant select, insert, update on public.stripe_webhook_events to service_role;
