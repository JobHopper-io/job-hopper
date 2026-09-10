-- Core $29.00 -> $29.99, Premium $49.00 -> $49.99.
-- Stripe charge amounts are built inline from products.price_cents at checkout and
-- plan-change time (create-checkout-session and modify-subscription both use
-- price_data.unit_amount), so there are no pre-created Stripe Price objects to update --
-- this migration IS the Stripe change. Existing Stripe subscriptions keep their current
-- amount until the customer changes plan.

update public.products set price_cents = 2999 where key = 'core'    and category = 'base_plan';
update public.products set price_cents = 4999 where key = 'premium' and category = 'base_plan';
