-- Add is_onboarded flag to organizations table
-- This migration adds a boolean flag to track whether an organization has completed onboarding

-- Add is_onboarded column to organizations table
ALTER TABLE organizations 
ADD COLUMN is_onboarded BOOLEAN DEFAULT FALSE;

-- Update existing organizations to be onboarded if they have branding setup
UPDATE organizations 
SET is_onboarded = TRUE 
WHERE logo_bucket_key IS NOT NULL 
  AND primary_color IS NOT NULL 
  AND secondary_color IS NOT NULL;

-- Update the user_needs_onboarding function to check the is_onboarded flag
CREATE OR REPLACE FUNCTION user_needs_onboarding()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_auth_user_id UUID;
    current_user_id UUID;
    user_org_id UUID;
    org_is_onboarded BOOLEAN;
BEGIN
    -- Get current authenticated user
    current_auth_user_id := auth.uid();
    
    IF current_auth_user_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Get user ID from users table
    SELECT id INTO current_user_id 
    FROM users 
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if user has an organization
    SELECT organization_id INTO user_org_id
    FROM users 
    WHERE id = current_user_id;

    IF user_org_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if organization is onboarded
    SELECT is_onboarded INTO org_is_onboarded
    FROM organizations 
    WHERE id = user_org_id;

    RETURN NOT COALESCE(org_is_onboarded, FALSE);
END;
$$;

-- Update the create_organization_and_link_doctor function to set is_onboarded to FALSE
CREATE OR REPLACE FUNCTION create_organization_and_link_doctor(
    org_name TEXT,
    org_domain TEXT,
    org_logo_bucket_key TEXT DEFAULT NULL,
    org_primary_color TEXT DEFAULT '#007AFF',
    org_secondary_color TEXT DEFAULT '#0038D6'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_org_id UUID;
    current_user_id UUID;
    current_auth_user_id UUID;
BEGIN
    -- Get current authenticated user
    current_auth_user_id := auth.uid();
    
    IF current_auth_user_id IS NULL THEN
        RETURN json_build_object('error', 'User not authenticated');
    END IF;

    -- Get user ID from users table
    SELECT id INTO current_user_id 
    FROM users 
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'User profile not found');
    END IF;

    -- Create organization with is_onboarded = FALSE
    INSERT INTO organizations (name, domain, logo_bucket_key, primary_color, secondary_color, is_onboarded)
    VALUES (org_name, org_domain, org_logo_bucket_key, org_primary_color, org_secondary_color, FALSE)
    RETURNING id INTO new_org_id;

    -- Link user to organization
    UPDATE users 
    SET organization_id = new_org_id
    WHERE id = current_user_id;

    -- Return the created organization
    RETURN (
        SELECT json_build_object(
            'id', id,
            'name', name,
            'domain', domain,
            'logo_bucket_key', logo_bucket_key,
            'primary_color', primary_color,
            'secondary_color', secondary_color,
            'is_onboarded', is_onboarded,
            'created_at', created_at
        )
        FROM organizations 
        WHERE id = new_org_id
    );
END;
$$;

-- Add function to mark organization as onboarded
CREATE OR REPLACE FUNCTION mark_organization_onboarded()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_auth_user_id UUID;
    current_user_id UUID;
    user_org_id UUID;
    updated_org JSON;
BEGIN
    -- Get current authenticated user
    current_auth_user_id := auth.uid();
    
    IF current_auth_user_id IS NULL THEN
        RETURN json_build_object('error', 'User not authenticated');
    END IF;

    -- Get user ID from users table
    SELECT id INTO current_user_id 
    FROM users 
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'User profile not found');
    END IF;

    -- Get user's organization ID
    SELECT organization_id INTO user_org_id
    FROM users 
    WHERE id = current_user_id;

    IF user_org_id IS NULL THEN
        RETURN json_build_object('error', 'User has no organization');
    END IF;

    -- Mark organization as onboarded
    UPDATE organizations 
    SET is_onboarded = TRUE
    WHERE id = user_org_id;

    -- Return updated organization
    SELECT json_build_object(
        'id', id,
        'name', name,
        'domain', domain,
        'logo_bucket_key', logo_bucket_key,
        'primary_color', primary_color,
        'secondary_color', secondary_color,
        'is_onboarded', is_onboarded,
        'created_at', created_at
    ) INTO updated_org
    FROM organizations 
    WHERE id = user_org_id;

    RETURN COALESCE(updated_org, json_build_object('error', 'Failed to update organization'));
END;
$$;
