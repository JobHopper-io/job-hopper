-- Create function to create organization and link doctor
CREATE OR REPLACE FUNCTION create_organization_and_link_doctor(
    org_name TEXT,
    logo_bucket_key TEXT DEFAULT NULL,
    primary_color TEXT DEFAULT NULL,
    secondary_color TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_org_id UUID;
    current_user_id UUID;
    result JSON;
BEGIN
    -- Get the current authenticated user's ID
    current_user_id := auth.uid();
    
    -- Check if user exists and is a doctor without an organization
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE auth_user_id = current_user_id 
        AND role = 'doctor' 
        AND organization_id IS NULL
    ) THEN
        RAISE EXCEPTION 'User must be a doctor without an organization to create one';
    END IF;
    
    -- Create the organization
    INSERT INTO organizations (name, logo_bucket_key, primary_color, secondary_color)
    VALUES (org_name, logo_bucket_key, primary_color, secondary_color)
    RETURNING id INTO new_org_id;
    
    -- Link the doctor to the organization
    UPDATE users 
    SET organization_id = new_org_id
    WHERE auth_user_id = current_user_id;
    
    -- Return the created organization data
    SELECT json_build_object(
        'organization_id', new_org_id,
        'name', org_name,
        'logo_bucket_key', logo_bucket_key,
        'primary_color', primary_color,
        'secondary_color', secondary_color,
        'created_at', NOW()
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION create_organization_and_link_doctor TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

-- Create function to get current user's organization
CREATE OR REPLACE FUNCTION get_current_user_organization()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', o.id,
        'name', o.name,
        'logo_bucket_key', o.logo_bucket_key,
        'primary_color', o.primary_color,
        'secondary_color', o.secondary_color,
        'stripe_customer_id', o.stripe_customer_id,
        'stripe_subscription_status', o.stripe_subscription_status,
        'stripe_plan_name', o.stripe_plan_name,
        'created_at', o.created_at,
        'updated_at', o.updated_at
    )
    INTO result
    FROM organizations o
    JOIN users u ON u.organization_id = o.id
    WHERE u.auth_user_id = auth.uid();
    
    RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION get_current_user_organization TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

-- Create function to check if user needs onboarding
CREATE OR REPLACE FUNCTION user_needs_onboarding()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE auth_user_id = auth.uid() 
        AND organization_id IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION user_needs_onboarding TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;
