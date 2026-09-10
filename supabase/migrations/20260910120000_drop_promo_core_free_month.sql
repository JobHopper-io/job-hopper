-- Remove the "First 25 Core subscribers get a free month" promo entirely.
-- Offer is retired: create-checkout-session no longer calls try_claim_core_free_month
-- and always applies the standard 14-day trial. Drop the RPC and its bookkeeping tables.

drop function if exists public.try_claim_core_free_month(uuid);
drop table if exists public.promo_core_free_month_claims;
drop table if exists public.promo_core_free_month;
