-- Premium tier launch: flip from waitlist-only to purchasable.
--
-- Premium's feature set (Real Sponsorship Score, Sponsor Watch, Apply Intelligence,
-- hiring manager contact, Ghost Listing Detector) is confirmed live. price_cents
-- keeps the $49/mo target set when the row was first created (see
-- 20260708120000_free_core_premium_product_model.sql); only availability changes.
UPDATE public.products
SET available_for_purchase = true
WHERE key = 'premium';
