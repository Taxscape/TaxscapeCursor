-- =============================================================================
-- AI Qualification Layer Migration
-- Adds: project_ai_evaluations, project_evidence_items, project_gaps
-- Extends: project_questionnaire_items with AI-related fields
-- =============================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROJECT AI EVALUATIONS
-- Stores versioned AI evaluation results per project per tax year
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_ai_evaluations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    evaluation_version INTEGER NOT NULL DEFAULT 1,
    
    -- Four-Part Test Results (structured JSON)
    four_part_test_json JSONB NOT NULL DEFAULT '{
        "permitted_purpose": {"status": "missing_data", "reasoning": ""},
        "elimination_uncertainty": {"status": "missing_data", "reasoning": ""},
        "process_experimentation": {"status": "missing_data", "reasoning": ""},
        "technological_nature": {"status": "missing_data", "reasoning": ""}
    }',
    
    -- Evaluation metadata
    confidence_score DECIMAL(3,2) DEFAULT 0.00 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    qualified_boolean BOOLEAN DEFAULT FALSE,
    missing_info TEXT[] DEFAULT '{}',
    ai_summary TEXT,
    
    -- Model provenance (auditability)
    model_provider TEXT NOT NULL DEFAULT 'gemini',
    model_name TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    prompt_version TEXT NOT NULL DEFAULT 'v1.0.0',
    inputs_snapshot_hash TEXT NOT NULL, -- Hash of inputs to detect staleness
    
    -- Evidence used
    evidence_ids_used UUID[] DEFAULT '{}',
    
    -- Status
    status TEXT CHECK (status IN ('completed', 'needs_review', 'error', 'stale')) DEFAULT 'completed',
    error_message TEXT,
    
    -- Cost tracking (optional)
    evaluation_cost_cents INTEGER,
    tokens_used INTEGER,
    
    -- Timestamps and audit
    is_latest BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Ensure unique latest per project/tax_year
    UNIQUE(project_id, tax_year, evaluation_version)
);

-- Index for fast "latest" lookups
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_latest 
ON public.project_ai_evaluations(project_id, tax_year, is_latest) 
WHERE is_latest = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_evaluations_org_client 
ON public.project_ai_evaluations(organization_id, client_company_id, tax_year);

-- Function to update is_latest when new evaluation is inserted
CREATE OR REPLACE FUNCTION update_latest_evaluation()
RETURNS TRIGGER AS $$
BEGIN
    -- Set all previous evaluations for this project/tax_year to is_latest = false
    UPDATE public.project_ai_evaluations 
    SET is_latest = FALSE 
    WHERE project_id = NEW.project_id 
      AND tax_year = NEW.tax_year 
      AND id != NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_latest_evaluation ON public.project_ai_evaluations;
CREATE TRIGGER trigger_update_latest_evaluation
AFTER INSERT ON public.project_ai_evaluations
FOR EACH ROW EXECUTE FUNCTION update_latest_evaluation();

-- =============================================================================
-- 2. PROJECT EVIDENCE ITEMS
-- Canonical evidence artifacts linkable to projects, questions, tasks, evaluations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_evidence_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    
    -- File storage reference (Supabase Storage)
    storage_object_key TEXT, -- e.g., 'org-123/client-456/evidence/file.pdf'
    storage_bucket TEXT DEFAULT 'evidence',
    original_filename TEXT NOT NULL,
    file_type TEXT CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'csv', 'txt', 'url', 'image', 'other')),
    file_size_bytes INTEGER,
    mime_type TEXT,
    
    -- For URL-based evidence
    external_url TEXT,
    
    -- Extracted content
    extraction_status TEXT CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    extracted_text TEXT,
    extracted_chunks JSONB DEFAULT '[]', -- [{chunk_index, text, page_number, section, citations}]
    extraction_error TEXT,
    extracted_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata and tagging
    evidence_type TEXT CHECK (evidence_type IN (
        'project_narrative', 'technical_docs', 'test_results', 'source_control',
        'tickets', 'time_logs', 'financial_support', 'contract', 'design_docs',
        'experiment_logs', 'meeting_notes', 'email_thread', 'other'
    )) DEFAULT 'other',
    tags TEXT[] DEFAULT '{}',
    description TEXT,
    
    -- Linked entities (many-to-many handled via join table or array)
    linked_questionnaire_item_ids UUID[] DEFAULT '{}',
    linked_task_ids UUID[] DEFAULT '{}',
    linked_gap_ids UUID[] DEFAULT '{}',
    
    -- Usage tracking
    used_in_evaluation_ids UUID[] DEFAULT '{}',
    citation_count INTEGER DEFAULT 0,
    
    -- Audit
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_storage_or_url CHECK (
        storage_object_key IS NOT NULL OR external_url IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_evidence_project ON public.project_evidence_items(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org_client ON public.project_evidence_items(organization_id, client_company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON public.project_evidence_items(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON public.project_evidence_items USING GIN(tags);

-- =============================================================================
-- 3. PROJECT GAPS
-- Missing requirements with actionable resolution tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_gaps (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Gap identification
    gap_type TEXT NOT NULL CHECK (gap_type IN (
        'missing_uncertainty', 'missing_experimentation', 'missing_tech_basis',
        'missing_permitted_purpose', 'missing_wage_support', 'missing_time_allocation',
        'foreign_vendor_flag', 'contractor_qualification', 'supply_eligibility',
        'missing_project_narrative', 'missing_test_evidence', 'missing_design_docs',
        'financial_anomaly', 'needs_clarification', 'other'
    )),
    gap_code TEXT, -- Machine-readable code like 'GAP-UNC-001'
    
    -- Severity and priority
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',
    priority_score INTEGER DEFAULT 50, -- 0-100 for sorting
    
    -- Status tracking
    status TEXT CHECK (status IN ('open', 'in_progress', 'pending_review', 'resolved', 'waived', 'rejected')) NOT NULL DEFAULT 'open',
    
    -- Human-readable description
    title TEXT NOT NULL,
    description TEXT,
    required_info TEXT[], -- What's needed to resolve
    suggested_actions TEXT[], -- Recommended next steps
    
    -- Links to related entities
    linked_questionnaire_item_id UUID, -- Will be FK after questionnaire table updated
    linked_task_id UUID REFERENCES public.verification_tasks(id) ON DELETE SET NULL,
    linked_criterion_key TEXT CHECK (linked_criterion_key IN (
        'permitted_purpose', 'elimination_uncertainty', 'process_experimentation', 'technological_nature'
    )),
    
    -- Evidence attached to resolve gap
    evidence_ids UUID[] DEFAULT '{}',
    
    -- Resolution
    resolution_notes TEXT,
    resolution_evidence_ids UUID[] DEFAULT '{}',
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    waived_reason TEXT,
    waived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    waived_at TIMESTAMP WITH TIME ZONE,
    
    -- AI-generated
    ai_generated BOOLEAN DEFAULT FALSE,
    source_evaluation_id UUID REFERENCES public.project_ai_evaluations(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gaps_project ON public.project_gaps(project_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON public.project_gaps(status);
CREATE INDEX IF NOT EXISTS idx_gaps_severity ON public.project_gaps(severity, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_org_client ON public.project_gaps(organization_id, client_company_id);

-- =============================================================================
-- 4. EXTEND PROJECT_QUESTIONNAIRE_ITEMS (if exists, otherwise create)
-- =============================================================================

-- First check if table exists and add columns
DO $$ 
BEGIN
    -- Add new columns to project_questionnaire_items if they don't exist
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'project_questionnaire_items') THEN
        -- ai_generated flag
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'ai_generated') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN ai_generated BOOLEAN DEFAULT FALSE;
        END IF;
        
        -- question_intent enum
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'question_intent') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN question_intent TEXT 
                CHECK (question_intent IN (
                    'uncertainty', 'experimentation', 'tech_nature', 'permitted_purpose',
                    'substantiation', 'allocation', 'general'
                ));
        END IF;
        
        -- linked_gap_id
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'linked_gap_id') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN linked_gap_id UUID 
                REFERENCES public.project_gaps(id) ON DELETE SET NULL;
        END IF;
        
        -- evidence_ids array
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'evidence_ids') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN evidence_ids UUID[] DEFAULT '{}';
        END IF;
        
        -- copilot_draft for AI-suggested answers
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'copilot_draft') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN copilot_draft TEXT;
        END IF;
        
        -- response_confidence
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'project_questionnaire_items' AND column_name = 'response_confidence') THEN
            ALTER TABLE public.project_questionnaire_items ADD COLUMN response_confidence DECIMAL(3,2);
        END IF;
    END IF;
END $$;

-- =============================================================================
-- 5. ADD STALENESS TRACKING TO PROJECTS
-- =============================================================================

DO $$
BEGIN
    -- last_inputs_updated_at - when canonical data changed
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'last_inputs_updated_at') THEN
        ALTER TABLE public.projects ADD COLUMN last_inputs_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- last_ai_evaluation_at - when AI last evaluated
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'last_ai_evaluation_at') THEN
        ALTER TABLE public.projects ADD COLUMN last_ai_evaluation_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- qualification_status (extend existing or add)
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'ai_qualification_status') THEN
        ALTER TABLE public.projects ADD COLUMN ai_qualification_status TEXT 
            CHECK (ai_qualification_status IN ('not_evaluated', 'qualified', 'not_qualified', 'needs_review', 'stale'))
            DEFAULT 'not_evaluated';
    END IF;
    
    -- open_gaps_count for quick filtering
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'open_gaps_count') THEN
        ALTER TABLE public.projects ADD COLUMN open_gaps_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- =============================================================================
-- 6. RLS POLICIES
-- =============================================================================

-- Project AI Evaluations
ALTER TABLE public.project_ai_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view evaluations for their organization" ON public.project_ai_evaluations;
CREATE POLICY "Users can view evaluations for their organization" ON public.project_ai_evaluations
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert evaluations for their organization" ON public.project_ai_evaluations;
CREATE POLICY "Users can insert evaluations for their organization" ON public.project_ai_evaluations
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update evaluations for their organization" ON public.project_ai_evaluations;
CREATE POLICY "Users can update evaluations for their organization" ON public.project_ai_evaluations
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Project Evidence Items
ALTER TABLE public.project_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view evidence for their organization" ON public.project_evidence_items;
CREATE POLICY "Users can view evidence for their organization" ON public.project_evidence_items
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert evidence for their organization" ON public.project_evidence_items;
CREATE POLICY "Users can insert evidence for their organization" ON public.project_evidence_items
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update evidence for their organization" ON public.project_evidence_items;
CREATE POLICY "Users can update evidence for their organization" ON public.project_evidence_items
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete evidence for their organization" ON public.project_evidence_items;
CREATE POLICY "Users can delete evidence for their organization" ON public.project_evidence_items
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Project Gaps
ALTER TABLE public.project_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view gaps for their organization" ON public.project_gaps;
CREATE POLICY "Users can view gaps for their organization" ON public.project_gaps
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert gaps for their organization" ON public.project_gaps;
CREATE POLICY "Users can insert gaps for their organization" ON public.project_gaps
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update gaps for their organization" ON public.project_gaps;
CREATE POLICY "Users can update gaps for their organization" ON public.project_gaps
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Only CPA/executives can waive gaps (check role in profiles)
DROP POLICY IF EXISTS "Only CPAs can waive gaps" ON public.project_gaps;
CREATE POLICY "Only CPAs can waive gaps" ON public.project_gaps
    FOR UPDATE USING (
        -- For waiving: check if user has appropriate role
        (
            status = 'waived' AND
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role IN ('admin', 'cpa', 'executive', 'managing_partner', 'reviewer')
            )
        ) OR
        -- For other updates, standard org check
        (
            status != 'waived' AND
            organization_id IN (
                SELECT organization_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- =============================================================================
-- 7. FUNCTIONS FOR CONVENIENCE
-- =============================================================================

-- Function to get latest evaluation for a project
CREATE OR REPLACE FUNCTION get_latest_project_evaluation(p_project_id UUID, p_tax_year INTEGER DEFAULT 2024)
RETURNS public.project_ai_evaluations AS $$
    SELECT * FROM public.project_ai_evaluations
    WHERE project_id = p_project_id 
      AND tax_year = p_tax_year 
      AND is_latest = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to compute inputs hash for staleness detection
CREATE OR REPLACE FUNCTION compute_project_inputs_hash(p_project_id UUID, p_tax_year INTEGER DEFAULT 2024)
RETURNS TEXT AS $$
DECLARE
    hash_input TEXT;
BEGIN
    SELECT md5(
        COALESCE(p.name, '') || '|' ||
        COALESCE(p.description, '') || '|' ||
        COALESCE(p.technical_uncertainty, '') || '|' ||
        COALESCE(p.process_of_experimentation, '') || '|' ||
        COALESCE(p.updated_at::TEXT, '') || '|' ||
        COALESCE(
            (SELECT string_agg(q.response_text, '|' ORDER BY q.id)
             FROM public.project_questionnaire_items q 
             WHERE q.project_id = p_project_id),
            ''
        ) || '|' ||
        COALESCE(
            (SELECT string_agg(e.id::TEXT, '|' ORDER BY e.id)
             FROM public.project_evidence_items e 
             WHERE e.project_id = p_project_id),
            ''
        )
    ) INTO hash_input
    FROM public.projects p
    WHERE p.id = p_project_id;
    
    RETURN hash_input;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if evaluation is stale
CREATE OR REPLACE FUNCTION is_evaluation_stale(p_project_id UUID, p_tax_year INTEGER DEFAULT 2024)
RETURNS BOOLEAN AS $$
DECLARE
    current_hash TEXT;
    stored_hash TEXT;
BEGIN
    current_hash := compute_project_inputs_hash(p_project_id, p_tax_year);
    
    SELECT inputs_snapshot_hash INTO stored_hash
    FROM public.project_ai_evaluations
    WHERE project_id = p_project_id 
      AND tax_year = p_tax_year 
      AND is_latest = TRUE;
    
    IF stored_hash IS NULL THEN
        RETURN TRUE; -- No evaluation exists
    END IF;
    
    RETURN current_hash != stored_hash;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count open gaps for a project
CREATE OR REPLACE FUNCTION get_project_open_gaps_count(p_project_id UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER 
    FROM public.project_gaps 
    WHERE project_id = p_project_id 
      AND status IN ('open', 'in_progress', 'pending_review');
$$ LANGUAGE SQL STABLE;

-- Trigger to update open_gaps_count on projects
CREATE OR REPLACE FUNCTION update_project_gaps_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE public.projects 
        SET open_gaps_count = get_project_open_gaps_count(OLD.project_id)
        WHERE id = OLD.project_id;
        RETURN OLD;
    ELSE
        UPDATE public.projects 
        SET open_gaps_count = get_project_open_gaps_count(NEW.project_id)
        WHERE id = NEW.project_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_gaps_count ON public.project_gaps;
CREATE TRIGGER trigger_update_project_gaps_count
AFTER INSERT OR UPDATE OR DELETE ON public.project_gaps
FOR EACH ROW EXECUTE FUNCTION update_project_gaps_count();

-- =============================================================================
-- 8. UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_evidence_updated_at ON public.project_evidence_items;
CREATE TRIGGER trigger_evidence_updated_at
BEFORE UPDATE ON public.project_evidence_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_gaps_updated_at ON public.project_gaps;
CREATE TRIGGER trigger_gaps_updated_at
BEFORE UPDATE ON public.project_gaps
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9. PROJECT NARRATIVE DRAFTS TABLE (for copilot-generated narratives)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_narrative_drafts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    
    -- Narrative content
    narrative_type TEXT CHECK (narrative_type IN ('project_summary', 'technical_uncertainty', 'process_of_experimentation', 'permitted_purpose', 'full_narrative')) NOT NULL,
    draft_content TEXT NOT NULL,
    
    -- Source tracking
    evidence_ids_cited UUID[] DEFAULT '{}',
    questionnaire_item_ids_used UUID[] DEFAULT '{}',
    
    -- Status
    status TEXT CHECK (status IN ('draft', 'accepted', 'rejected', 'superseded')) DEFAULT 'draft',
    accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    
    -- Model info
    model_name TEXT,
    prompt_version TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_narrative_drafts_project ON public.project_narrative_drafts(project_id);

ALTER TABLE public.project_narrative_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view narrative drafts for their organization" ON public.project_narrative_drafts;
CREATE POLICY "Users can view narrative drafts for their organization" ON public.project_narrative_drafts
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage narrative drafts for their organization" ON public.project_narrative_drafts;
CREATE POLICY "Users can manage narrative drafts for their organization" ON public.project_narrative_drafts
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMENT ON TABLE public.project_ai_evaluations IS 'Versioned AI evaluation results per project. Never deleted, only appended.';
COMMENT ON TABLE public.project_evidence_items IS 'Evidence artifacts uploaded to support qualification. Supports file and URL types.';
COMMENT ON TABLE public.project_gaps IS 'Missing requirements identified by AI or manually. Resolution workflow with task linking.';
COMMENT ON TABLE public.project_narrative_drafts IS 'AI-drafted narratives for CPA review before acceptance.';


