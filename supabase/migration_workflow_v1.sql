-- ============================================
-- WORKFLOW ENGINE MIGRATION
-- ============================================

-- ENUMS
DO $$ BEGIN
    CREATE TYPE public.workflow_overall_state AS ENUM ('not_started', 'in_progress', 'ready_for_review', 'needs_follow_up', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.criterion_state AS ENUM ('missing', 'incomplete', 'sufficient', 'flagged', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.workflow_risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.evidence_type AS ENUM ('project_narrative', 'technical_docs', 'test_results', 'source_control', 'tickets', 'time_logs', 'financial_support');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.evidence_source AS ENUM ('upload', 'manual_entry', 'ai_extracted', 'integration');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. PROJECT WORKFLOW STATUS
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

CREATE INDEX IF NOT EXISTS idx_workflow_status_project_id ON public.project_workflow_status(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_status_client_id ON public.project_workflow_status(client_id);
CREATE INDEX IF NOT EXISTS idx_workflow_status_org_id ON public.project_workflow_status(organization_id);

-- 2. PROJECT CRITERION STATUS
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

CREATE INDEX IF NOT EXISTS idx_criterion_status_project_id ON public.project_criterion_status(project_id);

-- 3. PROJECT EVIDENCE
CREATE TABLE IF NOT EXISTS public.project_evidence (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    evidence_type public.evidence_type NOT NULL,
    source public.evidence_source DEFAULT 'manual_entry',
    file_id UUID, -- Reference to a file table if exists
    url TEXT,
    text_excerpt TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_project_id ON public.project_evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_client_id ON public.project_evidence(client_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org_id ON public.project_evidence(organization_id);

-- 4. WORKFLOW EVENTS (Append-only)
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

CREATE INDEX IF NOT EXISTS idx_workflow_events_project_id ON public.workflow_events(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_client_id ON public.workflow_events(client_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_org_id ON public.workflow_events(organization_id);

-- RLS POLICIES

-- Enable RLS
ALTER TABLE public.project_workflow_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_criterion_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

-- Policies for project_workflow_status
CREATE POLICY "Users can view org workflow status" ON public.project_workflow_status
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can update org workflow status" ON public.project_workflow_status
    FOR UPDATE USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can insert org workflow status" ON public.project_workflow_status
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

-- Policies for project_criterion_status
CREATE POLICY "Users can view org criterion status" ON public.project_criterion_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = project_id 
            AND p.organization_id = public.get_user_org_id()
        )
    );

CREATE POLICY "Users can update org criterion status" ON public.project_criterion_status
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = project_id 
            AND p.organization_id = public.get_user_org_id()
        )
    );

CREATE POLICY "Users can insert org criterion status" ON public.project_criterion_status
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = project_id 
            AND p.organization_id = public.get_user_org_id()
        )
    );

-- Policies for project_evidence
CREATE POLICY "Users can view org evidence" ON public.project_evidence
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can insert org evidence" ON public.project_evidence
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

-- Policies for workflow_events
CREATE POLICY "Users can view org workflow events" ON public.workflow_events
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can insert org workflow events" ON public.workflow_events
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());




