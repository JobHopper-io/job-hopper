-- Add product_category enum and category column; backfill from legacy columns; drop is_addon and type.

-- 1. Create product_category enum
DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM (
    'base_plan',
    'subscription_addon',
    'one_time_addon',
    'one_time_item'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add category column with a temporary default so existing rows are valid
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category public.product_category
    DEFAULT 'base_plan'::public.product_category;

-- 3. Backfill category for existing rows using legacy is_addon + type
UPDATE public.products
SET category = CASE
  WHEN is_addon = false AND type = 'subscription'::public.product_type THEN 'base_plan'::public.product_category
  WHEN is_addon = true  AND type = 'subscription'::public.product_type THEN 'subscription_addon'::public.product_category
  WHEN is_addon = true  AND type = 'payment'::public.product_type     THEN 'one_time_addon'::public.product_category
  WHEN is_addon = false AND type = 'payment'::public.product_type     THEN 'one_time_item'::public.product_category
  ELSE category
END
WHERE category IS NULL;

-- 4. Make category NOT NULL and drop the default (new products must set it explicitly)
ALTER TABLE public.products
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN category DROP DEFAULT;

-- 5. Drop legacy columns now that category is the single source of truth
ALTER TABLE public.products
  DROP COLUMN IF EXISTS is_addon,
  DROP COLUMN IF EXISTS type;

