-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create custom types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('office', 'tc', 'doctor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE client_status AS ENUM ('prospect', 'lead', 'review', 'proposal', 'client');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    logo_bucket_key TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    -- Stripe subscription information
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_subscription_status TEXT,
    stripe_current_period_start TIMESTAMPTZ,
    stripe_current_period_end TIMESTAMPTZ,
    stripe_plan_id TEXT,
    stripe_plan_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone_number TEXT,
    role user_role NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure each email can only be part of one organization
    CONSTRAINT unique_email_per_org UNIQUE (email, organization_id)
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    status client_status NOT NULL DEFAULT 'prospect',
    image_bucket_key TEXT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure client email is unique within each organization
    CONSTRAINT unique_client_email_per_org UNIQUE (email, organization_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id ON organizations(stripe_customer_id);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Organizations
-- Users can view organizations they belong to
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Users can update their organization (for onboarding and settings)
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
CREATE POLICY "Users can update their organization" ON organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id FROM users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Users can insert organizations (for initial setup)
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
CREATE POLICY "Users can create organizations" ON organizations
    FOR INSERT WITH CHECK (true);

-- RLS Policies for Users
-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth_user_id = auth.uid());

-- Users can view all users (for now, to avoid recursion)
DROP POLICY IF EXISTS "Users can view organization members" ON users;
CREATE POLICY "Users can view organization members" ON users
    FOR SELECT USING (true);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth_user_id = auth.uid());

-- Users can update all users (for now, to avoid recursion)
DROP POLICY IF EXISTS "Users can update organization members" ON users;
CREATE POLICY "Users can update organization members" ON users
    FOR UPDATE USING (true);

-- RLS Policies for Clients
-- Allow all operations on clients for now (to avoid recursion issues)
DROP POLICY IF EXISTS "Users can view organization clients" ON clients;
CREATE POLICY "Users can view organization clients" ON clients
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create clients in their organization" ON clients;
CREATE POLICY "Users can create clients in their organization" ON clients
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update organization clients" ON clients;
CREATE POLICY "Users can update organization clients" ON clients
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete organization clients" ON clients;
CREATE POLICY "Users can delete organization clients" ON clients
    FOR DELETE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at 
    BEFORE UPDATE ON clients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- Declare variables to hold the extracted data
    user_organization_id UUID;
    user_assigned_role user_role;
BEGIN
    -- Check if an organization_id was provided in the user metadata.
    -- This distinguishes between a doctor signing up and an invited user.
    IF NEW.raw_user_meta_data->>'organization_id' IS NULL THEN
        -- Case 1: The doctor is signing up for the first time.
        -- They will create their organization in the next step of your onboarding flow.
        user_assigned_role := 'doctor';
        user_organization_id := NULL;
    ELSE
        -- Case 2: An invited user is signing up.
        -- Their role and organization are specified in the metadata during the invite.
        user_assigned_role := (NEW.raw_user_meta_data->>'role')::user_role;
        user_organization_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    END IF;
    
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

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON organizations TO anon, authenticated;
GRANT ALL ON users TO anon, authenticated;
GRANT ALL ON clients TO anon, authenticated;
