-- Update user signup function to include booking_link
-- This migration updates the create_user_profile_and_organization function to handle booking links

CREATE OR REPLACE FUNCTION create_user_profile_and_organization(
    user_id UUID,
    user_email TEXT,
    first_name TEXT,
    last_name TEXT,
    org_name TEXT DEFAULT NULL,
    org_domain TEXT DEFAULT NULL,
    booking_link TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user_id UUID;
    new_org_id UUID;
BEGIN
    -- Create user profile
    INSERT INTO users (
        auth_user_id,
        first_name,
        last_name,
        email,
        role
    ) VALUES (
        user_id,
        first_name,
        last_name,
        user_email,
        'doctor'
    )
    RETURNING id INTO new_user_id;

    -- If organization data provided, create organization and link user
    IF org_name IS NOT NULL AND org_domain IS NOT NULL THEN
        -- Create organization with booking link
        INSERT INTO organizations (name, domain, booking_link)
        VALUES (org_name, org_domain, booking_link)
        RETURNING id INTO new_org_id;

        -- Link user to organization
        UPDATE users 
        SET organization_id = new_org_id
        WHERE id = new_user_id;
    END IF;

    -- Return success
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'organization_id', new_org_id
    );
END;
$$;
