-- ============================================================================
-- Migration: Credit Estimates v1
-- Implements: Credit range drafting, senior signoff, exports, versioning
-- ============================================================================

-- ============================================================================
-- 1. Estimate Status and Methodology Enums
-- ============================================================================

CREATE TYPE credit_estimate_status AS ENUM (
    'draft',
    'pending_senior_signoff',
    'approved',
    'rejected',
    'superseded',
    'sent_to_client'
);

CREATE TYPE credit_methodology AS ENUM (
    'regular',
    'asc',
    'both'
);

CREATE TYPE estimate_export_type AS ENUM (
    'pdf',
    'docx'
);

CREATE TYPE signoff_decision AS ENUM (
    'approved',
    'rejected',
    'changes_requested'
);

CREATE TYPE signoff_reason_code AS ENUM (
    'sufficient_support',
    'insufficient_support',
    'material_uncertainty',
    'requires_more_evidence',
    'methodology_change',
    'other'
);

CREATE TYPE assumption_impact_direction AS ENUM (
    'increases',
    'decreases',
    'uncertain'
);

CREATE TYPE assumption_impact_band AS ENUM (
    'low',
    'medium',
    'high'
);

CREATE TYPE assumption_source AS ENUM (
    'system_default',
    'user_entered',
    'senior_override'
);

-- ============================================================================
-- 2. Credit Estimates Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    intake_session_id UUID,
    estimate_version INTEGER NOT NULL DEFAULT 1,
    status credit_estimate_status NOT NULL DEFAULT 'draft',
    methodology credit_methodology NOT NULL DEFAULT 'both',
    
    -- Range objects (JSONB containing wage_qre, supply_qre, contract_qre, total_qre, credit amounts)
    range_low JSONB NOT NULL DEFAULT '{}'::jsonb,
    range_base JSONB NOT NULL DEFAULT '{}'::jsonb,
    range_high JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Assumptions array
    assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Quality metrics
    data_completeness_score FLOAT NOT NULL DEFAULT 0,
    risk_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Range strategy settings
    range_strategy JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_by_user_id UUID NOT NULL,
    approved_by_user_id UUID,
    approved_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint on version per client+year
    UNIQUE(client_company_id, tax_year, estimate_version)
);

-- Indexes
CREATE INDEX idx_credit_estimates_org ON credit_estimates(organization_id);
CREATE INDEX idx_credit_estimates_client_year ON credit_estimates(client_company_id, tax_year);
CREATE INDEX idx_credit_estimates_status ON credit_estimates(status);
CREATE INDEX idx_credit_estimates_version ON credit_estimates(client_company_id, tax_year, estimate_version DESC);

-- ============================================================================
-- 3. Estimate Exports Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS estimate_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_estimate_id UUID NOT NULL REFERENCES credit_estimates(id) ON DELETE CASCADE,
    export_type estimate_export_type NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'estimate-exports',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_estimate_exports_estimate ON estimate_exports(credit_estimate_id);
CREATE INDEX idx_estimate_exports_type ON estimate_exports(export_type);

-- ============================================================================
-- 4. Estimate Signoffs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS estimate_signoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_estimate_id UUID NOT NULL REFERENCES credit_estimates(id) ON DELETE CASCADE,
    decision signoff_decision NOT NULL,
    reason_code signoff_reason_code NOT NULL,
    note TEXT NOT NULL,
    completion_method TEXT NOT NULL DEFAULT 'senior_override',
    modifications JSONB DEFAULT '{}'::jsonb,
    decided_by_user_id UUID NOT NULL,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_estimate_signoffs_estimate ON estimate_signoffs(credit_estimate_id);
CREATE INDEX idx_estimate_signoffs_decision ON estimate_signoffs(decision);

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE credit_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_signoffs ENABLE ROW LEVEL SECURITY;

-- Credit Estimates: Org CPA/Executive access
CREATE POLICY "credit_estimates_org_access" ON credit_estimates
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('cpa', 'executive', 'admin')
        )
    );

-- Estimate Exports: Access via parent estimate
CREATE POLICY "estimate_exports_org_access" ON estimate_exports
    FOR ALL TO authenticated
    USING (
        credit_estimate_id IN (
            SELECT ce.id FROM credit_estimates ce
            JOIN profiles p ON ce.organization_id = p.organization_id
            WHERE p.id = auth.uid()
        )
    );

-- Estimate Signoffs: Access via parent estimate
CREATE POLICY "estimate_signoffs_org_access" ON estimate_signoffs
    FOR ALL TO authenticated
    USING (
        credit_estimate_id IN (
            SELECT ce.id FROM credit_estimates ce
            JOIN profiles p ON ce.organization_id = p.organization_id
            WHERE p.id = auth.uid()
        )
    );

-- ============================================================================
-- 6. Update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_credit_estimate_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_credit_estimate_updated
    BEFORE UPDATE ON credit_estimates
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_estimate_timestamp();

-- ============================================================================
-- 7. Helper Function: Get Next Version
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_estimate_version(
    p_client_id UUID,
    p_tax_year INTEGER
) RETURNS INTEGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(estimate_version), 0) INTO max_version
    FROM credit_estimates
    WHERE client_company_id = p_client_id AND tax_year = p_tax_year;
    
    RETURN max_version + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. View: Latest Estimates per Client/Year
-- ============================================================================

CREATE OR REPLACE VIEW latest_credit_estimates AS
SELECT DISTINCT ON (client_company_id, tax_year)
    ce.*,
    c.name AS client_name,
    creator.full_name AS created_by_name,
    approver.full_name AS approved_by_name
FROM credit_estimates ce
LEFT JOIN client_companies c ON ce.client_company_id = c.id
LEFT JOIN profiles creator ON ce.created_by_user_id = creator.id
LEFT JOIN profiles approver ON ce.approved_by_user_id = approver.id
ORDER BY client_company_id, tax_year, estimate_version DESC;

-- ============================================================================
-- End Migration
-- ============================================================================
