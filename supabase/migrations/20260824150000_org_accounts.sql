-- Bulk licensing / organization accounts (Build 10-11).
--
-- org_accounts is deliberately its own table, not an extension of trial_grants: that
-- table's own migration comment is explicit that it was kept out of `subscriptions` to
-- avoid corrupting subscription_reconciliation_audit -- bolting real Stripe/payment
-- state onto the same free-trial table would blur that exact boundary. Instead this
-- reuses trial_grants' *pattern* (org-scoped seats, folds into base-tier the same way,
-- `converted_from_trial_grant_id` for lineage when a free trial becomes a paying org)
-- while keeping a real `subscriptions` row (subscription_id, one per org, owned by the
-- org's billing-contact profile) as the actual entitlement/reconciliation source of
-- truth -- no parallel status/period tracking, no faked subscriptions row.
--
-- Seat quantity billing uses Stripe's native subscription item `quantity` (set at
-- creation and updated via stripe.subscriptions.update on revoke) -- no custom
-- seat-pricing logic. seat_count/seats_used here are the DB-side count purchased
-- (mirrors the Stripe quantity) and the CSV-import hard-stop checks against it.
create table public.org_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  institutional_lead_id uuid references public.institutional_leads(id),
  organization_name text not null,
  billing_profile_id uuid not null references public.profiles(id),
  subscription_id uuid references public.subscriptions(id),
  feature_tier text not null check (feature_tier in ('core', 'premium')),
  seat_count int not null check (seat_count > 0),
  seats_used int not null default 0 check (seats_used >= 0 and seats_used <= seat_count),
  converted_from_trial_grant_id uuid references public.trial_grants(id),
  status text not null default 'active' check (status in ('active', 'canceled')),
  created_by uuid references auth.users(id)
);

-- One row per CSV-imported seat: the specific named email an admin invited against a
-- purchased seat, matched by email at signup time (same best-effort email-match shape
-- `handle_new_user()` already uses for institutional_leads.contact_email below) rather
-- than a shared invite-code/link the way trial_grants works -- a CSV of specific people
-- is a specific-identity provisioning model, not an anonymous pool.
create table public.org_seat_invites (
  id uuid primary key default gen_random_uuid(),
  org_account_id uuid not null references public.org_accounts(id) on delete cascade,
  email text not null,
  invited_at timestamptz not null default now(),
  claimed boolean not null default false,
  revoked_at timestamptz,
  unique (org_account_id, email)
);

alter table public.profiles
  add column org_account_id uuid references public.org_accounts(id);

alter table public.org_accounts enable row level security;
alter table public.org_seat_invites enable row level security;

-- Same posture as trial_grants: no general client access, all reads/writes through
-- admin edge functions (service role). One exception mirroring trial_grants_select_own
-- -- a signed-in user may read their OWN linked org account so baseTier can fold it in
-- without a round trip through an edge function.
create policy "org_accounts_select_own" on public.org_accounts
  for select
  to authenticated
  using (
    id = (select org_account_id from public.profiles where auth_user_id = auth.uid())
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta_phone text;
  normalized_phone text;
  work_domain text;
  matched_employer_id uuid;
  verification_status text;
  new_employer_account_id uuid;
  matched_lead_id uuid;
  matched_trial_grant_id uuid;
  matched_org_seat_invite_id uuid;
  matched_org_account_id uuid;
  -- ponytail: small hardcoded list, not an exhaustive free-email-provider database;
  -- expand here (or replace with a lookup table) if false-"verified" reports come in.
  free_email_domains text[] := array[
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
    'aol.com', 'protonmail.com', 'live.com', 'msn.com'
  ];
begin
  if new.raw_user_meta_data->>'account_type' = 'employer' then
    work_domain := lower(split_part(new.email, '@', 2));

    select id into matched_employer_id
    from public.employers
    where lower(domain) = work_domain
    limit 1;

    if matched_employer_id is not null then
      verification_status := 'verified';
    elsif work_domain = any(free_email_domains) then
      verification_status := 'pending';
    else
      verification_status := 'verified';
    end if;

    insert into public.employer_accounts (
      auth_user_id, company_name, work_email, verification_status, matched_employer_id
    )
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'company_name', ''),
      new.email,
      verification_status,
      matched_employer_id
    )
    returning id into new_employer_account_id;

    insert into public.scheduled_jobs (function_name, payload, run_at)
    values (
      'verify-employer-account',
      jsonb_build_object('employer_account_id', new_employer_account_id),
      now()
    );

    return new;
  end if;

  meta_phone := trim(coalesce(new.raw_user_meta_data->>'phone_number', ''));
  if meta_phone <> '' then
    normalized_phone := regexp_replace(meta_phone, '[^0-9]', '', 'g');
    if length(normalized_phone) < 10 then
      normalized_phone := null;
    end if;
  else
    normalized_phone := null;
  end if;

  -- Best-effort only: most real institutional-outreach signups will come from a
  -- student/employee at the org, not the decision-maker whose email was actually
  -- messaged, so this is expected to be null far more often than not — that's normal,
  -- not a bug.
  select id into matched_lead_id
  from public.institutional_leads
  where lower(contact_email) = lower(new.email)
  limit 1;

  -- Atomically claim a trial seat: the where clause is the only guard against
  -- overfilling (status/expiry/seat-cap all re-checked here, not just at link-visit
  -- time), so a burst of concurrent signups on the same code can never exceed
  -- seat_count. An invalid/expired/full code is best-effort like the lead match above
  -- — signup still succeeds, it just proceeds without trial access.
  if trim(coalesce(new.raw_user_meta_data->>'trial_invite_code', '')) <> '' then
    update public.trial_grants
    set seats_used = seats_used + 1
    where invite_code = new.raw_user_meta_data->>'trial_invite_code'
      and status = 'active'
      and expires_at > now()
      and seats_used < seat_count
    returning id into matched_trial_grant_id;
  end if;

  -- Org seat provisioning: best-effort email match against an unclaimed CSV-imported
  -- invite. The seat's capacity was already reserved at import time (org_accounts.
  -- seats_used incremented then, hard-stopped against seat_count) -- this just marks
  -- the specific named invite claimed and links the resulting profile to the org so
  -- base-tier folds in the org's paid tier the same way a trial grant already does.
  select id, org_account_id into matched_org_seat_invite_id, matched_org_account_id
  from public.org_seat_invites
  where lower(email) = lower(new.email)
    and claimed = false
    and revoked_at is null
  limit 1;

  if matched_org_seat_invite_id is not null then
    update public.org_seat_invites
    set claimed = true
    where id = matched_org_seat_invite_id;
  end if;

  insert into public.profiles (
    auth_user_id, first_name, last_name, email, phone_number,
    landing_path, utm_source, referrer_host, utm_campaign, utm_medium,
    referred_by_institutional_lead_id, trial_grant_id, org_account_id
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    normalized_phone,
    new.raw_user_meta_data->>'landing_path',
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'referrer_host',
    new.raw_user_meta_data->>'utm_campaign',
    new.raw_user_meta_data->>'utm_medium',
    matched_lead_id,
    matched_trial_grant_id,
    matched_org_account_id
  );

  return new;
end;
$$;
