-- ============================================================================
-- READINESS SCORING & DASHBOARD SUPPORT
-- Migration: migration_readiness_dashboard.sql
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- READINESS SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.readiness_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('client', 'project')),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    
    -- Overall score
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    
    -- Component scores (0-100 each)
    component_scores JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Example: {
    --   "data_completeness": 85,
    --   "questionnaire_completeness": 70,
    --   "gaps_resolved": 60,
    --   "evidence_coverage": 75,
    --   "ai_evaluation_freshness": 90,
    --   "automated_review_resolved": 80,
    --   "study_decisions_locked": 0
    -- }
    
    -- Blockers list
    blockers JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Example: [
    --   {"type": "missing_field", "entity_type": "project", "entity_id": "...", "field": "uncertainty_type", "severity": "high"},
    --   {"type": "unresolved_gap", "entity_type": "gap", "entity_id": "...", "severity": "critical"}
    -- ]
    
    -- Recommended actions
    recommended_actions JSONB NOT NULL DEFAULT '[]'::JSONB,
    
    -- Metadata
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint for current snapshot per scope
    UNIQUE(client_company_id, tax_year, scope_type, project_id, is_current)
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_readiness_client_year ON public.readiness_snapshots(client_company_id, tax_year, scope_type) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_readiness_project ON public.readiness_snapshots(project_id, tax_year) WHERE scope_type = 'project' AND is_current = TRUE;

-- ============================================================================
-- MISSING FIELD REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.missing_field_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL,
    
    -- Entity reference
    entity_type TEXT NOT NULL, -- 'project', 'employee', 'vendor', 'contract', 'ap_transaction', 'supply', 'timesheet'
    entity_id UUID NOT NULL,
    field_key TEXT NOT NULL,
    
    -- Request details
    prompt_text TEXT NOT NULL,
    prompt_detail TEXT, -- Additional context
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    category TEXT, -- 'four_part_test', 'wage_data', 'contract_data', 'linkage', etc.
    
    -- Assignment
    suggested_assignee_role TEXT DEFAULT 'cpa', -- 'cpa', 'contributor'
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Task linkage
    linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    linked_gap_id UUID REFERENCES public.project_gaps(id) ON DELETE SET NULL,
    linked_questionnaire_item_id UUID,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'waived')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    waive_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicates
    UNIQUE(client_company_id, tax_year, entity_type, entity_id, field_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_missing_requests_client ON public.missing_field_requests(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_missing_requests_entity ON public.missing_field_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_missing_requests_assigned ON public.missing_field_requests(assigned_to) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_missing_requests_severity ON public.missing_field_requests(severity, status);

-- ============================================================================
-- PIPELINE STATUS VIEW (for dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW public.client_pipeline_status AS
SELECT 
    cc.id as client_company_id,
    cc.organization_id,
    cc.name as client_name,
    COALESCE(cc.active_tax_year, 2024) as tax_year,
    
    -- Step 1: Data Import
    (SELECT COUNT(*) FROM public.projects WHERE client_company_id = cc.id) as projects_count,
    (SELECT COUNT(*) FROM public.employees WHERE client_company_id = cc.id) as employees_count,
    (SELECT COUNT(*) FROM public.vendors WHERE client_company_id = cc.id) as vendors_count,
    
    -- Step 2: Recompute status
    (SELECT MAX(created_at) FROM public.qre_summaries 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024)) as last_recompute_at,
    
    -- Step 3: AI Evaluations
    (SELECT COUNT(*) FROM public.project_ai_evaluations 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024)) as evaluations_count,
    (SELECT MAX(created_at) FROM public.project_ai_evaluations 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024)) as last_evaluation_at,
    
    -- Step 4: Gaps status
    (SELECT COUNT(*) FROM public.project_gaps 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     AND status IN ('open', 'in_progress')) as open_gaps_count,
    (SELECT COUNT(*) FROM public.project_gaps 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     AND status = 'resolved') as resolved_gaps_count,
    
    -- Step 5: Missing requests
    (SELECT COUNT(*) FROM public.missing_field_requests 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     AND status IN ('open', 'in_progress')) as open_missing_requests_count,
    
    -- Step 6: Study status
    (SELECT status FROM public.studies 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     ORDER BY version DESC LIMIT 1) as latest_study_status,
    (SELECT id FROM public.studies 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     ORDER BY version DESC LIMIT 1) as latest_study_id,
    (SELECT version FROM public.studies 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     ORDER BY version DESC LIMIT 1) as latest_study_version,
    
    -- Readiness score
    (SELECT score FROM public.readiness_snapshots 
     WHERE client_company_id = cc.id AND tax_year = COALESCE(cc.active_tax_year, 2024) 
     AND scope_type = 'client' AND is_current = TRUE 
     ORDER BY computed_at DESC LIMIT 1) as readiness_score,
    
    -- Last activity
    GREATEST(
        cc.updated_at,
        (SELECT MAX(updated_at) FROM public.projects WHERE client_company_id = cc.id),
        (SELECT MAX(updated_at) FROM public.employees WHERE client_company_id = cc.id)
    ) as last_activity_at

FROM public.client_companies cc;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to compute client readiness score
CREATE OR REPLACE FUNCTION public.compute_client_readiness(
    p_client_company_id UUID,
    p_tax_year INTEGER
) RETURNS TABLE (
    score INTEGER,
    component_scores JSONB,
    blockers JSONB,
    recommended_actions JSONB
) AS $$
DECLARE
    v_data_completeness INTEGER;
    v_questionnaire_completeness INTEGER;
    v_gaps_resolved INTEGER;
    v_evidence_coverage INTEGER;
    v_ai_freshness INTEGER;
    v_review_resolved INTEGER;
    v_study_decisions INTEGER;
    v_total_score INTEGER;
    v_blockers JSONB := '[]'::JSONB;
    v_actions JSONB := '[]'::JSONB;
    v_project_count INTEGER;
    v_employee_count INTEGER;
    v_evaluated_count INTEGER;
    v_total_gaps INTEGER;
    v_resolved_gaps INTEGER;
    v_evidence_count INTEGER;
    v_missing_count INTEGER;
BEGIN
    -- Count basic entities
    SELECT COUNT(*) INTO v_project_count FROM public.projects WHERE client_company_id = p_client_company_id;
    SELECT COUNT(*) INTO v_employee_count FROM public.employees WHERE client_company_id = p_client_company_id;
    
    -- Data completeness (projects, employees, basic setup)
    IF v_project_count = 0 THEN
        v_data_completeness := 10;
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type', 'no_projects', 'severity', 'critical'));
    ELSIF v_employee_count = 0 THEN
        v_data_completeness := 30;
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type', 'no_employees', 'severity', 'high'));
    ELSE
        v_data_completeness := 70 + LEAST(30, (v_project_count + v_employee_count) / 2);
    END IF;
    
    -- Questionnaire completeness (simplified)
    SELECT COUNT(*) INTO v_missing_count FROM public.missing_field_requests 
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year 
    AND category = 'four_part_test' AND status IN ('open', 'in_progress');
    
    v_questionnaire_completeness := CASE 
        WHEN v_project_count = 0 THEN 0
        WHEN v_missing_count = 0 THEN 100
        ELSE GREATEST(0, 100 - (v_missing_count * 10))
    END;
    
    -- Gaps resolved percentage
    SELECT COUNT(*) INTO v_total_gaps FROM public.project_gaps 
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year;
    SELECT COUNT(*) INTO v_resolved_gaps FROM public.project_gaps 
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year AND status = 'resolved';
    
    v_gaps_resolved := CASE 
        WHEN v_total_gaps = 0 THEN 100
        ELSE (v_resolved_gaps * 100) / v_total_gaps
    END;
    
    IF v_total_gaps > 0 AND v_resolved_gaps < v_total_gaps THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
            'type', 'unresolved_gaps', 
            'count', v_total_gaps - v_resolved_gaps,
            'severity', CASE WHEN v_total_gaps - v_resolved_gaps > 5 THEN 'high' ELSE 'medium' END
        ));
    END IF;
    
    -- Evidence coverage
    SELECT COUNT(*) INTO v_evidence_count FROM public.project_evidence_items 
    WHERE client_company_id = p_client_company_id;
    
    v_evidence_coverage := CASE 
        WHEN v_project_count = 0 THEN 0
        WHEN v_evidence_count = 0 THEN 20
        ELSE LEAST(100, 40 + (v_evidence_count * 10))
    END;
    
    -- AI evaluation freshness
    SELECT COUNT(*) INTO v_evaluated_count FROM public.project_ai_evaluations 
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year;
    
    v_ai_freshness := CASE 
        WHEN v_project_count = 0 THEN 0
        WHEN v_evaluated_count = 0 THEN 0
        WHEN v_evaluated_count >= v_project_count THEN 100
        ELSE (v_evaluated_count * 100) / v_project_count
    END;
    
    IF v_evaluated_count < v_project_count THEN
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
            'type', 'run_ai_evaluation',
            'count', v_project_count - v_evaluated_count,
            'label', 'Run AI evaluation on remaining projects'
        ));
    END IF;
    
    -- Review resolved (placeholder)
    v_review_resolved := 100; -- TODO: Implement based on automated review flags
    
    -- Study decisions (based on study status)
    SELECT CASE 
        WHEN status = 'approved' THEN 100
        WHEN status = 'in_review' THEN 80
        WHEN status = 'draft' THEN 60
        ELSE 0
    END INTO v_study_decisions
    FROM public.studies 
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year 
    ORDER BY version DESC LIMIT 1;
    
    v_study_decisions := COALESCE(v_study_decisions, 0);
    
    -- Calculate weighted total (weights in comments)
    -- Data: 15%, Questionnaire: 15%, Gaps: 20%, Evidence: 15%, AI: 20%, Review: 5%, Study: 10%
    v_total_score := (
        (v_data_completeness * 15) +
        (v_questionnaire_completeness * 15) +
        (v_gaps_resolved * 20) +
        (v_evidence_coverage * 15) +
        (v_ai_freshness * 20) +
        (v_review_resolved * 5) +
        (v_study_decisions * 10)
    ) / 100;
    
    RETURN QUERY SELECT 
        v_total_score,
        jsonb_build_object(
            'data_completeness', v_data_completeness,
            'questionnaire_completeness', v_questionnaire_completeness,
            'gaps_resolved', v_gaps_resolved,
            'evidence_coverage', v_evidence_coverage,
            'ai_evaluation_freshness', v_ai_freshness,
            'automated_review_resolved', v_review_resolved,
            'study_decisions_locked', v_study_decisions
        ),
        v_blockers,
        v_actions;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to detect missing fields for a project
CREATE OR REPLACE FUNCTION public.detect_project_missing_fields(
    p_project_id UUID
) RETURNS TABLE (
    field_key TEXT,
    prompt_text TEXT,
    severity TEXT,
    category TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM (
        SELECT 
            'uncertainty_type'::TEXT as field_key,
            'Please describe what technological uncertainty this project aimed to resolve.'::TEXT as prompt_text,
            'high'::TEXT as severity,
            'four_part_test'::TEXT as category
        FROM public.projects p
        WHERE p.id = p_project_id 
        AND (p.uncertainty_type IS NULL OR p.uncertainty_type = '')
        
        UNION ALL
        
        SELECT 
            'experimentation_description'::TEXT,
            'Describe the systematic experimentation process used in this project.'::TEXT,
            'high'::TEXT,
            'four_part_test'::TEXT
        FROM public.projects p
        WHERE p.id = p_project_id 
        AND (p.experimentation_description IS NULL OR p.experimentation_description = '')
        
        UNION ALL
        
        SELECT 
            'technological_basis'::TEXT,
            'What is the technological basis or foundation of this R&D activity?'::TEXT,
            'medium'::TEXT,
            'four_part_test'::TEXT
        FROM public.projects p
        WHERE p.id = p_project_id 
        AND (p.technological_basis IS NULL OR p.technological_basis = '')
        
        UNION ALL
        
        SELECT 
            'permitted_purpose'::TEXT,
            'Describe the permitted purpose (new/improved product, process, etc.) for this project.'::TEXT,
            'medium'::TEXT,
            'four_part_test'::TEXT
        FROM public.projects p
        WHERE p.id = p_project_id 
        AND (p.permitted_purpose IS NULL OR p.permitted_purpose = '')
    ) missing_fields;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- DEMO MODE SUPPORT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE,
    demo_type TEXT DEFAULT 'guided',
    current_step INTEGER DEFAULT 0,
    completed_steps JSONB DEFAULT '[]'::JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, organization_id)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.readiness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_field_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_sessions ENABLE ROW LEVEL SECURITY;

-- Readiness snapshots: Org members can view
CREATE POLICY "readiness_snapshots_org_access" ON public.readiness_snapshots
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Missing field requests: Org members can view, CPAs can update
CREATE POLICY "missing_requests_view" ON public.missing_field_requests
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "missing_requests_update" ON public.missing_field_requests
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Demo sessions: Own sessions only
CREATE POLICY "demo_sessions_own" ON public.demo_sessions
    FOR ALL USING (user_id = auth.uid());

COMMENT ON TABLE public.readiness_snapshots IS 'Cached readiness scores for clients and projects';
COMMENT ON TABLE public.missing_field_requests IS 'Auto-detected missing information requests';
COMMENT ON TABLE public.demo_sessions IS 'Demo mode session tracking';

