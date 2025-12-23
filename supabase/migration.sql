-- TaxScape Pro Migration Script
-- Run this INSTEAD of schema.sql if you have existing tables
-- This safely adds new columns and tables

-- ============================================
-- STEP 1: CREATE NEW TABLES FIRST
-- ============================================

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    industry TEXT,
    tax_year TEXT DEFAULT '2024',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- Add slug column if table already exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'organizations' 
                   AND column_name = 'slug') THEN
        ALTER TABLE public.organizations ADD COLUMN slug TEXT UNIQUE;
        CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
    END IF;
END $$;

-- ============================================
-- STEP 2: ADD NEW COLUMNS TO EXISTING TABLES
-- ============================================

-- Add organization_id to profiles (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.profiles 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
    END IF;
END $$;

-- Add organization_id to projects (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'projects' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.projects 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);
    END IF;
END $$;

-- Add organization_id and new columns to employees (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'employees' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.employees 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_employees_organization_id ON public.employees(organization_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'employees' 
                   AND column_name = 'department') THEN
        ALTER TABLE public.employees ADD COLUMN department TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'employees' 
                   AND column_name = 'rd_percentage') THEN
        ALTER TABLE public.employees ADD COLUMN rd_percentage DECIMAL(5, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'employees' 
                   AND column_name = 'verification_status') THEN
        ALTER TABLE public.employees ADD COLUMN verification_status TEXT DEFAULT 'pending' 
        CHECK (verification_status IN ('pending', 'verified', 'denied'));
    END IF;
END $$;

-- Add organization_id and new columns to contractors (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'contractors' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.contractors 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_contractors_organization_id ON public.contractors(organization_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'contractors' 
                   AND column_name = 'verification_status') THEN
        ALTER TABLE public.contractors ADD COLUMN verification_status TEXT DEFAULT 'pending' 
        CHECK (verification_status IN ('pending', 'verified', 'denied'));
    END IF;
END $$;

-- Add organization_id to chat_sessions (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'chat_sessions' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.chat_sessions 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_organization_id ON public.chat_sessions(organization_id);
    END IF;
END $$;

-- Add organization_id to studies (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'studies' 
                   AND column_name = 'organization_id') THEN
        ALTER TABLE public.studies 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_studies_organization_id ON public.studies(organization_id);
    END IF;
END $$;

-- ============================================
-- STEP 3: CREATE ORGANIZATION MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'project_lead', 'vendor_approver', 'supply_approver', 'hr_verifier', 'member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive')),
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_status ON public.organization_members(status);

-- ============================================
-- STEP 4: CREATE VERIFICATION TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.verification_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('projects', 'vendors', 'supplies', 'wages')),
    item_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'denied')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    due_date TIMESTAMP WITH TIME ZONE,
    comment TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tasks_organization_id ON public.verification_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_assigned_to ON public.verification_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_status ON public.verification_tasks(status);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_category ON public.verification_tasks(category);

-- ============================================
-- STEP 5: CREATE AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    item_type TEXT,
    item_id UUID,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================
-- STEP 6: CREATE HELPER FUNCTIONS
-- ============================================

-- Function to check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is org member
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE id = auth.uid();
    RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate a URL-safe slug from text
CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INT := 0;
BEGIN
    -- Convert to lowercase, replace spaces with hyphens, remove special chars
    base_slug := lower(trim(input_text));
    base_slug := regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'g');
    base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := trim(both '-' from base_slug);
    
    -- If empty, generate a random slug
    IF base_slug = '' OR base_slug IS NULL THEN
        base_slug := 'org-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;
    
    final_slug := base_slug;
    
    -- Check for uniqueness and append number if needed
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Update the handle_new_user function to create organizations with slug
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    company_name_val TEXT;
    org_slug TEXT;
BEGIN
    -- Get company name from metadata
    company_name_val := COALESCE(NEW.raw_user_meta_data->>'company_name', '');
    
    -- Create organization if company name provided
    IF company_name_val != '' THEN
        -- Generate slug from company name
        org_slug := public.generate_slug(company_name_val);
        
        INSERT INTO public.organizations (name, slug)
        VALUES (company_name_val, org_slug)
        RETURNING id INTO new_org_id;
    END IF;
    
    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, company_name, organization_id, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        company_name_val,
        new_org_id,
        TRUE
    );
    
    -- Add user as org admin if organization created
    IF new_org_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
        VALUES (new_org_id, NEW.id, 'admin', 'active', NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STEP 7: ADD UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================

-- Make sure update function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_org_members_updated_at ON public.organization_members;
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_verification_tasks_updated_at ON public.verification_tasks;
CREATE TRIGGER update_verification_tasks_updated_at BEFORE UPDATE ON public.verification_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STEP 8: ENABLE RLS ON NEW TABLES
-- ============================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 9: DROP OLD POLICIES (if they exist) AND CREATE NEW ONES
-- ============================================

-- Organizations policies
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

CREATE POLICY "Users can view their organization" ON public.organizations
    FOR SELECT USING (
        id = public.get_user_org_id() OR
        public.is_org_member(id)
    );

CREATE POLICY "Admins can update their organization" ON public.organizations
    FOR UPDATE USING (public.is_org_admin(id));

CREATE POLICY "Users can create organizations" ON public.organizations
    FOR INSERT WITH CHECK (true);

-- Organization members policies
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can insert org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can delete org members" ON public.organization_members;

CREATE POLICY "Users can view org members" ON public.organization_members
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "Admins can insert org members" ON public.organization_members
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id)
    );

CREATE POLICY "Admins can update org members" ON public.organization_members
    FOR UPDATE USING (
        public.is_org_admin(organization_id)
    );

CREATE POLICY "Admins can delete org members" ON public.organization_members
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- Verification tasks policies
DROP POLICY IF EXISTS "Users can view org tasks" ON public.verification_tasks;
DROP POLICY IF EXISTS "Admins can insert tasks" ON public.verification_tasks;
DROP POLICY IF EXISTS "Assigned users can update tasks" ON public.verification_tasks;
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.verification_tasks;

CREATE POLICY "Users can view org tasks" ON public.verification_tasks
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "Admins can insert tasks" ON public.verification_tasks
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id)
    );

CREATE POLICY "Assigned users can update tasks" ON public.verification_tasks
    FOR UPDATE USING (
        assigned_to = auth.uid() OR public.is_org_admin(organization_id)
    );

CREATE POLICY "Admins can delete tasks" ON public.verification_tasks
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- Audit logs policies
DROP POLICY IF EXISTS "Users can view org audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "Users can view org audit logs" ON public.audit_logs
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id()
    );

-- ============================================
-- STEP 10: UPDATE EXISTING TABLE POLICIES
-- ============================================

-- Profiles: add policy for viewing org members
DROP POLICY IF EXISTS "Users can view org members profiles" ON public.profiles;
CREATE POLICY "Users can view org members profiles" ON public.profiles
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

-- ============================================
-- DONE! 
-- ============================================
-- Migration complete. Your existing data is preserved
-- and new organization features are now available.
