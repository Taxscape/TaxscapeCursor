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
    slug TEXT UNIQUE,
    industry TEXT,
    tax_year TEXT DEFAULT '2024',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

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
    role TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('executive', 'cpa', 'engineer')),
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
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);

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
-- BUDGETS TABLE (CPA manages)
-- ============================================
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    allocated_amount DECIMAL(12, 2) DEFAULT 0,
    category TEXT CHECK (category IN ('personnel', 'materials', 'software', 'contractors', 'other')),
    fiscal_year TEXT DEFAULT '2024',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_organization_id ON public.budgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_budgets_project_id ON public.budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON public.budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON public.budgets(status);

-- ============================================
-- EXPENSES TABLE (CPA logs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    budget_id UUID REFERENCES public.budgets(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category TEXT CHECK (category IN ('personnel', 'materials', 'software', 'contractors', 'other')),
    vendor_name TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    receipt_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_organization_id ON public.expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON public.expenses(budget_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

-- ============================================
-- ENGINEERING TASKS TABLE (Engineers use)
-- ============================================
CREATE TABLE IF NOT EXISTS public.engineering_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    estimated_hours DECIMAL(6, 2) DEFAULT 0,
    hours_logged DECIMAL(6, 2) DEFAULT 0,
    milestone TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_tasks_organization_id ON public.engineering_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_project_id ON public.engineering_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_assigned_to ON public.engineering_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_status ON public.engineering_tasks(status);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_priority ON public.engineering_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_due_date ON public.engineering_tasks(due_date);

-- ============================================
-- TIME LOGS TABLE (Engineers log hours)
-- ============================================
CREATE TABLE IF NOT EXISTS public.time_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES public.engineering_tasks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    hours DECIMAL(6, 2) NOT NULL,
    description TEXT,
    log_date DATE DEFAULT CURRENT_DATE,
    billable BOOLEAN DEFAULT TRUE,
    hourly_rate DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_logs_organization_id ON public.time_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_task_id ON public.time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_project_id ON public.time_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON public.time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_log_date ON public.time_logs(log_date DESC);

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

-- Function to check if user is org executive (admin)
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'executive'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is org CPA
CREATE OR REPLACE FUNCTION public.is_org_cpa(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'cpa'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is org engineer
CREATE OR REPLACE FUNCTION public.is_org_engineer(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'engineer'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user's role in org
CREATE OR REPLACE FUNCTION public.get_user_role(org_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active';
    RETURN user_role;
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

-- Trigger to create profile and organization on user signup
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
        TRUE -- First user is admin
    );
    
    -- Add user as org executive if organization created
    IF new_org_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
        VALUES (new_org_id, NEW.id, 'executive', 'active', NOW());
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
-- BUDGETS POLICIES
-- ============================================
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org budgets" ON public.budgets
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "CPAs and Executives can insert budgets" ON public.budgets
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

CREATE POLICY "CPAs and Executives can update budgets" ON public.budgets
    FOR UPDATE USING (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

CREATE POLICY "Executives can delete budgets" ON public.budgets
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- EXPENSES POLICIES
-- ============================================
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org expenses" ON public.expenses
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "CPAs can insert expenses" ON public.expenses
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

CREATE POLICY "CPAs can update expenses" ON public.expenses
    FOR UPDATE USING (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

CREATE POLICY "Executives can delete expenses" ON public.expenses
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- ENGINEERING TASKS POLICIES
-- ============================================
ALTER TABLE public.engineering_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org engineering tasks" ON public.engineering_tasks
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "Engineers and Executives can insert tasks" ON public.engineering_tasks
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_engineer(organization_id)
    );

CREATE POLICY "Assigned users can update tasks" ON public.engineering_tasks
    FOR UPDATE USING (
        assigned_to = auth.uid() OR 
        public.is_org_admin(organization_id) OR 
        public.is_org_engineer(organization_id)
    );

CREATE POLICY "Executives can delete tasks" ON public.engineering_tasks
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- TIME LOGS POLICIES
-- ============================================
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org time logs" ON public.time_logs
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

CREATE POLICY "Engineers can insert time logs" ON public.time_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND public.is_org_member(organization_id)
    );

CREATE POLICY "Users can update own time logs" ON public.time_logs
    FOR UPDATE USING (
        user_id = auth.uid()
    );

CREATE POLICY "Users can delete own time logs" ON public.time_logs
    FOR DELETE USING (
        user_id = auth.uid() OR public.is_org_admin(organization_id)
    );

-- ============================================
-- TRIGGERS FOR NEW TABLES
-- ============================================
DROP TRIGGER IF EXISTS update_budgets_updated_at ON public.budgets;
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_eng_tasks_updated_at ON public.engineering_tasks;
CREATE TRIGGER update_eng_tasks_updated_at BEFORE UPDATE ON public.engineering_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
