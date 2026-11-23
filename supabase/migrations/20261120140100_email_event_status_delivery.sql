-- Growth step 3: provider delivery outcomes recorded on email_events by
-- mailtrap-bounce-webhook (matched by provider_message_id). Own file for the same
-- ALTER TYPE ... ADD VALUE reason as 20261120140000.
ALTER TYPE public.email_event_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE public.email_event_status ADD VALUE IF NOT EXISTS 'bounced';
ALTER TYPE public.email_event_status ADD VALUE IF NOT EXISTS 'complained';
