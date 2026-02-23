-- Allow anonymous users to read products (e.g. pricing page before sign-up).
-- Existing policy "Authenticated can read products" remains for authenticated users.

DROP POLICY IF EXISTS "Anon can read products" ON public.products;
CREATE POLICY "Anon can read products" ON public.products
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.products TO anon;
