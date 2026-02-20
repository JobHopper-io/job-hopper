-- Subscription overhaul (plan): add stripe_customer_id to profiles; create products, subscription, subscription_product, profile_product.
-- New subscription table uses billing_subscription_status enum (trial | active | canceled). Old subscriptions table remains until next migration.

-- 1. Add stripe_customer_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 2. Enum for new subscription table (trial | active | canceled)
DO $$ BEGIN
  CREATE TYPE public.billing_subscription_status AS ENUM ('trial', 'active', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Table: products (key = slug, display_name = human-facing name)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id text NOT NULL UNIQUE,
  key text NOT NULL,
  display_name text NOT NULL,
  is_addon boolean NOT NULL
);

-- 4. Table: subscription (one row per Stripe subscription; profile_id links to profile)
CREATE TABLE IF NOT EXISTS public.subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_status public.billing_subscription_status NOT NULL,
  current_period_ends_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_subscription_profile_id ON public.subscription(profile_id);
CREATE INDEX IF NOT EXISTS idx_subscription_stripe_id ON public.subscription(stripe_subscription_id);

-- 5. Table: subscription_product (one row per product on a subscription)
CREATE TABLE IF NOT EXISTS public.subscription_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscription(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE(subscription_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_product_subscription_id ON public.subscription_product(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_product_product_id ON public.subscription_product(product_id);

-- 6. Table: profile_product (one-time purchases)
CREATE TABLE IF NOT EXISTS public.profile_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE(profile_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_product_profile_id ON public.profile_product(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_product_product_id ON public.profile_product(product_id);

-- 7. RLS: subscription
ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their subscription row" ON public.subscription;
CREATE POLICY "Users can view their subscription row" ON public.subscription
  FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 8. RLS: subscription_product
ALTER TABLE public.subscription_product ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view subscription_product for their subscriptions" ON public.subscription_product;
CREATE POLICY "Users can view subscription_product for their subscriptions" ON public.subscription_product
  FOR SELECT
  USING (
    subscription_id IN (
      SELECT id FROM public.subscription
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
  );

-- 9. RLS: profile_product
ALTER TABLE public.profile_product ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their profile_product rows" ON public.profile_product;
CREATE POLICY "Users can view their profile_product rows" ON public.profile_product
  FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 10. RLS: products (readable by authenticated for display)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products" ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- 11. Grants
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.subscription TO authenticated;
GRANT SELECT ON public.subscription_product TO authenticated;
GRANT SELECT ON public.profile_product TO authenticated;
