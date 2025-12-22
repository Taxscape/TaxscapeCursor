-- TaxScape Pro Database Schema for Supabase
-- Run this in the Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ORGANIZATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    tax_year TEXT DEFAULT '2024',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    company_name TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

-- ============================================
-- ORGANIZATION MEMBERS TABLE
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
-- VERIFICATION TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.verification_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('projects', 'vendors', 'supplies', 'wages')),
    item_id UUID, -- Reference to the specific project/contractor/employee
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
-- AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    item_type TEXT, -- 'project', 'employee', 'contractor', 'task', 'member'
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
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    technical_uncertainty TEXT,
    process_of_experimentation TEXT,
    qualification_status TEXT DEFAULT 'pending' CHECK (qualification_status IN ('pending', 'qualified', 'not_qualified')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);

-- ============================================
-- EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    department TEXT,
    state TEXT,
    total_wages DECIMAL(12, 2) DEFAULT 0,
    qualified_percent DECIMAL(5, 2) DEFAULT 0,
    rd_percentage DECIMAL(5, 2) DEFAULT 0,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'denied')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_organization_id ON public.employees(organization_id);

-- ============================================
-- CONTRACTORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    cost DECIMAL(12, 2) DEFAULT 0,
    is_qualified BOOLEAN DEFAULT TRUE,
    location TEXT DEFAULT 'US',
    notes TEXT,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'denied')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON public.contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_organization_id ON public.contractors(organization_id);
CREATE INDEX IF NOT EXISTS idx_contractors_project_id ON public.contractors(project_id);

-- ============================================
-- PROJECT ALLOCATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_allocations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    allocation_percent DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_employee_id ON public.project_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_allocations_project_id ON public.project_allocations(project_id);

-- ============================================
-- CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Audit Session',
    structured_output JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_organization_id ON public.chat_sessions(organization_id);

-- ============================================
-- CHAT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- ============================================
-- STUDIES TABLE (generated reports)
-- ============================================
CREATE TABLE IF NOT EXISTS public.studies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    chat_session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_path TEXT, -- Supabase Storage path
    file_url TEXT,  -- Public or signed URL
    total_qre DECIMAL(12, 2) DEFAULT 0,
    total_credit DECIMAL(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'failed')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studies_user_id ON public.studies(user_id);
CREATE INDEX IF NOT EXISTS idx_studies_organization_id ON public.studies(organization_id);

-- ============================================
-- DEMO REQUESTS TABLE (for landing page)
-- ============================================
CREATE TABLE IF NOT EXISTS public.demo_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'scheduled', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON public.demo_requests(email);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON public.demo_requests(status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Trigger to create profile and organization on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    company_name_val TEXT;
BEGIN
    -- Get company name from metadata
    company_name_val := COALESCE(NEW.raw_user_meta_data->>'company_name', '');
    
    -- Create organization if company name provided
    IF company_name_val != '' THEN
        INSERT INTO public.organizations (name)
        VALUES (company_name_val)
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
        TRUE -- First user is admin
    );
    
    -- Add user as org admin if organization created
    IF new_org_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
        VALUES (new_org_id, NEW.id, 'admin', 'active', NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update last_active_at on profile
CREATE OR REPLACE FUNCTION public.update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles SET last_active_at = NOW() WHERE id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_org_members_updated_at ON public.organization_members;
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_verification_tasks_updated_at ON public.verification_tasks;
CREATE TRIGGER update_verification_tasks_updated_at BEFORE UPDATE ON public.verification_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contractors_updated_at ON public.contractors;
CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON public.contractors
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_demo_requests_updated_at ON public.demo_requests;
CREATE TRIGGER update_demo_requests_updated_at BEFORE UPDATE ON public.demo_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ORGANIZATIONS POLICIES
-- ============================================
CREATE POLICY "Users can view their organization" ON public.organizations
    FOR SELECT USING (
        id = public.get_user_org_id() OR
        public.is_org_member(id)
    );

CREATE POLICY "Admins can update their organization" ON public.organizations
    FOR UPDATE USING (public.is_org_admin(id));

CREATE POLICY "Users can create organizations" ON public.organizations
    FOR INSERT WITH CHECK (true);

-- ============================================
-- PROFILES POLICIES
-- ============================================
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view org members profiles" ON public.profiles
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- ORGANIZATION MEMBERS POLICIES
-- ============================================
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

-- ============================================
-- VERIFICATION TASKS POLICIES
-- ============================================
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

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================
CREATE POLICY "Users can view org audit logs" ON public.audit_logs
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id()
    );

-- ============================================
-- PROJECTS POLICIES
-- ============================================
CREATE POLICY "Users can view org projects" ON public.projects
    FOR SELECT USING (
        organization_id = public.get_user_org_id() OR user_id = auth.uid()
    );

CREATE POLICY "Users can insert org projects" ON public.projects
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

-- ============================================
-- EMPLOYEES POLICIES
-- ============================================
CREATE POLICY "Users can view org employees" ON public.employees
    FOR SELECT USING (
        organization_id = public.get_user_org_id() OR user_id = auth.uid()
    );

CREATE POLICY "Users can insert org employees" ON public.employees
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Users can update org employees" ON public.employees
    FOR UPDATE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

CREATE POLICY "Users can delete own employees" ON public.employees
    FOR DELETE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

-- ============================================
-- CONTRACTORS POLICIES
-- ============================================
CREATE POLICY "Users can view org contractors" ON public.contractors
    FOR SELECT USING (
        organization_id = public.get_user_org_id() OR user_id = auth.uid()
    );

CREATE POLICY "Users can insert org contractors" ON public.contractors
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Users can update org contractors" ON public.contractors
    FOR UPDATE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

CREATE POLICY "Users can delete own contractors" ON public.contractors
    FOR DELETE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

-- ============================================
-- PROJECT ALLOCATIONS POLICIES
-- ============================================
CREATE POLICY "Users can view org allocations" ON public.project_allocations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_id
            AND (e.organization_id = public.get_user_org_id() OR e.user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert org allocations" ON public.project_allocations
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can update org allocations" ON public.project_allocations
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can delete org allocations" ON public.project_allocations
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

-- ============================================
-- CHAT SESSIONS POLICIES
-- ============================================
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can view org chat sessions" ON public.chat_sessions
    FOR SELECT USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- CHAT MESSAGES POLICIES
-- ============================================
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can insert own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

-- ============================================
-- STUDIES POLICIES
-- ============================================
CREATE POLICY "Users can view own studies" ON public.studies
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own studies" ON public.studies
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own studies" ON public.studies
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own studies" ON public.studies
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can view org studies" ON public.studies
    FOR SELECT USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- DEMO REQUESTS POLICIES
-- ============================================
CREATE POLICY "Anyone can submit demo requests" ON public.demo_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view demo requests" ON public.demo_requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

CREATE POLICY "Admins can update demo requests" ON public.demo_requests
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ============================================
-- STORAGE BUCKET FOR STUDIES
-- ============================================
-- Run this in Supabase Dashboard > Storage > Create new bucket
-- Bucket name: studies
-- Public: false (use signed URLs)

-- Storage policies (run in SQL editor after creating bucket)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('studies', 'studies', false);

-- CREATE POLICY "Users can upload own studies" ON storage.objects
--     FOR INSERT WITH CHECK (
--         bucket_id = 'studies' AND 
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- CREATE POLICY "Users can view own studies" ON storage.objects
--     FOR SELECT USING (
--         bucket_id = 'studies' AND 
--         auth.uid()::text = (storage.foldername(name))[1]
--     );
