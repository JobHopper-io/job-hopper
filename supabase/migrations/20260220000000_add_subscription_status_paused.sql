-- Add 'paused' to subscription_status enum for Stripe subscription pause/resume lifecycle.
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'paused';
