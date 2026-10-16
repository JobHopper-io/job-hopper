-- University partner portal: email-domain seat claiming, partner staff access, and the
-- analytics feed behind both /partner (university staff) and /admin/partner-dashboard.
--
-- A "partner" is an institutional_leads row: trial_grants (free pilot) and org_accounts
-- (paid license) already both hang off institutional_lead_id, so everything here keys
-- off that too and works the same across the pilot -> paid lifecycle.

-- Student email domains that auto-claim a seat (e.g. {stateu.edu, mail.stateu.edu}).
alter table public.institutional_leads
  add column email_domains text[] not null default '{}';

-- When a student's seat was claimed (vs. profiles.created_at, which is account creation:
-- an existing user can claim a seat long after signing up). Null = claimed at signup.
alter table public.profiles
  add column partner_seat_claimed_at timestamptz;

-- Real engagement signal for partner dashboards. auth.users.last_sign_in_at only moves on
-- an actual sign-in, and Supabase sessions refresh silently for weeks, so a student using
-- the app daily could read as "inactive". Bumped by touch_last_active() from the router.
alter table public.profiles
  add column last_active_at timestamptz;

-- University staff who can sign in to /partner for one partner. Matched by email (same
-- shape as org_seat_invites) so staff can be added before they have an account.
create table public.partner_staff (
  id uuid primary key default gen_random_uuid(),
  institutional_lead_id uuid not null references public.institutional_leads(id) on delete cascade,
  -- Lowercase enforced: partner-portal matches staff with an exact eq() on the caller's
  -- lowercased email (never ilike, where `_` is a wildcard).
  email text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (institutional_lead_id, email)
);

-- Seats a partner freed up (graduated/left students). Blocks the domain auto-claim from
-- immediately re-granting the seat on that student's next login. Delete the row to let
-- them back in.
create table public.partner_seat_releases (
  institutional_lead_id uuid not null references public.institutional_leads(id) on delete cascade,
  email text not null,
  released_at timestamptz not null default now(),
  released_by uuid references auth.users(id),
  primary key (institutional_lead_id, email)
);

-- Service-role only, same posture as trial_grants/org_seat_invites.
alter table public.partner_staff enable row level security;
alter table public.partner_seat_releases enable row level security;
-- Explicit, rather than relying on the project's default table grants (newer Supabase
-- projects no longer auto-grant new public tables to the API roles).
grant select, insert, update, delete on public.partner_staff, public.partner_seat_releases to service_role;

create index profiles_trial_grant_id_idx on public.profiles (trial_grant_id) where trial_grant_id is not null;
create index profiles_org_account_id_idx on public.profiles (org_account_id) where org_account_id is not null;

-- Claim a partner seat for the calling user, if one applies. Called by the client after
-- sign-in (not from handle_new_user): it must only run for a CONFIRMED email, otherwise
-- anyone could burn a university's seats by signing up fake @uni.edu addresses that are
-- never verified. Also covers users who had an account before their university joined.
-- Returns the organization name when a seat was claimed, else null.
create or replace function public.claim_partner_seat()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_confirmed_at timestamptz;
  v_profile_id uuid;
  v_trial_grant_id uuid;
  v_org_account_id uuid;
  v_invite_id uuid;
  v_lead_id uuid;
  v_claimed_id uuid;
  v_org_name text;
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed_at
  from auth.users where id = auth.uid();
  if v_email is null or v_confirmed_at is null then
    return null;
  end if;

  select id, trial_grant_id, org_account_id
  into v_profile_id, v_trial_grant_id, v_org_account_id
  from profiles where auth_user_id = auth.uid();
  if v_profile_id is null or v_org_account_id is not null then
    return null;
  end if;

  -- 1. A named (CSV) invite: capacity was already reserved at import time, so this only
  --    links the seat. Mirrors the signup-time match in handle_new_user().
  select i.id, i.org_account_id, o.organization_name
  into v_invite_id, v_claimed_id, v_org_name
  from org_seat_invites i
  join org_accounts o on o.id = i.org_account_id
  where lower(i.email) = v_email and not i.claimed and i.revoked_at is null and o.status = 'active'
  limit 1;

  if v_invite_id is not null then
    update org_seat_invites set claimed = true where id = v_invite_id;
    update profiles set org_account_id = v_claimed_id, partner_seat_claimed_at = now()
    where id = v_profile_id;
    return v_org_name;
  end if;

  -- Already on a pilot seat: nothing more to claim (pilot -> paid carry-over happens
  -- when the org account is created, see admin-org-accounts).
  if v_trial_grant_id is not null then
    return null;
  end if;

  -- 2. Email-domain auto-claim. Staff don't consume student seats, and a seat the
  --    partner released (or an admin revoked) isn't silently re-granted.
  select l.id into v_lead_id
  from institutional_leads l
  where split_part(v_email, '@', 2) = any(l.email_domains)
    and not exists (
      select 1 from partner_staff s
      where s.institutional_lead_id = l.id and lower(s.email) = v_email)
    and not exists (
      select 1 from partner_seat_releases r
      where r.institutional_lead_id = l.id and r.email = v_email)
    and not exists (
      select 1 from org_seat_invites i join org_accounts o on o.id = i.org_account_id
      where o.institutional_lead_id = l.id and lower(i.email) = v_email and i.revoked_at is not null)
  order by l.created_at
  limit 1;

  if v_lead_id is null then
    return null;
  end if;

  -- Paid seat first. The seats_used < seat_count in the outer WHERE is re-checked under
  -- the row lock, so concurrent claims can't overfill (same guard as handle_new_user).
  update org_accounts set seats_used = seats_used + 1
  where id = (
      select id from org_accounts
      where institutional_lead_id = v_lead_id and status = 'active' and seats_used < seat_count
      order by created_at desc limit 1)
    and seats_used < seat_count
  returning id, organization_name into v_claimed_id, v_org_name;

  if v_claimed_id is not null then
    insert into org_seat_invites (org_account_id, email, claimed)
    values (v_claimed_id, v_email, true)
    on conflict (org_account_id, email) do update set claimed = true, revoked_at = null;
    update profiles set org_account_id = v_claimed_id, partner_seat_claimed_at = now()
    where id = v_profile_id;
    return v_org_name;
  end if;

  update trial_grants set seats_used = seats_used + 1
  where id = (
      select id from trial_grants
      where institutional_lead_id = v_lead_id and status = 'active'
        and expires_at > now() and seats_used < seat_count
      order by created_at desc limit 1)
    and seats_used < seat_count
  returning id, organization_name into v_claimed_id, v_org_name;

  if v_claimed_id is not null then
    update profiles set trial_grant_id = v_claimed_id, partner_seat_claimed_at = now()
    where id = v_profile_id;
    return v_org_name;
  end if;

  return null;
end;
$$;

revoke execute on function public.claim_partner_seat() from public, anon;
grant execute on function public.claim_partner_seat() to authenticated;

-- Cheap check for the router: should this signed-in user land on /partner?
create or replace function public.is_partner_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from partner_staff s
    join auth.users u on lower(u.email) = lower(s.email)
    where u.id = auth.uid()
  );
$$;

revoke execute on function public.is_partner_staff() from public, anon;
grant execute on function public.is_partner_staff() to authenticated;

-- Heartbeat for profiles.last_active_at. Called once per page load by the router guard;
-- throttled to one write per hour so it's effectively free.
create or replace function public.touch_last_active()
returns void
language sql security definer set search_path = public
as $$
  update profiles set last_active_at = now()
  where auth_user_id = auth.uid()
    and (last_active_at is null or last_active_at < now() - interval '1 hour');
$$;

revoke execute on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;

-- Everything the partner dashboard renders, in one round trip. Seat holders only (a
-- pilot or paid seat of this partner) -- NOT referred_by_institutional_lead_id, which
-- links the decision-maker who was emailed, not a student. Per-student rows are counts
-- and status only; which companies/roles a student applied to is never exposed, only
-- the cohort-level topEmployers aggregate. service_role only (reads auth.users).
--
-- p_since scopes ACTIVITY (matches, applications, interviews, practice, top employers,
-- joined-per-week) to a period; null = all time. Seat/profile/resume state is always
-- current. The weekly series spans the period (min 4 weeks, max 52), and both of its
-- series are period-filtered so no bar shows activity from outside the period.
create or replace function public.partner_insights(p_lead_id uuid, p_since timestamptz default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with holders as (
    select
      p.id, p.first_name, p.last_name, p.email, p.onboarding_completed,
      p.resume_bucket_key is not null as has_resume,
      p.requires_us_sponsorship,
      coalesce(p.partner_seat_claimed_at, p.created_at) as claimed_at,
      case when o.id is not null then 'paid' else 'pilot' end as seat_source,
      greatest(p.last_active_at, u.last_sign_in_at) as last_active_at
    from profiles p
    left join org_accounts o on o.id = p.org_account_id and o.institutional_lead_id = p_lead_id
    left join trial_grants g on g.id = p.trial_grant_id and g.institutional_lead_id = p_lead_id
    left join auth.users u on u.id = p.auth_user_id
    where o.id is not null or g.id is not null
  ),
  period_apps as (
    select a.profile_id, a.status, a.company_name, coalesce(a.applied_at, a.created_at) as at
    from job_applications a
    join holders h on h.id = a.profile_id
    where a.status <> 'saved'
      and (p_since is null or coalesce(a.applied_at, a.created_at) >= p_since)
  ),
  matches as (
    select m.profile_id, count(*) as n,
      count(*) filter (where j.sponsorship_likelihood in ('High', 'Medium')) as sponsor_n
    from job_matches m
    join holders h on h.id = m.profile_id
    left join job_hopper_live j on j.id = m.job_id
    where p_since is null or m.created_at >= p_since
    group by 1
  ),
  apps as (
    select profile_id, count(*) as applied, count(*) filter (where status = 'interviewing') as interviewing
    from period_apps group by 1
  ),
  practice as (
    select s.profile_id, count(*) as n
    from interview_sessions s
    join holders h on h.id = s.profile_id
    where p_since is null or s.created_at >= p_since
    group by 1
  ),
  bounds as (
    select
      date_trunc('week', now()) as last_wk,
      greatest(
        date_trunc('week', now()) - interval '51 weeks',
        least(
          date_trunc('week', now()) - interval '3 weeks',
          date_trunc('week', coalesce(p_since, (select min(claimed_at) from holders), now()))
        )
      ) as first_wk
  ),
  weeks as (
    select generate_series(b.first_wk, b.last_wk, interval '1 week') as wk from bounds b
  )
  select jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', h.id,
        'name', trim(h.first_name || ' ' || h.last_name),
        'email', h.email,
        'seatSource', h.seat_source,
        'claimedAt', h.claimed_at,
        'lastActiveAt', h.last_active_at,
        'onboarded', coalesce(h.onboarding_completed, false),
        'hasResume', h.has_resume,
        'needsSponsorship', coalesce(h.requires_us_sponsorship, false),
        'matches', coalesce(m.n, 0),
        'sponsorMatches', coalesce(m.sponsor_n, 0),
        'applications', coalesce(a.applied, 0),
        'interviewing', coalesce(a.interviewing, 0),
        'practiceSessions', coalesce(pr.n, 0)
      ) order by h.claimed_at desc)
      from holders h
      left join matches m on m.profile_id = h.id
      left join apps a on a.profile_id = h.id
      left join practice pr on pr.profile_id = h.id
    ), '[]'::jsonb),
    'joinedInPeriod', (select count(*) from holders where p_since is null or claimed_at >= p_since),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', w.wk,
        'joined', (
          select count(*) from holders h
          where date_trunc('week', h.claimed_at) = w.wk and (p_since is null or h.claimed_at >= p_since)),
        'applications', (select count(*) from period_apps a where date_trunc('week', a.at) = w.wk)
      ) order by w.wk)
      from weeks w
    ),
    'topEmployers', coalesce((
      select jsonb_agg(jsonb_build_object('company', t.company_name, 'applications', t.n, 'students', t.students))
      from (
        select company_name, count(*) as n, count(distinct profile_id) as students
        from period_apps where company_name is not null
        group by 1 order by 2 desc, 1 limit 8
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.partner_insights(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.partner_insights(uuid, timestamptz) to service_role;

-- Per-partner engagement for the admin partner list, in one query instead of one
-- partner_insights() call per partner. Same seat-holder definition and the same
-- last-active signal as partner_insights. service_role only.
create or replace function public.partner_summaries()
returns table (
  lead_id uuid, seat_holders int, onboarded int, activated int, active_30d int, applications_30d int
)
language sql stable security definer set search_path = public
as $$
  with holders as (
    select
      coalesce(o.institutional_lead_id, g.institutional_lead_id) as lead_id,
      p.id, p.onboarding_completed, p.resume_bucket_key is not null as has_resume,
      greatest(p.last_active_at, u.last_sign_in_at) as last_active_at
    from profiles p
    left join org_accounts o on o.id = p.org_account_id
    left join trial_grants g on g.id = p.trial_grant_id
    left join auth.users u on u.id = p.auth_user_id
    where coalesce(o.institutional_lead_id, g.institutional_lead_id) is not null
  ),
  recent_apps as (
    select h.lead_id, count(*) as n
    from job_applications a join holders h on h.id = a.profile_id
    where a.status <> 'saved' and coalesce(a.applied_at, a.created_at) >= now() - interval '30 days'
    group by 1
  )
  select
    h.lead_id,
    count(*)::int,
    count(*) filter (where h.onboarding_completed)::int,
    count(*) filter (where h.has_resume)::int,
    count(*) filter (where h.last_active_at >= now() - interval '30 days')::int,
    coalesce(max(r.n), 0)::int
  from holders h
  left join recent_apps r on r.lead_id = h.lead_id
  group by h.lead_id;
$$;

revoke execute on function public.partner_summaries() from public, anon, authenticated;
grant execute on function public.partner_summaries() to service_role;
