-- Day 1 baseline dashboard (admin-growth-dashboard): user segments and the outbound funnel
-- in one query. SECURITY DEFINER because it reads auth.users (email confirmation, last
-- sign-in); service role only.
--
-- segments = docs/growth/day1-audit.md section 5, query 1, verbatim. Base population:
-- signed-up profiles, excluding partner staff, license billing contacts and admins;
-- subscriptions referenced by org_accounts (university licenses) don't count as B2C.
-- funnel   = replies and outbound-attributed signups on the same base population. Lead
-- and send counts come from the edge function (institutional_leads / email_events).
create or replace function public.growth_dashboard_counts()
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
  sub_flags as (
    select profile_id,
           bool_or(status = 'active')   as has_active,
           bool_or(status = 'trial')    as has_trial,
           bool_or(status = 'past_due') as has_past_due,
           bool_or(status = 'canceled') as has_canceled
    from b2c_subs
    group by profile_id
  ),
  base as (
    select p.id,
           p.onboarding_completed,
           p.resume_bucket_key,
           p.stripe_customer_id,
           p.trial_grant_id,
           p.org_account_id,
           p.utm_source,
           p.referred_by_institutional_lead_id,
           u.email_confirmed_at,
           greatest(p.last_active_at, u.last_sign_in_at) as last_seen_at,
           f.profile_id is not null        as has_any_sub,
           coalesce(f.has_active,   false) as has_active,
           coalesce(f.has_trial,    false) as has_trial,
           coalesce(f.has_past_due, false) as has_past_due,
           coalesce(f.has_canceled, false) as has_canceled
    from public.profiles p
    join auth.users u on u.id = p.auth_user_id
    left join sub_flags f on f.profile_id = p.id
    where not exists (select 1 from public.partner_staff ps where ps.email = lower(p.email))
      and not exists (select 1 from public.org_accounts o where o.billing_profile_id = p.id)
      and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id)
  ),
  segments as (
    select
      count(*)                                                                    as registered,
      count(*) filter (where email_confirmed_at is not null)                      as registered_confirmed,
      count(*) filter (where email_confirmed_at is null)                          as incomplete_unconfirmed_email,
      count(*) filter (where email_confirmed_at is not null
                         and onboarding_completed is not true)                    as incomplete_not_onboarded,
      count(*) filter (where resume_bucket_key is not null)                       as resume_uploaded,
      count(*) filter (where onboarding_completed is true
                         and resume_bucket_key is null)                           as onboarded_no_resume,
      count(*) filter (where onboarding_completed is true
                         and (last_seen_at is null
                              or last_seen_at < now() - interval '30 days'))      as inactive_30d,
      count(*) filter (where stripe_customer_id is not null
                         and not has_any_sub)                                     as abandoned_checkout_proxy,
      count(*) filter (where has_active)                                          as active_paid,
      count(*) filter (where has_trial and not has_active)                        as trialing_unpaid,
      count(*) filter (where has_past_due and not has_active and not has_trial)   as past_due,
      count(*) filter (where has_canceled and not has_active and not has_trial)   as cancelled,
      count(*) filter (where trial_grant_id is not null
                         or org_account_id is not null)                           as sponsored_seat_holders
    from base
  ),
  outbound_signups as (
    select * from base
    where utm_source = 'email_outbound' or referred_by_institutional_lead_id is not null
  )
  select jsonb_build_object(
    'segments', (select to_jsonb(s) from segments s),
    'funnel', jsonb_build_object(
      'prospects', (select count(*) from public.prospects),
      'replies', (select count(*) from public.reply_events),
      'positive_replies', (select count(*) from public.reply_events
                           where reply_class in ('Interested', 'Meeting requested', 'More information')),
      'outbound_signups', (select count(*) from outbound_signups),
      'outbound_paid', (select count(*) from outbound_signups where has_active)
    )
  );
$$;

revoke execute on function public.growth_dashboard_counts() from public, anon, authenticated;
grant execute on function public.growth_dashboard_counts() to service_role;
