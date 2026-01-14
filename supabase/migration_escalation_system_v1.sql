-- ============================================================================
-- Migration: Escalation System v1
-- Implements: Senior CPA escalation workflow with override tracking
-- ============================================================================

-- ============================================================================
-- 1. RBAC: Add role_level for CPA track
-- ============================================================================

CREATE TYPE cpa_role_level AS ENUM (
    'junior',
    'senior',
    'director',
    'partner'
);

-- Add role_level to profiles (for CPA users)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role_level cpa_role_level DEFAULT 'junior';

-- Add role_level to organization_members if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organization_members') THEN
        ALTER TABLE organization_members 
        ADD COLUMN IF NOT EXISTS role_level cpa_role_level DEFAULT 'junior';
    END IF;
END $$;

-- ============================================================================
-- 2. Org Settings: Escalation thresholds
-- ============================================================================

-- Add escalation settings to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS escalation_settings JSONB DEFAULT '{
    "senior_required_credit_at_risk": 25000,
    "senior_required_qre_at_risk": 100000,
    "senior_required_severity": "high",
    "allow_junior_high_impact_finalize": false
}'::jsonb;

-- ============================================================================
-- 3. Escalation Reason Codes
-- ============================================================================

CREATE TYPE escalation_reason_code AS ENUM (
    'materiality_threshold',
    'client_confirmation_received',
    'reasonable_estimate_method',
    'documentation_sufficient',
    'documentation_insufficient',
    'classification_corrected',
    'legal_interpretation',
    'audit_risk_mitigation',
    'process_improvement',
    'other'
);

-- ============================================================================
-- 4. Escalation Requests Table
-- ============================================================================

CREATE TYPE escalation_source_type AS ENUM (
    'review_finding',
    'intake_mapping',
    'manual'
);

CREATE TYPE escalation_status AS ENUM (
    'queued',
    'assigned',
    'in_review',
    'returned_to_junior',
    'resolved',
    'cancelled'
);

CREATE TYPE escalation_decision_type AS ENUM (
    'approve_junior_resolution',
    'override_fields',
    'request_more_evidence',
    'return_guidance',
    'dismiss'
);

CREATE TABLE IF NOT EXISTS escalation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    client_company_id UUID NOT NULL REFERENCES client_companies(id),
    tax_year INTEGER,
    
    -- Source linking
    source_type escalation_source_type NOT NULL,
    source_id UUID NOT NULL,
    
    -- Escalation details
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity review_finding_severity NOT NULL DEFAULT 'medium',
    estimated_impact JSONB DEFAULT '{}'::jsonb,
    proposed_action JSONB DEFAULT '{}'::jsonb,
    authority_refs JSONB DEFAULT '[]'::jsonb,
    
    -- Status and assignment
    status escalation_status NOT NULL DEFAULT 'queued',
    assigned_to_user_id UUID REFERENCES auth.users(id),
    
    -- Decision (when resolved)
    decision_type escalation_decision_type,
    decision_reason_code escalation_reason_code,
    decision_note TEXT,
    decision_field_changes JSONB,
    decision_at TIMESTAMPTZ,
    decided_by_user_id UUID REFERENCES auth.users(id),
    
    -- Guidance (when returned)
    guidance_text TEXT,
    
    -- Tracking
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_escalation_org_status ON escalation_requests(organization_id, status);
CREATE INDEX idx_escalation_assigned ON escalation_requests(assigned_to_user_id, status);
CREATE INDEX idx_escalation_source ON escalation_requests(source_type, source_id);
CREATE INDEX idx_escalation_client ON escalation_requests(client_company_id, tax_year);
CREATE INDEX idx_escalation_severity ON escalation_requests(severity, status);

-- ============================================================================
-- 5. Escalation History Table (for tracking all state changes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS escalation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escalation_request_id UUID NOT NULL REFERENCES escalation_requests(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    previous_status escalation_status,
    new_status escalation_status,
    previous_assigned_to UUID,
    new_assigned_to UUID,
    note TEXT,
    performed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_escalation_history_request ON escalation_history(escalation_request_id);

-- ============================================================================
-- 6. Notifications Table (lightweight)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- ============================================================================
-- 7. Link escalations to tasks (if tasks table exists)
-- ============================================================================

DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tasks') THEN
        ALTER TABLE tasks 
        ADD COLUMN IF NOT EXISTS escalation_request_id UUID REFERENCES escalation_requests(id);
        
        CREATE INDEX IF NOT EXISTS idx_tasks_escalation ON tasks(escalation_request_id);
    END IF;
END $$;

-- ============================================================================
-- 8. RLS Policies
-- ============================================================================

ALTER TABLE escalation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Escalation Requests: Org CPA/Executive can read, CPA can create, assigned senior can update
CREATE POLICY "escalation_requests_org_read" ON escalation_requests
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "escalation_requests_create" ON escalation_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('cpa', 'executive', 'admin')
        )
    );

CREATE POLICY "escalation_requests_update" ON escalation_requests
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        AND (
            -- Creator can update if status is queued
            (created_by_user_id = auth.uid() AND status = 'queued')
            -- Assigned senior can update
            OR assigned_to_user_id = auth.uid()
            -- Executives can always update
            OR EXISTS (
                SELECT 1 FROM profiles 
                WHERE id = auth.uid() AND role = 'executive'
            )
            -- Senior+ CPAs can update
            OR EXISTS (
                SELECT 1 FROM profiles 
                WHERE id = auth.uid() 
                AND role = 'cpa' 
                AND role_level IN ('senior', 'director', 'partner')
            )
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Escalation History: Org members can read
CREATE POLICY "escalation_history_org_read" ON escalation_history
    FOR SELECT TO authenticated
    USING (
        escalation_request_id IN (
            SELECT id FROM escalation_requests 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "escalation_history_insert" ON escalation_history
    FOR INSERT TO authenticated
    WITH CHECK (
        escalation_request_id IN (
            SELECT id FROM escalation_requests 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Notifications: User can only read their own
CREATE POLICY "notifications_user_read" ON notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "notifications_user_update" ON notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Service role can insert notifications for anyone
CREATE POLICY "notifications_service_insert" ON notifications
    FOR INSERT TO service_role
    WITH CHECK (true);

-- Authenticated users can insert notifications (for system use)
CREATE POLICY "notifications_auth_insert" ON notifications
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ============================================================================
-- 9. Update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_escalation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_escalation_updated
    BEFORE UPDATE ON escalation_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_escalation_timestamp();

-- ============================================================================
-- 10. Helper View: Escalation Queue with User Details
-- ============================================================================

CREATE OR REPLACE VIEW escalation_queue_view AS
SELECT 
    e.*,
    creator.full_name AS created_by_name,
    creator.email AS created_by_email,
    assignee.full_name AS assigned_to_name,
    assignee.email AS assigned_to_email,
    decider.full_name AS decided_by_name,
    c.name AS client_name,
    EXTRACT(DAY FROM NOW() - e.created_at) AS days_open
FROM escalation_requests e
LEFT JOIN profiles creator ON e.created_by_user_id = creator.id
LEFT JOIN profiles assignee ON e.assigned_to_user_id = assignee.id
LEFT JOIN profiles decider ON e.decided_by_user_id = decider.id
LEFT JOIN client_companies c ON e.client_company_id = c.id;

-- ============================================================================
-- End Migration
-- ============================================================================
