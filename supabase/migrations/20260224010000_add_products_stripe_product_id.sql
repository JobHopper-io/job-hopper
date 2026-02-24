alter table public.products
  add column if not exists stripe_product_id text;

