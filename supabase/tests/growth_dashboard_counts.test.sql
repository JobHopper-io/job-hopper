-- Checks for 20261121140000_growth_dashboard_counts.sql. Seeds one user per segment (plus
-- the excluded kinds) and asserts every count moves by exactly the expected amount.
-- Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261121140000_growth_dashboard_counts.sql \
--     -f supabase/tests/growth_dashboard_counts.test.sql -c 'rollback'
--
-- The segment SQL itself is docs/growth/day1-audit.md section 5 query 1; compare the two
-- directly on any data with the snippet in docs/growth/deploy-growth-suppression.md.

create temp table before_counts as select public.growth_dashboard_counts() as c;

-- Fixtures. g1..g13: handle_new_user creates each profile; fields set below.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       'g' || n || '@growth.test',
       case when n = 1 then null else now() end,
       jsonb_build_object('first_name', 'G' || n)
from generate_series(1, 13) n;

create temp table g as
select n, p.id from generate_series(1, 13) n
join public.profiles p on p.email = 'g' || n || '@growth.test';

update public.profiles p set
  onboarding_completed = g.n in (3, 4, 5, 6, 8, 12, 13),
  resume_bucket_key = case when g.n in (3, 5, 6, 8, 12) then 'resumes/' || g.n end,
  last_active_at = case when g.n = 4 then now() - interval '40 days' else now() end,
  stripe_customer_id = case when g.n in (6, 7) then 'cus_g' || g.n end,
  utm_source = case when g.n = 12 then 'email_outbound' end
from g where g.id = p.id;

-- subscriptions: g3 active, g4 trial, g5 past_due, g6 canceled, g12 active
insert into public.subscriptions (stripe_subscription_id, profile_id, status)
select 'sub_g' || g.n, g.id, s.status::public.subscription_status
from g join (values (3, 'active'), (4, 'trial'), (5, 'past_due'), (6, 'canceled'), (12, 'active')) s(n, status) on s.n = g.n;

-- g8: seat on a university license (sponsored); the license subscription belongs to g9,
-- the billing contact, and is not B2C. g10: partner staff. g11: admin. g13: referred by a lead.
insert into public.institutional_leads (id, organization_name, source, category)
values ('00000000-0000-4000-8000-0000000001ff', 'Growth Test U', 'seed_growth', 'university');
insert into public.subscriptions (stripe_subscription_id, profile_id, status)
select 'sub_license', id, 'active' from g where n = 9;
insert into public.org_accounts (id, institutional_lead_id, organization_name, billing_profile_id, subscription_id, feature_tier, seat_count)
select '00000000-0000-4000-8000-0000000001fe', '00000000-0000-4000-8000-0000000001ff', 'Growth Test U', g.id,
       (select id from public.subscriptions where stripe_subscription_id = 'sub_license'), 'core', 10
from g where n = 9;
update public.profiles set org_account_id = '00000000-0000-4000-8000-0000000001fe' where id = (select id from g where n = 8);
insert into public.partner_staff (institutional_lead_id, email) values ('00000000-0000-4000-8000-0000000001ff', 'g10@growth.test');
insert into public.profile_roles (profile_id, role_id) select (select id from g where n = 11), id from public.roles where name = 'admin';
update public.profiles set referred_by_institutional_lead_id = '00000000-0000-4000-8000-0000000001ff' where id = (select id from g where n = 13);

-- funnel: 3 replies (2 positive), 1 prospect
insert into public.reply_events (from_email, reply_class, processed) values
  ('a@growth.test', 'Interested', true), ('b@growth.test', 'Not interested', true), ('c@growth.test', 'Meeting requested', true);
insert into public.prospects (kind, email, source) values ('job_seeker', 'p@growth.test', 'seed_growth');

do $$
declare
  b jsonb := (select c from before_counts);
  a jsonb := public.growth_dashboard_counts();
  expected_segments jsonb := '{
    "registered": 10, "registered_confirmed": 9, "incomplete_unconfirmed_email": 1,
    "incomplete_not_onboarded": 2, "resume_uploaded": 5, "onboarded_no_resume": 2,
    "inactive_30d": 1, "abandoned_checkout_proxy": 1, "active_paid": 2, "trialing_unpaid": 1,
    "past_due": 1, "cancelled": 1, "sponsored_seat_holders": 1
  }';
  expected_funnel jsonb := '{"prospects": 1, "replies": 3, "positive_replies": 2, "outbound_signups": 2, "outbound_paid": 1}';
  k text;
begin
  for k in select jsonb_object_keys(expected_segments) loop
    assert (a -> 'segments' ->> k)::int - (b -> 'segments' ->> k)::int = (expected_segments ->> k)::int,
      format('segments.%s: expected +%s, got +%s', k, expected_segments ->> k, (a -> 'segments' ->> k)::int - (b -> 'segments' ->> k)::int);
  end loop;
  assert (select count(*) from jsonb_object_keys(a -> 'segments')) = 13, 'segment key count';
  for k in select jsonb_object_keys(expected_funnel) loop
    assert (a -> 'funnel' ->> k)::int - (b -> 'funnel' ->> k)::int = (expected_funnel ->> k)::int,
      format('funnel.%s: expected +%s, got +%s', k, expected_funnel ->> k, (a -> 'funnel' ->> k)::int - (b -> 'funnel' ->> k)::int);
  end loop;
  raise notice 'PASS segment and funnel counts (13 segments, 5 funnel counts, exclusions)';

  assert not has_function_privilege('anon', 'public.growth_dashboard_counts()', 'execute');
  assert not has_function_privilege('authenticated', 'public.growth_dashboard_counts()', 'execute');
  assert has_function_privilege('service_role', 'public.growth_dashboard_counts()', 'execute');
  raise notice 'PASS service role only';
end;
$$;
