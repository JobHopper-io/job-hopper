-- Remove redundant 'in_progress' from resume_product_status (same meaning as 'pending').

-- 1. Migrate any existing in_progress rows to pending
UPDATE public.resume_products
SET status = 'pending'
WHERE status = 'in_progress';

-- 2. Create new enum without in_progress
CREATE TYPE public.resume_product_status_new AS ENUM (
  'pending',
  'complete',
  'cancelled'
);

-- 3. Switch column to new type (in_progress already updated to pending above)
ALTER TABLE public.resume_products
  ALTER COLUMN status TYPE public.resume_product_status_new
  USING (status::text::public.resume_product_status_new);

-- 4. Drop old enum and rename new one
DROP TYPE public.resume_product_status;
ALTER TYPE public.resume_product_status_new RENAME TO resume_product_status;

-- 5. Restore default (alter type can clear it)
ALTER TABLE public.resume_products
  ALTER COLUMN status SET DEFAULT 'pending'::public.resume_product_status;
