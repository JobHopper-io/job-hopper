-- Checks for 20261124120100_recovery_sequences.sql (needs 20261124120000 applied first,
-- in its own transaction, since a new enum value can't be used in the same one).
-- Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261124120100_recovery_sequences.sql \
--     -f supabase/tests/recovery_sequences.test.sql -c 'rollback'

-- r1..r16: handle_new_user creates each profile.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, 'r' || n || '@recovery.test', now(),
       jsonb_build_object('first_name', 'R' || n)
from generate_series(1, 16) n;

create temp table r as
select n, p.id from generate_series(1, 16) n join public.profiles p on p.email = 'r' || n || '@recovery.test';

update public.profiles set onboarding_completed = true where id in (select id from r);

insert into public.institutional_leads (id, organization_name, source, category)
values ('00000000-0000-4000-8000-0000000004ff', 'Recovery Test U', 'seed_recovery', 'university');

-- r1  plain free user (in the population)
-- r2  partner staff                      -> excluded
-- r3  university billing profile         -> excluded
-- r4  admin                              -> excluded
-- r5  active subscription                -> excluded (live access)
-- r6  trial subscription                 -> excluded (live access)
-- r7  seat on an active org license      -> excluded (live access)
-- r8  seat on a pending_payment license  -> included (no live access)
-- r9  active trial grant                 -> excluded (live access)
-- r10 expired trial grant                -> included
-- r11 past_due                           -> excluded
-- r12 started checkout 2h ago            -> abandoned (attempts)
-- r13 started checkout 10 min ago        -> not abandoned yet
-- r14 expired checkout, completed later  -> not abandoned
-- r15 stripe customer, no attempts, no subscription -> abandoned (proxy)
-- r16 canceled subscription              -> included, has_canceled_sub
insert into public.partner_staff (institutional_lead_id, email) values ('00000000-0000-4000-8000-0000000004ff', 'r2@recovery.test');
insert into public.profile_roles (profile_id, role_id) select (select id from r where n = 4), id from public.roles where name = 'admin';
insert into public.subscriptions (stripe_subscription_id, profile_id, status)
select 'sub_r' || r.n, r.id, s.status::public.subscription_status
from r join (values (5, 'active'), (6, 'trial'), (11, 'past_due'), (16, 'canceled')) s(n, status) on s.n = r.n;
insert into public.subscriptions (stripe_subscription_id, profile_id, status) select 'sub_r3_license', id, 'active' from r where n = 3;
insert into public.org_accounts (id, institutional_lead_id, organization_name, billing_profile_id, subscription_id, feature_tier, seat_count, status)
select '00000000-0000-4000-8000-0000000004f1', '00000000-0000-4000-8000-0000000004ff', 'Recovery Test U', r.id,
       (select id from public.subscriptions where stripe_subscription_id = 'sub_r3_license'), 'core', 10, 'active'
from r where n = 3;
insert into public.org_accounts (id, institutional_lead_id, organization_name, billing_profile_id, feature_tier, seat_count, status)
select '00000000-0000-4000-8000-0000000004f2', '00000000-0000-4000-8000-0000000004ff', 'Recovery Pending U', r.id, 'core', 10, 'pending_payment'
from r where n = 3;
update public.profiles set org_account_id = '00000000-0000-4000-8000-0000000004f1' where id = (select id from r where n = 7);
update public.profiles set org_account_id = '00000000-0000-4000-8000-0000000004f2' where id = (select id from r where n = 8);
insert into public.trial_grants (id, institutional_lead_id, organization_name, seat_count, feature_tier, expires_at, invite_code, status) values
  ('00000000-0000-4000-8000-0000000004e1', '00000000-0000-4000-8000-0000000004ff', 'Recovery Test U', 10, 'core', now() + interval '10 days', 'REC-ACTIVE', 'active'),
  ('00000000-0000-4000-8000-0000000004e2', '00000000-0000-4000-8000-0000000004ff', 'Recovery Test U', 10, 'core', now() - interval '1 day', 'REC-EXPIRED', 'active');
update public.profiles set trial_grant_id = '00000000-0000-4000-8000-0000000004e1' where id = (select id from r where n = 9);
update public.profiles set trial_grant_id = '00000000-0000-4000-8000-0000000004e2' where id = (select id from r where n = 10);
insert into public.checkout_attempts (profile_id, stripe_checkout_session_id, status, created_at, completed_at)
select r.id, 'cs_r' || r.n || '_' || a.k, a.status, now() - a.ago, a.done
from r join (values
  (12, 'a', 'started',   interval '2 hours',   null::timestamptz),
  (13, 'a', 'started',   interval '10 minutes', null),
  (14, 'a', 'expired',   interval '3 days',    null),
  (14, 'b', 'completed', interval '1 day',     now() - interval '1 day')
) a(n, k, status, ago, done) on a.n = r.n;
update public.profiles set stripe_customer_id = 'cus_r15' where id = (select id from r where n = 15);

create temp table cand as
select r.n, c.* from public.recovery_candidates() c join r on r.id = c.profile_id;

do $$
declare
  got int[] := (select array_agg(n order by n) from cand);
begin
  assert got = array[1, 8, 10, 12, 13, 14, 15, 16], 'population: ' || got::text;
  raise notice 'PASS population: partner staff, billing profile, admin, live access (active/trial sub, active org seat, active trial grant) and past_due excluded';

  assert (select abandoned_checkout_at is not null and not abandoned_checkout_proxy from cand where n = 12), 'r12 abandoned';
  assert (select abandoned_checkout_at is null from cand where n = 13), 'r13 too recent';
  assert (select abandoned_checkout_at is null and not abandoned_checkout_proxy from cand where n = 14), 'r14 completed later';
  assert (select abandoned_checkout_at is null and abandoned_checkout_proxy from cand where n = 15), 'r15 proxy';
  assert (select not abandoned_checkout_proxy from cand where n = 1), 'r1 no stripe customer';
  raise notice 'PASS abandoned checkout: >1h, nothing completed after it; proxy only without attempts';

  assert (select has_canceled_sub and has_any_sub from cand where n = 16), 'r16 canceled';
  assert (select max_job_searches >= 1 and job_searches_used = 0 from cand where n = 1), 'search counts';
  raise notice 'PASS candidate signals';
end $$;

-- recovery_send_state
insert into public.suppressed_emails (email_normalized, reason, scope, source) values
  ('r12@recovery.test', 'hard_bounce', 'all', 'test'),
  ('r13@recovery.test', 'spam_complaint', 'all', 'test'),
  ('r14@recovery.test', 'unsubscribe', 'marketing', 'test'),
  ('r15@recovery.test', 'manual', 'all', 'test');
delete from public.notification_settings where profile_id = (select id from r where n = 16);
insert into public.notification_settings (profile_id, email_unsubscribed_at) select id, now() from r where n = 16;

do $$
declare
  s jsonb;
begin
  s := public.recovery_send_state((select id from r where n = 5));
  assert (s->>'live_access')::boolean and (s->>'exists')::boolean, 'r5 live';
  assert (public.recovery_send_state((select id from r where n = 11))->>'past_due')::boolean, 'r11 past_due';
  assert (public.recovery_send_state((select id from r where n = 12))->>'bounced')::boolean, 'r12 bounced';
  assert (public.recovery_send_state((select id from r where n = 13))->>'complained')::boolean, 'r13 complained';
  assert (public.recovery_send_state((select id from r where n = 14))->>'unsubscribed')::boolean, 'r14 unsubscribed (suppression)';
  assert (public.recovery_send_state((select id from r where n = 16))->>'unsubscribed')::boolean, 'r16 unsubscribed (notification_settings)';
  assert (public.recovery_send_state((select id from r where n = 15))->>'manual')::boolean, 'r15 manual';
  s := public.recovery_send_state((select id from r where n = 1));
  assert not (s->>'live_access')::boolean and not (s->>'bounced')::boolean and not (s->>'unsubscribed')::boolean, 'r1 clean';
  assert not (public.recovery_send_state('00000000-0000-4000-8000-000000000000')->>'exists')::boolean, 'missing profile';
  raise notice 'PASS recovery_send_state flags';
end $$;

-- followup_sequences: one row per (profile, sequence, stage); widened stop reasons
insert into public.followup_sequences (profile_id, sequence_key, sequence_stage, scheduled_date)
select id, 'recovery_cancelled', 1, now() from r where n = 16;
do $$
declare
  reason text;
begin
  begin
    insert into public.followup_sequences (profile_id, sequence_key, sequence_stage, scheduled_date)
    select id, 'recovery_cancelled', 1, now() from r where n = 16;
    raise exception 'duplicate (profile, sequence, stage) was accepted';
  exception when unique_violation then null;
  end;
  foreach reason in array array['reply', 'subscribed', 'unsubscribed', 'manual_pause', 'paid', 'bounced', 'complained', 'no_consent'] loop
    update public.followup_sequences set stop_reason = reason where sequence_key = 'recovery_cancelled' and profile_id = (select id from r where n = 16);
  end loop;
  begin
    update public.followup_sequences set stop_reason = 'bored' where sequence_key = 'recovery_cancelled';
    raise exception 'unknown stop_reason was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS followup_sequences unique key and stop reasons';
end $$;

-- growth_settings defaults
do $$
begin
  assert (select not recovery_auto_send and recovery_max_sends_per_run = 25 and recovery_offers = '{}'::jsonb from public.growth_settings where id = 1), 'defaults';
  begin
    insert into public.growth_settings (id) values (2);
    raise exception 'second settings row accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS growth_settings: auto-send off, 25 per run, no offers, single row';
end $$;

-- recovery_funnel_counts: r1 sent+delivered, came back, paid in 30 days; r8 sent only;
-- r10 a failed send (not counted); r10 stage 2 of another segment counted there.
create temp table before_f as select public.recovery_funnel_counts() as c;
insert into public.email_events (profile_id, type, status, campaign, sequence_stage, sent_at, delivered_at) values
  ((select id from r where n = 1), 'recovery', 'sent', 'recovery_cancelled_s1', 1, now() - interval '10 days', now() - interval '10 days'),
  ((select id from r where n = 1), 'recovery', 'sent', 'recovery_cancelled_s2', 2, now() - interval '3 days', null),
  ((select id from r where n = 8), 'recovery', 'sent', 'recovery_cancelled_s1', 1, now() - interval '2 days', null),
  ((select id from r where n = 10), 'recovery', 'failed', 'recovery_cancelled_s1', 1, now() - interval '2 days', null),
  ((select id from r where n = 10), 'recovery', 'sent', 'recovery_heavy_free_usage_s1', 1, now() - interval '2 days', null);
update public.profiles set last_active_at = now() where id = (select id from r where n = 1);
update public.profiles set last_active_at = now() - interval '5 days' where id = (select id from r where n = 8);
insert into public.checkout_attempts (profile_id, stripe_checkout_session_id, status, created_at, completed_at)
values ((select id from r where n = 1), 'cs_r1_paid', 'completed', now() - interval '1 day', now() - interval '1 day');

do $$
declare
  b jsonb := (select c from before_f);
  a jsonb := public.recovery_funnel_counts();
  d jsonb;
begin
  d := jsonb_build_object(
    'sent', (a#>>'{cancelled,sent}')::int - coalesce((b#>>'{cancelled,sent}')::int, 0),
    'delivered', (a#>>'{cancelled,delivered}')::int - coalesce((b#>>'{cancelled,delivered}')::int, 0),
    'came_back', (a#>>'{cancelled,came_back}')::int - coalesce((b#>>'{cancelled,came_back}')::int, 0),
    'paid_30d', (a#>>'{cancelled,paid_30d}')::int - coalesce((b#>>'{cancelled,paid_30d}')::int, 0));
  assert d = '{"sent": 2, "delivered": 1, "came_back": 1, "paid_30d": 1}'::jsonb, 'cancelled funnel ' || d::text;
  assert (a#>>'{heavy_free_usage,sent}')::int - coalesce((b#>>'{heavy_free_usage,sent}')::int, 0) = 1, 'heavy funnel';
  raise notice 'PASS recovery_funnel_counts: people per segment from first send; failed sends ignored';
end $$;

do $$
begin
  set local role authenticated;
  begin
    perform public.recovery_candidates();
    raise exception 'authenticated could call recovery_candidates';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.recovery_send_state('00000000-0000-4000-8000-000000000000');
    raise exception 'authenticated could call recovery_send_state';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS service_role only';
end $$;
