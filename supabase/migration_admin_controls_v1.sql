-- ============================================================================
-- ADMIN CONTROLS: Authority Library, Org Settings, Feature Flags, Audit Exports
-- Migration: migration_admin_controls_v1.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE authority_change_type AS ENUM ('created', 'updated', 'deactivated', 'reactivated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_export_type AS ENUM ('audit_log_csv', 'defense_pack_zip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_export_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- ORG_SETTINGS TABLE (Normalized org-level configuration with versioning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.org_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Thresholds and defaults
    defaults JSONB NOT NULL DEFAULT '{
        "wage_outlier_threshold": 500000,
        "large_tx_threshold": 50000,
        "allocation_upper_bound": 0.95,
        "allocation_lower_bound": 0.01,
        "senior_required_credit_at_risk": 25000,
        "senior_required_qre_at_risk": 100000,
        "block_finalize_with_open_high_findings": true,
        "allow_preliminary_credit_export": false,
        "evidence_token_expiration_days": 14
    }'::jsonb,
    
    -- Feature flags
    feature_flags JSONB NOT NULL DEFAULT '{
        "enable_client_upload_portal": true,
        "enable_section_174_module": false,
        "enable_ai_narratives": true,
        "enable_auto_reprocessing": true,
        "enable_study_locking": true,
        "enable_credit_range_module": true
    }'::jsonb,
    
    -- Purchased sections (array of section codes)
    purchased_sections JSONB NOT NULL DEFAULT '["41"]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org ON public.org_settings(organization_id);

-- ============================================================================
-- AUTHORITY_CHANGE_LOG TABLE (Track all authority library modifications)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.authority_change_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    authority_id UUID NOT NULL,
    change_type authority_change_type NOT NULL,
    before_state JSONB,
    after_state JSONB,
    changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_change_log_authority ON public.authority_change_log(authority_id);
CREATE INDEX IF NOT EXISTS idx_authority_change_log_org ON public.authority_change_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_authority_change_log_changed_at ON public.authority_change_log(changed_at DESC);

-- ============================================================================
-- AUDIT_EXPORTS TABLE (Track generated export files)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_exports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE SET NULL,
    tax_year INTEGER,
    
    export_type audit_export_type NOT NULL,
    status audit_export_status NOT NULL DEFAULT 'queued',
    
    storage_bucket TEXT NOT NULL DEFAULT 'audit-exports',
    storage_path TEXT,
    sha256 TEXT,
    file_size_bytes BIGINT,
    
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    
    requested_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_exports_org ON public.audit_exports(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_client ON public.audit_exports(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_audit_exports_status ON public.audit_exports(status);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_exports ENABLE ROW LEVEL SECURITY;

-- Org Settings: Read for org members, write only for executive/admin
CREATE POLICY "org_settings_read" ON public.org_settings
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "org_settings_write" ON public.org_settings
    FOR ALL USING (
        organization_id IN (
            SELECT p.organization_id 
            FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.role IN ('executive', 'admin')
        )
    );

-- Authority Change Log: Read for org members (or all if global)
CREATE POLICY "authority_change_log_read" ON public.authority_change_log
    FOR SELECT USING (
        organization_id IS NULL OR
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Audit Exports: Read/write for org members with executive/admin role
CREATE POLICY "audit_exports_access" ON public.audit_exports
    FOR ALL USING (
        organization_id IN (
            SELECT p.organization_id 
            FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.role IN ('executive', 'admin', 'cpa')
        )
    );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_org_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_settings_updated ON public.org_settings;
CREATE TRIGGER trigger_org_settings_updated
    BEFORE UPDATE ON public.org_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_org_settings_timestamp();

CREATE OR REPLACE FUNCTION update_audit_exports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_exports_updated ON public.audit_exports;
CREATE TRIGGER trigger_audit_exports_updated
    BEFORE UPDATE ON public.audit_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_audit_exports_timestamp();

-- ============================================================================
-- HELPER FUNCTION: Get org settings with safe defaults
-- ============================================================================

CREATE OR REPLACE FUNCTION get_org_settings_with_defaults(p_organization_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    default_settings JSONB := '{
        "defaults": {
            "wage_outlier_threshold": 500000,
            "large_tx_threshold": 50000,
            "allocation_upper_bound": 0.95,
            "allocation_lower_bound": 0.01,
            "senior_required_credit_at_risk": 25000,
            "senior_required_qre_at_risk": 100000,
            "block_finalize_with_open_high_findings": true,
            "allow_preliminary_credit_export": false,
            "evidence_token_expiration_days": 14
        },
        "feature_flags": {
            "enable_client_upload_portal": true,
            "enable_section_174_module": false,
            "enable_ai_narratives": true,
            "enable_auto_reprocessing": true,
            "enable_study_locking": true,
            "enable_credit_range_module": true
        },
        "purchased_sections": ["41"]
    }'::jsonb;
BEGIN
    SELECT jsonb_build_object(
        'id', id,
        'organization_id', organization_id,
        'defaults', defaults,
        'feature_flags', feature_flags,
        'purchased_sections', purchased_sections,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO result
    FROM public.org_settings
    WHERE organization_id = p_organization_id;
    
    IF result IS NULL THEN
        -- Return defaults if no settings exist
        RETURN default_settings;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

