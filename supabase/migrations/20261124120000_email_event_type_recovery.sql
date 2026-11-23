-- email_events.type for B2C recovery sequence sends (admin-revenue-recovery-segments,
-- recovery-sequences). Its own file: a new enum value can't be used in the transaction
-- that adds it.
alter type public.email_event_type add value if not exists 'recovery';
