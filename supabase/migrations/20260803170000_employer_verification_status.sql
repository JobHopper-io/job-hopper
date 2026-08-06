-- Phase 2 bullet 2: automatic verification at employer signup.
--
-- employers.domain is ~0% populated in production right now (backfill blocked on a Brave
-- Search API key, not on code - see docs/sponsorship-data-engine.md). A pure domain-match
-- would mark nearly everyone "pending" today, so this also falls back to a free-email-
-- provider heuristic that works regardless of that backfill: a matched employers.domain
-- wins outright; otherwise any domain that isn't a known free-email provider is presumed
-- to be a real company domain. This auto-improves for free once the domain backfill lands -
-- no code change needed, more signups will start hitting the employers.domain match.
alter table public.employer_accounts
  add column verification_status text not null default 'pending'
    check (verification_status in ('verified', 'pending', 'rejected')),
  add column matched_employer_id uuid references public.employers(id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta_phone text;
  normalized_phone text;
  work_domain text;
  matched_employer_id uuid;
  verification_status text;
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

  insert into public.profiles (
    auth_user_id, first_name, last_name, email, phone_number,
    landing_path, utm_source, referrer_host
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    normalized_phone,
    new.raw_user_meta_data->>'landing_path',
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'referrer_host'
  );

  return new;
end;
$$;
