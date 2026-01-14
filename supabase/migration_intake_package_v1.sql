-- ============================================================================
-- INTAKE PACKAGE GENERATOR MIGRATION (Prompt 8)
-- ============================================================================
-- Implements:
-- 1. intake_templates - Generated document templates
-- 2. intake_email_drafts - Email draft storage
-- 3. client_intake_sessions - Intake workflow state
-- 4. intake_upload_tokens - Secure upload link tokens
-- 5. Extends client_companies with engagement settings
-- ============================================================================

-- ============================================================================
-- 1. EXTEND CLIENT_COMPANIES WITH ENGAGEMENT SETTINGS
-- ============================================================================

-- Add engagement-specific columns if they don't exist
ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS purchased_sections JSONB DEFAULT '{"section_41": true, "section_174": false}';

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS study_scope TEXT;

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS intake_mode TEXT DEFAULT 'portal_upload_only' 
CHECK (intake_mode IN ('upload_link', 'portal_upload_only', 'email_routing_reserved'));

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS has_vendors_expected BOOLEAN DEFAULT TRUE;

ALTER TABLE public.client_companies 
ADD COLUMN IF NOT EXISTS engagement_status TEXT DEFAULT 'setup'
CHECK (engagement_status IN ('setup', 'awaiting_intake', 'intake_received', 'in_progress', 'review', 'complete'));

-- ============================================================================
-- 2. CREATE INTAKE_TEMPLATES TABLE
-- ============================================================================

-- Enum for template types
DO $$ BEGIN
    CREATE TYPE intake_template_type AS ENUM (
        'data_request_master',
        'projects_questionnaire',
        'employee_payroll_template',
        'timesheet_template',
        'vendors_contracts_template',
        'ap_transactions_template',
        'supplies_template',
        'section_174_info_request'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.intake_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Template identification
    tax_years JSONB NOT NULL DEFAULT '[]', -- Array of years e.g. [2023, 2024]
    template_type TEXT NOT NULL CHECK (template_type IN (
        'data_request_master',
        'projects_questionnaire', 
        'employee_payroll_template',
        'timesheet_template',
        'vendors_contracts_template',
        'ap_transactions_template',
        'supplies_template',
        'section_174_info_request'
    )),
    template_version INTEGER NOT NULL DEFAULT 1,
    
    -- Storage location
    storage_bucket TEXT NOT NULL DEFAULT 'intake-templates',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size_bytes INTEGER,
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
    
    -- Audit trail
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL,
    -- metadata includes:
    -- - included_sections (array of section names)
    -- - required_fields (array of field names)
    -- - example_rows_present (boolean)
    -- - generated_from_onboarding_session_id (uuid or null)
    -- - sha256_hash (string)
    -- - generation_method ('ai_validated' | 'manual_user_action')
    
    -- Ensure unique versioning per client+type
    UNIQUE(client_company_id, template_type, template_version)
);

-- Indexes for intake_templates
CREATE INDEX IF NOT EXISTS idx_intake_templates_org ON public.intake_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_templates_client ON public.intake_templates(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_templates_type ON public.intake_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_intake_templates_status ON public.intake_templates(status);

-- ============================================================================
-- 3. CREATE INTAKE_EMAIL_DRAFTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.intake_email_drafts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Email content
    tax_years JSONB NOT NULL DEFAULT '[]',
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    
    -- Recipients
    to_recipients JSONB DEFAULT '[]' NOT NULL, -- Array of {name, email}
    cc_recipients JSONB DEFAULT '[]' NOT NULL,
    bcc_recipients JSONB DEFAULT '[]' NOT NULL,
    
    -- Attachments
    attachment_template_ids JSONB DEFAULT '[]' NOT NULL, -- Array of template UUIDs
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'marked_sent', 'superseded')),
    marked_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit trail
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL
    -- metadata includes:
    -- - intake_mode_used
    -- - upload_link_embedded
    -- - disclaimers_included
    -- - tone_setting
);

-- Indexes for intake_email_drafts
CREATE INDEX IF NOT EXISTS idx_intake_email_drafts_org ON public.intake_email_drafts(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_email_drafts_client ON public.intake_email_drafts(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_email_drafts_status ON public.intake_email_drafts(status);

-- ============================================================================
-- 4. CREATE CLIENT_INTAKE_SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_intake_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Session context
    tax_years JSONB NOT NULL DEFAULT '[]',
    
    -- Status workflow
    status TEXT DEFAULT 'open' CHECK (status IN (
        'open',
        'awaiting_client',
        'received_partial',
        'processing',
        'needs_mapping',
        'complete'
    )),
    
    -- Expected inputs checklist (what we need from the client)
    expected_inputs JSONB DEFAULT '{}' NOT NULL,
    -- Structure:
    -- {
    --   "employees_payroll": { "required": true, "status": "pending|received|verified", "files": [] },
    --   "projects": { "required": true, "status": "pending|received|verified", "files": [] },
    --   "timesheets": { "required": true, "status": "pending|received|verified", "files": [] },
    --   "vendors_contracts": { "required": false, "status": "pending|received|verified", "files": [] },
    --   "ap_transactions": { "required": false, "status": "pending|received|verified", "files": [] },
    --   "supplies": { "required": false, "status": "pending|received|verified", "files": [] },
    --   "section_174_questionnaire": { "required": false, "status": "pending|received|verified", "files": [] }
    -- }
    
    -- Received files (populated by Prompt 9)
    received_files JSONB DEFAULT '[]' NOT NULL,
    
    -- Links to source
    source_onboarding_session_id UUID,
    source_email_draft_id UUID REFERENCES public.intake_email_drafts(id) ON DELETE SET NULL,
    template_ids JSONB DEFAULT '[]' NOT NULL, -- Array of template UUIDs used
    
    -- Audit trail
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- Indexes for client_intake_sessions
CREATE INDEX IF NOT EXISTS idx_intake_sessions_org ON public.client_intake_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_client ON public.client_intake_sessions(client_company_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON public.client_intake_sessions(status);

-- ============================================================================
-- 5. CREATE INTAKE_UPLOAD_TOKENS TABLE (for secure upload links)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.intake_upload_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Token for URL (hashed for security)
    token_hash TEXT NOT NULL UNIQUE,
    
    -- Scope
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    intake_session_id UUID REFERENCES public.client_intake_sessions(id) ON DELETE CASCADE,
    tax_years JSONB NOT NULL DEFAULT '[]',
    
    -- Validity
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Usage tracking
    max_uses INTEGER DEFAULT 100,
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Rate limiting
    uploads_per_hour INTEGER DEFAULT 20,
    
    -- Audit
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- Indexes for intake_upload_tokens
CREATE INDEX IF NOT EXISTS idx_upload_tokens_hash ON public.intake_upload_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_client ON public.intake_upload_tokens(client_company_id);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_expires ON public.intake_upload_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_session ON public.intake_upload_tokens(intake_session_id);

-- ============================================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.intake_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_upload_tokens ENABLE ROW LEVEL SECURITY;

-- intake_templates policies
CREATE POLICY "Users can view org intake templates" ON public.intake_templates
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can create intake templates" ON public.intake_templates
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

CREATE POLICY "CPAs can update intake templates" ON public.intake_templates
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- intake_email_drafts policies
CREATE POLICY "Users can view org email drafts" ON public.intake_email_drafts
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can create email drafts" ON public.intake_email_drafts
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

CREATE POLICY "CPAs can update email drafts" ON public.intake_email_drafts
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- client_intake_sessions policies
CREATE POLICY "Users can view org intake sessions" ON public.client_intake_sessions
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can create intake sessions" ON public.client_intake_sessions
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

CREATE POLICY "CPAs can update intake sessions" ON public.client_intake_sessions
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- intake_upload_tokens policies
CREATE POLICY "Users can view org upload tokens" ON public.intake_upload_tokens
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can create upload tokens" ON public.intake_upload_tokens
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

CREATE POLICY "CPAs can update upload tokens" ON public.intake_upload_tokens
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Auto-update trigger for intake_email_drafts
DROP TRIGGER IF EXISTS update_intake_email_drafts_updated_at ON public.intake_email_drafts;
CREATE TRIGGER update_intake_email_drafts_updated_at 
    BEFORE UPDATE ON public.intake_email_drafts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update trigger for client_intake_sessions
DROP TRIGGER IF EXISTS update_client_intake_sessions_updated_at ON public.client_intake_sessions;
CREATE TRIGGER update_client_intake_sessions_updated_at 
    BEFORE UPDATE ON public.client_intake_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to get the next template version
CREATE OR REPLACE FUNCTION public.get_next_template_version(
    p_client_company_id UUID,
    p_template_type TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(template_version), 0) INTO v_max_version
    FROM public.intake_templates
    WHERE client_company_id = p_client_company_id
    AND template_type = p_template_type;
    
    RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if upload token is valid
CREATE OR REPLACE FUNCTION public.validate_upload_token(p_token_hash TEXT)
RETURNS TABLE (
    is_valid BOOLEAN,
    client_company_id UUID,
    intake_session_id UUID,
    organization_id UUID,
    tax_years JSONB
) AS $$
DECLARE
    v_token RECORD;
BEGIN
    SELECT * INTO v_token
    FROM public.intake_upload_tokens t
    WHERE t.token_hash = p_token_hash
    AND t.revoked = FALSE
    AND t.expires_at > NOW()
    AND t.use_count < t.max_uses;
    
    IF v_token IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::JSONB;
    ELSE
        -- Increment use count
        UPDATE public.intake_upload_tokens
        SET use_count = use_count + 1,
            last_used_at = NOW()
        WHERE id = v_token.id;
        
        RETURN QUERY SELECT 
            TRUE,
            v_token.client_company_id,
            v_token.intake_session_id,
            v_token.organization_id,
            v_token.tax_years;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
