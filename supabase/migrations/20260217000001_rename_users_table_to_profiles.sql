-- Rename public.users table to profiles and update all dependent objects.
-- This preserves data and foreign keys; functions and policies that reference
-- the table are updated to use the new name.

-- 1. Rename table (RLS policies and triggers move with the table)
ALTER TABLE public.users RENAME TO profiles;

-- 2. Rename trigger for clarity
ALTER TRIGGER update_users_updated_at ON public.profiles RENAME TO update_profiles_updated_at;

-- 3. Rename foreign key constraint
ALTER TABLE public.profiles RENAME CONSTRAINT users_organization_id_fkey TO profiles_organization_id_fkey;

-- 4. Update RLS policies on organizations that reference the profile table
DROP POLICY IF EXISTS "Users can view their subscription" ON organizations;
CREATE POLICY "Users can view their subscription" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM profiles
            WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their subscription" ON organizations;
CREATE POLICY "Users can update their subscription" ON organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id FROM profiles
            WHERE auth_user_id = auth.uid()
        )
    );

-- 5. handle_new_user: insert into profiles (latest version from 20260212000001)
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

    INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, role, organization_id)
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

-- 6. get_current_user_organization_id
CREATE OR REPLACE FUNCTION get_current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    RETURN user_org_id;
END;
$$;

-- 7. user_belongs_to_organization (unchanged logic, depends on get_current_user_organization_id)
-- No change needed; it only calls get_current_user_organization_id().

-- 8. create_organization_and_link_doctor (from 20250127000001 with is_onboarded)
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
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
    current_user_id UUID;
    current_auth_user_id UUID;
BEGIN
    current_auth_user_id := auth.uid();

    IF current_auth_user_id IS NULL THEN
        RETURN json_build_object('error', 'User not authenticated');
    END IF;

    SELECT id INTO current_user_id
    FROM profiles
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'User profile not found');
    END IF;

    INSERT INTO organizations (name, domain, logo_bucket_key, primary_color, secondary_color, is_onboarded)
    VALUES (org_name, org_domain, org_logo_bucket_key, org_primary_color, org_secondary_color, FALSE)
    RETURNING id INTO new_org_id;

    UPDATE profiles
    SET organization_id = new_org_id
    WHERE id = current_user_id;

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

-- 9. mark_organization_onboarded
CREATE OR REPLACE FUNCTION mark_organization_onboarded()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_auth_user_id UUID;
    current_user_id UUID;
    user_org_id UUID;
    updated_org JSON;
BEGIN
    current_auth_user_id := auth.uid();

    IF current_auth_user_id IS NULL THEN
        RETURN json_build_object('error', 'User not authenticated');
    END IF;

    SELECT id INTO current_user_id
    FROM profiles
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'User profile not found');
    END IF;

    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE id = current_user_id;

    IF user_org_id IS NULL THEN
        RETURN json_build_object('error', 'User has no organization');
    END IF;

    UPDATE organizations
    SET is_onboarded = TRUE
    WHERE id = user_org_id;

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

-- 10. user_needs_onboarding (from 20250127000001)
CREATE OR REPLACE FUNCTION user_needs_onboarding()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_auth_user_id UUID;
    current_user_id UUID;
    user_org_id UUID;
    org_is_onboarded BOOLEAN;
BEGIN
    current_auth_user_id := auth.uid();

    IF current_auth_user_id IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT id INTO current_user_id
    FROM profiles
    WHERE auth_user_id = current_auth_user_id;

    IF current_user_id IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE id = current_user_id;

    IF user_org_id IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT is_onboarded INTO org_is_onboarded
    FROM organizations
    WHERE id = user_org_id;

    RETURN NOT COALESCE(org_is_onboarded, FALSE);
END;
$$;

-- 11. get_current_user_organization
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
    JOIN profiles p ON p.organization_id = o.id
    WHERE p.auth_user_id = auth.uid();

    RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. check_user_belongs_to_organization
CREATE OR REPLACE FUNCTION check_user_belongs_to_organization(
    user_email TEXT,
    org_domain TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM profiles p
        JOIN organizations o ON p.organization_id = o.id
        WHERE p.email = user_email
        AND o.domain = org_domain
    ) INTO user_exists;

    RETURN COALESCE(user_exists, FALSE);
END;
$$;

-- 13. create_user_profile_and_organization (from 20251219193903)
CREATE OR REPLACE FUNCTION create_user_profile_and_organization(
    user_id UUID,
    user_email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT DEFAULT NULL,
    org_name TEXT DEFAULT NULL,
    org_domain TEXT DEFAULT NULL,
    booking_link TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    new_user_id UUID;
    subscription_id UUID;
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
            phone_number,
            role
        ) VALUES (
            user_id,
            first_name,
            last_name,
            user_email,
            phone_number,
            'subscriber'
        ) RETURNING id INTO new_user_id;
    END IF;

    RETURN jsonb_build_object(
        'user_id', new_user_id,
        'organization_id', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 14. create_subscription_for_user
CREATE OR REPLACE FUNCTION create_subscription_for_user(
    user_id UUID,
    tier subscription_tier,
    trial_days INTEGER DEFAULT 7
)
RETURNS UUID AS $$
DECLARE
    subscription_id UUID;
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_org_id IS NULL THEN
        INSERT INTO organizations (
            name,
            subscription_tier,
            subscription_status,
            trial_ends_at,
            current_period_start,
            current_period_end
        ) VALUES (
            'Subscription for ' || user_id::text,
            tier,
            'trial',
            NOW() + (trial_days || ' days')::INTERVAL,
            NOW(),
            NOW() + (trial_days || ' days')::INTERVAL
        ) RETURNING id INTO subscription_id;

        UPDATE profiles
        SET organization_id = subscription_id
        WHERE auth_user_id = user_id;
    ELSE
        UPDATE organizations
        SET
            subscription_tier = tier,
            subscription_status = 'trial',
            trial_ends_at = NOW() + (trial_days || ' days')::INTERVAL,
            current_period_start = NOW(),
            current_period_end = NOW() + (trial_days || ' days')::INTERVAL
        WHERE id = user_org_id;

        subscription_id := user_org_id;
    END IF;

    RETURN subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 15. update_subscription_tier
CREATE OR REPLACE FUNCTION update_subscription_tier(
    user_id UUID,
    new_tier subscription_tier
)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_org_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE organizations
    SET subscription_tier = new_tier
    WHERE id = user_org_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 16. enable_premium_addon
CREATE OR REPLACE FUNCTION enable_premium_addon(
    user_id UUID,
    addon_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_org_id IS NULL THEN
        RETURN false;
    END IF;

    IF addon_type = 'premium_insights' THEN
        UPDATE organizations
        SET premium_insights_enabled = true
        WHERE id = user_org_id;
    ELSIF addon_type = 'interview_prep' THEN
        UPDATE organizations
        SET interview_prep_enabled = true
        WHERE id = user_org_id;
    ELSIF addon_type = 'resume_upgrade' THEN
        UPDATE organizations
        SET resume_upgrade_purchased = true
        WHERE id = user_org_id;
    ELSE
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 17. create_organization_and_link_doctor_v2
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
    current_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE auth_user_id = current_user_id
        AND role = 'doctor'
        AND organization_id IS NULL
    ) THEN
        RAISE EXCEPTION 'User must be a doctor without an organization to create one';
    END IF;

    IF EXISTS (SELECT 1 FROM organizations WHERE organizations.domain = org_domain) THEN
        RAISE EXCEPTION 'Domain % is already taken', org_domain;
    END IF;

    INSERT INTO organizations (name, domain, logo_bucket_key, primary_color, secondary_color)
    VALUES (org_name, org_domain, logo_bucket_key, primary_color, secondary_color)
    RETURNING id INTO new_org_id;

    UPDATE profiles
    SET organization_id = new_org_id
    WHERE auth_user_id = current_user_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 18. Grant on profiles (table was renamed; grants persist, but ensure anon/authenticated)
GRANT ALL ON public.profiles TO anon, authenticated;
