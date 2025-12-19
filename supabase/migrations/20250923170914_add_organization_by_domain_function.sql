-- Create function to get organization by domain
CREATE OR REPLACE FUNCTION get_organization_by_domain(domain_name TEXT)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', o.id,
        'name', o.name,
        'domain', o.domain,
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
    WHERE o.domain = domain_name;
    
    RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anonymous users
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION get_organization_by_domain TO authenticated, anon;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;
