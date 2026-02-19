-- Require unique phone numbers for registration; store phone in profiles.
-- Availability check and DB-level uniqueness use profiles.phone_number.

-- 1. Unique constraint on normalized phone in profiles (digits only; multiple NULLs allowed)
CREATE UNIQUE INDEX idx_profiles_phone_number_unique
ON public.profiles (
  (regexp_replace(trim(COALESCE(phone_number, '')), '[^0-9]', '', 'g'))
)
WHERE phone_number IS NOT NULL AND trim(phone_number) <> '' AND length(regexp_replace(trim(phone_number), '[^0-9]', '', 'g')) >= 10;

-- 2. RPC for anon to check if a phone number is available (reads from profiles)
CREATE OR REPLACE FUNCTION public.check_phone_available(phone_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_input text;
  taken boolean;
BEGIN
  IF phone_input IS NULL OR trim(phone_input) = '' THEN
    RETURN true;
  END IF;
  normalized_input := regexp_replace(trim(phone_input), '[^0-9]', '', 'g');
  IF length(normalized_input) < 10 THEN
    RETURN true;
  END IF;
  SELECT EXISTS(
    SELECT 1
    FROM profiles p
    WHERE p.phone_number IS NOT NULL
      AND trim(p.phone_number) <> ''
      AND regexp_replace(trim(p.phone_number), '[^0-9]', '', 'g') = normalized_input
  ) INTO taken;
  RETURN NOT taken;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO authenticated;

-- 3. handle_new_user: write phone_number from auth metadata into profiles (normalized to digits)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_subscription_id UUID;
  meta_phone text;
  normalized_phone text;
BEGIN
  user_subscription_id := NULL;
  meta_phone := trim(COALESCE(NEW.raw_user_meta_data->>'phone_number', ''));
  IF meta_phone <> '' THEN
    normalized_phone := regexp_replace(meta_phone, '[^0-9]', '', 'g');
    IF length(normalized_phone) < 10 THEN
      normalized_phone := NULL;
    END IF;
  ELSE
    normalized_phone := NULL;
  END IF;

  INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, phone_number, subscription_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    normalized_phone,
    user_subscription_id
  );

  RETURN NEW;
END;
$$;
