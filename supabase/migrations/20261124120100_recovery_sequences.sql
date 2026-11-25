-- B2C recovery sequences (docs/growth/deploy-day7.md).
--   1. followup_sequences: sequence_key, email_event_id, one row per (profile, sequence,
--      stage), and the extra stop reasons.
--   2. growth_settings: recovery_auto_send (off by default), sends per run, offers.
--   3. profile_has_live_access(): active/trial subscription, live org seat or active
--      trial grant. Such users are never recovery targets.
--   4. recovery_candidates(): the growth_dashboard_counts() base population (auth user;
--      no partner staff, university billing profiles or admins) minus live access and
--      past_due, with the signals the segments need. Segment choice is in TS
--      (_shared/revenue-recovery-segments.ts).
--   5. recovery_send_state(): what's checked right before every send.
--   6. recovery_funnel_counts(): per-segment funnel for admin-growth-dashboard.

-- 1 -------------------------------------------------------------------------------------

alter table public.followup_sequences
  add column if not exists sequence_key text,
  add column if not exists email_event_id uuid references public.email_events (id) on delete set null;

create unique index if not exists followup_sequences_profile_sequence_stage_key
  on public.followup_sequences (profile_id, sequence_key, sequence_stage);

alter table public.followup_sequences drop constraint if exists followup_sequences_stop_reason_check;
alter table public.followup_sequences add constraint followup_sequences_stop_reason_check
  check (stop_reason in ('reply', 'subscribed', 'unsubscribed', 'manual_pause',
                         'paid', 'bounced', 'complained', 'no_consent'));

-- 2 -------------------------------------------------------------------------------------

create table if not exists public.growth_settings (
  id smallint primary key default 1 check (id = 1),
  -- false: the daily recovery-sequences run only logs a preview. Manual sends from the
  -- admin page work either way.
  recovery_auto_send boolean not null default false,
  recovery_max_sends_per_run integer not null default 25 check (recovery_max_sends_per_run between 1 and 500),
  -- Offer lines by segment key, e.g. {"cancelled": "..."}. Empty: no email mentions a
  -- discount or offer.
  recovery_offers jsonb not null default '{}'::jsonb check (jsonb_typeof(recovery_offers) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.growth_settings (id) values (1) on conflict (id) do nothing;

alter table public.growth_settings enable row level security;
drop policy if exists "Admins can read growth_settings" on public.growth_settings;
create policy "Admins can read growth_settings" on public.growth_settings
  for select to authenticated
  using (public.current_user_has_role('admin') or public.current_user_has_role('super_admin'));
revoke all on public.growth_settings from anon, authenticated;
grant select on public.growth_settings to authenticated;
grant all on public.growth_settings to service_role;

-- 3 -------------------------------------------------------------------------------------

create or replace function public.profile_has_live_access(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscriptions s
                 where s.profile_id = p_profile_id and s.status in ('active', 'trial'))
      or exists (select 1 from public.profiles p
                 join public.org_accounts o on o.id = p.org_account_id
                 where p.id = p_profile_id and o.status = 'active')
      or exists (select 1 from public.profiles p
                 join public.trial_grants t on t.id = p.trial_grant_id
                 where p.id = p_profile_id and t.status = 'active' and t.expires_at > now())
$$;

revoke execute on function public.profile_has_live_access(uuid) from public, anon, authenticated;
grant execute on function public.profile_has_live_access(uuid) to service_role;

-- 4 -------------------------------------------------------------------------------------

-- abandoned_checkout_at: the latest started/expired checkout_attempt older than an hour
-- with no completed attempt at or after it. abandoned_checkout_proxy: only for users with
-- no checkout_attempts rows at all (before tracking existed): a Stripe customer id and
-- no subscription row.
create or replace function public.recovery_candidates()
returns table (
  profile_id uuid,
  email text,
  first_name text,
  target_job_title text,
  created_at timestamptz,
  email_confirmed boolean,
  onboarding_completed boolean,
  has_resume boolean,
  requires_us_sponsorship boolean,
  last_seen_at timestamptz,
  has_any_sub boolean,
  has_canceled_sub boolean,
  job_searches_used integer,
  max_job_searches integer,
  abandoned_checkout_at timestamptz,
  abandoned_checkout_proxy boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select coalesce((select max_job_searches from public.freemium_settings where id = 1), 3) as max_job_searches
  ),
  base as (
    select p.*, u.email_confirmed_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.auth_user_id
    where p.email is not null
      and not exists (select 1 from public.partner_staff ps where ps.email = lower(p.email))
      and not exists (select 1 from public.org_accounts o where o.billing_profile_id = p.id)
      and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id)
      and not public.profile_has_live_access(p.id)
      and not exists (select 1 from public.subscriptions s where s.profile_id = p.id and s.status = 'past_due')
  ),
  abandoned as (
    select ca.profile_id, max(ca.created_at) as at
    from public.checkout_attempts ca
    where ca.status in ('started', 'expired')
      and ca.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.checkout_attempts done
                      where done.profile_id = ca.profile_id
                        and done.status = 'completed'
                        and done.created_at >= ca.created_at)
    group by ca.profile_id
  )
  select b.id,
         b.email,
         b.first_name,
         b.target_job_title,
         b.created_at,
         b.email_confirmed_at is not null,
         coalesce(b.onboarding_completed, false),
         b.resume_bucket_key is not null,
         b.requires_us_sponsorship,
         greatest(b.last_active_at, b.last_sign_in_at),
         exists (select 1 from public.subscriptions s where s.profile_id = b.id),
         exists (select 1 from public.subscriptions s where s.profile_id = b.id and s.status = 'canceled'),
         coalesce(f.job_searches_used, 0),
         (select max_job_searches from settings),
         a.at,
         b.stripe_customer_id is not null
           and not exists (select 1 from public.checkout_attempts ca where ca.profile_id = b.id)
           and not exists (select 1 from public.subscriptions s where s.profile_id = b.id)
  from base b
  left join public.freemium_usage f on f.profile_id = b.id
  left join abandoned a on a.profile_id = b.id
$$;

revoke execute on function public.recovery_candidates() from public, anon, authenticated;
grant execute on function public.recovery_candidates() to service_role;

-- 5 -------------------------------------------------------------------------------------

-- Fresh state for one profile, read right before each recovery send.
--   unsubscribed: notification_settings.email_unsubscribed_at, or an 'unsubscribe' row
--   manual: an admin-added suppression (stop reason manual_pause)
create or replace function public.recovery_send_state(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select id, public.normalize_email(email) as email from public.profiles where id = p_profile_id),
  sup as (select reason from public.suppressed_emails s join p on s.email_normalized = p.email)
  select jsonb_build_object(
    'exists', exists (select 1 from p),
    'live_access', public.profile_has_live_access(p_profile_id),
    'past_due', exists (select 1 from public.subscriptions s where s.profile_id = p_profile_id and s.status = 'past_due'),
    'unsubscribed', exists (select 1 from sup where reason = 'unsubscribe')
                    or exists (select 1 from public.notification_settings n
                               where n.profile_id = p_profile_id and n.email_unsubscribed_at is not null),
    'bounced', exists (select 1 from sup where reason = 'hard_bounce'),
    'complained', exists (select 1 from sup where reason = 'spam_complaint'),
    'manual', exists (select 1 from sup where reason = 'manual'),
    'marketing_consent', coalesce(public.current_marketing_consent(p_profile_id), false)
  )
$$;

revoke execute on function public.recovery_send_state(uuid) from public, anon, authenticated;
grant execute on function public.recovery_send_state(uuid) to service_role;

-- 6 -------------------------------------------------------------------------------------

-- People per segment (campaign 'recovery_<segment>_s<stage>'), from each person's first
-- successful send in that segment:
--   sent        a send that didn't fail
--   delivered   Mailtrap delivery event
--   came_back   profiles.last_active_at after that first send
--   paid_30d    a completed checkout within 30 days of that first send
create or replace function public.recovery_funnel_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sends as (
    select e.profile_id,
           regexp_replace(e.campaign, '^recovery_(.+)_s[0-9]+$', '\1') as segment,
           e.sent_at,
           e.delivered_at
    from public.email_events e
    where e.type = 'recovery'
      and e.status <> 'failed'
      and e.profile_id is not null
      and e.campaign ~ '^recovery_.+_s[0-9]+$'
  ),
  people as (
    select segment, profile_id, min(sent_at) as first_sent_at, bool_or(delivered_at is not null) as delivered
    from sends group by segment, profile_id
  ),
  per_segment as (
    select pe.segment,
           count(*) as sent,
           count(*) filter (where pe.delivered) as delivered,
           count(*) filter (where pr.last_active_at > pe.first_sent_at) as came_back,
           count(*) filter (where exists (
             select 1 from public.checkout_attempts ca
             where ca.profile_id = pe.profile_id and ca.status = 'completed'
               and ca.completed_at >= pe.first_sent_at
               and ca.completed_at < pe.first_sent_at + interval '30 days')) as paid_30d
    from people pe
    join public.profiles pr on pr.id = pe.profile_id
    group by pe.segment
  )
  select coalesce(jsonb_object_agg(segment, jsonb_build_object(
           'sent', sent, 'delivered', delivered, 'came_back', came_back, 'paid_30d', paid_30d)), '{}'::jsonb)
  from per_segment
$$;

revoke execute on function public.recovery_funnel_counts() from public, anon, authenticated;
grant execute on function public.recovery_funnel_counts() to service_role;
