-- D51-55: Sponsor Watch alert emails need their own email_events.type value, distinct from
-- 'subscription_update' (billing) and 'job_match_digest' (matching) - see
-- docs/sponsorship-data-engine.md D51-55.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as a statement that reads the
-- new value, so this is deliberately its own migration file with nothing else in it - the
-- sponsor-watch-check edge function (a later deploy, a separate transaction entirely) is the
-- first thing that ever writes 'sponsor_watch_alert'.
ALTER TYPE public.email_event_type ADD VALUE IF NOT EXISTS 'sponsor_watch_alert';
