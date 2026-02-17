-- Rename organizations table to subscriptions and profiles.organization_id to subscription_id.
-- Update RLS, trigger, RPCs, and handle_new_user.

-- 1.1 Rename table and trigger
ALTER TABLE public.organizations RENAME TO subscriptions;
ALTER TRIGGER update_organizations_updated_at ON public.subscriptions RENAME TO update_subscriptions_updated_at;

-- 1.2 Rename column on profiles and update FK/index
ALTER TABLE public.profiles RENAME COLUMN organization_id TO subscription_id;
ALTER TABLE public.profiles RENAME CONSTRAINT profiles_organization_id_fkey TO profiles_subscription_id_fkey;
DROP INDEX IF EXISTS idx_users_organization_id;
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_id ON public.profiles(subscription_id);

-- 1.3 RLS on subscriptions (policies referenced organization_id; drop and recreate with subscription_id)
DROP POLICY IF EXISTS "Users can view their subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their subscription" ON public.subscriptions;
CREATE POLICY "Users can view their subscription" ON public.subscriptions
    FOR SELECT USING (
        id IN (
            SELECT subscription_id FROM public.profiles
            WHERE auth_user_id = auth.uid()
        )
    );
CREATE POLICY "Users can update their subscription" ON public.subscriptions
    FOR UPDATE USING (
        id IN (
            SELECT subscription_id FROM public.profiles
            WHERE auth_user_id = auth.uid()
        )
    );

-- 1.4 Update RPCs: create_subscription_for_user, update_subscription_tier, enable_premium_addon
CREATE OR REPLACE FUNCTION create_subscription_for_user(
    user_id UUID,
    tier subscription_tier,
    trial_days INTEGER DEFAULT 7
)
RETURNS UUID AS $$
DECLARE
    sub_id UUID;
    user_sub_id UUID;
BEGIN
    SELECT subscription_id INTO user_sub_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_sub_id IS NULL THEN
        INSERT INTO subscriptions (
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
        ) RETURNING id INTO sub_id;

        UPDATE profiles
        SET subscription_id = sub_id
        WHERE auth_user_id = user_id;
    ELSE
        UPDATE subscriptions
        SET
            subscription_tier = tier,
            subscription_status = 'trial',
            trial_ends_at = NOW() + (trial_days || ' days')::INTERVAL,
            current_period_start = NOW(),
            current_period_end = NOW() + (trial_days || ' days')::INTERVAL
        WHERE id = user_sub_id;

        sub_id := user_sub_id;
    END IF;

    RETURN sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_subscription_tier(
    user_id UUID,
    new_tier subscription_tier
)
RETURNS BOOLEAN AS $$
DECLARE
    user_sub_id UUID;
BEGIN
    SELECT subscription_id INTO user_sub_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_sub_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE subscriptions
    SET subscription_tier = new_tier
    WHERE id = user_sub_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION enable_premium_addon(
    user_id UUID,
    addon_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_sub_id UUID;
BEGIN
    SELECT subscription_id INTO user_sub_id
    FROM profiles
    WHERE auth_user_id = user_id;

    IF user_sub_id IS NULL THEN
        RETURN false;
    END IF;

    IF addon_type = 'premium_insights' THEN
        UPDATE subscriptions
        SET premium_insights_enabled = true
        WHERE id = user_sub_id;
    ELSIF addon_type = 'interview_prep' THEN
        UPDATE subscriptions
        SET interview_prep_enabled = true
        WHERE id = user_sub_id;
    ELSIF addon_type = 'resume_upgrade' THEN
        UPDATE subscriptions
        SET resume_upgrade_purchased = true
        WHERE id = user_sub_id;
    ELSE
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.5 Update handle_new_user to use subscription_id
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_subscription_id UUID;
BEGIN
    user_subscription_id := NULL;

    INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, subscription_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email,
        user_subscription_id
    );

    RETURN NEW;
END;
$$;

-- 1.6 Grants
GRANT ALL ON public.subscriptions TO anon, authenticated;
