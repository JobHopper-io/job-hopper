-- Cancellation data on subscriptions, copied from Stripe by stripe-webhook on
-- customer.subscription.updated / .deleted (_shared/subscription-cancellation.ts):
--   canceled_at            Stripe canceled_at: when cancellation was requested (for a
--                          cancel-at-period-end, before the subscription actually ends)
--   cancel_at_period_end   Stripe cancel_at_period_end
--   cancel_at              Stripe cancel_at: when a scheduled cancellation takes effect
--   cancellation_reason    cancellation_details.reason   (cancellation_requested | payment_disputed | payment_failed)
--   cancellation_feedback  cancellation_details.feedback (portal reason: too_expensive, missing_features, ...)
--   cancellation_comment   cancellation_details.comment  (free text from the portal)
--
-- No check constraints on the Stripe enums on purpose: a value Stripe adds later would
-- make the webhook's subscriptions update fail and be retried for days, status included.
--
-- No backfill. Existing canceled rows keep canceled_at null: nothing stored locally has
-- it (stripe_webhook_events keeps no payload or subscription id, and the
-- subscription_canceled email marks when the subscription ended, not when cancellation
-- was requested). Getting it means reading each subscription from Stripe.

alter table public.subscriptions
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_at_period_end boolean,
  add column if not exists cancel_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_feedback text,
  add column if not exists cancellation_comment text;

create index if not exists subscriptions_canceled_at_idx
  on public.subscriptions (canceled_at) where canceled_at is not null;

-- Read-only counts for admin-growth-dashboard. Same B2C scope as
-- growth_dashboard_counts(): university-license subscriptions (org_accounts) excluded.
--   by_feedback  subscriptions canceled or scheduled to cancel, by portal feedback
--                ('none' = no feedback given, incl. every row from before this migration)
--   churn_30d    canceled_at in the last 30 days: ended (status canceled) vs still
--                running until period end; canceled_no_date = canceled rows with no
--                canceled_at (pre-migration), which the 30-day count can't place
create or replace function public.cancellation_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b2c_subs as (
    select s.*
    from public.subscriptions s
    where not exists (select 1 from public.org_accounts o where o.subscription_id = s.id)
  ),
  cancelled as (
    select * from b2c_subs where status = 'canceled' or canceled_at is not null
  )
  select jsonb_build_object(
    'by_feedback', coalesce(
      (select jsonb_object_agg(feedback, n)
       from (select coalesce(cancellation_feedback, 'none') as feedback, count(*) as n
             from cancelled group by 1) f),
      '{}'::jsonb),
    'churn_30d', (
      select jsonb_build_object(
        'canceled', count(*) filter (where canceled_at >= now() - interval '30 days'),
        'ended', count(*) filter (where canceled_at >= now() - interval '30 days' and status = 'canceled'),
        'pending_period_end', count(*) filter (where canceled_at >= now() - interval '30 days' and status <> 'canceled'),
        'canceled_no_date', count(*) filter (where status = 'canceled' and canceled_at is null)
      )
      from b2c_subs
    )
  )
$$;

revoke execute on function public.cancellation_dashboard_counts() from public, anon, authenticated;
grant execute on function public.cancellation_dashboard_counts() to service_role;
