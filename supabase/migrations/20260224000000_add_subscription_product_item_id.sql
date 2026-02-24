-- Add Stripe subscription item id to subscription_product
-- This is used only for Stripe operations (e.g. per-item cancel); Supabase remains the source of truth.

alter table public.subscription_product
  add column if not exists stripe_subscription_item_id text;

