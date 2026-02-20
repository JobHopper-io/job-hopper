-- Subscription overhaul (plan): drop old subscriptions table, profiles.subscription_id, RPCs; update handle_new_user.

-- 1. Drop RPCs that depend on subscriptions and profiles.subscription_id
DROP FUNCTION IF EXISTS public.create_subscription_for_user(uuid, subscription_tier, integer);
DROP FUNCTION IF EXISTS public.update_subscription_tier(uuid, subscription_tier);
DROP FUNCTION IF EXISTS public.enable_premium_addon(text, uuid);

-- 2. Update handle_new_user: stop inserting subscription_id (column will be dropped)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_phone text;
  normalized_phone text;
BEGIN
  meta_phone := trim(COALESCE(NEW.raw_user_meta_data->>'phone_number', ''));
  IF meta_phone <> '' THEN
    normalized_phone := regexp_replace(meta_phone, '[^0-9]', '', 'g');
    IF length(normalized_phone) < 10 THEN
      normalized_phone := NULL;
    END IF;
  ELSE
    normalized_phone := NULL;
  END IF;

  INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, phone_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    normalized_phone
  );

  RETURN NEW;
END;
$$;

-- 3. Drop RLS policies on subscriptions (they reference profiles.subscription_id)
DROP POLICY IF EXISTS "Users can view their subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their subscription" ON public.subscriptions;

-- 4. Drop FK and column on profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_id_fkey;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS subscription_id;

DROP INDEX IF EXISTS idx_profiles_subscription_id;

-- 5. Drop old subscriptions table (and its trigger if any)
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TABLE IF EXISTS public.subscriptions;

-- 6. Drop old enums (no longer referenced)
DROP TYPE IF EXISTS public.subscription_status;
DROP TYPE IF EXISTS public.subscription_tier;
