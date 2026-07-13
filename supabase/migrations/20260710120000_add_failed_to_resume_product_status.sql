-- Add 'failed' to resume_product_status.
--
-- Must live in its own migration: Postgres forbids using a newly added enum value
-- in the same transaction that adds it, and the Supabase CLI runs each migration
-- file in a transaction. The sweeper and the fulfillment error paths that write
-- 'failed' therefore land in later migrations / deploys.

ALTER TYPE public.resume_product_status ADD VALUE IF NOT EXISTS 'failed';
