-- Rename the "Premium Insights" display name to "Hiring Intel" everywhere the app shows
-- product-catalog copy (Billing / ManageSubscription add-on list). The product key
-- (`premium_insights`) and every internal identifier (columns, edge function, lib files)
-- are left unchanged - this is a display-copy-only rename to match the rest of the app.
update public.products
set
  display_name = 'Hiring Intel & Contact Access',
  description = 'Access to full Hiring Intel — hiring-manager contacts and more.'
where key = 'premium_insights';
