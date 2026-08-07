-- Phase 6 bullet 1: admins can approve/reject/suspend employer accounts. `rejected` already
-- existed in the CHECK but nothing ever wrote it (Phase 2's auto-verification never rejects,
-- just leaves accounts 'pending' for human review) - this adds 'suspended' for bad actors
-- caught post-verification, plus the audit trail of who reviewed and why.
--
-- No new RLS policy: writes stay service-role-only via admin-review-employer (auth enforced
-- there via current_user_has_role), matching the existing posture - adding an authenticated-
-- facing policy here without a matching GRANT is exactly the footgun 20260805140000 fixed.
alter table public.employer_accounts
  drop constraint employer_accounts_verification_status_check,
  add constraint employer_accounts_verification_status_check
    check (verification_status in ('verified', 'pending', 'rejected', 'suspended')),
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz,
  add column review_reason text;
