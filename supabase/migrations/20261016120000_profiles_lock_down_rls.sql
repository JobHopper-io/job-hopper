-- SECURITY: profiles was readable AND writable by anyone holding the anon key.
--
-- The 2024 initial setup created two "for now, to avoid recursion" policies on the old
-- `users` table (renamed to profiles since): FOR SELECT USING (true) and FOR UPDATE
-- USING (true), both on role `public` (which includes anon). Every frontend profiles
-- query is already scoped to the caller's own row (src/lib/profile.ts, subscription.ts,
-- notifications.ts) and the "own profile" policies cover those, so these are pure
-- exposure: every email/phone/stripe_customer_id was dumpable, and any row editable.
drop policy if exists "Users can view organization members" on public.profiles;
drop policy if exists "Users can update organization members" on public.profiles;

-- Even own-row UPDATE was unrestricted by column, so a user could set their own
-- org_account_id / trial_grant_id and grant themselves a paid partner seat (or rewrite
-- stripe_customer_id). Column-level allowlist = ProfileUserEditable in
-- src/types/database.ts plus the two non-form fields src/lib/profile.ts writes. Server
-- code uses service_role and is unaffected. A new self-editable column must be added
-- here too (fails closed: the update errors rather than silently allowing it).
revoke update on public.profiles from anon, authenticated;
grant update (
  first_name, last_name, current_job_title, career_level, target_job_title,
  years_of_experience, current_industry, target_role_categories, desired_salary_min,
  desired_salary_max, preferred_locations, open_to_relocation, open_to_remote,
  location_radius_miles, requires_us_sponsorship, recruiter_visible, current_employer,
  resume_bucket_key, has_seen_walkthrough
) on public.profiles to authenticated;
