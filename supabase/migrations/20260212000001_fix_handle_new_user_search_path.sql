-- Fix handle_new_user so it works when the trigger runs from auth schema.
-- The trigger runs in Auth context where search_path may not include public,
-- so we set search_path and use fully qualified names for public.user_role and public.users.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_organization_id UUID;
    user_assigned_role public.user_role;
BEGIN
    user_assigned_role := 'subscriber';
    user_organization_id := NULL;

    INSERT INTO public.users (auth_user_id, first_name, last_name, email, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email,
        user_assigned_role,
        user_organization_id
    );

    RETURN NEW;
END;
$$;
