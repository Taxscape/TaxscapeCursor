-- ============================================================================
-- COMPLETE MIGRATION - ALL PROMPTS 7-15 COMBINED
-- ============================================================================
-- Run this ONCE in Supabase SQL Editor to set up everything
-- This file is IDEMPOTENT - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE ALL ENUM TYPES
-- ============================================================================

-- Onboarding status (Prompt 7)
DO $$ BEGIN
    CREATE TYPE onboarding_session_status AS ENUM ('started', 'in_progress', 'completed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Intake template types (Prompt 8)
DO $$ BEGIN
    CREATE TYPE intake_template_type AS ENUM (
        'data_request_master', 'projects_questionnaire', 'employee_payroll_template',
        'timesheet_template', 'vendors_contracts_template', 'ap_transactions_template',
        'supplies_template', 'section_174_info_request'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Authority types (Prompt 10)
DO $$ BEGIN
    CREATE TYPE authority_type_enum AS ENUM (
        'irc_section', 'regulation', 'irs_guidance', 
        'form_instruction', 'case_law', 'internal_policy'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Review finding enums (Prompt 10)
DO $$ BEGIN
    CREATE TYPE review_finding_domain AS ENUM (
        'employees', 'projects', 'timesheets', 'vendors', 
        'contracts', 'ap_transactions', 'supplies', 'section_174', 'cross_domain'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE review_finding_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE review_finding_status AS ENUM (
        'open', 'in_review', 'resolved_verified', 
        'resolved_fixed', 'resolved_escalated', 'dismissed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE finding_resolution_type AS ENUM (
        'verified_no_change', 'field_updated', 'client_evidence_requested',
        'task_created', 'escalated_to_senior', 'dismissed_with_reason'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE completion_method_enum AS ENUM (
        'manual_user_action', 'ai_validated', 'senior_override'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Escalation enums (Prompt 11)
DO $$ BEGIN
    CREATE TYPE escalation_source_type AS ENUM ('review_finding', 'intake_mapping', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE escalation_status AS ENUM (
        'pending', 'assigned', 'in_review', 'resolved', 'returned', 'dismissed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE escalation_decision AS ENUM (
        'approve', 'override', 'request_evidence', 'return_guidance', 'dismiss'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE escalation_reason_code AS ENUM (
        'materiality_threshold', 'client_confirmation_received', 'documentation_sufficient',
        'additional_evidence_required', 'scope_clarification_needed', 'senior_judgment_applied',
        'calculation_verified', 'risk_accepted', 'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Evidence enums (Prompt 12)
DO $$ BEGIN
    CREATE TYPE evidence_request_status AS ENUM (
        'draft', 'sent', 'partially_received', 'complete', 'expired', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE evidence_file_status AS ENUM (
        'uploaded', 'linked', 'rejected', 'archived'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reprocessing_status AS ENUM (
        'queued', 'running', 'completed', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Credit estimate enums (Prompt 13)
DO $$ BEGIN
    CREATE TYPE credit_estimate_status AS ENUM (
        'draft', 'pending_review', 'approved', 'rejected', 'superseded'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE estimate_signoff_decision AS ENUM (
        'approved', 'rejected', 'changes_requested'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Study v2 enums (Prompt 14)
DO $$ BEGIN
    CREATE TYPE study_v2_status AS ENUM (
        'draft', 'ready_for_finalization', 'finalizing', 'final', 'complete', 'superseded'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE study_artifact_v2_type AS ENUM (
        'excel_study_workbook', 'form_6765_export', 'section_41_narratives_docx',
        'section_174_narratives_docx', 'project_narrative_packets_zip',
        'client_cover_summary_pdf', 'client_package_zip'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE study_artifact_gen_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE study_signoff_decision AS ENUM ('approved', 'rejected', 'changes_requested');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE study_signoff_reason AS ENUM (
        'all_findings_resolved', 'senior_override_allowed', 'documentation_sufficient',
        'documentation_insufficient', 'client_scope_change', 'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admin enums (Prompt 15)
DO $$ BEGIN
    CREATE TYPE authority_change_type AS ENUM ('created', 'updated', 'deactivated', 'reactivated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE audit_export_type AS ENUM ('audit_log_csv', 'defense_pack_zip');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE audit_export_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- PART 2: EXTEND EXISTING TABLES
-- ============================================================================

-- ----- Profiles extensions (Prompt 7) -----
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_seen_onboarding BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience_level TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_session_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_last_seen_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_level TEXT;

-- ----- Client Companies extensions (Prompt 8) -----
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS purchased_sections JSONB DEFAULT '{"section_41": true, "section_174": false}';
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS study_scope TEXT;
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS intake_mode TEXT DEFAULT 'portal_upload_only';
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS has_vendors_expected BOOLEAN DEFAULT TRUE;
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS engagement_status TEXT DEFAULT 'setup';

-- ----- Employees extensions (Prompt 9) -----
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_year TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location_state TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w2_wages DECIMAL(15, 2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS stock_compensation DECIMAL(15, 2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS severance DECIMAL(15, 2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bonus DECIMAL(15, 2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_external_id TEXT;

-- ----- Projects extensions (Prompt 9) -----
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tax_year TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_owner TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_contact TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category TEXT;

-- ----- Time Logs extensions (Prompt 9) - if table exists -----
DO $$ BEGIN
    ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS tax_year TEXT;
    ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'timesheet';
    ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS period_start DATE;
    ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS period_end DATE;
    ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS allocation_method TEXT;
EXCEPTION WHEN undefined_table THEN null; END $$;

-- ----- Contractors extensions (Prompt 9) -----
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS tax_year TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States';
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS risk_bearer TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS ip_rights TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS is_foreign_research BOOLEAN DEFAULT FALSE;

-- ----- Expenses extensions (Prompt 9) -----
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_year TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gl_account TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rd_category TEXT;

-- ============================================================================
-- PART 3: CREATE NEW TABLES - PROMPT 7 (ONBOARDING)
-- ============================================================================

CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE SET NULL,
    tax_years JSONB DEFAULT '[]'::jsonb,
    purchased_sections JSONB DEFAULT '{}'::jsonb,
    study_scope TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_step_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    onboarding_session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    completion_method TEXT,
    completed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: CREATE NEW TABLES - PROMPT 8 (INTAKE PACKAGE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intake_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_years JSONB NOT NULL DEFAULT '[]',
    template_type TEXT NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1,
    storage_bucket TEXT NOT NULL DEFAULT 'intake-templates',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size_bytes INTEGER,
    status TEXT DEFAULT 'active',
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}' NOT NULL,
    UNIQUE(client_company_id, template_type, template_version)
);

CREATE TABLE IF NOT EXISTS intake_email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_years JSONB NOT NULL DEFAULT '[]',
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    to_recipients JSONB DEFAULT '[]' NOT NULL,
    cc_recipients JSONB DEFAULT '[]' NOT NULL,
    bcc_recipients JSONB DEFAULT '[]' NOT NULL,
    attachment_template_ids JSONB DEFAULT '[]' NOT NULL,
    status TEXT DEFAULT 'draft',
    marked_sent_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}' NOT NULL
);

CREATE TABLE IF NOT EXISTS client_intake_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_years JSONB NOT NULL DEFAULT '[]',
    status TEXT DEFAULT 'open',
    expected_inputs JSONB DEFAULT '{}' NOT NULL,
    received_files JSONB DEFAULT '[]' NOT NULL,
    received_files_count INTEGER DEFAULT 0,
    parsed_summary JSONB DEFAULT '{}',
    source_onboarding_session_id UUID,
    source_email_draft_id UUID REFERENCES intake_email_drafts(id) ON DELETE SET NULL,
    template_ids JSONB DEFAULT '[]' NOT NULL,
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}' NOT NULL
);

CREATE TABLE IF NOT EXISTS intake_upload_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    intake_session_id UUID REFERENCES client_intake_sessions(id) ON DELETE CASCADE,
    tax_years JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    max_uses INTEGER DEFAULT 100,
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    uploads_per_hour INTEGER DEFAULT 20,
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- ============================================================================
-- PART 5: CREATE NEW TABLES - PROMPT 9 (INTAKE INGESTION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intake_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_intake_session_id UUID REFERENCES client_intake_sessions(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    uploaded_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'intake-files',
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes INTEGER,
    sha256 TEXT NOT NULL,
    upload_source TEXT DEFAULT 'portal_upload',
    classification_domain TEXT DEFAULT 'unknown',
    classification_confidence FLOAT DEFAULT 0,
    classification_reason TEXT,
    classification_method TEXT DEFAULT 'heuristic',
    status TEXT DEFAULT 'uploaded',
    parse_error TEXT,
    parse_summary JSONB DEFAULT '{}',
    sheet_names JSONB DEFAULT '[]',
    header_row JSONB DEFAULT '[]',
    preview_data JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intake_file_id UUID REFERENCES intake_files(id) ON DELETE CASCADE NOT NULL,
    mapping_type TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    prompt TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    options JSONB DEFAULT '[]',
    resolution JSONB,
    resolved_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    vendor_name TEXT,
    contract_name TEXT,
    contract_type TEXT,
    effective_date DATE,
    expiration_date DATE,
    contract_value DECIMAL(15, 2),
    risk_bearer TEXT,
    ip_rights TEXT,
    scope_of_work TEXT,
    storage_bucket TEXT,
    storage_path TEXT,
    tax_year TEXT,
    needs_review BOOLEAN DEFAULT TRUE,
    source_intake_file_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    item_name TEXT NOT NULL,
    description TEXT,
    vendor_name TEXT,
    vendor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    project_name TEXT,
    amount DECIMAL(15, 2),
    purchase_date DATE,
    consumed BOOLEAN DEFAULT TRUE,
    capitalized BOOLEAN DEFAULT FALSE,
    rd_qualified BOOLEAN DEFAULT TRUE,
    qualification_status TEXT DEFAULT 'pending',
    tax_year TEXT,
    source_intake_file_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS section_174_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year TEXT NOT NULL,
    has_software_development BOOLEAN,
    software_dev_nature TEXT,
    dev_vs_maintenance_ratio TEXT,
    has_foreign_development BOOLEAN,
    labor_us DECIMAL(15, 2),
    labor_foreign DECIMAL(15, 2),
    supplies_total DECIMAL(15, 2),
    contract_research_us DECIMAL(15, 2),
    contract_research_foreign DECIMAL(15, 2),
    book_treatment TEXT,
    currently_capitalized_costs BOOLEAN,
    has_167f_software_amortization BOOLEAN,
    has_patent_acquisition_costs BOOLEAN,
    responses JSONB DEFAULT '{}',
    source_intake_file_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 6: CREATE NEW TABLES - PROMPT 10 (REVIEW SYSTEM)
-- ============================================================================

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

-- ============================================================================
-- PART 7: CREATE NEW TABLES - PROMPT 11 (ESCALATIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS escalation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    source_type escalation_source_type NOT NULL,
    source_id UUID,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity review_finding_severity NOT NULL DEFAULT 'medium',
    estimated_impact JSONB DEFAULT '{}'::jsonb,
    proposed_action JSONB DEFAULT '{}'::jsonb,
    authority_refs JSONB DEFAULT '[]'::jsonb,
    status escalation_status NOT NULL DEFAULT 'pending',
    assigned_to_user_id UUID REFERENCES profiles(id),
    created_by_user_id UUID REFERENCES profiles(id),
    decision escalation_decision,
    decision_reason_code escalation_reason_code,
    decision_note TEXT,
    decided_by_user_id UUID REFERENCES profiles(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 8: CREATE NEW TABLES - PROMPT 12 (EVIDENCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    request_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    requested_items JSONB DEFAULT '[]'::jsonb,
    linked_finding_id UUID REFERENCES review_findings(id),
    linked_mapping_id UUID,
    linked_task_id UUID,
    status evidence_request_status NOT NULL DEFAULT 'draft',
    due_date DATE,
    created_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_upload_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_request_id UUID NOT NULL REFERENCES evidence_requests(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER DEFAULT 10,
    use_count INTEGER DEFAULT 0,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    evidence_request_id UUID REFERENCES evidence_requests(id),
    storage_bucket TEXT DEFAULT 'evidence-files',
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT,
    sha256 TEXT,
    status evidence_file_status NOT NULL DEFAULT 'uploaded',
    linked_finding_id UUID REFERENCES review_findings(id),
    linked_task_id UUID,
    linked_entity_type TEXT,
    linked_entity_id UUID,
    uploaded_by_user_id UUID REFERENCES profiles(id),
    uploaded_via TEXT DEFAULT 'portal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reprocessing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_id UUID,
    affected_rules JSONB DEFAULT '[]'::jsonb,
    status reprocessing_status NOT NULL DEFAULT 'queued',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    results JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 9: CREATE NEW TABLES - PROMPT 13 (CREDIT ESTIMATES)
-- ============================================================================

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
-- PART 10: CREATE NEW TABLES - PROMPT 14 (STUDY PACKAGING)
-- ============================================================================

CREATE TABLE IF NOT EXISTS studies_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    study_version INTEGER NOT NULL DEFAULT 1,
    status study_v2_status NOT NULL DEFAULT 'draft',
    intake_session_id UUID,
    approved_credit_estimate_id UUID REFERENCES credit_estimates(id),
    finalized_by_user_id UUID REFERENCES profiles(id),
    finalized_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    lock_reason TEXT,
    snapshot_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_company_id, tax_year, study_version)
);

CREATE TABLE IF NOT EXISTS study_artifacts_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies_v2(id) ON DELETE CASCADE,
    artifact_type study_artifact_v2_type NOT NULL,
    generation_status study_artifact_gen_status NOT NULL DEFAULT 'queued',
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    storage_bucket TEXT DEFAULT 'study-artifacts',
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    page_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(study_id, artifact_type)
);

CREATE TABLE IF NOT EXISTS study_signoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies_v2(id) ON DELETE CASCADE,
    decision study_signoff_decision NOT NULL,
    reason_code study_signoff_reason NOT NULL,
    note TEXT NOT NULL,
    completion_method TEXT NOT NULL DEFAULT 'senior_override',
    decided_by_user_id UUID REFERENCES profiles(id),
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_finalization_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    checks JSONB DEFAULT '[]'::jsonb,
    blocking_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    computed_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_company_id, tax_year)
);

CREATE TABLE IF NOT EXISTS study_delivery_email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies_v2(id) ON DELETE CASCADE,
    to_email TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    marked_sent_at TIMESTAMPTZ
);

-- ============================================================================
-- PART 11: CREATE NEW TABLES - PROMPT 15 (ADMIN CONTROLS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
    feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    purchased_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authority_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    authority_id UUID NOT NULL,
    change_type authority_change_type NOT NULL,
    before JSONB,
    after JSONB,
    changed_by_user_id UUID REFERENCES profiles(id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID REFERENCES client_companies(id),
    tax_year INTEGER,
    export_type audit_export_type NOT NULL,
    status audit_export_status NOT NULL DEFAULT 'queued',
    error TEXT,
    storage_bucket TEXT DEFAULT 'audit-exports',
    storage_path TEXT NOT NULL,
    sha256 TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_by_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 12: CREATE ALL INDEXES
-- ============================================================================

-- Onboarding indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_org_id ON onboarding_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_logs_session ON onboarding_step_logs(onboarding_session_id, step_key);

-- Intake Package indexes
CREATE INDEX IF NOT EXISTS idx_intake_templates_org ON intake_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_templates_client ON intake_templates(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_email_drafts_org ON intake_email_drafts(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_email_drafts_client ON intake_email_drafts(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_org ON client_intake_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_client ON client_intake_sessions(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON client_intake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_hash ON intake_upload_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_client ON intake_upload_tokens(client_company_id);

-- Intake Ingestion indexes
CREATE INDEX IF NOT EXISTS idx_intake_files_session ON intake_files(client_intake_session_id);
CREATE INDEX IF NOT EXISTS idx_intake_files_sha256 ON intake_files(sha256);
CREATE INDEX IF NOT EXISTS idx_intake_files_domain_status ON intake_files(classification_domain, status);
CREATE INDEX IF NOT EXISTS idx_intake_mappings_file ON intake_mappings(intake_file_id);
CREATE INDEX IF NOT EXISTS idx_intake_mappings_status ON intake_mappings(status);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_company_id);
CREATE INDEX IF NOT EXISTS idx_supplies_org ON supplies(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplies_client ON supplies(client_company_id);
CREATE INDEX IF NOT EXISTS idx_174_responses_client ON section_174_responses(client_company_id, tax_year);

-- Review System indexes
CREATE INDEX IF NOT EXISTS idx_authority_library_citation_key ON authority_library(citation_key);
CREATE INDEX IF NOT EXISTS idx_authority_library_tags ON authority_library USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_authority_library_type ON authority_library(authority_type);
CREATE INDEX IF NOT EXISTS idx_review_findings_client_year_status ON review_findings(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_review_findings_rule_id ON review_findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_review_findings_domain_severity ON review_findings(domain, severity);
CREATE INDEX IF NOT EXISTS idx_finding_resolutions_finding_id ON finding_resolutions(review_finding_id);
CREATE INDEX IF NOT EXISTS idx_review_runs_client_year ON review_runs(client_company_id, tax_year);

-- Escalation indexes
CREATE INDEX IF NOT EXISTS idx_escalation_requests_client_year ON escalation_requests(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_escalation_requests_status ON escalation_requests(status);
CREATE INDEX IF NOT EXISTS idx_escalation_requests_assigned ON escalation_requests(assigned_to_user_id);

-- Evidence indexes
CREATE INDEX IF NOT EXISTS idx_evidence_requests_client ON evidence_requests(client_company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_requests_status ON evidence_requests(status);
CREATE INDEX IF NOT EXISTS idx_evidence_files_request ON evidence_files(evidence_request_id);
CREATE INDEX IF NOT EXISTS idx_client_upload_tokens_hash ON client_upload_tokens(token_hash);

-- Credit Estimate indexes
CREATE INDEX IF NOT EXISTS idx_credit_estimates_client_year ON credit_estimates(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_credit_estimates_status ON credit_estimates(status);

-- Study indexes
CREATE INDEX IF NOT EXISTS idx_studies_v2_client_year_status ON studies_v2(client_company_id, tax_year, status);
CREATE INDEX IF NOT EXISTS idx_studies_v2_org ON studies_v2(organization_id);
CREATE INDEX IF NOT EXISTS idx_study_artifacts_v2_study ON study_artifacts_v2(study_id);
CREATE INDEX IF NOT EXISTS idx_study_signoffs_study ON study_signoffs(study_id);
CREATE INDEX IF NOT EXISTS idx_study_finalization_checks_client_year ON study_finalization_checks(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_study_delivery_email_study ON study_delivery_email_drafts(study_id);

-- Admin indexes
CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON org_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_authority_change_log_authority_id ON authority_change_log(authority_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_org_id ON audit_exports(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_client_year ON audit_exports(client_company_id, tax_year);

-- ============================================================================
-- PART 13: ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_174_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocessing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_artifacts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_finalization_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_delivery_email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 14: DROP OLD POLICIES SAFELY
-- ============================================================================

-- Drop all existing policies so we can recreate them cleanly
DO $$ BEGIN DROP POLICY IF EXISTS "Users can read own onboarding sessions" ON onboarding_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Users can create own onboarding sessions" ON onboarding_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Users can update own onboarding sessions" ON onboarding_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Org admins can read org onboarding sessions" ON onboarding_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "onboarding_sessions_user_access" ON onboarding_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Users can read own step logs" ON onboarding_step_logs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Users can create own step logs" ON onboarding_step_logs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Users can update own step logs" ON onboarding_step_logs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Org admins can read org step logs" ON onboarding_step_logs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "onboarding_step_logs_user_access" ON onboarding_step_logs; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org intake templates" ON intake_templates; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can create intake templates" ON intake_templates; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can update intake templates" ON intake_templates; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "intake_templates_org_access" ON intake_templates; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org email drafts" ON intake_email_drafts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can create email drafts" ON intake_email_drafts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can update email drafts" ON intake_email_drafts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "intake_email_drafts_org_access" ON intake_email_drafts; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org intake sessions" ON client_intake_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can create intake sessions" ON client_intake_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can update intake sessions" ON client_intake_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "client_intake_sessions_org_access" ON client_intake_sessions; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org upload tokens" ON intake_upload_tokens; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can create upload tokens" ON intake_upload_tokens; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can update upload tokens" ON intake_upload_tokens; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "intake_upload_tokens_service_access" ON intake_upload_tokens; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org intake files" ON intake_files; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can create intake files" ON intake_files; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can update intake files" ON intake_files; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "intake_files_org_access" ON intake_files; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org mappings" ON intake_mappings; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can manage mappings" ON intake_mappings; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "intake_mappings_org_access" ON intake_mappings; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org contracts" ON contracts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can manage contracts" ON contracts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "contracts_org_access" ON contracts; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org supplies" ON supplies; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can manage supplies" ON supplies; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "supplies_org_access" ON supplies; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Users can view org 174 responses" ON section_174_responses; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "CPAs can manage 174 responses" ON section_174_responses; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "section_174_responses_org_access" ON section_174_responses; EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "authority_library_read" ON authority_library; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "authority_library_service_write" ON authority_library; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "review_findings_org_access" ON review_findings; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "finding_resolutions_access" ON finding_resolutions; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "review_config_org_access" ON review_configurations; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "review_runs_org_access" ON review_runs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "escalation_requests_org_access" ON escalation_requests; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "evidence_requests_org_access" ON evidence_requests; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "client_upload_tokens_access" ON client_upload_tokens; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "evidence_files_org_access" ON evidence_files; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "reprocessing_jobs_org_access" ON reprocessing_jobs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "credit_estimates_org_access" ON credit_estimates; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "estimate_exports_access" ON estimate_exports; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "estimate_signoffs_access" ON estimate_signoffs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "studies_v2_org_access" ON studies_v2; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "study_artifacts_v2_access" ON study_artifacts_v2; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "study_signoffs_access" ON study_signoffs; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "study_finalization_checks_org_access" ON study_finalization_checks; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "study_delivery_email_access" ON study_delivery_email_drafts; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "org_settings_read_access" ON org_settings; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "org_settings_write_access" ON org_settings; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "authority_change_log_org_access" ON authority_change_log; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "audit_exports_org_access" ON audit_exports; EXCEPTION WHEN undefined_table THEN null; END $$;

-- ============================================================================
-- PART 15: CREATE SIMPLE RLS POLICIES (org-based, no role column dependencies)
-- ============================================================================

-- Onboarding sessions: users can access their own
CREATE POLICY "onboarding_sessions_user_access" ON onboarding_sessions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Onboarding step logs: users can access their own session's logs
CREATE POLICY "onboarding_step_logs_user_access" ON onboarding_step_logs
    FOR ALL TO authenticated
    USING (onboarding_session_id IN (SELECT id FROM onboarding_sessions WHERE user_id = auth.uid()));

-- Intake templates: org members can access
CREATE POLICY "intake_templates_org_access" ON intake_templates
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Intake email drafts: org members can access
CREATE POLICY "intake_email_drafts_org_access" ON intake_email_drafts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Client intake sessions: org members can access
CREATE POLICY "client_intake_sessions_org_access" ON client_intake_sessions
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Intake upload tokens: service role only for security
CREATE POLICY "intake_upload_tokens_service_access" ON intake_upload_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Intake files: org members can access
CREATE POLICY "intake_files_org_access" ON intake_files
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Intake mappings: based on file access
CREATE POLICY "intake_mappings_org_access" ON intake_mappings
    FOR ALL TO authenticated
    USING (intake_file_id IN (
        SELECT id FROM intake_files 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Contracts: org members can access
CREATE POLICY "contracts_org_access" ON contracts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Supplies: org members can access
CREATE POLICY "supplies_org_access" ON supplies
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Section 174 responses: org members can access
CREATE POLICY "section_174_responses_org_access" ON section_174_responses
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Authority Library: everyone can read, service role can write
CREATE POLICY "authority_library_read" ON authority_library
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authority_library_service_write" ON authority_library
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Review Findings
CREATE POLICY "review_findings_org_access" ON review_findings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Finding Resolutions
CREATE POLICY "finding_resolutions_access" ON finding_resolutions
    FOR ALL TO authenticated
    USING (review_finding_id IN (
        SELECT id FROM review_findings 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Review Configurations
CREATE POLICY "review_config_org_access" ON review_configurations
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Review Runs
CREATE POLICY "review_runs_org_access" ON review_runs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Escalation Requests
CREATE POLICY "escalation_requests_org_access" ON escalation_requests
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Evidence Requests
CREATE POLICY "evidence_requests_org_access" ON evidence_requests
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Client Upload Tokens (service role only for security)
CREATE POLICY "client_upload_tokens_access" ON client_upload_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Evidence Files
CREATE POLICY "evidence_files_org_access" ON evidence_files
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Reprocessing Jobs
CREATE POLICY "reprocessing_jobs_org_access" ON reprocessing_jobs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Credit Estimates
CREATE POLICY "credit_estimates_org_access" ON credit_estimates
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Estimate Exports
CREATE POLICY "estimate_exports_access" ON estimate_exports
    FOR ALL TO authenticated
    USING (credit_estimate_id IN (
        SELECT id FROM credit_estimates 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Estimate Signoffs
CREATE POLICY "estimate_signoffs_access" ON estimate_signoffs
    FOR ALL TO authenticated
    USING (credit_estimate_id IN (
        SELECT id FROM credit_estimates 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Studies V2
CREATE POLICY "studies_v2_org_access" ON studies_v2
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Study Artifacts V2
CREATE POLICY "study_artifacts_v2_access" ON study_artifacts_v2
    FOR ALL TO authenticated
    USING (study_id IN (
        SELECT id FROM studies_v2 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Study Signoffs
CREATE POLICY "study_signoffs_access" ON study_signoffs
    FOR ALL TO authenticated
    USING (study_id IN (
        SELECT id FROM studies_v2 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Study Finalization Checks
CREATE POLICY "study_finalization_checks_org_access" ON study_finalization_checks
    FOR ALL TO authenticated
    USING (client_company_id IN (
        SELECT id FROM client_companies 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Study Delivery Email Drafts
CREATE POLICY "study_delivery_email_access" ON study_delivery_email_drafts
    FOR ALL TO authenticated
    USING (study_id IN (
        SELECT id FROM studies_v2 
        WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ));

-- Org Settings
CREATE POLICY "org_settings_read_access" ON org_settings
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_settings_write_access" ON org_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authority Change Log
CREATE POLICY "authority_change_log_org_access" ON authority_change_log
    FOR ALL TO authenticated
    USING (organization_id IS NULL OR organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Audit Exports
CREATE POLICY "audit_exports_org_access" ON audit_exports
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- ============================================================================
-- PART 16: CREATE TRIGGERS
-- ============================================================================

-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Onboarding sessions
DROP TRIGGER IF EXISTS update_onboarding_sessions_updated_at ON onboarding_sessions;
CREATE TRIGGER update_onboarding_sessions_updated_at
    BEFORE UPDATE ON onboarding_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Intake email drafts
DROP TRIGGER IF EXISTS update_intake_email_drafts_updated_at ON intake_email_drafts;
CREATE TRIGGER update_intake_email_drafts_updated_at 
    BEFORE UPDATE ON intake_email_drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Client intake sessions
DROP TRIGGER IF EXISTS update_client_intake_sessions_updated_at ON client_intake_sessions;
CREATE TRIGGER update_client_intake_sessions_updated_at 
    BEFORE UPDATE ON client_intake_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Intake files
DROP TRIGGER IF EXISTS update_intake_files_updated_at ON intake_files;
CREATE TRIGGER update_intake_files_updated_at 
    BEFORE UPDATE ON intake_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Contracts
DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
CREATE TRIGGER update_contracts_updated_at 
    BEFORE UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Supplies
DROP TRIGGER IF EXISTS update_supplies_updated_at ON supplies;
CREATE TRIGGER update_supplies_updated_at 
    BEFORE UPDATE ON supplies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Section 174 responses
DROP TRIGGER IF EXISTS update_174_responses_updated_at ON section_174_responses;
CREATE TRIGGER update_174_responses_updated_at 
    BEFORE UPDATE ON section_174_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 17: SEED AUTHORITY LIBRARY (if empty)
-- ============================================================================

INSERT INTO authority_library (authority_type, citation_label, citation_key, summary, excerpt, tags)
SELECT * FROM (VALUES
    ('irc_section'::authority_type_enum, 'IRC §41(d) - Qualified Research', 'IRC_41_D', 
     'Defines the four-part test for qualified research activities',
     'Research must meet: (1) permitted purpose, (2) technological in nature, (3) elimination of uncertainty, (4) process of experimentation',
     '["four_part_test", "qualified_research"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(b) - QRE Components', 'IRC_41_B',
     'Defines qualified research expenditures including wages, supplies, and contract research',
     'QRE includes: in-house research expenses (wages, supplies) and contract research expenses (65% of amounts paid)',
     '["qre", "wages", "supplies", "contract_research"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(b)(3) - Contract Research 65% Rule', 'IRC_41_B_3',
     '65% of contract research payments qualify as QRE',
     'Only 65 percent of contract research payments shall be treated as qualified research expenses',
     '["contract_research", "65_percent"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §174 - R&E Expenditures', 'IRC_174',
     'Post-TCJA rules requiring capitalization of R&E expenditures',
     'R&E expenditures must be capitalized and amortized over 5 years (domestic) or 15 years (foreign)',
     '["section_174", "capitalization"]'::jsonb),
    
    ('irc_section'::authority_type_enum, 'IRC §41(d)(4) - Foreign Research Exclusion', 'IRC_41_D_4',
     'Research conducted outside the United States does not qualify',
     'Qualified research shall not include research conducted outside the United States',
     '["foreign_research", "exclusion"]'::jsonb),
    
    ('form_instruction'::authority_type_enum, 'Form 6765 Instructions', 'FORM_6765',
     'IRS form for computing and claiming the R&D tax credit',
     'Use Form 6765 to figure and claim the credit for increasing research activities',
     '["form_6765", "credit_computation"]'::jsonb)
) AS v(authority_type, citation_label, citation_key, summary, excerpt, tags)
WHERE NOT EXISTS (SELECT 1 FROM authority_library LIMIT 1);

-- ============================================================================
-- DONE!
-- ============================================================================

SELECT 'COMPLETE_MIGRATION finished successfully - ALL Prompts 7-15 applied!' AS status;
