-- ============================================================================
-- Migration: Review System v1
-- Implements: Post-ingestion Review experience with authority library,
--             findings tracking, and resolution audit trail
-- ============================================================================

-- ============================================================================
-- 1. Authority Library Table
-- Purpose: Store vetted IRS/legal references the system can cite
-- ============================================================================

CREATE TYPE authority_type_enum AS ENUM (
    'irc_section',
    'regulation', 
    'irs_guidance',
    'form_instruction',
    'case_law',
    'internal_policy'
);

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

-- Indexes for authority_library
CREATE INDEX idx_authority_library_citation_key ON authority_library(citation_key);
CREATE INDEX idx_authority_library_tags ON authority_library USING GIN(tags);
CREATE INDEX idx_authority_library_type ON authority_library(authority_type);

-- ============================================================================
-- 2. Review Findings Table
-- Purpose: Store all review anomalies flagged by automated checks
-- ============================================================================

CREATE TYPE review_finding_domain AS ENUM (
    'employees',
    'projects',
    'timesheets',
    'vendors',
    'contracts',
    'ap_transactions',
    'supplies',
    'section_174',
    'cross_domain'
);

CREATE TYPE review_finding_severity AS ENUM (
    'low',
    'medium',
    'high'
);

CREATE TYPE review_finding_status AS ENUM (
    'open',
    'in_review',
    'resolved_verified',
    'resolved_fixed',
    'resolved_escalated',
    'dismissed'
);

CREATE TABLE IF NOT EXISTS review_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    intake_session_id UUID REFERENCES client_intake_sessions(id),
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Composite unique constraint to prevent duplicates
    CONSTRAINT unique_finding_per_entity UNIQUE (client_company_id, tax_year, rule_id, entity_id)
);

-- Indexes for review_findings
CREATE INDEX idx_review_findings_client_year_status ON review_findings(client_company_id, tax_year, status);
CREATE INDEX idx_review_findings_rule_id ON review_findings(rule_id);
CREATE INDEX idx_review_findings_domain_severity ON review_findings(domain, severity);
CREATE INDEX idx_review_findings_org ON review_findings(organization_id);
CREATE INDEX idx_review_findings_intake ON review_findings(intake_session_id);

-- ============================================================================
-- 3. Finding Resolutions Table
-- Purpose: Durable resolution log per finding for audit defense
-- ============================================================================

CREATE TYPE resolution_type_enum AS ENUM (
    'verified_no_change',
    'field_updated',
    'client_evidence_requested',
    'task_created',
    'escalated_to_senior',
    'dismissed_with_reason'
);

CREATE TYPE resolution_completion_method AS ENUM (
    'manual_user_action',
    'ai_validated',
    'senior_override'
);

CREATE TABLE IF NOT EXISTS finding_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_finding_id UUID NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
    resolution_type resolution_type_enum NOT NULL,
    completion_method resolution_completion_method NOT NULL,
    resolution_note TEXT,
    changes JSONB DEFAULT '{}'::jsonb,
    artifacts JSONB DEFAULT '[]'::jsonb,
    resolved_by_user_id UUID NOT NULL,
    resolved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for finding_resolutions
CREATE INDEX idx_finding_resolutions_finding ON finding_resolutions(review_finding_id);
CREATE INDEX idx_finding_resolutions_resolver ON finding_resolutions(resolved_by_user_id);
CREATE INDEX idx_finding_resolutions_type ON finding_resolutions(resolution_type);

-- ============================================================================
-- 4. Review Configuration Table
-- Purpose: Org/client-level configurable thresholds for review rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID REFERENCES client_companies(id),
    config_key TEXT NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique per org or org+client
    CONSTRAINT unique_review_config UNIQUE (organization_id, client_company_id, config_key)
);

CREATE INDEX idx_review_config_org ON review_configurations(organization_id);
CREATE INDEX idx_review_config_client ON review_configurations(client_company_id);

-- ============================================================================
-- 5. Review Run History Table
-- Purpose: Track when reviews were run and their outcomes
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    intake_session_id UUID REFERENCES client_intake_sessions(id),
    run_by_user_id UUID NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    rules_executed INTEGER DEFAULT 0,
    findings_created INTEGER DEFAULT 0,
    findings_updated INTEGER DEFAULT 0,
    findings_by_severity JSONB DEFAULT '{}'::jsonb,
    findings_by_domain JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_runs_client ON review_runs(client_company_id, tax_year);

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

ALTER TABLE authority_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_runs ENABLE ROW LEVEL SECURITY;

-- Authority Library: Readable by all authenticated, editable by service role
CREATE POLICY "authority_library_read_all" ON authority_library
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authority_library_write_service" ON authority_library
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Review Findings: CPA/Executive can read/write their org data
CREATE POLICY "review_findings_org_access" ON review_findings
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Finding Resolutions: Access through finding's org
CREATE POLICY "finding_resolutions_org_access" ON finding_resolutions
    FOR ALL TO authenticated
    USING (
        review_finding_id IN (
            SELECT id FROM review_findings 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
    WITH CHECK (
        review_finding_id IN (
            SELECT id FROM review_findings 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Review Configurations: Org members can read, executives can write
CREATE POLICY "review_config_read" ON review_configurations
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "review_config_write" ON review_configurations
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('executive', 'admin')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('executive', 'admin')
        )
    );

-- Review Runs: Org access
CREATE POLICY "review_runs_org_access" ON review_runs
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- ============================================================================
-- 7. Seed Authority Library with Core References
-- ============================================================================

INSERT INTO authority_library (authority_type, citation_label, citation_key, summary, excerpt, url, tags) VALUES

-- IRC §41(d) - Four-Part Test
('irc_section', 'IRC §41(d)', 'IRC_41_D', 
'The Four-Part Test for Qualified Research Activities. Research must meet all four criteria: (1) Permitted Purpose, (2) Technological in Nature, (3) Elimination of Uncertainty, and (4) Process of Experimentation.',
'Research activities qualify for the credit only if they are undertaken for the purpose of discovering technological information, the application of which is intended to be useful in developing a new or improved business component, and substantially all activities constitute elements of a process of experimentation.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["four_part_test", "qualified_research", "experimentation", "uncertainty"]'::jsonb),

-- IRC §41(d)(1) - Permitted Purpose
('irc_section', 'IRC §41(d)(1) - Permitted Purpose', 'IRC_41_D_1',
'Activities must be for developing a new or improved business component (product, process, technique, formula, invention, or software) with improved function, performance, reliability, or quality.',
'Research is undertaken for the purpose of discovering information which is technological in nature, and the application of which is intended to be useful in the development of a new or improved business component.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["four_part_test", "permitted_purpose", "business_component"]'::jsonb),

-- IRC §41(d)(1) - Technological in Nature
('irc_section', 'IRC §41(d)(1) - Technological in Nature', 'IRC_41_D_1_TECH',
'Research must fundamentally rely on principles of physical sciences, biological sciences, engineering, or computer science.',
'Research activities must rely on principles of the physical or biological sciences, engineering, or computer science.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["four_part_test", "technological", "hard_sciences"]'::jsonb),

-- IRC §41(d)(1) - Elimination of Uncertainty  
('irc_section', 'IRC §41(d)(1) - Uncertainty', 'IRC_41_D_1_UNCERTAINTY',
'At the outset of the research, there must be uncertainty regarding capability, method, or design for achieving the result.',
'Activities intended to discover information to eliminate uncertainty concerning the development or improvement of a business component. Uncertainty exists if the information available does not establish capability, method, or appropriate design.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["four_part_test", "uncertainty", "technical_uncertainty"]'::jsonb),

-- IRC §41(d)(1) - Process of Experimentation
('irc_section', 'IRC §41(d)(1) - Experimentation', 'IRC_41_D_1_EXPERIMENTATION',
'Substantially all activities must constitute a systematic process of experimentation - evaluating alternatives through modeling, simulation, testing, or trial and error.',
'Substantially all of the activities constitute elements of a process of experimentation for a qualified purpose. Evaluation of alternatives through systematic trial and error or other methods.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["four_part_test", "experimentation", "systematic"]'::jsonb),

-- IRC §41(b) - QRE Components
('irc_section', 'IRC §41(b) - Qualified Research Expenses', 'IRC_41_B',
'QREs consist of in-house research expenses (wages for qualified services, supplies, computer use) and contract research expenses (65% of amounts paid to others for qualified research).',
'The term qualified research expenses means the sum of in-house research expenses and contract research expenses.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["qre", "wages", "supplies", "contract_research"]'::jsonb),

-- IRC §41(b)(1) - In-House Research Expenses (Wages)
('irc_section', 'IRC §41(b)(1) - Wages', 'IRC_41_B_1_WAGES',
'Wages for employees engaged in qualified research or direct supervision/support of qualified research are eligible QREs. Only the portion of time spent on qualified activities counts.',
'In-house research expenses include wages paid or incurred for qualified services performed by an employee.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["qre", "wages", "employees", "allocation"]'::jsonb),

-- IRC §41(b)(2) - Supplies
('irc_section', 'IRC §41(b)(2) - Supplies', 'IRC_41_B_2_SUPPLIES',
'Supplies used in the conduct of qualified research are eligible QREs. Supplies must be consumed or used up during research activities.',
'Any amount paid or incurred for supplies used in the conduct of qualified research.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["qre", "supplies", "consumables"]'::jsonb),

-- IRC §41(b)(3) - Contract Research (65% Rule)
('irc_section', 'IRC §41(b)(3) - Contract Research', 'IRC_41_B_3_CONTRACT',
'Only 65% of amounts paid to third parties for qualified research on behalf of the taxpayer are eligible as QREs. The taxpayer must retain substantial rights to the research results.',
'65 percent of any amount paid or incurred by the taxpayer to any person (other than an employee) for qualified research. The research must be performed on behalf of the taxpayer.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["qre", "contract_research", "65_percent_rule", "third_party"]'::jsonb),

-- IRC §41(d)(4) - Foreign Research Exclusion
('irc_section', 'IRC §41(d)(4) - Foreign Research', 'IRC_41_D_4_FOREIGN',
'Research conducted outside the United States, Puerto Rico, or US possessions does not qualify for the R&D credit, regardless of whether the taxpayer is domestic.',
'Qualified research does not include any research conducted outside the United States, the Commonwealth of Puerto Rico, or any possession of the United States.',
'https://www.law.cornell.edu/uscode/text/26/41',
'["foreign_research", "exclusion", "us_only"]'::jsonb),

-- IRC §174 - R&E Expenditures (Post-TCJA)
('irc_section', 'IRC §174 - R&E Capitalization', 'IRC_174',
'Post-TCJA (effective for tax years beginning after 2021), R&E expenditures must be capitalized and amortized over 5 years (domestic) or 15 years (foreign) rather than immediately expensed.',
'Research or experimental expenditures which are paid or incurred by the taxpayer during the taxable year shall be charged to capital account and amortized ratably over the 5-year period (15-year for foreign research).',
'https://www.law.cornell.edu/uscode/text/26/174',
'["section_174", "capitalization", "amortization", "tcja"]'::jsonb),

-- Regulation §1.41-4(a) - Qualified Research Definition
('regulation', 'Reg. §1.41-4(a) - Qualified Research', 'REG_1_41_4A',
'Treasury regulations providing detailed guidance on what constitutes qualified research, including the substantially all requirement and documentation standards.',
'Research activities qualify only if undertaken for discovering technological information whose application is useful in developing a new or improved business component.',
'https://www.law.cornell.edu/cfr/text/26/1.41-4',
'["regulation", "qualified_research", "documentation"]'::jsonb),

-- Regulation §1.41-2 - Qualified Research Expenses
('regulation', 'Reg. §1.41-2 - QRE Computation', 'REG_1_41_2',
'Regulations detailing computation of qualified research expenses, including allocation methods and substantiation requirements.',
'Detailed rules for determining in-house research expenses, contract research expenses, and basic research payments.',
'https://www.law.cornell.edu/cfr/text/26/1.41-2',
'["regulation", "qre", "computation", "allocation"]'::jsonb),

-- Form 6765 Instructions
('form_instruction', 'Form 6765 Instructions', 'FORM_6765_INST',
'Instructions for Form 6765 (Credit for Increasing Research Activities) providing guidance on computing and claiming the R&D tax credit.',
'Use Form 6765 to figure and claim the credit for increasing research activities (research credit) and the employer credit for paid family and medical leave.',
'https://www.irs.gov/instructions/i6765',
'["form_6765", "computation", "claiming", "documentation"]'::jsonb),

-- IRS Audit Guidance
('irs_guidance', 'IRS R&D Audit Guide', 'IRS_AUDIT_GUIDE',
'IRS guidance for examining R&D credit claims, including documentation requirements and common issues.',
'The IRS examiner should determine whether the taxpayer has adequately documented the four-part test for each claimed research activity.',
NULL,
'["audit", "documentation", "examination", "compliance"]'::jsonb),

-- Internal Policy - High Wage Verification
('internal_policy', 'High Wage Verification Policy', 'POLICY_HIGH_WAGE',
'Internal policy requiring manual verification of employees with wages exceeding threshold to ensure proper allocation documentation.',
'Employees with total compensation exceeding $500,000 require additional documentation and supervisor verification of R&D allocation percentages.',
NULL,
'["internal", "verification", "high_wage", "allocation"]'::jsonb),

-- Internal Policy - Foreign Vendor Review
('internal_policy', 'Foreign Vendor Review Policy', 'POLICY_FOREIGN_VENDOR',
'Internal policy for reviewing foreign vendor contracts to ensure compliance with IRC §41(d)(4) foreign research exclusion.',
'All vendor contracts involving work performed outside the US must be reviewed for potential foreign research exclusion under IRC §41(d)(4).',
NULL,
'["internal", "foreign_vendor", "review", "compliance"]'::jsonb)

ON CONFLICT (citation_key) DO UPDATE SET
    summary = EXCLUDED.summary,
    excerpt = EXCLUDED.excerpt,
    url = EXCLUDED.url,
    tags = EXCLUDED.tags,
    updated_at = NOW();

-- ============================================================================
-- 8. Default Review Configurations
-- ============================================================================

-- Note: These will be inserted per-org when review is first run
-- Keeping template here for reference:
-- INSERT INTO review_configurations (organization_id, config_key, config_value, description) VALUES
-- ('{org_id}', 'wage_outlier_threshold', '500000', 'Wage threshold for high-wage verification rule'),
-- ('{org_id}', 'large_transaction_threshold', '100000', 'Single transaction amount threshold for review'),
-- ('{org_id}', 'allocation_min_bound', '0.01', 'Minimum allocation percentage to flag as outlier'),
-- ('{org_id}', 'allocation_max_bound', '0.95', 'Maximum allocation percentage to flag as outlier'),
-- ('{org_id}', 'require_timesheets', 'false', 'Whether timesheets are required vs allocation method');

-- ============================================================================
-- 9. Update Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_review_finding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_review_findings_updated
    BEFORE UPDATE ON review_findings
    FOR EACH ROW
    EXECUTE FUNCTION update_review_finding_timestamp();

CREATE TRIGGER trigger_authority_library_updated
    BEFORE UPDATE ON authority_library
    FOR EACH ROW
    EXECUTE FUNCTION update_review_finding_timestamp();

-- ============================================================================
-- End Migration
-- ============================================================================
