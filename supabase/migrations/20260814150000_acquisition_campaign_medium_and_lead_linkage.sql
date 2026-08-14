-- Extends the existing acquisition-attribution system (landing_path/utm_source/
-- referrer_host, see supabase/functions/_shared/acquisition-channel.ts) rather than
-- duplicating it with a separate acquisition_source/acquisition_medium/
-- acquisition_campaign scheme, per the build spec's own "extend, don't duplicate"
-- instruction. Adds the two pieces that were genuinely missing: campaign/medium
-- capture, and a best-effort link from a signup back to the specific
-- institutional_leads row it came from (mirrors the employer-domain-match pattern
-- already used for matched_employer_id below).
alter table public.profiles
  add column if not exists utm_campaign text,
  add column if not exists utm_medium text,
  add column if not exists referred_by_institutional_lead_id uuid references public.institutional_leads(id);

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

  insert into public.profiles (
    auth_user_id, first_name, last_name, email, phone_number,
    landing_path, utm_source, referrer_host, utm_campaign, utm_medium,
    referred_by_institutional_lead_id
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
    matched_lead_id
  );

  return new;
end;
$$;
