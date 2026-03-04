-- Resume products: dedicated lifecycle table; drop profile_product; add resume_tailoring product.

-- 1. Create resume_product_status enum
DO $$ BEGIN
  CREATE TYPE public.resume_product_status AS ENUM (
    'pending',
    'in_progress',
    'complete',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create resume_products table
CREATE TABLE IF NOT EXISTS public.resume_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  job_match_id uuid NULL REFERENCES public.job_matches(id) ON DELETE SET NULL,
  status public.resume_product_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  UNIQUE (profile_id, job_match_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_products_profile_id ON public.resume_products(profile_id);
CREATE INDEX IF NOT EXISTS idx_resume_products_job_match_id ON public.resume_products(job_match_id);
CREATE INDEX IF NOT EXISTS idx_resume_products_product_id ON public.resume_products(product_id);

-- 3. RLS: users can only read their own resume_products rows
ALTER TABLE public.resume_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their resume_products rows" ON public.resume_products;
CREATE POLICY "Users can view their resume_products rows" ON public.resume_products
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

GRANT SELECT ON public.resume_products TO authenticated;

-- 4. Drop profile_product (discard existing data per plan)
DROP POLICY IF EXISTS "Users can view their profile_product rows" ON public.profile_product;
DROP TABLE IF EXISTS public.profile_product;

-- 5. Seed resume_tailoring product (idempotent by key)
INSERT INTO public.products (key, display_name, description, category, price_cents)
VALUES (
  'resume_tailoring',
  'Per-Job Resume Tailoring',
  'Tailor your resume specifically for this job to stand out to employers.',
  'one_time_addon'::public.product_category,
  449
)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_cents = EXCLUDED.price_cents;
