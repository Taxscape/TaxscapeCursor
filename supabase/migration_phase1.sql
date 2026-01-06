-- TaxScape Pro Phase 1 Migration Script
-- Run this in the Supabase SQL Editor to add Pipeline Dashboard features
-- This safely adds new tables and updates existing ones without data loss

-- ============================================
-- UPDATE ORGANIZATION_MEMBERS ROLE CONSTRAINT
-- ============================================
-- First, migrate existing roles to new role system
DO $$
BEGIN
    -- Update existing admin roles to executive
    UPDATE public.organization_members 
    SET role = 'executive' 
    WHERE role = 'admin';
    
    -- Update other roles to engineer (default)
    UPDATE public.organization_members 
    SET role = 'engineer' 
    WHERE role NOT IN ('executive', 'cpa', 'engineer');
    
    -- Now alter the constraint
    ALTER TABLE public.organization_members 
    DROP CONSTRAINT IF EXISTS organization_members_role_check;
    
    ALTER TABLE public.organization_members 
    ADD CONSTRAINT organization_members_role_check 
    CHECK (role IN ('executive', 'cpa', 'engineer'));
    
    -- Update default
    ALTER TABLE public.organization_members 
    ALTER COLUMN role SET DEFAULT 'engineer';
    
    RAISE NOTICE 'Updated organization_members role constraint';
END $$;

-- Add index for role if not exists
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);

-- ============================================
-- CREATE BUDGETS TABLE
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
-- CREATE EXPENSES TABLE
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
-- CREATE ENGINEERING TASKS TABLE
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
-- CREATE TIME LOGS TABLE
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
-- UPDATE HELPER FUNCTIONS
-- ============================================

-- Update is_org_admin to check for 'executive' role
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

-- Add is_org_cpa function
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

-- Add is_org_engineer function
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

-- Add get_user_role function
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

-- Update handle_new_user to use 'executive' role
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

-- ============================================
-- ENABLE RLS ON NEW TABLES
-- ============================================
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- BUDGETS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view org budgets" ON public.budgets;
CREATE POLICY "Users can view org budgets" ON public.budgets
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

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
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- EXPENSES POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view org expenses" ON public.expenses;
CREATE POLICY "Users can view org expenses" ON public.expenses
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

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
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- ENGINEERING TASKS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view org engineering tasks" ON public.engineering_tasks;
CREATE POLICY "Users can view org engineering tasks" ON public.engineering_tasks
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

DROP POLICY IF EXISTS "Engineers and Executives can insert tasks" ON public.engineering_tasks;
CREATE POLICY "Engineers and Executives can insert tasks" ON public.engineering_tasks
    FOR INSERT WITH CHECK (
        public.is_org_admin(organization_id) OR public.is_org_engineer(organization_id)
    );

DROP POLICY IF EXISTS "Assigned users can update tasks" ON public.engineering_tasks;
CREATE POLICY "Assigned users can update tasks" ON public.engineering_tasks
    FOR UPDATE USING (
        assigned_to = auth.uid() OR 
        public.is_org_admin(organization_id) OR 
        public.is_org_engineer(organization_id)
    );

DROP POLICY IF EXISTS "Executives can delete tasks" ON public.engineering_tasks;
CREATE POLICY "Executives can delete tasks" ON public.engineering_tasks
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- TIME LOGS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view org time logs" ON public.time_logs;
CREATE POLICY "Users can view org time logs" ON public.time_logs
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

DROP POLICY IF EXISTS "Engineers can insert time logs" ON public.time_logs;
CREATE POLICY "Engineers can insert time logs" ON public.time_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND public.is_org_member(organization_id)
    );

DROP POLICY IF EXISTS "Users can update own time logs" ON public.time_logs;
CREATE POLICY "Users can update own time logs" ON public.time_logs
    FOR UPDATE USING (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can delete own time logs" ON public.time_logs;
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
-- DONE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Phase 1 Migration completed successfully!';
    RAISE NOTICE 'New tables: budgets, expenses, engineering_tasks, time_logs';
    RAISE NOTICE 'Updated roles: executive, cpa, engineer';
END $$;






