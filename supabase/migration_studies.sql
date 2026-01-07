-- ============================================================================
-- STUDIES DOMAIN: Study Generation, Versioning, and Audit Package Support
-- Migration: migration_studies.sql
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Study type enum
DO $$ BEGIN
    CREATE TYPE study_type AS ENUM ('workspace_study', 'rd_session_study');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Study status enum
DO $$ BEGIN
    CREATE TYPE study_status AS ENUM ('draft', 'in_review', 'approved', 'rejected', 'superseded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Artifact type enum
DO $$ BEGIN
    CREATE TYPE artifact_type AS ENUM ('excel', 'zip_audit_package', 'pdf_summary', 'json_export');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Project decision enum for study
DO $$ BEGIN
    CREATE TYPE project_decision AS ENUM ('qualified', 'not_qualified', 'needs_follow_up', 'waived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STUDIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL,
    
    -- Study type and source
    study_type study_type NOT NULL DEFAULT 'workspace_study',
    source_context JSONB DEFAULT '{}', -- For workspace: project filters; for rd_session: session_id
    
    -- Status and versioning
    status study_status NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Generation metadata
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    inputs_snapshot_hash TEXT NOT NULL, -- SHA256 of input data for reproducibility
    
    -- Computed totals (cached for quick display)
    total_qre NUMERIC(15,2) DEFAULT 0,
    total_credit NUMERIC(15,2) DEFAULT 0,
    qualified_projects_count INTEGER DEFAULT 0,
    risk_flags_count INTEGER DEFAULT 0,
    
    -- Credit method
    credit_method TEXT DEFAULT 'both', -- 'regular', 'asc', 'both'
    recommended_method TEXT,
    
    -- Review fields
    notes TEXT,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approval_notes TEXT,
    rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Lock state
    locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Traceability
    evaluation_ids UUID[] DEFAULT '{}', -- Project evaluation IDs used
    evidence_ids UUID[] DEFAULT '{}', -- Evidence item IDs referenced
    recompute_timestamp TIMESTAMP WITH TIME ZONE, -- When recompute was last run
    prompt_version TEXT, -- AI prompt version used for evaluations
    model_version TEXT, -- AI model version used
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: only one non-superseded study per client+year+version
    UNIQUE(client_company_id, tax_year, version)
);

-- Index for finding latest study
CREATE INDEX IF NOT EXISTS idx_studies_client_year_status ON public.studies(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_studies_org ON public.studies(organization_id);
CREATE INDEX IF NOT EXISTS idx_studies_generated_at ON public.studies(generated_at DESC);

-- ============================================================================
-- STUDY ARTIFACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_artifacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies(id) ON DELETE CASCADE NOT NULL,
    
    -- Artifact details
    artifact_type artifact_type NOT NULL,
    storage_path TEXT NOT NULL, -- Supabase Storage key
    filename TEXT NOT NULL,
    file_size INTEGER, -- bytes
    sha256_checksum TEXT NOT NULL, -- For integrity verification
    
    -- Metadata
    metadata JSONB DEFAULT '{}', -- sheet names, row counts, etc.
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one artifact type per study
    UNIQUE(study_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_study_artifacts_study ON public.study_artifacts(study_id);

-- ============================================================================
-- STUDY DECISIONS TABLE (per-project decisions for a study)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_decisions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    
    -- Decision details
    decision project_decision NOT NULL,
    reason_code TEXT, -- e.g., 'four_part_pass', 'insufficient_evidence', 'foreign_research'
    review_notes TEXT,
    
    -- Evidence linkage
    linked_evidence_ids UUID[] DEFAULT '{}',
    linked_evaluation_id UUID, -- Reference to project_ai_evaluations
    
    -- Acknowledgements for high-risk
    risk_acknowledged BOOLEAN DEFAULT FALSE,
    risk_acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    risk_acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Lock state (locked when study is approved)
    locked BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one decision per project per study
    UNIQUE(study_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_study_decisions_study ON public.study_decisions(study_id);
CREATE INDEX IF NOT EXISTS idx_study_decisions_project ON public.study_decisions(project_id);

-- ============================================================================
-- STUDY AUDIT LOG (extends existing audit_logs or creates study-specific)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies(id) ON DELETE CASCADE NOT NULL,
    
    -- Action details
    action TEXT NOT NULL, -- 'generated', 'submitted_review', 'approved', 'rejected', 'superseded', 'downloaded'
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Context
    details JSONB DEFAULT '{}', -- Additional context like IP, user agent, notes
    previous_status study_status,
    new_status study_status,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_audit_logs_study ON public.study_audit_logs(study_id);
CREATE INDEX IF NOT EXISTS idx_study_audit_logs_performed_at ON public.study_audit_logs(performed_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_audit_logs ENABLE ROW LEVEL SECURITY;

-- Studies: CPAs and executives can read/write for their org
CREATE POLICY "studies_org_access" ON public.studies
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Study Artifacts: Same as studies
CREATE POLICY "study_artifacts_org_access" ON public.study_artifacts
    FOR ALL USING (
        study_id IN (
            SELECT id FROM public.studies WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- Study Decisions: Same as studies
CREATE POLICY "study_decisions_org_access" ON public.study_decisions
    FOR ALL USING (
        study_id IN (
            SELECT id FROM public.studies WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- Study Audit Logs: Read-only for org members
CREATE POLICY "study_audit_logs_read" ON public.study_audit_logs
    FOR SELECT USING (
        study_id IN (
            SELECT id FROM public.studies WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get the latest approved study for a client/year
CREATE OR REPLACE FUNCTION get_latest_approved_study(
    p_client_company_id UUID,
    p_tax_year INTEGER
) RETURNS UUID AS $$
DECLARE
    v_study_id UUID;
BEGIN
    SELECT id INTO v_study_id
    FROM public.studies
    WHERE client_company_id = p_client_company_id
      AND tax_year = p_tax_year
      AND status = 'approved'
    ORDER BY version DESC
    LIMIT 1;
    
    RETURN v_study_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get next version number for a client/year
CREATE OR REPLACE FUNCTION get_next_study_version(
    p_client_company_id UUID,
    p_tax_year INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version), 0) INTO v_max_version
    FROM public.studies
    WHERE client_company_id = p_client_company_id
      AND tax_year = p_tax_year;
    
    RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark older approved studies as superseded
CREATE OR REPLACE FUNCTION supersede_older_studies(
    p_study_id UUID
) RETURNS VOID AS $$
DECLARE
    v_client_id UUID;
    v_tax_year INTEGER;
BEGIN
    SELECT client_company_id, tax_year INTO v_client_id, v_tax_year
    FROM public.studies WHERE id = p_study_id;
    
    UPDATE public.studies
    SET status = 'superseded',
        updated_at = NOW()
    WHERE client_company_id = v_client_id
      AND tax_year = v_tax_year
      AND status = 'approved'
      AND id != p_study_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock a study and all its decisions
CREATE OR REPLACE FUNCTION lock_study(
    p_study_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE public.studies
    SET locked = TRUE,
        locked_at = NOW(),
        locked_by = p_user_id,
        updated_at = NOW()
    WHERE id = p_study_id;
    
    UPDATE public.study_decisions
    SET locked = TRUE,
        updated_at = NOW()
    WHERE study_id = p_study_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_studies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS studies_updated_at ON public.studies;
CREATE TRIGGER studies_updated_at
    BEFORE UPDATE ON public.studies
    FOR EACH ROW
    EXECUTE FUNCTION update_studies_updated_at();

DROP TRIGGER IF EXISTS study_decisions_updated_at ON public.study_decisions;
CREATE TRIGGER study_decisions_updated_at
    BEFORE UPDATE ON public.study_decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_studies_updated_at();

-- ============================================================================
-- STORAGE BUCKET (run this in Supabase dashboard or via API)
-- ============================================================================
-- Note: Create a storage bucket named 'studies' with the following policy:
-- INSERT: authenticated users can upload to their org path
-- SELECT: authenticated users can download from their org path
-- DELETE: only service role

-- Example bucket creation (run in Supabase SQL or dashboard):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('studies', 'studies', false);

COMMENT ON TABLE public.studies IS 'Stores generated R&D tax credit studies with versioning and approval workflow';
COMMENT ON TABLE public.study_artifacts IS 'Stores file artifacts (Excel, ZIP, PDF) for each study';
COMMENT ON TABLE public.study_decisions IS 'Per-project decisions and notes for each study';
COMMENT ON TABLE public.study_audit_logs IS 'Audit trail for study lifecycle events';

