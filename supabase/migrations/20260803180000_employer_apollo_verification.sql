-- Phase 2 bullet 2, upgraded: Apollo org search becomes the authoritative verification
-- signal (does the claimed company's real domain match the work email's domain?), with the
-- signup-time heuristic (20260803170000: employers.domain match / free-email fallback) kept
-- as the fallback for whenever Apollo is inconclusive (no match, ambiguous, credit
-- exhaustion, API error) - the row simply keeps its initial status in that case.
--
-- Apollo needs an HTTP call, which a Postgres trigger can't make synchronously. Reuses the
-- existing scheduled_jobs + run-scheduled-jobs cron infra (same one resume-advice/job-
-- matching already ride) instead of adding a new invocation mechanism.
insert into public.apollo_limits (name, usage, credit_limit)
values ('employer_verification', 0, 100)
on conflict (name) do nothing;

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
