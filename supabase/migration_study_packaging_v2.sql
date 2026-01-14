-- ============================================================================
-- STUDY PACKAGING V2: Finalization, Versioned Artifacts, Readiness Checks, Locking
-- Migration: migration_study_packaging_v2.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE study_v2_status AS ENUM (
        'draft',
        'ready_for_finalization',
        'finalizing',
        'final',
        'complete',
        'superseded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE study_artifact_v2_type AS ENUM (
        'excel_study_workbook',
        'form_6765_export',
        'section_41_narratives_docx',
        'section_174_narratives_docx',
        'project_narrative_packets_zip',
        'client_cover_summary_pdf',
        'client_package_zip'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE study_artifact_gen_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE study_signoff_decision AS ENUM ('approved', 'rejected', 'changes_requested');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE study_signoff_reason AS ENUM (
        'all_findings_resolved',
        'senior_override_allowed',
        'documentation_sufficient',
        'documentation_insufficient',
        'client_scope_change',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STUDIES_V2 TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studies_v2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL,

    study_version INTEGER NOT NULL DEFAULT 1,
    status study_v2_status NOT NULL DEFAULT 'draft',

    intake_session_id UUID,
    approved_credit_estimate_id UUID,

    finalized_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    finalized_at TIMESTAMP WITH TIME ZONE,
    locked_at TIMESTAMP WITH TIME ZONE,
    lock_reason TEXT,

    snapshot_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(client_company_id, tax_year, study_version)
);

CREATE INDEX IF NOT EXISTS idx_studies_v2_client_year ON public.studies_v2(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_studies_v2_org ON public.studies_v2(organization_id);

-- Helper function to get next version
CREATE OR REPLACE FUNCTION get_next_study_v2_version(
    p_client_company_id UUID,
    p_tax_year INTEGER
) RETURNS INTEGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(study_version), 0) INTO max_version
    FROM public.studies_v2
    WHERE client_company_id = p_client_company_id AND tax_year = p_tax_year;

    RETURN max_version + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STUDY_ARTIFACTS_V2 TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_artifacts_v2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies_v2(id) ON DELETE CASCADE NOT NULL,
    artifact_type study_artifact_v2_type NOT NULL,

    generation_status study_artifact_gen_status NOT NULL DEFAULT 'queued',
    error TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    storage_bucket TEXT NOT NULL DEFAULT 'study-artifacts',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    page_count INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(study_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_study_artifacts_v2_study ON public.study_artifacts_v2(study_id);
CREATE INDEX IF NOT EXISTS idx_study_artifacts_v2_status ON public.study_artifacts_v2(generation_status);

-- ============================================================================
-- STUDY_SIGNOFFS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_signoffs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies_v2(id) ON DELETE CASCADE NOT NULL,
    decision study_signoff_decision NOT NULL,
    reason_code study_signoff_reason NOT NULL,
    note TEXT NOT NULL,
    completion_method TEXT NOT NULL DEFAULT 'senior_override',
    decided_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_signoffs_study ON public.study_signoffs(study_id);

-- ============================================================================
-- STUDY_FINALIZATION_CHECKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_finalization_checks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    blocking_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    computed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_study_finalization_checks_client_year ON public.study_finalization_checks(client_company_id, tax_year, computed_at DESC);

-- ============================================================================
-- OPTIONAL: STUDY DELIVERY EMAIL DRAFTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_delivery_email_drafts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES public.studies_v2(id) ON DELETE CASCADE NOT NULL,
    to_email TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    marked_sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_study_delivery_email_study ON public.study_delivery_email_drafts(study_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.studies_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_artifacts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_finalization_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_delivery_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studies_v2_org_access" ON public.studies_v2
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "study_artifacts_v2_org_access" ON public.study_artifacts_v2
    FOR ALL USING (
        study_id IN (
            SELECT id FROM public.studies_v2 WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "study_signoffs_org_access" ON public.study_signoffs
    FOR ALL USING (
        study_id IN (
            SELECT id FROM public.studies_v2 WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "study_finalization_checks_org_access" ON public.study_finalization_checks
    FOR ALL USING (
        client_company_id IN (
            SELECT cc.id
            FROM public.client_companies cc
            JOIN public.profiles p ON p.organization_id = cc.organization_id
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "study_delivery_email_org_access" ON public.study_delivery_email_drafts
    FOR ALL USING (
        study_id IN (
            SELECT id FROM public.studies_v2 WHERE organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_studies_v2_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_studies_v2_updated ON public.studies_v2;
CREATE TRIGGER trigger_studies_v2_updated
    BEFORE UPDATE ON public.studies_v2
    FOR EACH ROW
    EXECUTE FUNCTION update_studies_v2_timestamp();

