-- Repurpose organizations table for subscriptions
-- Add subscription-related fields

-- Create subscription tier enum
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('entry_mid', 'senior_management', 'director_vp_c_level');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create subscription status enum
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'cancelled', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add subscription fields to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier,
ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS premium_insights_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS interview_prep_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS resume_upgrade_purchased BOOLEAN DEFAULT false;

-- Note: We keep domain and booking_link columns for backward compatibility but they're deprecated
-- They can be removed in a future migration if needed

-- Update RLS policies to reflect subscription model
-- Users should only access their own subscription
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their subscription" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM users 
            WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
CREATE POLICY "Users can update their subscription" ON organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id FROM users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Create function to create subscription for user
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
    -- Get user's organization_id (which now represents their subscription)
    SELECT organization_id INTO user_org_id
    FROM users
    WHERE auth_user_id = user_id;

    IF user_org_id IS NULL THEN
        -- Create new subscription record
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

        -- Link user to subscription
        UPDATE users
        SET organization_id = subscription_id
        WHERE auth_user_id = user_id;
    ELSE
        -- Update existing subscription
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update subscription tier
CREATE OR REPLACE FUNCTION update_subscription_tier(
    user_id UUID,
    new_tier subscription_tier
)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM users
    WHERE auth_user_id = user_id;

    IF user_org_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE organizations
    SET subscription_tier = new_tier
    WHERE id = user_org_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to enable premium addon
CREATE OR REPLACE FUNCTION enable_premium_addon(
    user_id UUID,
    addon_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
BEGIN
    SELECT organization_id INTO user_org_id
    FROM users
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

