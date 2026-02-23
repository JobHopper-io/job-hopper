-- DB-first products: add price_cents, type (enum), description; remove stripe_product_id; seed rows.

-- 1. Create product_type enum
DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('subscription', 'payment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add new columns with defaults (so existing rows get values and NOT NULL is valid)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type public.product_type DEFAULT 'subscription'::public.product_type,
  ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- 3. Backfill existing rows by key (correct values for known keys)
UPDATE public.products SET
  price_cents = CASE key
    WHEN 'entry_mid' THEN 1900
    WHEN 'senior_management' THEN 2900
    WHEN 'director_vp_c_level' THEN 4900
    WHEN 'premium_insights' THEN 3000
    WHEN 'interview_prep' THEN 3000
    WHEN 'resume_upgrade' THEN 1995
    ELSE price_cents
  END,
  type = CASE key
    WHEN 'resume_upgrade' THEN 'payment'::public.product_type
    ELSE 'subscription'::public.product_type
  END,
  description = CASE key
    WHEN 'entry_mid' THEN 'Curated job matches for entry and mid-level roles.'
    WHEN 'senior_management' THEN 'Curated job matches for senior and management roles.'
    WHEN 'director_vp_c_level' THEN 'Curated job matches for director, VP, and C-level roles.'
    WHEN 'premium_insights' THEN 'Access to premium insights and hiring contacts.'
    WHEN 'interview_prep' THEN 'Structured interview prep and strategy.'
    WHEN 'resume_upgrade' THEN 'One-time professional resume upgrade.'
    ELSE COALESCE(description, '')
  END;

-- 4. Set NOT NULL (all rows now have values)
ALTER TABLE public.products
  ALTER COLUMN price_cents SET NOT NULL,
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN description SET NOT NULL;
ALTER TABLE public.products
  ALTER COLUMN price_cents DROP DEFAULT,
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN description SET DEFAULT '';

-- 5. Unique on key for idempotent seed (skip if already exists)
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_key_key UNIQUE (key);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. Drop stripe_product_id (constraint goes with column)
ALTER TABLE public.products
  DROP COLUMN IF EXISTS stripe_product_id;

-- 7. Seed products (idempotent: upsert by key)
INSERT INTO public.products (key, display_name, description, is_addon, price_cents, type)
VALUES
  ('entry_mid', 'Entry & Mid Level', 'Curated job matches for entry and mid-level roles.', false, 1900, 'subscription'),
  ('senior_management', 'Senior & Management', 'Curated job matches for senior and management roles.', false, 2900, 'subscription'),
  ('director_vp_c_level', 'Director, VP & C-Level', 'Curated job matches for director, VP, and C-level roles.', false, 4900, 'subscription'),
  ('premium_insights', 'Premium Insights & Contact Access', 'Access to premium insights and hiring contacts.', true, 3000, 'subscription'),
  ('interview_prep', 'Interview Prep & Strategy', 'Structured interview prep and strategy.', true, 3000, 'subscription'),
  ('resume_upgrade', 'Resume Upgrade', 'One-time professional resume upgrade.', true, 1995, 'payment')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_addon = EXCLUDED.is_addon,
  price_cents = EXCLUDED.price_cents,
  type = EXCLUDED.type;
