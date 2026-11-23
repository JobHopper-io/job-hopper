-- SECURITY (safety re-apply, not a fix for a live hole): re-asserts the profiles column
-- allowlist from 20261016120000. A hosted check on 2026-11-21 confirmed production is already
-- locked down (authenticated can update first_name but not stripe_customer_id,
-- org_account_id or email). This re-applies it idempotently so it doesn't depend on that
-- state surviving, and hardens it further:
--   - also revokes per-column UPDATE grants (a table-level REVOKE leaves those in place)
--   - limits the own-row UPDATE policy to authenticated, with an explicit WITH CHECK
--   - pins resume_bucket_key to the caller's own upload path
-- If these columns were ever writable, a signed-in user could set their own
-- stripe_customer_id (another customer's billing portal), org_account_id / trial_grant_id (a
-- paid partner seat without using one), onboarding_completed, email, and more.
--
-- Server code uses service_role and is unaffected. touch_last_active() is SECURITY DEFINER,
-- so last_active_at keeps updating. A new self-editable column must be added to the grant
-- below (fails closed: the update errors rather than silently allowing it).

-- 1. Remove every UPDATE privilege anon/authenticated hold on profiles, table-level AND
--    per-column: a table-level REVOKE leaves column-level grants in place.
revoke update on public.profiles from anon, authenticated;
do $$
declare
  c record;
begin
  for c in
    select attname from pg_attribute
    where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
  loop
    execute format('revoke update (%I) on public.profiles from anon, authenticated', c.attname);
  end loop;
end;
$$;

-- 2. Grant back only the columns the frontend writes: ProfileUserEditable in
--    src/types/database.ts, plus resume_bucket_key and has_seen_walkthrough (src/lib/profile.ts).
grant update (
  first_name, last_name, current_job_title, career_level, target_job_title,
  years_of_experience, current_industry, target_role_categories, desired_salary_min,
  desired_salary_max, preferred_locations, open_to_relocation, open_to_remote,
  location_radius_miles, requires_us_sponsorship, recruiter_visible, current_employer,
  resume_bucket_key, has_seen_walkthrough
) on public.profiles to authenticated;

-- 3. Own-row UPDATE policy: authenticated only (was role public, which includes anon), with
--    an explicit WITH CHECK so the row can't be re-pointed at another auth user.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- 4. resume_bucket_key may only point at the user's own upload. src/lib/profile.ts uploads to
--    'resumes/<auth user id>-<ms timestamp>.<ext>' (getSessionUser().id = profiles.auth_user_id).
--    Server functions download this path with the service role, so without this a user could
--    point it at someone else's resume. NOT VALID: enforced for every new write now; existing
--    rows aren't checked until VALIDATE. Count violations on the hosted DB first:
--
--      select count(*) from public.profiles
--      where resume_bucket_key is not null
--        and resume_bucket_key not like 'resumes/' || auth_user_id::text || '-%';
--
--    then, once it returns 0 (or the rows are fixed):
--      alter table public.profiles validate constraint profiles_resume_bucket_key_own;
alter table public.profiles
  add constraint profiles_resume_bucket_key_own
  check (resume_bucket_key is null or resume_bucket_key like 'resumes/' || auth_user_id::text || '-%')
  not valid;
