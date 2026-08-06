-- Phase 2's employer_accounts (20260803160000) shipped with an RLS policy but no matching
-- GRANT - same bug shape as employers/employer_sponsorship_scores (20260717180000 +
-- 20260718120000) and sponsor_watch_subscriptions (20260718130000), caught here while building
-- Phase 4: employer_reveal_requests' RLS policies subquery employer_accounts, and that subquery
-- fails with "permission denied for table employer_accounts" without this grant - which also
-- means employerAPI.getCurrentEmployerAccount() (the employer dashboard's very first read) has
-- been broken since Phase 2.
grant select on public.employer_accounts to authenticated;
