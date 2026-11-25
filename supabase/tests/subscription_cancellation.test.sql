-- Checks for 20261123120000_subscription_cancellation.sql. Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261123120000_subscription_cancellation.sql \
--     -f supabase/tests/subscription_cancellation.test.sql -c 'rollback'
--
-- Asserts deltas against the counts before the fixtures, so existing local data is fine.

create temp table before_c as select public.cancellation_dashboard_counts() as c;

insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'c' || n || '@cancel.test', jsonb_build_object('first_name', 'C' || n)
from generate_series(1, 7) n;

create temp table c as
select n, p.id from generate_series(1, 7) n join public.profiles p on p.email = 'c' || n || '@cancel.test';

-- c1: ended 5 days ago, too_expensive      c2: scheduled to end, missing_features (still active)
-- c3: ended 40 days ago, too_expensive      c4: canceled before this migration (no date, no feedback)
-- c5: active, never canceled                c6: payment_failed, no feedback, ended 2 days ago
-- c7: university license, canceled 1 day ago, too_expensive -> excluded everywhere
insert into public.subscriptions (stripe_subscription_id, profile_id, status, canceled_at, cancel_at_period_end, cancellation_reason, cancellation_feedback)
select 'sub_c' || c.n, c.id, v.status::public.subscription_status, now() - v.ago, v.cape, v.reason, v.feedback
from c join (values
  (1, 'canceled', interval '5 days',  false, 'cancellation_requested', 'too_expensive'),
  (2, 'active',   interval '3 days',  true,  'cancellation_requested', 'missing_features'),
  (3, 'canceled', interval '40 days', false, 'cancellation_requested', 'too_expensive'),
  (4, 'canceled', null,               null,  null, null),
  (5, 'active',   null,               null,  null, null),
  (6, 'canceled', interval '2 days',  false, 'payment_failed', null),
  (7, 'canceled', interval '1 day',   false, 'cancellation_requested', 'too_expensive')
) v(n, status, ago, cape, reason, feedback) on v.n = c.n;

insert into public.institutional_leads (id, organization_name, source, category)
values ('00000000-0000-4000-8000-0000000002ff', 'Cancel Test U', 'seed_cancel', 'university');
insert into public.org_accounts (institutional_lead_id, organization_name, billing_profile_id, subscription_id, feature_tier, seat_count)
select '00000000-0000-4000-8000-0000000002ff', 'Cancel Test U', c.id, (select id from public.subscriptions where stripe_subscription_id = 'sub_c7'), 'core', 10
from c where n = 7;

do $$
declare
  b jsonb := (select c from before_c);
  a jsonb := public.cancellation_dashboard_counts();
begin
  -- feedback: too_expensive +2 (c1, c3; c7 excluded), missing_features +1 (c2), none +2 (c4, c6)
  assert coalesce((a->'by_feedback'->>'too_expensive')::int, 0) - coalesce((b->'by_feedback'->>'too_expensive')::int, 0) = 2, 'too_expensive +2';
  assert coalesce((a->'by_feedback'->>'missing_features')::int, 0) - coalesce((b->'by_feedback'->>'missing_features')::int, 0) = 1, 'missing_features +1';
  assert coalesce((a->'by_feedback'->>'none')::int, 0) - coalesce((b->'by_feedback'->>'none')::int, 0) = 2, 'none +2';
  raise notice 'PASS by_feedback (license subscription excluded, active never-canceled not counted)';

  -- churn_30d: canceled c1, c2, c6 (+3); ended c1, c6 (+2); pending c2 (+1); no date c4 (+1)
  assert (a->'churn_30d'->>'canceled')::int - (b->'churn_30d'->>'canceled')::int = 3, 'canceled +3';
  assert (a->'churn_30d'->>'ended')::int - (b->'churn_30d'->>'ended')::int = 2, 'ended +2';
  assert (a->'churn_30d'->>'pending_period_end')::int - (b->'churn_30d'->>'pending_period_end')::int = 1, 'pending +1';
  assert (a->'churn_30d'->>'canceled_no_date')::int - (b->'churn_30d'->>'canceled_no_date')::int = 1, 'no date +1';
  raise notice 'PASS churn_30d (40-day-old and license cancellations not counted)';
end $$;

do $$
begin
  set local role authenticated;
  begin
    perform public.cancellation_dashboard_counts();
    raise exception 'authenticated could call cancellation_dashboard_counts';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS service_role only';
end $$;
