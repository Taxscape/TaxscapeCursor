-- ============================================================================
-- FIX MIGRATION ERRORS
-- Run this BEFORE running the migrations, or after if you got errors
-- ============================================================================

-- ============================================================================
-- 1. Create missing enum types (if not exists)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE authority_type_enum AS ENUM (
        'irc_section', 'regulation', 'irs_guidance', 
        'form_instruction', 'case_law', 'internal_policy'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE review_finding_domain AS ENUM (
        'employees', 'projects', 'timesheets', 'vendors', 
        'contracts', 'ap_transactions', 'supplies', 'section_174', 'cross_domain'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE review_finding_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE review_finding_status AS ENUM (
        'open', 'in_review', 'resolved_verified', 
        'resolved_fixed', 'resolved_escalated', 'dismissed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE finding_resolution_type AS ENUM (
        'verified_no_change', 'field_updated', 'client_evidence_requested',
        'task_created', 'escalated_to_senior', 'dismissed_with_reason'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE completion_method_enum AS ENUM (
        'manual_user_action', 'ai_validated', 'senior_override'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. Drop problematic RLS policies that reference non-existent columns
-- (Wrapped in DO blocks to handle cases where tables don't exist)
-- ============================================================================

DO $$ BEGIN
    DROP POLICY IF EXISTS "review_config_write" ON review_configurations;
EXCEPTION WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "review_config_read" ON review_configurations;
EXCEPTION WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "credit_estimates_org_access" ON credit_estimates;
EXCEPTION WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "estimate_exports_org_access" ON estimate_exports;
EXCEPTION WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "estimate_signoffs_org_access" ON estimate_signoffs;
EXCEPTION WHEN undefined_table THEN null;
END $$;

-- ============================================================================
-- 3. Drop duplicate indexes (if they exist)
-- ============================================================================

DROP INDEX IF EXISTS idx_upload_tokens_hash;

-- ============================================================================
-- 4. Create tables if they don't exist (safe creates)
-- ============================================================================

-- Authority Library
CREATE TABLE IF NOT EXISTS authority_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_type authority_type_enum NOT NULL,
    citation_label TEXT NOT NULL,
    citation_key TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    excerpt TEXT,
    url TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review Findings
CREATE TABLE IF NOT EXISTS review_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    intake_session_id UUID,
    domain review_finding_domain NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    rule_id TEXT NOT NULL,
    severity review_finding_severity NOT NULL DEFAULT 'medium',
    status review_finding_status NOT NULL DEFAULT 'open',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommended_actions JSONB DEFAULT '[]'::jsonb,
    authority_refs JSONB DEFAULT '[]'::jsonb,
    estimated_impact JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finding Resolutions
CREATE TABLE IF NOT EXISTS finding_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_finding_id UUID NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
    resolution_type finding_resolution_type NOT NULL,
    completion_method completion_method_enum NOT NULL,
    resolution_note TEXT,
    changes JSONB DEFAULT '{}'::jsonb,
    artifacts JSONB DEFAULT '[]'::jsonb,
    resolved_by_user_id UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review Configurations
CREATE TABLE IF NOT EXISTS review_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID REFERENCES client_companies(id),
    wage_outlier_threshold INTEGER DEFAULT 500000,
    large_transaction_threshold INTEGER DEFAULT 50000,
    allowable_allocation_bounds JSONB DEFAULT '{"lower": 0.01, "upper": 0.95}'::jsonb,
    timesheets_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, client_company_id)
);

-- Review Runs
CREATE TABLE IF NOT EXISTS review_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    intake_session_id UUID,
    run_by_user_id UUID REFERENCES profiles(id),
    findings_count INTEGER DEFAULT 0,
    high_severity_count INTEGER DEFAULT 0,
    qre_at_risk_total NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit Estimates
CREATE TABLE IF NOT EXISTS credit_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    estimate_version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    methodology TEXT DEFAULT 'standard',
    range_low JSONB DEFAULT '{}'::jsonb,
    range_base JSONB DEFAULT '{}'::jsonb,
    range_high JSONB DEFAULT '{}'::jsonb,
    assumptions JSONB DEFAULT '[]'::jsonb,
    data_completeness_score NUMERIC DEFAULT 0,
    risk_notes JSONB DEFAULT '[]'::jsonb,
    missing_inputs JSONB DEFAULT '[]'::jsonb,
    created_by_user_id UUID REFERENCES profiles(id),
    approved_by_user_id UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estimate Exports
CREATE TABLE IF NOT EXISTS estimate_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_estimate_id UUID NOT NULL REFERENCES credit_estimates(id) ON DELETE CASCADE,
    export_type TEXT NOT NULL,
    storage_bucket TEXT DEFAULT 'estimate-exports',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Estimate Signoffs
CREATE TABLE IF NOT EXISTS estimate_signoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_estimate_id UUID NOT NULL REFERENCES credit_estimates(id) ON DELETE CASCADE,
    decision TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    note TEXT,
    completion_method TEXT NOT NULL DEFAULT 'senior_override',
    decided_by_user_id UUID REFERENCES profiles(id),
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. Create indexes (if not exists)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_authority_library_citation_key ON authority_library(citation_key);
CREATE INDEX IF NOT EXISTS idx_authority_library_tags ON authority_library USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_authority_library_type ON authority_library(authority_type);

CREATE INDEX IF NOT EXISTS idx_review_findings_client_year_status ON review_findings(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_review_findings_rule_id ON review_findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_review_findings_domain_severity ON review_findings(domain, severity);

CREATE INDEX IF NOT EXISTS idx_finding_resolutions_finding_id ON finding_resolutions(review_finding_id);

CREATE INDEX IF NOT EXISTS idx_review_runs_client_year ON review_runs(client_company_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_credit_estimates_client_year ON credit_estimates(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_credit_estimates_status ON credit_estimates(status);

-- ============================================================================
-- 6. Enable RLS on tables
-- ============================================================================

ALTER TABLE authority_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_signoffs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. Create simple RLS policies (org-based access without role checks)
-- ============================================================================

-- Authority Library: Readable by all authenticated users
CREATE POLICY "authority_library_read" ON authority_library
    FOR SELECT TO authenticated USING (true);

-- Authority Library: Writable by service role only (admin via backend)
CREATE POLICY "authority_library_service_write" ON authority_library
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Review Findings: Org access
CREATE POLICY "review_findings_org_access" ON review_findings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Finding Resolutions: Access via finding
CREATE POLICY "finding_resolutions_access" ON finding_resolutions
    FOR ALL TO authenticated
    USING (review_finding_id IN (
        SELECT id FROM review_findings 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Review Configurations: Org access
CREATE POLICY "review_config_org_access" ON review_configurations
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Review Runs: Org access
CREATE POLICY "review_runs_org_access" ON review_runs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Credit Estimates: Org access
CREATE POLICY "credit_estimates_org_access" ON credit_estimates
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Estimate Exports: Access via estimate
CREATE POLICY "estimate_exports_access" ON estimate_exports
    FOR ALL TO authenticated
    USING (credit_estimate_id IN (
        SELECT id FROM credit_estimates 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Estimate Signoffs: Access via estimate
CREATE POLICY "estimate_signoffs_access" ON estimate_signoffs
    FOR ALL TO authenticated
    USING (credit_estimate_id IN (
        SELECT id FROM credit_estimates 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- ============================================================================
-- 8. Seed Authority Library (if empty)
-- ============================================================================

INSERT INTO authority_library (authority_type, citation_label, citation_key, summary, excerpt, tags)
SELECT * FROM (VALUES
    ('irc_section'::authority_type_enum, 'IRC §41(d) - Qualified Research', 'IRC_41_D', 
     'Defines the four-part test for qualified research activities',
     'Research activities must meet: (1) permitted purpose, (2) technological in nature, (3) elimination of uncertainty, (4) process of experimentation',
     '["four_part_test", "qualified_research", "r&d_credit"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(b) - QRE Components', 'IRC_41_B',
     'Defines qualified research expenditures including wages, supplies, and contract research',
     'QRE includes: in-house research expenses (wages for qualified services, supplies used in research) and contract research expenses (65% of amounts paid)',
     '["qre", "wages", "supplies", "contract_research"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(b)(3) - Contract Research 65% Rule', 'IRC_41_B_3',
     '65% of contract research payments qualify as QRE',
     'Only 65 percent of any amount paid or incurred by the taxpayer to any person for qualified research shall be treated as qualified research expenses',
     '["contract_research", "65_percent", "qre"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §174 - R&E Expenditures', 'IRC_174',
     'Post-TCJA rules requiring capitalization of R&E expenditures over 5 years (domestic) or 15 years (foreign)',
     'Research and experimental expenditures paid or incurred in taxable years beginning after December 31, 2021, must be capitalized and amortized',
     '["section_174", "capitalization", "amortization"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(d)(4) - Foreign Research Exclusion', 'IRC_41_D_4',
     'Research conducted outside the United States does not qualify for the R&D credit',
     'Qualified research shall not include any research conducted outside the United States, the Commonwealth of Puerto Rico, or any possession of the United States',
     '["foreign_research", "exclusion", "domestic_only"]'::jsonb),
    
    ('form_instruction'::authority_type_enum, 'Form 6765 - Credit for Increasing Research Activities', 'FORM_6765',
     'IRS form for computing and claiming the R&D tax credit',
     'Use Form 6765 to figure and claim the credit for increasing research activities, to elect the reduced credit under section 280C, and to elect the payroll tax credit',
     '["form_6765", "credit_computation", "filing"]'::jsonb)
) AS v(authority_type, citation_label, citation_key, summary, excerpt, tags)
WHERE NOT EXISTS (SELECT 1 FROM authority_library LIMIT 1);

-- ============================================================================
-- DONE - Now you can run the remaining migrations
-- ============================================================================

SELECT 'FIX_MIGRATION_ERRORS completed successfully' AS status;
