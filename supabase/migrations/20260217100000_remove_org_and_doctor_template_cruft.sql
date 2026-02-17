-- Remove organization and doctor template cruft.
-- Drop org-only columns from organizations and drop/update RPCs.
-- Table name and organization_id stay; a follow-up can rename to subscriptions.

-- 1. Update create_subscription_for_user to INSERT without name (and other dropped columns)
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
            subscription_tier,
            subscription_status,
            trial_ends_at,
            current_period_start,
            current_period_end
        ) VALUES (
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

-- 2. Drop org/doctor-only RPCs (no app usage)
DROP FUNCTION IF EXISTS create_organization_and_link_doctor(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_organization_and_link_doctor(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_organization_and_link_doctor_v2(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_organization_by_domain(TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_organization_by_domain_public(TEXT) CASCADE;
DROP FUNCTION IF EXISTS mark_organization_onboarded() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_organization_id() CASCADE;
DROP FUNCTION IF EXISTS user_belongs_to_organization(UUID) CASCADE;
DROP FUNCTION IF EXISTS check_user_belongs_to_organization(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS user_needs_onboarding() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_organization() CASCADE;
DROP FUNCTION IF EXISTS create_user_profile_and_organization(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS check_domain_availability(TEXT) CASCADE;

-- 3. Create simplified create_user_profile (replaces create_user_profile_and_organization)
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

    RETURN jsonb_build_object('user_id', new_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Make name nullable then drop organization-only columns
ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL;
ALTER TABLE organizations DROP COLUMN IF EXISTS name;
ALTER TABLE organizations DROP COLUMN IF EXISTS domain;
ALTER TABLE organizations DROP COLUMN IF EXISTS logo_bucket_key;
ALTER TABLE organizations DROP COLUMN IF EXISTS primary_color;
ALTER TABLE organizations DROP COLUMN IF EXISTS secondary_color;
ALTER TABLE organizations DROP COLUMN IF EXISTS is_onboarded;
