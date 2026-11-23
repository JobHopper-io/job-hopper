-- Growth step 3 (docs/growth/lead-system-design.md §4): email_events becomes the single
-- send log, including cold outbound sends from scripts/outbound-live-send.mjs.
--
-- ALTER TYPE ... ADD VALUE cannot share a transaction with a statement that uses the new
-- value, so this is deliberately its own migration file with nothing else in it (same
-- pattern as 20260720130000 / 20260805130000).
ALTER TYPE public.email_event_type ADD VALUE IF NOT EXISTS 'outbound';
