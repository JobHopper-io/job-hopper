-- Phase 4 follow-up: a reveal request now carries the actual role and pay range the employer
-- is hiring for, instead of just "we want to know more about you" - the seeker can then make
-- an informed approve/decline decision instead of approving blind. Mirrors the industry pattern
-- (e.g. Hired's interview requests arrive with salary attached) rather than LinkedIn/Indeed's
-- blind-contact-request model.
--
-- Nullable + validated at the edge function layer (employer-request-reveal), not a DB NOT NULL -
-- consistent with how the other snapshot columns on this table are handled, and avoids a
-- migration-time backfill problem for any rows that predate this column.
alter table public.employer_reveal_requests
  add column role_title text,
  add column pay_min integer,
  add column pay_max integer,
  add column pay_type public.pay_type;
