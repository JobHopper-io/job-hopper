-- Phase 2 of Recruiter-Visible Mode (docs/recruiter-visible-mode-build-plan.md), bullet 1:
-- employer sign-up only. No verification status yet (bullet 2) and no separate employer
-- login route yet (bullet 3) - this just lets an employer account exist.
--
-- Named `employer_accounts`, not `employers` - that table already exists (scraped-company
-- reference data for Apollo org matching, see 20260716200000_sponsorship_data_engine_schema.sql)
-- and has no relation to user accounts.
create table public.employer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  work_email text not null,
  created_at timestamptz not null default now()
);

alter table public.employer_accounts enable row level security;

-- No insert/update policy for `authenticated`: rows are written only by handle_new_user()
-- (SECURITY DEFINER), same reasoning as profile_roles (20260313120000) - account state
-- shouldn't be self-editable by the row's own owner.
create policy "Employers can view own account"
on public.employer_accounts
for select
to authenticated
using (auth_user_id = auth.uid());

-- Re-create handle_new_user() (full body copied from 20260724170000_acquisition_referrer.sql)
-- to branch on account_type: employer signups create an employer_accounts row instead of a
-- profiles row - employers are not job seekers and don't go through seeker onboarding.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta_phone text;
  normalized_phone text;
begin
  if new.raw_user_meta_data->>'account_type' = 'employer' then
    insert into public.employer_accounts (auth_user_id, company_name, work_email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'company_name', ''),
      new.email
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
