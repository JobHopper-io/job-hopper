-- University partner licensing: billing terms, the seats-full waitlist and seat requests.
--
-- Split out of 20261016130000_university_partner_portal.sql, which was already applied
-- to production before these additions were made (a migration that has run is never
-- re-run, so editing it would have silently skipped this on deploy).

-- License commercials. Seats bill per month or per year; the per-deal discount is a
-- negotiated 0/20/30% applied as a Stripe coupon (so the university's invoice shows it).
-- list_price_cents snapshots the per-seat MONTHLY list price at signing, so later list
-- price changes never silently re-price an existing contract's reporting.
alter table public.org_accounts
  add column if not exists billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  add column if not exists discount_percent int not null default 0 check (discount_percent in (0, 20, 30)),
  add column if not exists list_price_cents int;

-- Throttle for the "your seats are full" email to staff + us (one per partner per day).
alter table public.institutional_leads
  add column if not exists seats_full_notified_at timestamptz;

-- Students who matched a partner's domain while every seat was taken. They get a seat
-- automatically on a later sign-in once one frees up (the claim retries each page load);
-- this table is the demand signal for an upsell ("23 students waiting").
create table if not exists public.partner_seat_waitlist (
  institutional_lead_id uuid not null references public.institutional_leads(id) on delete cascade,
  email text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (institutional_lead_id, email)
);

-- "Request more seats" from the university portal; resolved by an admin after adding
-- seats to the license (or extending the pilot).
create table if not exists public.partner_seat_requests (
  id uuid primary key default gen_random_uuid(),
  institutional_lead_id uuid not null references public.institutional_leads(id) on delete cascade,
  requested_by text not null,
  seats int not null check (seats > 0),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

alter table public.partner_seat_waitlist enable row level security;
alter table public.partner_seat_requests enable row level security;
grant select, insert, update, delete on public.partner_seat_waitlist, public.partner_seat_requests to service_role;

-- The claim now reports *why* there was no seat ("full" -> waitlist + notify), so its
-- return type changes from text to jsonb; a return-type change needs drop + create.
drop function if exists public.claim_partner_seat();

-- Claim a partner seat for the calling user, if one applies. Called by the client after
-- sign-in (not from handle_new_user): it must only run for a CONFIRMED email, otherwise
-- anyone could burn a university's seats by signing up fake @uni.edu addresses that are
-- never verified. Also covers users who had an account before their university joined.
--
-- Returns {"status": "claimed" | "full" | "none", "organization": text|null}. "full" =
-- the student's domain belongs to a partner with a live pilot/license but every seat is
-- taken: they're waitlisted and staff + Job-Hopper get emailed (via scheduled_jobs ->
-- partner-portal notify_seats_full, at most once a day per partner).
create or replace function public.claim_partner_seat()
returns jsonb
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
  v_lead_name text;
  v_claimed_id uuid;
  v_org_name text;
  none constant jsonb := jsonb_build_object('status', 'none', 'organization', null);
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed_at
  from auth.users where id = auth.uid();
  if v_email is null or v_confirmed_at is null then
    return none;
  end if;

  select id, trial_grant_id, org_account_id
  into v_profile_id, v_trial_grant_id, v_org_account_id
  from profiles where auth_user_id = auth.uid();
  if v_profile_id is null or v_org_account_id is not null then
    return none;
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
    return jsonb_build_object('status', 'claimed', 'organization', v_org_name);
  end if;

  -- Already on a pilot seat: nothing more to claim (pilot -> paid carry-over happens
  -- when the org account is created, see admin-org-accounts).
  if v_trial_grant_id is not null then
    return none;
  end if;

  -- 2. Email-domain auto-claim. Staff don't consume student seats, and a seat the
  --    partner released (or an admin revoked) isn't silently re-granted.
  select l.id, l.organization_name into v_lead_id, v_lead_name
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
    return none;
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
    delete from partner_seat_waitlist where institutional_lead_id = v_lead_id and email = v_email;
    return jsonb_build_object('status', 'claimed', 'organization', v_org_name);
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
    delete from partner_seat_waitlist where institutional_lead_id = v_lead_id and email = v_email;
    return jsonb_build_object('status', 'claimed', 'organization', v_org_name);
  end if;

  -- No free seat. Only "full" if the partner has a live program at all -- a lapsed
  -- pilot with no license isn't a capacity problem, the student just isn't covered.
  if not exists (select 1 from org_accounts where institutional_lead_id = v_lead_id and status = 'active')
     and not exists (
       select 1 from trial_grants
       where institutional_lead_id = v_lead_id and status = 'active' and expires_at > now()) then
    return none;
  end if;

  insert into partner_seat_waitlist (institutional_lead_id, email)
  values (v_lead_id, v_email)
  on conflict do nothing;

  update institutional_leads set seats_full_notified_at = now()
  where id = v_lead_id
    and (seats_full_notified_at is null or seats_full_notified_at < now() - interval '1 day');
  if found then
    insert into scheduled_jobs (function_name, payload, run_at)
    values ('partner-portal', jsonb_build_object('action', 'notify_seats_full', 'leadId', v_lead_id), now());
  end if;

  return jsonb_build_object('status', 'full', 'organization', v_lead_name);
end;
$$;

revoke execute on function public.claim_partner_seat() from public, anon;
grant execute on function public.claim_partner_seat() to authenticated;

-- partner_insights gains the waitlist count; otherwise unchanged.
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
    'waitlisted', (select count(*) from partner_seat_waitlist w where w.institutional_lead_id = p_lead_id),
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
