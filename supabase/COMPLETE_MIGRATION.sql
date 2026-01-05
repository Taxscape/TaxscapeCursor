-- ============================================
-- TAXSCAPE COMPLETE DATABASE SCHEMA + MIGRATIONS
-- ============================================
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- This is a COMPLETE standalone file - no other SQL files needed.
-- ============================================

-- ============================================
-- STEP 1: ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 2: BASE TABLES
-- ============================================

-- ORGANIZATIONS TABLE
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tax_year TEXT DEFAULT '2024';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- PROFILES TABLE (extends auth.users)
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

-- ORGANIZATION MEMBERS TABLE
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

-- VERIFICATION TASKS TABLE
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

-- AUDIT LOGS TABLE
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

-- PROJECTS TABLE
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS technical_uncertainty TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS process_of_experimentation TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS qualification_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);

-- EMPLOYEES TABLE
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS total_wages DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS qualified_percent DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS rd_percentage DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_organization_id ON public.employees(organization_id);

-- CONTRACTORS TABLE
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS is_qualified BOOLEAN DEFAULT TRUE;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'US';
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON public.contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_organization_id ON public.contractors(organization_id);
CREATE INDEX IF NOT EXISTS idx_contractors_project_id ON public.contractors(project_id);

-- PROJECT ALLOCATIONS TABLE
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

-- BUDGETS TABLE
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

-- EXPENSES TABLE
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

-- ENGINEERING TASKS TABLE
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

-- TIME LOGS TABLE
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

-- CHAT SESSIONS TABLE
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

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'New Audit Session';
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS structured_output JSONB;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_organization_id ON public.chat_sessions(organization_id);

-- CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- STUDIES TABLE
CREATE TABLE IF NOT EXISTS public.studies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    chat_session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_path TEXT,
    file_url TEXT,
    total_qre DECIMAL(12, 2) DEFAULT 0,
    total_credit DECIMAL(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'failed')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS chat_session_id UUID;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS total_qre DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS total_credit DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'generated';
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_studies_user_id ON public.studies(user_id);
CREATE INDEX IF NOT EXISTS idx_studies_organization_id ON public.studies(organization_id);

-- DEMO REQUESTS TABLE
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
-- STEP 3: HELPER FUNCTIONS
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

-- Function to get user's role in org
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
    base_slug := lower(trim(input_text));
    base_slug := regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'g');
    base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := trim(both '-' from base_slug);
    
    IF base_slug = '' OR base_slug IS NULL THEN
        base_slug := 'org-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;
    
    final_slug := base_slug;
    
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
    company_name_val := COALESCE(NEW.raw_user_meta_data->>'company_name', '');
    
    IF company_name_val != '' THEN
        org_slug := public.generate_slug(company_name_val);
        
        INSERT INTO public.organizations (name, slug)
        VALUES (company_name_val, org_slug)
        RETURNING id INTO new_org_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, full_name, company_name, organization_id, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        company_name_val,
        new_org_id,
        TRUE
    );
    
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

-- ============================================
-- STEP 4: APPLY UPDATED_AT TRIGGERS
-- ============================================
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
-- STEP 5: ROW LEVEL SECURITY
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
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS POLICIES
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
CREATE POLICY "Users can view their organization" ON public.organizations
    FOR SELECT USING (
        id = public.get_user_org_id() OR public.is_org_member(id)
    );

DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
CREATE POLICY "Admins can update their organization" ON public.organizations
    FOR UPDATE USING (public.is_org_admin(id));

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Users can create organizations" ON public.organizations
    FOR INSERT WITH CHECK (true);

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view org members profiles" ON public.profiles;
CREATE POLICY "Users can view org members profiles" ON public.profiles
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ORGANIZATION MEMBERS POLICIES
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
CREATE POLICY "Users can view org members" ON public.organization_members
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Admins can insert org members" ON public.organization_members;
CREATE POLICY "Admins can insert org members" ON public.organization_members
    FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can update org members" ON public.organization_members;
CREATE POLICY "Admins can update org members" ON public.organization_members
    FOR UPDATE USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can delete org members" ON public.organization_members;
CREATE POLICY "Admins can delete org members" ON public.organization_members
    FOR DELETE USING (public.is_org_admin(organization_id));

-- VERIFICATION TASKS POLICIES
DROP POLICY IF EXISTS "Users can view org tasks" ON public.verification_tasks;
CREATE POLICY "Users can view org tasks" ON public.verification_tasks
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Admins can insert tasks" ON public.verification_tasks;
CREATE POLICY "Admins can insert tasks" ON public.verification_tasks
    FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Assigned users can update tasks" ON public.verification_tasks;
CREATE POLICY "Assigned users can update tasks" ON public.verification_tasks
    FOR UPDATE USING (assigned_to = auth.uid() OR public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can delete tasks" ON public.verification_tasks;
CREATE POLICY "Admins can delete tasks" ON public.verification_tasks
    FOR DELETE USING (public.is_org_admin(organization_id));

-- AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "Users can view org audit logs" ON public.audit_logs;
CREATE POLICY "Users can view org audit logs" ON public.audit_logs
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

-- PROJECTS POLICIES
DROP POLICY IF EXISTS "Users can view org projects" ON public.projects;
CREATE POLICY "Users can view org projects" ON public.projects
    FOR SELECT USING (organization_id = public.get_user_org_id() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert org projects" ON public.projects;
CREATE POLICY "Users can insert org projects" ON public.projects
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

-- EMPLOYEES POLICIES
DROP POLICY IF EXISTS "Users can view org employees" ON public.employees;
CREATE POLICY "Users can view org employees" ON public.employees
    FOR SELECT USING (organization_id = public.get_user_org_id() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert org employees" ON public.employees;
CREATE POLICY "Users can insert org employees" ON public.employees
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update org employees" ON public.employees;
CREATE POLICY "Users can update org employees" ON public.employees
    FOR UPDATE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Users can delete own employees" ON public.employees;
CREATE POLICY "Users can delete own employees" ON public.employees
    FOR DELETE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

-- CONTRACTORS POLICIES
DROP POLICY IF EXISTS "Users can view org contractors" ON public.contractors;
CREATE POLICY "Users can view org contractors" ON public.contractors
    FOR SELECT USING (organization_id = public.get_user_org_id() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert org contractors" ON public.contractors;
CREATE POLICY "Users can insert org contractors" ON public.contractors
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update org contractors" ON public.contractors;
CREATE POLICY "Users can update org contractors" ON public.contractors
    FOR UPDATE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Users can delete own contractors" ON public.contractors;
CREATE POLICY "Users can delete own contractors" ON public.contractors
    FOR DELETE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

-- PROJECT ALLOCATIONS POLICIES
DROP POLICY IF EXISTS "Users can view org allocations" ON public.project_allocations;
CREATE POLICY "Users can view org allocations" ON public.project_allocations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_id
            AND (e.organization_id = public.get_user_org_id() OR e.user_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can insert org allocations" ON public.project_allocations;
CREATE POLICY "Users can insert org allocations" ON public.project_allocations
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update org allocations" ON public.project_allocations;
CREATE POLICY "Users can update org allocations" ON public.project_allocations
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete org allocations" ON public.project_allocations;
CREATE POLICY "Users can delete org allocations" ON public.project_allocations
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

-- CHAT SESSIONS POLICIES
DROP POLICY IF EXISTS "Users can view own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can insert own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view org chat sessions" ON public.chat_sessions;
CREATE POLICY "Admins can view org chat sessions" ON public.chat_sessions
    FOR SELECT USING (public.is_org_admin(organization_id));

-- CHAT MESSAGES POLICIES
DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
CREATE POLICY "Users can insert own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

-- STUDIES POLICIES
DROP POLICY IF EXISTS "Users can view own studies" ON public.studies;
CREATE POLICY "Users can view own studies" ON public.studies
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own studies" ON public.studies;
CREATE POLICY "Users can insert own studies" ON public.studies
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own studies" ON public.studies;
CREATE POLICY "Users can update own studies" ON public.studies
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own studies" ON public.studies;
CREATE POLICY "Users can delete own studies" ON public.studies
    FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view org studies" ON public.studies;
CREATE POLICY "Admins can view org studies" ON public.studies
    FOR SELECT USING (public.is_org_admin(organization_id));

-- DEMO REQUESTS POLICIES
DROP POLICY IF EXISTS "Anyone can submit demo requests" ON public.demo_requests;
CREATE POLICY "Anyone can submit demo requests" ON public.demo_requests
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view demo requests" ON public.demo_requests;
CREATE POLICY "Admins can view demo requests" ON public.demo_requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

DROP POLICY IF EXISTS "Admins can update demo requests" ON public.demo_requests;
CREATE POLICY "Admins can update demo requests" ON public.demo_requests
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- BUDGETS POLICIES
DROP POLICY IF EXISTS "Users can view org budgets" ON public.budgets;
CREATE POLICY "Users can view org budgets" ON public.budgets
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "CPAs and Executives can insert budgets" ON public.budgets;
CREATE POLICY "CPAs and Executives can insert budgets" ON public.budgets
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

DROP POLICY IF EXISTS "CPAs and Executives can update budgets" ON public.budgets;
CREATE POLICY "CPAs and Executives can update budgets" ON public.budgets
    FOR UPDATE USING (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

DROP POLICY IF EXISTS "Executives can delete budgets" ON public.budgets;
CREATE POLICY "Executives can delete budgets" ON public.budgets
    FOR DELETE USING (public.is_org_admin(organization_id));

-- EXPENSES POLICIES
DROP POLICY IF EXISTS "Users can view org expenses" ON public.expenses;
CREATE POLICY "Users can view org expenses" ON public.expenses
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "CPAs can insert expenses" ON public.expenses;
CREATE POLICY "CPAs can insert expenses" ON public.expenses
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

DROP POLICY IF EXISTS "CPAs can update expenses" ON public.expenses;
CREATE POLICY "CPAs can update expenses" ON public.expenses
    FOR UPDATE USING (
        public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id)
    );

DROP POLICY IF EXISTS "Executives can delete expenses" ON public.expenses;
CREATE POLICY "Executives can delete expenses" ON public.expenses
    FOR DELETE USING (public.is_org_admin(organization_id));

-- ENGINEERING TASKS POLICIES
DROP POLICY IF EXISTS "Users can view org engineering tasks" ON public.engineering_tasks;
CREATE POLICY "Users can view org engineering tasks" ON public.engineering_tasks
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Engineers and Executives can insert tasks" ON public.engineering_tasks;
CREATE POLICY "Engineers and Executives can insert tasks" ON public.engineering_tasks
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_engineer(organization_id)
    );

DROP POLICY IF EXISTS "Assigned users can update eng tasks" ON public.engineering_tasks;
CREATE POLICY "Assigned users can update eng tasks" ON public.engineering_tasks
    FOR UPDATE USING (
        assigned_to = auth.uid() OR 
        public.is_org_admin(organization_id) OR 
        public.is_org_engineer(organization_id)
    );

DROP POLICY IF EXISTS "Executives can delete eng tasks" ON public.engineering_tasks;
CREATE POLICY "Executives can delete eng tasks" ON public.engineering_tasks
    FOR DELETE USING (public.is_org_admin(organization_id));

-- TIME LOGS POLICIES
DROP POLICY IF EXISTS "Users can view org time logs" ON public.time_logs;
CREATE POLICY "Users can view org time logs" ON public.time_logs
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Engineers can insert time logs" ON public.time_logs;
CREATE POLICY "Engineers can insert time logs" ON public.time_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND public.is_org_member(organization_id)
    );

DROP POLICY IF EXISTS "Users can update own time logs" ON public.time_logs;
CREATE POLICY "Users can update own time logs" ON public.time_logs
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own time logs" ON public.time_logs;
CREATE POLICY "Users can delete own time logs" ON public.time_logs
    FOR DELETE USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

-- ============================================
-- STEP 6: CLIENT COMPANIES (CPA-CENTRIC)
-- ============================================
CREATE TABLE IF NOT EXISTS public.client_companies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    industry TEXT,
    tax_year TEXT DEFAULT '2024',
    ein TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    settings JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_companies_org_id ON public.client_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_companies_status ON public.client_companies(status);
CREATE INDEX IF NOT EXISTS idx_client_companies_slug ON public.client_companies(slug);

-- Add client_company_id to existing tables
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.engineering_tasks ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;
ALTER TABLE public.verification_tasks ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS selected_client_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;

-- Helper functions for client companies
CREATE OR REPLACE FUNCTION public.get_user_client_companies()
RETURNS SETOF public.client_companies AS $$
BEGIN
    RETURN QUERY
    SELECT cc.*
    FROM public.client_companies cc
    WHERE cc.organization_id = public.get_user_org_id()
    AND cc.status = 'active'
    ORDER BY cc.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_access_client_company(company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.client_companies cc
        WHERE cc.id = company_id
        AND cc.organization_id = public.get_user_org_id()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for client_companies
ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org client companies" ON public.client_companies;
CREATE POLICY "Users can view org client companies" ON public.client_companies
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "CPAs can create client companies" ON public.client_companies;
CREATE POLICY "CPAs can create client companies" ON public.client_companies
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

DROP POLICY IF EXISTS "CPAs can update client companies" ON public.client_companies;
CREATE POLICY "CPAs can update client companies" ON public.client_companies
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

DROP POLICY IF EXISTS "Executives can delete client companies" ON public.client_companies;
CREATE POLICY "Executives can delete client companies" ON public.client_companies
    FOR DELETE USING (public.is_org_admin(organization_id));

-- ============================================
-- STEP 7: WORKFLOW ENGINE
-- ============================================
DO $$ BEGIN
    CREATE TYPE public.workflow_overall_state AS ENUM ('not_started', 'in_progress', 'ready_for_review', 'needs_follow_up', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.criterion_state AS ENUM ('missing', 'incomplete', 'sufficient', 'flagged', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.workflow_risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.evidence_type AS ENUM ('project_narrative', 'technical_docs', 'test_results', 'source_control', 'tickets', 'time_logs', 'financial_support');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.evidence_source AS ENUM ('upload', 'manual_entry', 'ai_extracted', 'integration');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Project Workflow Status
CREATE TABLE IF NOT EXISTS public.project_workflow_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    overall_state public.workflow_overall_state DEFAULT 'not_started',
    readiness_score INTEGER DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
    risk_level public.workflow_risk_level DEFAULT 'low',
    last_computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_computed_version INTEGER DEFAULT 1,
    computed_summary JSONB DEFAULT '{}',
    UNIQUE(project_id, tax_year)
);

-- Project Criterion Status
CREATE TABLE IF NOT EXISTS public.project_criterion_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    criterion_key TEXT NOT NULL CHECK (criterion_key IN ('qualified_purpose', 'technological_in_nature', 'elimination_of_uncertainty', 'process_of_experimentation')),
    state public.criterion_state DEFAULT 'missing',
    confidence FLOAT DEFAULT 0.0,
    missing_requirements JSONB DEFAULT '[]',
    supporting_evidence_ids UUID[] DEFAULT '{}',
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, criterion_key)
);

-- Project Evidence
CREATE TABLE IF NOT EXISTS public.project_evidence (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    evidence_type public.evidence_type NOT NULL,
    source public.evidence_source DEFAULT 'manual_entry',
    file_id UUID,
    url TEXT,
    text_excerpt TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Events (Append-only)
CREATE TABLE IF NOT EXISTS public.workflow_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_status_project_id ON public.project_workflow_status(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_status_client_id ON public.project_workflow_status(client_id);
CREATE INDEX IF NOT EXISTS idx_criterion_status_project_id ON public.project_criterion_status(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_project_id ON public.project_evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_project_id ON public.workflow_events(project_id);

-- RLS for workflow tables
ALTER TABLE public.project_workflow_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_criterion_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org workflow status" ON public.project_workflow_status;
CREATE POLICY "Users can view org workflow status" ON public.project_workflow_status
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update org workflow status" ON public.project_workflow_status;
CREATE POLICY "Users can update org workflow status" ON public.project_workflow_status
    FOR UPDATE USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org workflow status" ON public.project_workflow_status;
CREATE POLICY "Users can insert org workflow status" ON public.project_workflow_status
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can view org criterion status" ON public.project_criterion_status;
CREATE POLICY "Users can view org criterion status" ON public.project_criterion_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = project_id 
            AND p.organization_id = public.get_user_org_id()
        )
    );

DROP POLICY IF EXISTS "Users can view org evidence" ON public.project_evidence;
CREATE POLICY "Users can view org evidence" ON public.project_evidence
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org evidence" ON public.project_evidence;
CREATE POLICY "Users can insert org evidence" ON public.project_evidence
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can view org workflow events" ON public.workflow_events;
CREATE POLICY "Users can view org workflow events" ON public.workflow_events
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org workflow events" ON public.workflow_events;
CREATE POLICY "Users can insert org workflow events" ON public.workflow_events
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

-- ============================================
-- STEP 8: RBAC & CPA ROLES
-- ============================================
DO $$ BEGIN
    CREATE TYPE cpa_role AS ENUM ('managing_partner', 'reviewer', 'preparer', 'associate', 'ops_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed permissions
INSERT INTO public.permissions (code, category, description) VALUES
('client.create', 'client', 'Create new client companies'),
('client.edit', 'client', 'Edit client company details'),
('client.delete', 'client', 'Delete client companies'),
('project.create', 'project', 'Create new projects'),
('project.edit', 'project', 'Edit project details'),
('project.approve_reject', 'project', 'Final approve/reject decision'),
('task.create', 'task', 'Create new tasks'),
('task.assign', 'task', 'Assign or reassign tasks'),
('task.review', 'task', 'Review task deliverables')
ON CONFLICT (code) DO NOTHING;

-- Add cpa_role to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpa_role cpa_role DEFAULT 'associate';

-- ============================================
-- STEP 9: AI COPILOT ENGINE
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    summary TEXT NOT NULL,
    findings JSONB DEFAULT '[]',
    citations JSONB DEFAULT '[]',
    suggested_actions JSONB DEFAULT '[]',
    questions_for_user JSONB DEFAULT '[]',
    confidence FLOAT DEFAULT 0.0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    suggestion_id UUID REFERENCES public.ai_suggestions(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    target_entity_type TEXT,
    target_entity_id UUID,
    proposed_changes JSONB NOT NULL,
    status TEXT DEFAULT 'pending_approval',
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_interaction_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    interaction_type TEXT NOT NULL,
    request_payload JSONB DEFAULT '{}',
    response_payload JSONB DEFAULT '{}',
    response_time_ms INTEGER,
    citation_count INTEGER DEFAULT 0,
    is_hallucination_check_passed BOOLEAN DEFAULT TRUE,
    request_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_project_id ON public.ai_suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_client_id ON public.ai_suggestions(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_proposed_actions_status ON public.ai_proposed_actions(status);

-- RLS for AI tables
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org suggestions" ON public.ai_suggestions;
CREATE POLICY "Users can view org suggestions" ON public.ai_suggestions
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage suggestions" ON public.ai_suggestions;
CREATE POLICY "Users can manage suggestions" ON public.ai_suggestions
    FOR ALL USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can view org proposed actions" ON public.ai_proposed_actions;
CREATE POLICY "Users can view org proposed actions" ON public.ai_proposed_actions
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can view their org interaction logs" ON public.ai_interaction_logs;
CREATE POLICY "Users can view their org interaction logs" ON public.ai_interaction_logs
    FOR SELECT USING (organization_id = public.get_user_org_id());

-- ============================================
-- STEP 10: REACTIVE WORKSPACE (Versioning)
-- ============================================
-- Add version columns to core tables
DO $$ 
DECLARE 
    t TEXT;
BEGIN 
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'profiles', 'client_companies', 'projects', 
            'employees', 'contractors', 'expenses', 'budgets', 
            'time_logs', 'verification_tasks', 'project_workflow_status',
            'project_criterion_status', 'project_evidence'
        )
    LOOP 
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;', t);
    END LOOP;
END $$;

-- Saved Views table
CREATE TABLE IF NOT EXISTS public.saved_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('projects', 'employees', 'contractors', 'tasks', 'expenses')),
    name TEXT NOT NULL,
    filters JSONB DEFAULT '[]',
    sort JSONB DEFAULT '[]',
    grouping JSONB DEFAULT '[]',
    visible_columns JSONB DEFAULT '[]',
    pinned BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own or shared org views" ON public.saved_views;
CREATE POLICY "Users can view their own or shared org views" ON public.saved_views
    FOR SELECT USING (
        organization_id = public.get_user_org_id() AND (
            user_id = auth.uid() OR is_shared = TRUE
        )
    );

DROP POLICY IF EXISTS "Users can create their own views" ON public.saved_views;
CREATE POLICY "Users can create their own views" ON public.saved_views
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND user_id = auth.uid()
    );

-- Version increment function
CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMPLETE!
-- ============================================
-- Your database is now fully configured for TaxScape Pro
-- with all features:
-- ✅ Base tables (organizations, profiles, projects, etc.)
-- ✅ CPA-centric client management
-- ✅ Workflow engine with four-part test tracking
-- ✅ RBAC with CPA roles
-- ✅ AI Copilot tables
-- ✅ Reactive workspace with versioning
-- ✅ Row Level Security on all tables
