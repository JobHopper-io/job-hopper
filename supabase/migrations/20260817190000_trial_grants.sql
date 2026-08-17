-- Admin-triggered trial seat generator (Build 09). Lets an admin grant an org's people
-- Free/Core/Premium-equivalent access without a real Stripe subscription, via a shared
-- invite code. Deliberately NOT modeled as a `subscriptions` row: that table's
-- stripe_subscription_id is NOT NULL UNIQUE and is reconciled against real Stripe data
-- (see subscription_reconciliation_audit) — faking rows there would corrupt that system.
-- Instead this is a second input folded into the existing baseTier choke points
-- (resolveBaseTier server-side, the baseTier computed in src/stores/user.ts) so every
-- tier-gated feature honors it without being touched individually.
create table public.trial_grants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  institutional_lead_id uuid references public.institutional_leads(id),
  organization_name text not null,
  seat_count int not null check (seat_count > 0),
  seats_used int not null default 0 check (seats_used >= 0),
  feature_tier text not null check (feature_tier in ('free', 'core', 'premium')),
  expires_at timestamptz not null,
  invite_code text unique not null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_by uuid references auth.users(id)
);

alter table public.trial_grants enable row level security;

alter table public.profiles
  add column trial_grant_id uuid references public.trial_grants(id);

-- Same posture as institutional_leads: no general client access. Admin edge functions
-- (service role) do all reads/writes for the admin UI and seat-claiming happens inside
-- the SECURITY DEFINER handle_new_user() trigger below, not from client code.
-- The one exception: a signed-in user may read their OWN linked grant (by profiles.
-- trial_grant_id) so the frontend baseTier computed can fold trial tier/expiry in
-- without a round trip through an edge function, mirroring how subscriptions/
-- subscription_product are already read directly via RLS-scoped client queries.
create policy "trial_grants_select_own" on public.trial_grants
  for select
  to authenticated
  using (
    id = (select trial_grant_id from public.profiles where auth_user_id = auth.uid())
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

  insert into public.profiles (
    auth_user_id, first_name, last_name, email, phone_number,
    landing_path, utm_source, referrer_host, utm_campaign, utm_medium,
    referred_by_institutional_lead_id, trial_grant_id
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
    matched_trial_grant_id
  );

  return new;
end;
$$;
