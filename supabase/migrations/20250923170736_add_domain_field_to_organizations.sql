-- Add domain field to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS domain TEXT UNIQUE;

-- Add index for domain field for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);

-- Add check constraint to ensure domain follows subdomain format
DO $$ BEGIN
    ALTER TABLE organizations ADD CONSTRAINT check_domain_format 
    CHECK (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create new function with domain support
CREATE OR REPLACE FUNCTION create_organization_and_link_doctor_v2(
    org_name TEXT,
    org_domain TEXT,
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
    
    -- Check if domain is already taken
    IF EXISTS (SELECT 1 FROM organizations WHERE organizations.domain = org_domain) THEN
        RAISE EXCEPTION 'Domain % is already taken', org_domain;
    END IF;
    
    -- Create the organization
    INSERT INTO organizations (name, domain, logo_bucket_key, primary_color, secondary_color)
    VALUES (org_name, org_domain, logo_bucket_key, primary_color, secondary_color)
    RETURNING id INTO new_org_id;
    
    -- Link the doctor to the organization
    UPDATE users 
    SET organization_id = new_org_id
    WHERE auth_user_id = current_user_id;
    
    -- Return the created organization data
    SELECT json_build_object(
        'organization_id', new_org_id,
        'name', org_name,
        'domain', org_domain,
        'logo_bucket_key', logo_bucket_key,
        'primary_color', primary_color,
        'secondary_color', secondary_color,
        'created_at', NOW()
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check domain availability
CREATE OR REPLACE FUNCTION check_domain_availability(domain_to_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if domain follows the correct format
    IF domain_to_check !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
        RETURN FALSE;
    END IF;
    
    -- Check if domain is already taken
    IF EXISTS (SELECT 1 FROM organizations WHERE organizations.domain = domain_to_check) THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION create_organization_and_link_doctor_v2 TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION check_domain_availability TO authenticated;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;
