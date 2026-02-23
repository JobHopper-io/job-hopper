-- Rename subscription table to subscriptions (plural).

ALTER TABLE public.subscription RENAME TO subscriptions;

-- Update RLS policy on subscription_product that references the table in its USING clause
DROP POLICY IF EXISTS "Users can view subscription_product for their subscriptions" ON public.subscription_product;
CREATE POLICY "Users can view subscription_product for their subscriptions" ON public.subscription_product
  FOR SELECT
  USING (
    subscription_id IN (
      SELECT id FROM public.subscriptions
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
  );

