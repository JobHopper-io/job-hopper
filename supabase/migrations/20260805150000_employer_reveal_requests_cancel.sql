-- Phase 4 follow-up: employers can cancel a pending reveal request (e.g. changed their mind,
-- or - during dev - want to re-send after testing). Cancelling sets status rather than
-- deleting the row, so the audit trail Phase 6 wants ("every search and reveal request") stays
-- intact.
--
-- The original unique(employer_account_id, candidate_profile_id) blocked re-requesting a
-- candidate forever, including after a cancel or decline - too strict now that cancel exists.
-- Replaced with a partial unique index that only blocks a duplicate while a request is still
-- pending or already approved (no reason to send a second request once one's already granted);
-- a cancelled or declined row no longer blocks a fresh request.
alter table public.employer_reveal_requests
  drop constraint employer_reveal_requests_employer_account_id_candidate_prof_key;

alter table public.employer_reveal_requests
  drop constraint employer_reveal_requests_status_check,
  add constraint employer_reveal_requests_status_check
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  add column cancelled_at timestamptz;

create unique index employer_reveal_requests_active_unique
  on public.employer_reveal_requests (employer_account_id, candidate_profile_id)
  where status in ('pending', 'approved');
