-- Remove user_role enum and profiles.role column; app only uses subscriber.
-- Update RPCs that insert into profiles so they no longer reference role.

-- 1. handle_new_user: stop inserting role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_organization_id UUID;
BEGIN
    user_organization_id := NULL;

    INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email,
        user_organization_id
    );

    RETURN NEW;
END;
$$;

-- 2. create_user_profile: stop inserting role
CREATE OR REPLACE FUNCTION create_user_profile(
    user_id UUID,
    user_email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    new_user_id UUID;
BEGIN
    SELECT id INTO new_user_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF new_user_id IS NULL THEN
        INSERT INTO profiles (
            auth_user_id,
            first_name,
            last_name,
            email,
            phone_number
        ) VALUES (
            user_id,
            first_name,
            last_name,
            user_email,
            phone_number
        ) RETURNING id INTO new_user_id;
    END IF;

    RETURN jsonb_build_object('user_id', new_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Drop column and enum
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS public.user_role CASCADE;
