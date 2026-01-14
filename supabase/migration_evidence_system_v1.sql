-- ============================================================================
-- Migration: Evidence System v1
-- Implements: Evidence request, client upload, file tracking, and reprocessing
-- ============================================================================

-- ============================================================================
-- 1. Evidence Request Types and Status
-- ============================================================================

CREATE TYPE evidence_request_type AS ENUM (
    'timesheets_support',
    'vendor_contract',
    'foreign_research_support',
    'supply_consumption_support',
    'wage_support',
    'project_narrative_support',
    'section_174_support',
    'other'
);

CREATE TYPE evidence_request_status AS ENUM (
    'draft',
    'sent',
    'awaiting_upload',
    'received',
    'partially_received',
    'completed',
    'cancelled'
);

-- ============================================================================
-- 2. Evidence Requests Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER,
    status evidence_request_status NOT NULL DEFAULT 'draft',
    title TEXT NOT NULL,
    request_type evidence_request_type NOT NULL,
    requested_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason TEXT NOT NULL,
    authority_refs JSONB DEFAULT '[]'::jsonb,
    linked_finding_ids JSONB DEFAULT '[]'::jsonb,
    linked_task_id UUID,
    linked_intake_session_id UUID,
    client_upload_token_id UUID,
    due_date TIMESTAMPTZ,
    email_draft TEXT,
    email_sent_at TIMESTAMPTZ,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_evidence_requests_org ON evidence_requests(organization_id);
CREATE INDEX idx_evidence_requests_client ON evidence_requests(client_company_id, tax_year);
CREATE INDEX idx_evidence_requests_status ON evidence_requests(status);
CREATE INDEX idx_evidence_requests_due ON evidence_requests(due_date) WHERE status IN ('sent', 'awaiting_upload');

-- ============================================================================
-- 3. Client Upload Tokens Table
-- ============================================================================

CREATE TYPE upload_token_scope AS ENUM (
    'intake_session',
    'evidence_request'
);

CREATE TABLE IF NOT EXISTS client_upload_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    scope upload_token_scope NOT NULL,
    scope_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    max_uploads INTEGER DEFAULT 100,
    uploads_count INTEGER DEFAULT 0,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_upload_tokens_scope ON client_upload_tokens(client_company_id, scope, scope_id);
CREATE INDEX idx_upload_tokens_expiry ON client_upload_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_upload_tokens_hash ON client_upload_tokens(token_hash);

-- ============================================================================
-- 4. Evidence Files Table
-- ============================================================================

CREATE TYPE evidence_upload_source AS ENUM (
    'client_link',
    'portal_user'
);

CREATE TYPE evidence_file_status AS ENUM (
    'uploaded',
    'linked',
    'processed',
    'rejected'
);

CREATE TABLE IF NOT EXISTS evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    uploaded_by_user_id UUID,
    uploaded_via evidence_upload_source NOT NULL,
    evidence_request_id UUID REFERENCES evidence_requests(id),
    intake_session_id UUID,
    review_finding_id UUID,
    task_id UUID,
    entity_type TEXT,
    entity_id UUID,
    original_filename TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'evidence-files',
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes BIGINT,
    sha256 TEXT,
    status evidence_file_status NOT NULL DEFAULT 'uploaded',
    notes TEXT,
    matched_item_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_evidence_files_org ON evidence_files(organization_id);
CREATE INDEX idx_evidence_files_client ON evidence_files(client_company_id);
CREATE INDEX idx_evidence_files_request ON evidence_files(evidence_request_id);
CREATE INDEX idx_evidence_files_finding ON evidence_files(review_finding_id);
CREATE INDEX idx_evidence_files_status ON evidence_files(status);
CREATE INDEX idx_evidence_files_hash ON evidence_files(sha256);

-- ============================================================================
-- 5. Reprocessing Jobs Table
-- ============================================================================

CREATE TYPE reprocessing_trigger AS ENUM (
    'evidence_uploaded',
    'evidence_linked',
    'request_completed',
    'manual'
);

CREATE TYPE reprocessing_target AS ENUM (
    'review_rules',
    'ai_project_eval',
    'both'
);

CREATE TYPE reprocessing_status AS ENUM (
    'queued',
    'running',
    'completed',
    'failed'
);

CREATE TABLE IF NOT EXISTS reprocessing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER,
    trigger_type reprocessing_trigger NOT NULL,
    trigger_id UUID NOT NULL,
    target reprocessing_target NOT NULL,
    status reprocessing_status NOT NULL DEFAULT 'queued',
    impacted_domains TEXT[],
    impacted_finding_ids UUID[],
    impacted_project_ids UUID[],
    job_summary JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reprocessing_jobs_client ON reprocessing_jobs(client_company_id, tax_year);
CREATE INDEX idx_reprocessing_jobs_status ON reprocessing_jobs(status);
CREATE INDEX idx_reprocessing_jobs_trigger ON reprocessing_jobs(trigger_type, trigger_id);

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

ALTER TABLE evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocessing_jobs ENABLE ROW LEVEL SECURITY;

-- Evidence Requests: Org CPA/Executive access
CREATE POLICY "evidence_requests_org_access" ON evidence_requests
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

-- Client Upload Tokens: CPA/Executive can manage
CREATE POLICY "upload_tokens_org_access" ON client_upload_tokens
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

-- Evidence Files: Org access for read, CPA for write
CREATE POLICY "evidence_files_read" ON evidence_files
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "evidence_files_write" ON evidence_files
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('cpa', 'executive', 'admin')
        )
    );

CREATE POLICY "evidence_files_update" ON evidence_files
    FOR UPDATE TO authenticated
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

-- Service role can insert evidence files (for client uploads)
CREATE POLICY "evidence_files_service_insert" ON evidence_files
    FOR INSERT TO service_role
    WITH CHECK (true);

-- Reprocessing Jobs: Org access
CREATE POLICY "reprocessing_jobs_org_access" ON reprocessing_jobs
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
-- 7. Update Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_evidence_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_evidence_request_updated
    BEFORE UPDATE ON evidence_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_request_timestamp();

CREATE TRIGGER trigger_reprocessing_job_updated
    BEFORE UPDATE ON reprocessing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_request_timestamp();

-- ============================================================================
-- 8. Helper View: Evidence Request Summary
-- ============================================================================

CREATE OR REPLACE VIEW evidence_request_summary AS
SELECT 
    er.*,
    c.name AS client_name,
    creator.full_name AS created_by_name,
    COUNT(ef.id) AS files_received,
    SUM(CASE WHEN ef.status = 'linked' THEN 1 ELSE 0 END) AS files_linked
FROM evidence_requests er
LEFT JOIN client_companies c ON er.client_company_id = c.id
LEFT JOIN profiles creator ON er.created_by_user_id = creator.id
LEFT JOIN evidence_files ef ON ef.evidence_request_id = er.id
GROUP BY er.id, c.name, creator.full_name;

-- ============================================================================
-- End Migration
-- ============================================================================
