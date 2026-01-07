-- ============================================
-- COPILOT ENGINE MIGRATION
-- ============================================

-- 1. AI SUGGESTIONS TABLE
-- Stores proactive insights surfaced by the Copilot
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'missing_item', 'risk', 'draft', 'anomaly'
    severity TEXT DEFAULT 'info', -- 'info', 'warning', 'critical'
    summary TEXT NOT NULL,
    findings JSONB DEFAULT '[]', -- Detailed grounded findings
    citations JSONB DEFAULT '[]', -- References to evidence_id, file_id, etc.
    suggested_actions JSONB DEFAULT '[]', -- List of NBA action types
    questions_for_user JSONB DEFAULT '[]',
    confidence FLOAT DEFAULT 0.0,
    status TEXT DEFAULT 'active', -- 'active', 'dismissed', 'applied'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_project_id ON public.ai_suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_client_id ON public.ai_suggestions(client_id);

-- 2. AI PROPOSED ACTIONS TABLE
-- Actions the Copilot wants to execute, waiting for CPA approval
CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    suggestion_id UUID REFERENCES public.ai_suggestions(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- 'create_task', 'draft_narrative', 'link_evidence', etc.
    target_entity_type TEXT, -- 'project', 'verification_task', etc.
    target_entity_id UUID,
    proposed_changes JSONB NOT NULL, -- The diff/payload to apply
    status TEXT DEFAULT 'pending_approval', -- 'pending_approval', 'approved', 'rejected', 'executed'
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_proposed_actions_status ON public.ai_proposed_actions(status);

-- 3. AI INTERACTION LOGS (Observability)
CREATE TABLE IF NOT EXISTS public.ai_interaction_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    interaction_type TEXT NOT NULL, -- 'query', 'suggestion_generated', 'action_executed'
    request_payload JSONB DEFAULT '{}',
    response_payload JSONB DEFAULT '{}',
    response_time_ms INTEGER,
    citation_count INTEGER DEFAULT 0,
    is_hallucination_check_passed BOOLEAN DEFAULT TRUE,
    request_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS POLICIES
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org suggestions" ON public.ai_suggestions
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can manage suggestions" ON public.ai_suggestions
    FOR ALL USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can view org proposed actions" ON public.ai_proposed_actions
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can manage proposed actions" ON public.ai_proposed_actions
    FOR ALL USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can view their org interaction logs" ON public.ai_interaction_logs
    FOR SELECT USING (organization_id = public.get_user_org_id());




