-- stripe-webhook is now idempotent: rows go received -> processed | failed (with the error),
-- and a redelivery of a processed event is skipped. 'handled' remains on pre-change rows.
alter table public.stripe_webhook_events add column if not exists error_message text;

comment on table public.stripe_webhook_events is
  'Log of Stripe webhook events received by the stripe-webhook function. outcome = received (processing started), processed (done; redeliveries are skipped), failed (error_message set; Stripe retries), ignored (no handler for this type), or legacy handled (logged before processing, pre 2026-10).';
