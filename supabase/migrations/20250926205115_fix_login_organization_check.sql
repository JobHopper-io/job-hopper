-- Fix login organization check by creating a function that can verify user-organization relationships
-- without RLS restrictions (needed for pre-authentication validation)

-- Function to check if email belongs to organization (for login validation)
CREATE OR REPLACE FUNCTION check_user_belongs_to_organization(
    user_email TEXT,
    org_domain TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_exists BOOLEAN;
BEGIN
    -- Check if user exists and belongs to the organization
    SELECT EXISTS(
        SELECT 1 
        FROM users u
        JOIN organizations o ON u.organization_id = o.id
        WHERE u.email = user_email 
        AND o.domain = org_domain
    ) INTO user_exists;
    
    RETURN COALESCE(user_exists, FALSE);
END;
$$;

-- Function to get organization by domain (public access for login validation)
CREATE OR REPLACE FUNCTION get_organization_by_domain_public(domain_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    org_data JSON;
BEGIN
    SELECT json_build_object(
        'id', id,
        'name', name,
        'domain', domain,
        'logo_bucket_key', logo_bucket_key,
        'primary_color', primary_color,
        'secondary_color', secondary_color,
        'created_at', created_at
    ) INTO org_data
    FROM organizations 
    WHERE domain = domain_name;

    RETURN COALESCE(org_data, json_build_object('error', 'Organization not found'));
END;
$$;
