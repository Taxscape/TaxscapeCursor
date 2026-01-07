-- ============================================================================
-- ROLES & PERMISSIONS: Capability-based authorization for CPA firms
-- Migration: migration_roles_permissions.sql
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CAPABILITY FLAGS
-- ============================================================================

-- Add capabilities JSONB column to organization_members
ALTER TABLE public.organization_members 
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';

-- Add display_role for UI (maps internal role to user-friendly name)
ALTER TABLE public.organization_members 
ADD COLUMN IF NOT EXISTS display_role TEXT;

-- ============================================================================
-- DEFAULT CAPABILITY SETS
-- ============================================================================

-- Define capability constants (stored as a reference table)
CREATE TABLE IF NOT EXISTS public.role_capability_defaults (
    role TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    capabilities JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default capability mappings
INSERT INTO public.role_capability_defaults (role, display_name, capabilities, description) VALUES
(
    'executive',
    'Executive',
    '{
        "can_manage_org": true,
        "can_manage_clients": true,
        "can_edit_financials": true,
        "can_edit_projects": true,
        "can_view_ai": true,
        "can_run_ai": true,
        "can_generate_studies": true,
        "can_approve_studies": true,
        "can_upload_evidence": true,
        "can_resolve_gaps": true,
        "can_waive_gaps": true,
        "can_view_audit_package": true,
        "can_manage_tasks": true,
        "can_view_all_data": true
    }',
    'Full access to all organization features'
),
(
    'admin',
    'Administrator',
    '{
        "can_manage_org": true,
        "can_manage_clients": true,
        "can_edit_financials": true,
        "can_edit_projects": true,
        "can_view_ai": true,
        "can_run_ai": true,
        "can_generate_studies": true,
        "can_approve_studies": true,
        "can_upload_evidence": true,
        "can_resolve_gaps": true,
        "can_waive_gaps": true,
        "can_view_audit_package": true,
        "can_manage_tasks": true,
        "can_view_all_data": true
    }',
    'Full access to all organization features'
),
(
    'cpa',
    'CPA',
    '{
        "can_manage_org": false,
        "can_manage_clients": true,
        "can_edit_financials": true,
        "can_edit_projects": true,
        "can_view_ai": true,
        "can_run_ai": true,
        "can_generate_studies": true,
        "can_approve_studies": true,
        "can_upload_evidence": true,
        "can_resolve_gaps": true,
        "can_waive_gaps": true,
        "can_view_audit_package": true,
        "can_manage_tasks": true,
        "can_view_all_data": true
    }',
    'Full CPA access except org management'
),
(
    'engineer',
    'Client Contributor',
    '{
        "can_manage_org": false,
        "can_manage_clients": false,
        "can_edit_financials": false,
        "can_edit_projects": false,
        "can_view_ai": false,
        "can_run_ai": false,
        "can_generate_studies": false,
        "can_approve_studies": false,
        "can_upload_evidence": true,
        "can_resolve_gaps": false,
        "can_waive_gaps": false,
        "can_view_audit_package": false,
        "can_manage_tasks": false,
        "can_view_all_data": false,
        "can_submit_timesheets": true,
        "can_answer_questionnaires": true,
        "can_view_assigned_tasks": true,
        "can_complete_tasks": true
    }',
    'Limited contributor access for client employees'
)
ON CONFLICT (role) DO UPDATE SET 
    capabilities = EXCLUDED.capabilities,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if user has a specific capability
CREATE OR REPLACE FUNCTION public.has_capability(
    p_user_id UUID,
    p_org_id UUID,
    p_capability TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_member RECORD;
    v_default_caps JSONB;
    v_user_caps JSONB;
BEGIN
    -- Get member record
    SELECT role, capabilities INTO v_member
    FROM public.organization_members
    WHERE user_id = p_user_id 
      AND organization_id = p_org_id 
      AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get default capabilities for role
    SELECT capabilities INTO v_default_caps
    FROM public.role_capability_defaults
    WHERE role = v_member.role;
    
    -- Merge default with overrides (user-specific capabilities override defaults)
    v_user_caps := COALESCE(v_default_caps, '{}'::JSONB) || COALESCE(v_member.capabilities, '{}'::JSONB);
    
    -- Check capability
    RETURN COALESCE((v_user_caps->>p_capability)::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get all capabilities for a user in an org
CREATE OR REPLACE FUNCTION public.get_user_capabilities(
    p_user_id UUID,
    p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_member RECORD;
    v_default_caps JSONB;
BEGIN
    SELECT role, capabilities INTO v_member
    FROM public.organization_members
    WHERE user_id = p_user_id 
      AND organization_id = p_org_id 
      AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN '{}'::JSONB;
    END IF;
    
    SELECT capabilities INTO v_default_caps
    FROM public.role_capability_defaults
    WHERE role = v_member.role;
    
    RETURN COALESCE(v_default_caps, '{}'::JSONB) || COALESCE(v_member.capabilities, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's role display name
CREATE OR REPLACE FUNCTION public.get_role_display_name(p_role TEXT) 
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT display_name FROM public.role_capability_defaults WHERE role = p_role),
        p_role
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if user can access a specific client
CREATE OR REPLACE FUNCTION public.can_access_client(
    p_user_id UUID,
    p_client_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_org_id UUID;
    v_has_all_access BOOLEAN;
BEGIN
    -- Get the org for this client
    SELECT organization_id INTO v_org_id
    FROM public.client_companies
    WHERE id = p_client_company_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user is member of the org
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = p_user_id 
          AND organization_id = v_org_id 
          AND status = 'active'
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user has full data access
    v_has_all_access := public.has_capability(p_user_id, v_org_id, 'can_view_all_data');
    
    IF v_has_all_access THEN
        RETURN TRUE;
    END IF;
    
    -- For contributors, check if they have assigned tasks/projects for this client
    RETURN EXISTS (
        SELECT 1 FROM public.tasks
        WHERE assigned_to = p_user_id 
          AND client_company_id = p_client_company_id
    ) OR EXISTS (
        SELECT 1 FROM public.project_questionnaire_items pqi
        JOIN public.projects p ON p.id = pqi.project_id
        WHERE pqi.assigned_to = p_user_id
          AND p.client_company_id = p_client_company_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- DISMISSED SUGGESTIONS TABLE (for Action Center)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dismissed_suggestions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE,
    tax_year INTEGER,
    suggestion_type TEXT NOT NULL,
    suggestion_key TEXT NOT NULL, -- Unique key for the specific suggestion
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    snooze_until TIMESTAMP WITH TIME ZONE, -- NULL = permanently dismissed, date = snoozed until
    UNIQUE(user_id, client_company_id, tax_year, suggestion_key)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_user ON public.dismissed_suggestions(user_id, client_company_id, tax_year);

-- ============================================================================
-- RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    endpoint TEXT NOT NULL,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_count INTEGER DEFAULT 1,
    UNIQUE(user_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint ON public.rate_limit_tokens(user_id, endpoint, window_start);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id UUID,
    p_endpoint TEXT,
    p_max_requests INTEGER DEFAULT 60,
    p_window_minutes INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_current_count INTEGER;
BEGIN
    -- Calculate current window start
    v_window_start := date_trunc('minute', NOW());
    
    -- Clean old entries
    DELETE FROM public.rate_limit_tokens
    WHERE window_start < NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    -- Get or create rate limit entry
    INSERT INTO public.rate_limit_tokens (user_id, endpoint, window_start, request_count)
    VALUES (p_user_id, p_endpoint, v_window_start, 1)
    ON CONFLICT (user_id, endpoint, window_start) 
    DO UPDATE SET request_count = rate_limit_tokens.request_count + 1
    RETURNING request_count INTO v_current_count;
    
    RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AUDIT LOG ENHANCEMENTS
-- ============================================================================

-- Add more fields to existing audit_logs or create if not exists
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    client_company_id UUID,
    request_id TEXT,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- ============================================================================
-- AI TELEMETRY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_telemetry (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    request_id TEXT,
    endpoint TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_provider TEXT DEFAULT 'gemini',
    prompt_version TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost NUMERIC(10,6),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_type TEXT,
    error_message TEXT,
    parse_success BOOLEAN,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_telemetry_org ON public.ai_telemetry(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_user ON public.ai_telemetry(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_success ON public.ai_telemetry(success, created_at DESC);

-- ============================================================================
-- SYSTEM METRICS TABLE (for /api/system/metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_job_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_type TEXT NOT NULL, -- 'import', 'recompute', 'ai_eval', 'study_gen'
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_company_id UUID,
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    progress INTEGER DEFAULT 0,
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_jobs_status ON public.system_job_status(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_jobs_org ON public.system_job_status(organization_id, job_type, created_at DESC);

-- ============================================================================
-- ENHANCED RLS POLICIES
-- ============================================================================

-- Drop existing policies to recreate with capability checks
DROP POLICY IF EXISTS "projects_org_access" ON public.projects;
DROP POLICY IF EXISTS "employees_org_access" ON public.employees;
DROP POLICY IF EXISTS "timesheets_org_access" ON public.timesheets;

-- Projects: Full access for CPAs, limited for contributors
CREATE POLICY "projects_capability_access" ON public.projects
    FOR ALL USING (
        -- User must be in the org
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            -- Full access users
            public.has_capability(auth.uid(), organization_id, 'can_view_all_data')
            OR
            -- Contributors can only see projects they're assigned to
            id IN (
                SELECT project_id FROM public.tasks WHERE assigned_to = auth.uid()
                UNION
                SELECT project_id FROM public.project_questionnaire_items WHERE assigned_to = auth.uid()
            )
        )
    );

-- Employees: Full access for CPAs, own record for contributors
CREATE POLICY "employees_capability_access" ON public.employees
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_view_all_data')
            OR
            user_id = auth.uid() -- Can see own employee record
        )
    );

-- Timesheets: Full access for CPAs, own entries for contributors
CREATE POLICY "timesheets_capability_access" ON public.timesheets
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_view_all_data')
            OR
            employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "timesheets_insert_own" ON public.timesheets
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_edit_financials')
            OR
            (
                public.has_capability(auth.uid(), organization_id, 'can_submit_timesheets')
                AND employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
            )
        )
    );

-- Studies: Only CPAs with capability can generate/view
CREATE POLICY "studies_capability_access" ON public.studies
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND public.has_capability(auth.uid(), organization_id, 'can_generate_studies')
    );

CREATE POLICY "studies_generate" ON public.studies
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND public.has_capability(auth.uid(), organization_id, 'can_generate_studies')
    );

-- Evidence items: Upload access check
CREATE POLICY "evidence_upload_access" ON public.project_evidence_items
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND public.has_capability(auth.uid(), organization_id, 'can_upload_evidence')
    );

CREATE POLICY "evidence_view_access" ON public.project_evidence_items
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_view_all_data')
            OR
            created_by = auth.uid() -- Can see own uploads
            OR
            project_id IN (
                SELECT project_id FROM public.tasks WHERE assigned_to = auth.uid()
            )
        )
    );

-- Gaps: Resolve/waive capability checks
CREATE POLICY "gaps_view_access" ON public.project_gaps
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "gaps_resolve" ON public.project_gaps
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            -- Waiving requires special permission
            (status != 'waived' AND public.has_capability(auth.uid(), organization_id, 'can_resolve_gaps'))
            OR
            (status = 'waived' AND public.has_capability(auth.uid(), organization_id, 'can_waive_gaps'))
        )
    );

-- Tasks: Assigned users can view/complete their tasks
CREATE POLICY "tasks_view_access" ON public.tasks
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_manage_tasks')
            OR
            assigned_to = auth.uid()
            OR
            created_by = auth.uid()
        )
    );

CREATE POLICY "tasks_complete" ON public.tasks
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
        AND (
            public.has_capability(auth.uid(), organization_id, 'can_manage_tasks')
            OR
            (assigned_to = auth.uid() AND public.has_capability(auth.uid(), organization_id, 'can_complete_tasks'))
        )
    );

-- Dismissed suggestions: Users can only manage their own
ALTER TABLE public.dismissed_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissed_suggestions_own" ON public.dismissed_suggestions
    FOR ALL USING (user_id = auth.uid());

-- Rate limit tokens: Users can only see their own
ALTER TABLE public.rate_limit_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_own" ON public.rate_limit_tokens
    FOR ALL USING (user_id = auth.uid());

-- Audit logs: Read-only for org admins
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
    FOR SELECT USING (
        public.has_capability(auth.uid(), organization_id, 'can_manage_org')
    );

-- AI telemetry: Read-only for org admins
ALTER TABLE public.ai_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_telemetry_admin_read" ON public.ai_telemetry
    FOR SELECT USING (
        public.has_capability(auth.uid(), organization_id, 'can_manage_org')
    );

-- System job status: Read-only for org admins
ALTER TABLE public.system_job_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_jobs_admin_read" ON public.system_job_status
    FOR SELECT USING (
        public.has_capability(auth.uid(), organization_id, 'can_manage_org')
    );

-- ============================================================================
-- DATABASE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Timesheets indexes
CREATE INDEX IF NOT EXISTS idx_timesheets_client_year ON public.timesheets(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON public.timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_project ON public.timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON public.timesheets(work_date);

-- AP Transactions indexes
CREATE INDEX IF NOT EXISTS idx_ap_transactions_client_year ON public.ap_transactions(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_vendor ON public.ap_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_date ON public.ap_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_category ON public.ap_transactions(category);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Employees indexes
CREATE INDEX IF NOT EXISTS idx_employees_client ON public.employees(client_company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON public.employees(user_id);

-- Vendors indexes
CREATE INDEX IF NOT EXISTS idx_vendors_client ON public.vendors(client_company_id);

-- Contracts indexes
CREATE INDEX IF NOT EXISTS idx_contracts_client_year ON public.contracts(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON public.contracts(vendor_id);

-- Supplies indexes
CREATE INDEX IF NOT EXISTS idx_supplies_client_year ON public.supplies(client_company_id, tax_year);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON public.tasks(client_company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- Evidence indexes
CREATE INDEX IF NOT EXISTS idx_evidence_project ON public.project_evidence_items(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_created_by ON public.project_evidence_items(created_by);

-- Gaps indexes
CREATE INDEX IF NOT EXISTS idx_gaps_project_year ON public.project_gaps(project_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON public.project_gaps(status);

-- AI Evaluations indexes
CREATE INDEX IF NOT EXISTS idx_ai_eval_project_year ON public.project_ai_evaluations(project_id, tax_year);

COMMENT ON TABLE public.role_capability_defaults IS 'Default capability mappings for each role';
COMMENT ON TABLE public.dismissed_suggestions IS 'Tracks dismissed/snoozed suggestions per user';
COMMENT ON TABLE public.rate_limit_tokens IS 'Rate limiting tracking for API endpoints';
COMMENT ON TABLE public.ai_telemetry IS 'AI call telemetry for monitoring and cost tracking';
COMMENT ON TABLE public.system_job_status IS 'Background job status tracking';

