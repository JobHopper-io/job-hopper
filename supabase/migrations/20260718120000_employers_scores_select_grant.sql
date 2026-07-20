-- Fixes a bug in 20260717180000: RLS policies alone don't grant access - Postgres requires the
-- underlying GRANT before a policy is even evaluated (RLS filters rows an already-permitted
-- operation would return, it doesn't itself permit the operation). 20260717180000 added
-- `create policy ... for select to authenticated using (true)` but never granted SELECT itself,
-- so authenticated reads 403'd outright. Caught by browser-testing D46-50 against a local stack
-- (PostgREST surfaces this as a plain 403, no RLS-specific message, easy to miss without an
-- actual authenticated request). Compare public.dashboard_banner (20260422140000), which got
-- this right: `grant select ... to authenticated` alongside its policy.

grant select on public.employers to authenticated;
grant select on public.employer_sponsorship_scores to authenticated;
