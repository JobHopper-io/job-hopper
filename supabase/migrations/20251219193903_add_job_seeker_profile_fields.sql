-- Add job seeker profile fields to users table

-- Update user_role enum to include 'subscriber'
DO $$ BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'subscriber';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add job seeker profile fields
ALTER TABLE users
ADD COLUMN IF NOT EXISTS current_job_title TEXT,
ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
ADD COLUMN IF NOT EXISTS current_industry TEXT,
ADD COLUMN IF NOT EXISTS target_role_categories TEXT[],
ADD COLUMN IF NOT EXISTS desired_salary_min INTEGER,
ADD COLUMN IF NOT EXISTS desired_salary_max INTEGER,
ADD COLUMN IF NOT EXISTS preferred_locations TEXT[],
ADD COLUMN IF NOT EXISTS open_to_relocation BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS open_to_remote BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS resume_bucket_key TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Update the handle_new_user function to set default role to 'subscriber'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_organization_id UUID;
    user_assigned_role user_role;
BEGIN
    -- For Job-Hopper, default role is 'subscriber'
    -- Organization ID will be set when subscription is created during onboarding
    user_assigned_role := 'subscriber';
    user_organization_id := NULL;
    
    -- Insert the new user profile into the public.users table
    INSERT INTO users (auth_user_id, first_name, last_name, email, role, organization_id)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update create_user_profile_and_organization function to work with subscriptions
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
    -- Find or create user profile
    SELECT id INTO new_user_id
    FROM users
    WHERE auth_user_id = user_id;

    IF new_user_id IS NULL THEN
        INSERT INTO users (
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

    -- Create subscription will be handled separately during onboarding
    -- This function is kept for backward compatibility but subscription creation
    -- should use create_subscription_for_user function

    RETURN jsonb_build_object(
        'user_id', new_user_id,
        'organization_id', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

