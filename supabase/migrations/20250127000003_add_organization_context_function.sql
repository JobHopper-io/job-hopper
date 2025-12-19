-- Add organization context function for RLS policies
-- This function gets the current user's organization ID without causing recursion

CREATE OR REPLACE FUNCTION get_current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    user_org_id UUID;
BEGIN
    -- Get the current user's organization ID
    SELECT organization_id INTO user_org_id
    FROM users 
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    RETURN user_org_id;
END;
$$;

-- Grant execute permission to authenticated users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION get_current_user_organization_id TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

-- Create function to check if user belongs to organization
CREATE OR REPLACE FUNCTION user_belongs_to_organization(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN get_current_user_organization_id() = org_id;
END;
$$;

-- Grant execute permission to authenticated users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION user_belongs_to_organization TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;
