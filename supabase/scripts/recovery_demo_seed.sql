-- LOCAL ONLY. Seeds fake @example.test users for the recovery-sequence demo
-- (docs/growth/day7-demo.md). Remove with recovery_demo_cleanup.sql.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -f supabase/scripts/recovery_demo_seed.sql
--
-- d01 abandoned_checkout   started checkout 2h ago
-- d02 cancelled            canceled subscription            (later "pays")
-- d03 heavy_free_usage     3/3 free searches used
-- d04 visa_focused         needs sponsorship
-- d05 activated_never_paid onboarded, resume, no subscription
-- d06 would-be onboarded_no_resume   (no resume; lands in activated_never_paid)
-- d07 never_activated      signed up 5 days ago, not onboarded (later unsubscribes)
-- d08 would-be no_login_30d          (last seen 40 days ago; lands in activated_never_paid)
-- d09 admin                excluded   (also the demo admin who reads the dashboard)
-- d10 partner staff        excluded
-- d11 active subscriber    excluded
-- d12 past_due             excluded
-- d13 activated_never_paid, no marketing consent -> skipped, never emailed

begin;

do $$ begin
  if exists (select 1 from public.profiles where email like '%@example.test' and email <> 'd09@example.test') then
    raise exception 'demo users already seeded; run recovery_demo_cleanup.sql first';
  end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at)
select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid,
       'd' || lpad(n::text, 2, '0') || '@example.test', now(),
       jsonb_build_object('first_name', 'Demo' || n), now() - interval '10 days'
from generate_series(1, 13) n
where n <> 9; -- d09 (admin) is created first through the local auth API so it can sign in

create temp table d as
select n, p.id from generate_series(1, 13) n
join public.profiles p on p.email = 'd' || lpad(n::text, 2, '0') || '@example.test';

update public.profiles p set
  onboarding_completed = d.n <> 7,
  resume_bucket_key = case when d.n in (6, 7) then null else 'resumes/' || p.auth_user_id || '-demo.pdf' end,
  requires_us_sponsorship = d.n = 4,
  target_job_title = case d.n when 3 then 'Data Analyst' when 4 then 'Software Engineer' when 5 then 'Product Manager' end,
  last_active_at = case when d.n = 8 then now() - interval '40 days' else now() - interval '2 days' end,
  created_at = now() - interval '5 days'
from d where d.id = p.id;

insert into public.checkout_attempts (profile_id, stripe_checkout_session_id, status, created_at)
select id, 'cs_demo_d01', 'started', now() - interval '2 hours' from d where n = 1;
insert into public.subscriptions (stripe_subscription_id, profile_id, status)
select 'sub_demo_d' || lpad(d.n::text, 2, '0'), d.id, s.status::public.subscription_status
from d join (values (2, 'canceled'), (11, 'active'), (12, 'past_due')) s(n, status) on s.n = d.n;
insert into public.freemium_usage (profile_id, selected_tier_key, job_searches_used)
select id, 'entry_mid', 3 from d where n = 3
on conflict (profile_id) do update set job_searches_used = 3;

insert into public.institutional_leads (id, organization_name, source, category)
values ('00000000-0000-4000-8000-0000000007ff', 'Demo Partner U', 'demo_seed', 'university');
insert into public.partner_staff (institutional_lead_id, email) values ('00000000-0000-4000-8000-0000000007ff', 'd10@example.test');

insert into public.profile_roles (profile_id, role_id)
select d.id, r.id from d, public.roles r where d.n = 9 and r.name = 'admin';

-- Marketing consent on the current wording for everyone but d13.
insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
select d.id, 'd' || lpad(d.n::text, 2, '0') || '@example.test', 'email', 'marketing', true, 'marketing_email_v1', 'demo_seed'
from d where d.n <> 13;

commit;
