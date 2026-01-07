-- ============================================
-- RBAC & STRUCTURED TASK SYSTEM MIGRATION
-- ============================================

-- 1. ROLE DEFINITIONS ENUM
DO $$ BEGIN
    CREATE TYPE cpa_role AS ENUM ('managing_partner', 'reviewer', 'preparer', 'associate', 'ops_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. PERMISSION DEFINITIONS
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL, -- e.g., 'client.create', 'project.approve'
    category TEXT NOT NULL, -- 'org', 'client', 'project', 'task'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed canonical permissions
INSERT INTO public.permissions (code, category, description) VALUES
-- Org/Client Level
('client.create', 'client', 'Create new client companies'),
('client.edit', 'client', 'Edit client company details'),
('client.delete', 'client', 'Delete client companies'),
('client.configure_engagement', 'client', 'Configure tax year and engagement settings'),
('team.manage', 'org', 'Manage team membership and role changes'),
('metrics.view_firm', 'org', 'View firm-wide metrics and dashboards'),
-- Project Level
('project.create', 'project', 'Create new projects'),
('project.edit', 'project', 'Edit project details and narratives'),
('project.upload_evidence', 'project', 'Upload and link evidence to projects'),
('project.trigger_ai_eval', 'project', 'Trigger AI re-evaluations'),
('project.mark_criterion', 'project', 'Manually mark criterion sufficient/flagged'),
('project.mark_ready_review', 'project', 'Mark project ready for review'),
('project.approve_reject', 'project', 'Final approve/reject decision on projects'),
-- Task Level
('task.create', 'task', 'Create new tasks'),
('task.assign', 'task', 'Assign or reassign tasks'),
('task.change_status', 'task', 'Change task status'),
('task.submit', 'task', 'Submit task deliverables'),
('task.review', 'task', 'Review, accept, or deny task deliverables'),
('task.escalate', 'task', 'Escalate tasks'),
('task.close', 'task', 'Close or reopen tasks')
ON CONFLICT (code) DO NOTHING;

-- 3. ROLE-PERMISSION MAPPING
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    role cpa_role NOT NULL,
    permission_code TEXT REFERENCES public.permissions(code) ON DELETE CASCADE NOT NULL,
    UNIQUE(role, permission_code)
);

-- Seed role-permission matrix
-- Managing Partner: Full access
INSERT INTO public.role_permissions (role, permission_code) 
SELECT 'managing_partner', code FROM public.permissions ON CONFLICT DO NOTHING;

-- Reviewer: Most access except firm management
INSERT INTO public.role_permissions (role, permission_code) VALUES
('reviewer', 'client.create'), ('reviewer', 'client.edit'), ('reviewer', 'client.configure_engagement'),
('reviewer', 'project.create'), ('reviewer', 'project.edit'), ('reviewer', 'project.upload_evidence'),
('reviewer', 'project.trigger_ai_eval'), ('reviewer', 'project.mark_criterion'), ('reviewer', 'project.mark_ready_review'),
('reviewer', 'project.approve_reject'),
('reviewer', 'task.create'), ('reviewer', 'task.assign'), ('reviewer', 'task.change_status'),
('reviewer', 'task.submit'), ('reviewer', 'task.review'), ('reviewer', 'task.escalate'), ('reviewer', 'task.close')
ON CONFLICT DO NOTHING;

-- Preparer: Standard work access
INSERT INTO public.role_permissions (role, permission_code) VALUES
('preparer', 'client.edit'), ('preparer', 'client.configure_engagement'),
('preparer', 'project.create'), ('preparer', 'project.edit'), ('preparer', 'project.upload_evidence'),
('preparer', 'project.trigger_ai_eval'), ('preparer', 'project.mark_ready_review'),
('preparer', 'task.create'), ('preparer', 'task.assign'), ('preparer', 'task.change_status'),
('preparer', 'task.submit'), ('preparer', 'task.escalate')
ON CONFLICT DO NOTHING;

-- Associate: Limited access
INSERT INTO public.role_permissions (role, permission_code) VALUES
('associate', 'project.edit'), ('associate', 'project.upload_evidence'),
('associate', 'task.change_status'), ('associate', 'task.submit')
ON CONFLICT DO NOTHING;

-- 4. EXTEND PROFILES WITH ROLE
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpa_role cpa_role DEFAULT 'associate';

-- 5. CLIENT TEAM ASSIGNMENTS (Routing Configuration)
CREATE TABLE IF NOT EXISTS public.client_team_assignments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    preparer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    partner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    default_associate_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id)
);

-- 6. PROJECT TEAM OVERRIDES
CREATE TABLE IF NOT EXISTS public.project_team_overrides (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    preparer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id)
);

-- 7. TASK TYPES ENUM
DO $$ BEGIN
    CREATE TYPE task_type AS ENUM (
        'request_project_narrative',
        'request_process_of_experimentation_details',
        'request_uncertainty_statement',
        'request_technical_document_upload',
        'request_test_results_upload',
        'resolve_financial_anomaly',
        'verify_employee_allocation',
        'verify_contractor_qualification',
        'confirm_supply_eligibility',
        'review_ai_evaluation',
        'final_review_and_signoff',
        'generic'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. TASK STATUS ENUM
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'draft',
        'assigned',
        'in_progress',
        'submitted',
        'changes_requested',
        'accepted',
        'denied',
        'blocked',
        'escalated',
        'closed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. TASK PRIORITY ENUM
DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. STRUCTURED TASKS TABLE
CREATE TABLE IF NOT EXISTS public.structured_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    criterion_key TEXT, -- 'qualified_purpose', 'technological_in_nature', etc.
    task_type task_type NOT NULL DEFAULT 'generic',
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'draft',
    priority task_priority NOT NULL DEFAULT 'medium',
    due_date DATE,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    blocked_by_task_id UUID REFERENCES public.structured_tasks(id) ON DELETE SET NULL,
    related_entities JSONB DEFAULT '{}', -- { employees: [], contractors: [], expenses: [], evidence: [] }
    acceptance_criteria JSONB DEFAULT '[]', -- [{ key: 'has_attachment', label: 'Must attach document', met: false }]
    required_artifacts JSONB DEFAULT '[]', -- [{ type: 'file', label: 'Technical Document', file_types: ['pdf', 'docx'] }]
    submission JSONB, -- { artifacts: [], notes: '', submitted_at: '', submitted_by: '' }
    review JSONB, -- { decision: 'accepted'|'denied'|'changes_requested', reason_code: '', notes: '', reviewed_by: '', reviewed_at: '' }
    escalation_state JSONB, -- { level: 0, escalated_at: [], escalation_path: ['preparer', 'reviewer', 'partner'] }
    dedup_key TEXT, -- For preventing duplicate auto-generated tasks
    initiated_by_ai BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structured_tasks_org ON public.structured_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_structured_tasks_client ON public.structured_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_structured_tasks_project ON public.structured_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_structured_tasks_assigned ON public.structured_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_structured_tasks_status ON public.structured_tasks(status);
CREATE INDEX IF NOT EXISTS idx_structured_tasks_dedup ON public.structured_tasks(dedup_key);

-- 11. TASK EVENTS (Append-Only Audit Log)
CREATE TABLE IF NOT EXISTS public.task_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.structured_tasks(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'created', 'assigned', 'status_changed', 'comment_added', 'artifact_added', 'reviewed', 'escalated'
    payload JSONB DEFAULT '{}', -- { from_status: '', to_status: '', comment: '', routing_reason: '' }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON public.task_events(task_id);

-- 12. TASK TYPE CONFIGURATION (SLA, Routing Rules, Templates)
CREATE TABLE IF NOT EXISTS public.task_type_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_type task_type NOT NULL,
    default_sla_days INTEGER DEFAULT 3,
    default_priority task_priority DEFAULT 'medium',
    route_to_role cpa_role DEFAULT 'preparer', -- Default role to route to
    requires_review BOOLEAN DEFAULT FALSE,
    requires_partner_signoff BOOLEAN DEFAULT FALSE,
    acceptance_criteria_template JSONB DEFAULT '[]',
    required_artifacts_template JSONB DEFAULT '[]',
    escalation_path JSONB DEFAULT '["preparer", "reviewer", "managing_partner"]',
    UNIQUE(organization_id, task_type)
);

-- Seed default task type configurations (org_id NULL = global defaults)
INSERT INTO public.task_type_config (organization_id, task_type, default_sla_days, default_priority, route_to_role, requires_review, requires_partner_signoff, acceptance_criteria_template, required_artifacts_template) VALUES
(NULL, 'request_project_narrative', 5, 'medium', 'preparer', false, false, '[{"key": "has_narrative", "label": "Project narrative must be complete"}]', '[{"type": "text", "label": "Project Narrative"}]'),
(NULL, 'request_process_of_experimentation_details', 5, 'medium', 'preparer', false, false, '[{"key": "has_process_details", "label": "Experimentation process described"}]', '[{"type": "text", "label": "Process Description"}]'),
(NULL, 'request_uncertainty_statement', 5, 'medium', 'preparer', false, false, '[{"key": "has_uncertainty", "label": "Technical uncertainty documented"}]', '[{"type": "text", "label": "Uncertainty Statement"}]'),
(NULL, 'request_technical_document_upload', 3, 'high', 'associate', false, false, '[{"key": "has_file", "label": "Technical document attached"}]', '[{"type": "file", "label": "Technical Document", "file_types": ["pdf", "docx", "xlsx"]}]'),
(NULL, 'request_test_results_upload', 3, 'high', 'associate', false, false, '[{"key": "has_file", "label": "Test results attached"}]', '[{"type": "file", "label": "Test Results", "file_types": ["pdf", "xlsx", "csv"]}]'),
(NULL, 'resolve_financial_anomaly', 2, 'urgent', 'preparer', true, false, '[{"key": "anomaly_resolved", "label": "Financial anomaly explained or corrected"}]', '[{"type": "text", "label": "Explanation"}]'),
(NULL, 'verify_employee_allocation', 3, 'medium', 'associate', false, false, '[{"key": "allocation_confirmed", "label": "Employee allocation verified"}]', '[]'),
(NULL, 'verify_contractor_qualification', 3, 'medium', 'associate', false, false, '[{"key": "qualification_confirmed", "label": "Contractor qualification verified"}]', '[]'),
(NULL, 'confirm_supply_eligibility', 3, 'medium', 'associate', false, false, '[{"key": "eligibility_confirmed", "label": "Supply eligibility confirmed"}]', '[]'),
(NULL, 'review_ai_evaluation', 2, 'high', 'reviewer', true, false, '[{"key": "evaluation_reviewed", "label": "AI evaluation reviewed and validated"}]', '[]'),
(NULL, 'final_review_and_signoff', 5, 'high', 'reviewer', true, true, '[{"key": "all_criteria_met", "label": "All four-part test criteria satisfied"}, {"key": "documentation_complete", "label": "All documentation complete"}]', '[]'),
(NULL, 'generic', 3, 'medium', 'preparer', false, false, '[]', '[]')
ON CONFLICT DO NOTHING;

-- 13. RLS POLICIES
ALTER TABLE public.client_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structured_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_type_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org team assignments" ON public.client_team_assignments
    FOR SELECT USING (organization_id = public.get_user_org_id());
CREATE POLICY "Users can manage their org team assignments" ON public.client_team_assignments
    FOR ALL USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can view their org project overrides" ON public.project_team_overrides
    FOR SELECT USING (organization_id = public.get_user_org_id());
CREATE POLICY "Users can manage their org project overrides" ON public.project_team_overrides
    FOR ALL USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can view their org tasks" ON public.structured_tasks
    FOR SELECT USING (organization_id = public.get_user_org_id());
CREATE POLICY "Users can manage their org tasks" ON public.structured_tasks
    FOR ALL USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can view their org task events" ON public.task_events
    FOR SELECT USING (task_id IN (SELECT id FROM public.structured_tasks WHERE organization_id = public.get_user_org_id()));

CREATE POLICY "Users can view global and org task configs" ON public.task_type_config
    FOR SELECT USING (organization_id IS NULL OR organization_id = public.get_user_org_id());




