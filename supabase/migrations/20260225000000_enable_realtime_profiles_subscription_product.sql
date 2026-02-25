-- Enable Supabase Realtime for profile- and subscription-related tables.
-- This migration ensures that changes to `public.profiles` and
-- `public.subscription_product` can be consumed via `postgres_changes`
-- channels in Supabase Realtime.

-- Ensure full replica identity so UPDATE/DELETE events include previous row data.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.subscription_product REPLICA IDENTITY FULL;

-- Safely add tables to the `supabase_realtime` publication if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscription_product'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_product;
  END IF;
END;
$$;

