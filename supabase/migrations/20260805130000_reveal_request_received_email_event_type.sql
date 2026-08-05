-- Phase 4 of Recruiter-Visible Mode: the seeker-notification email for an incoming reveal
-- request needs its own email_events.type value, same reasoning as sponsor_watch_alert
-- (20260720130000).
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as a statement that reads the
-- new value, so this is deliberately its own migration file with nothing else in it - the
-- employer-request-reveal edge function (a later deploy, a separate transaction entirely) is the
-- first thing that ever writes 'reveal_request_received'.
ALTER TYPE public.email_event_type ADD VALUE IF NOT EXISTS 'reveal_request_received';
