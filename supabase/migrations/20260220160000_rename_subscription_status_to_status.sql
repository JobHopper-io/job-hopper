-- Rename subscriptions.subscription_status to status.

ALTER TABLE public.subscriptions
  RENAME COLUMN subscription_status TO status;
