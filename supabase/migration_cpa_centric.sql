-- ============================================
-- CPA-CENTRIC ARCHITECTURE MIGRATION
-- ============================================
-- This migration transforms the system to be CPA-centric:
-- - Organizations = CPA firms/practices
-- - Client companies = The businesses CPAs manage
-- - CPAs can manage multiple client companies
-- ============================================

-- ============================================
-- 1. CREATE CLIENT COMPANIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.client_companies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    industry TEXT,
    tax_year TEXT DEFAULT '2024',
    ein TEXT, -- Employer Identification Number
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

-- Indexes for client_companies
CREATE INDEX IF NOT EXISTS idx_client_companies_org_id ON public.client_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_companies_status ON public.client_companies(status);
CREATE INDEX IF NOT EXISTS idx_client_companies_slug ON public.client_companies(slug);

-- ============================================
-- 2. ADD CLIENT_COMPANY_ID TO EXISTING TABLES
-- ============================================

-- Add client_company_id to projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_projects_client_company_id ON public.projects(client_company_id);

-- Add client_company_id to employees  
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_employees_client_company_id ON public.employees(client_company_id);

-- Add client_company_id to contractors
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contractors_client_company_id ON public.contractors(client_company_id);

-- Add client_company_id to budgets
ALTER TABLE public.budgets
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_budgets_client_company_id ON public.budgets(client_company_id);

-- Add client_company_id to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expenses_client_company_id ON public.expenses(client_company_id);

-- Add client_company_id to engineering_tasks
ALTER TABLE public.engineering_tasks
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_eng_tasks_client_company_id ON public.engineering_tasks(client_company_id);

-- Add client_company_id to time_logs
ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_time_logs_client_company_id ON public.time_logs(client_company_id);

-- Add client_company_id to chat_sessions
ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_client_company_id ON public.chat_sessions(client_company_id);

-- Add client_company_id to studies
ALTER TABLE public.studies
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studies_client_company_id ON public.studies(client_company_id);

-- Add client_company_id to verification_tasks
ALTER TABLE public.verification_tasks
ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_verification_tasks_client_company_id ON public.verification_tasks(client_company_id);

-- ============================================
-- 3. ADD SELECTED CLIENT TO PROFILES
-- ============================================

-- Add currently selected client company to profile for state persistence
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS selected_client_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL;

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function to get user's client companies
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

-- Function to check if user can access client company
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

-- Function to generate client company slug
CREATE OR REPLACE FUNCTION public.generate_client_slug(input_text TEXT, org_id UUID)
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
        base_slug := 'client-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;
    
    final_slug := base_slug;
    
    -- Check for uniqueness within organization
    WHILE EXISTS (SELECT 1 FROM public.client_companies WHERE slug = final_slug AND organization_id = org_id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. TRIGGERS
-- ============================================

-- Auto-update trigger for client_companies
DROP TRIGGER IF EXISTS update_client_companies_updated_at ON public.client_companies;
CREATE TRIGGER update_client_companies_updated_at 
    BEFORE UPDATE ON public.client_companies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

-- CPAs can view their organization's client companies
CREATE POLICY "Users can view org client companies" ON public.client_companies
    FOR SELECT USING (
        organization_id = public.get_user_org_id()
    );

-- CPAs/Executives can create client companies
CREATE POLICY "CPAs can create client companies" ON public.client_companies
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- CPAs/Executives can update client companies
CREATE POLICY "CPAs can update client companies" ON public.client_companies
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- Only Executives can delete client companies
CREATE POLICY "Executives can delete client companies" ON public.client_companies
    FOR DELETE USING (
        public.is_org_admin(organization_id)
    );

-- ============================================
-- 7. SAMPLE DATA MIGRATION (for existing data)
-- ============================================
-- If you have existing data, you'll want to create a client company for each organization
-- and migrate the data. Run this after the above schema changes:

-- CREATE OR REPLACE FUNCTION migrate_to_cpa_centric() RETURNS void AS $$
-- DECLARE
--     org RECORD;
--     new_client_id UUID;
-- BEGIN
--     FOR org IN SELECT * FROM public.organizations LOOP
--         -- Create a default client company for each org
--         INSERT INTO public.client_companies (organization_id, name, slug, industry, tax_year)
--         VALUES (org.id, org.name, public.generate_client_slug(org.name, org.id), org.industry, org.tax_year)
--         RETURNING id INTO new_client_id;
--         
--         -- Migrate existing projects
--         UPDATE public.projects SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate employees
--         UPDATE public.employees SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate contractors
--         UPDATE public.contractors SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate budgets
--         UPDATE public.budgets SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate expenses
--         UPDATE public.expenses SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate engineering tasks
--         UPDATE public.engineering_tasks SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate time logs
--         UPDATE public.time_logs SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate chat sessions
--         UPDATE public.chat_sessions SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate studies
--         UPDATE public.studies SET client_company_id = new_client_id WHERE organization_id = org.id;
--         -- Migrate verification tasks
--         UPDATE public.verification_tasks SET client_company_id = new_client_id WHERE organization_id = org.id;
--     END LOOP;
-- END;
-- $$ LANGUAGE plpgsql;
-- 
-- SELECT migrate_to_cpa_centric();







