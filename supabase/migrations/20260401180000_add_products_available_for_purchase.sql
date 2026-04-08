-- Soft-disable retired subscription add-ons without deleting rows (Stripe FKs, existing entitlements).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_for_purchase boolean NOT NULL DEFAULT true;

UPDATE public.products
SET available_for_purchase = false
WHERE key IN ('premium_insights', 'interview_prep');
