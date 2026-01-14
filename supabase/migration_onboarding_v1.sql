-- Migration: Onboarding System v1
-- Description: Adds onboarding sessions, step logs, and profile extensions for CPA first-run experience
-- Date: 2026-01-11

-- ============================================================================
-- 1. Extend profiles table with onboarding fields
-- ============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_seen_onboarding boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS experience_level text CHECK (experience_level IN ('new', 'some', 'experienced')),
ADD COLUMN IF NOT EXISTS onboarding_session_id uuid,
ADD COLUMN IF NOT EXISTS onboarding_last_seen_at timestamptz;

COMMENT ON COLUMN profiles.has_seen_onboarding IS 'Whether user has completed or skipped onboarding';
COMMENT ON COLUMN profiles.experience_level IS 'User self-reported R&D credit experience level';
COMMENT ON COLUMN profiles.onboarding_session_id IS 'Current active onboarding session';
COMMENT ON COLUMN profiles.onboarding_last_seen_at IS 'Last time user interacted with onboarding';

-- ============================================================================
-- 2. Create onboarding_sessions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_company_id uuid REFERENCES client_companies(id) ON DELETE SET NULL,
    tax_years jsonb DEFAULT '[]'::jsonb,
    purchased_sections jsonb DEFAULT '{}'::jsonb,
    study_scope text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    context_snapshot jsonb NOT NULL DEFAULT '{
        "known_fields": {},
        "missing_fields": [],
        "last_step_key": null,
        "last_agent_message_id": null
    }'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes for onboarding_sessions
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_org_id ON onboarding_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_created_at ON onboarding_sessions(created_at DESC);

-- Add FK constraint to profiles
ALTER TABLE profiles 
ADD CONSTRAINT fk_profiles_onboarding_session 
FOREIGN KEY (onboarding_session_id) 
REFERENCES onboarding_sessions(id) ON DELETE SET NULL;

COMMENT ON TABLE onboarding_sessions IS 'Tracks onboarding progress for new CPA users';
COMMENT ON COLUMN onboarding_sessions.context_snapshot IS 'Agent-readable state: known_fields, missing_fields, last_step_key, last_agent_message_id';
COMMENT ON COLUMN onboarding_sessions.purchased_sections IS 'Modules client purchased e.g. {section_41: true, section_174: false}';
COMMENT ON COLUMN onboarding_sessions.tax_years IS 'Array of tax years for the study e.g. [2022, 2023]';

-- ============================================================================
-- 3. Create onboarding_step_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS onboarding_step_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    onboarding_session_id uuid NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
    step_key text NOT NULL CHECK (step_key IN (
        'experience_level',
        'client_selection',
        'tax_years_selection',
        'purchased_sections_confirmation',
        'scope_confirmation',
        'kickoff_summary_confirmation',
        'handoff_to_intake_package',
        'onboarding_complete'
    )),
    status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
        'not_started',
        'in_progress',
        'completed',
        'skipped',
        'blocked'
    )),
    completion_method text CHECK (completion_method IN (
        'manual_user_action',
        'ai_validated',
        'senior_override'
    )),
    completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Indexes for onboarding_step_logs
CREATE INDEX IF NOT EXISTS idx_onboarding_step_logs_session_step 
ON onboarding_step_logs(onboarding_session_id, step_key);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_logs_completed_at 
ON onboarding_step_logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_logs_status 
ON onboarding_step_logs(status);

-- Unique constraint: one log per step per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_step_logs_unique_step 
ON onboarding_step_logs(onboarding_session_id, step_key);

COMMENT ON TABLE onboarding_step_logs IS 'Tracks completion status for each onboarding step';
COMMENT ON COLUMN onboarding_step_logs.completion_method IS 'How step was completed: manual_user_action, ai_validated, senior_override';
COMMENT ON COLUMN onboarding_step_logs.metadata IS 'Step-specific data: selected ids, text entered, rationale';

-- ============================================================================
-- 4. RLS Policies for onboarding_sessions
-- ============================================================================

ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read their own sessions
CREATE POLICY "Users can read own onboarding sessions"
ON onboarding_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Org members with CPA/executive role can read sessions for oversight
CREATE POLICY "Org admins can read org onboarding sessions"
ON onboarding_sessions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.organization_id = onboarding_sessions.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'executive', 'cpa_partner')
    )
);

-- Only session owner can insert
CREATE POLICY "Users can create own onboarding sessions"
ON onboarding_sessions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only session owner can update
CREATE POLICY "Users can update own onboarding sessions"
ON onboarding_sessions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 5. RLS Policies for onboarding_step_logs
-- ============================================================================

ALTER TABLE onboarding_step_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own step logs (through session ownership)
CREATE POLICY "Users can read own step logs"
ON onboarding_step_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM onboarding_sessions os
        WHERE os.id = onboarding_step_logs.onboarding_session_id
        AND os.user_id = auth.uid()
    )
);

-- Org admins can read step logs
CREATE POLICY "Org admins can read org step logs"
ON onboarding_step_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM onboarding_sessions os
        JOIN organization_members om ON om.organization_id = os.organization_id
        WHERE os.id = onboarding_step_logs.onboarding_session_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'executive', 'cpa_partner')
    )
);

-- Only session owner can insert step logs
CREATE POLICY "Users can create own step logs"
ON onboarding_step_logs FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM onboarding_sessions os
        WHERE os.id = onboarding_step_logs.onboarding_session_id
        AND os.user_id = auth.uid()
    )
);

-- Only session owner can update step logs
CREATE POLICY "Users can update own step logs"
ON onboarding_step_logs FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM onboarding_sessions os
        WHERE os.id = onboarding_step_logs.onboarding_session_id
        AND os.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM onboarding_sessions os
        WHERE os.id = onboarding_step_logs.onboarding_session_id
        AND os.user_id = auth.uid()
    )
);

-- ============================================================================
-- 6. Updated_at trigger for onboarding_sessions
-- ============================================================================

CREATE OR REPLACE FUNCTION update_onboarding_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_onboarding_session_updated_at ON onboarding_sessions;
CREATE TRIGGER trigger_update_onboarding_session_updated_at
    BEFORE UPDATE ON onboarding_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_session_updated_at();

-- ============================================================================
-- 7. Helper function to get onboarding progress
-- ============================================================================

CREATE OR REPLACE FUNCTION get_onboarding_progress(p_session_id uuid)
RETURNS TABLE (
    step_key text,
    status text,
    completion_method text,
    completed_at timestamptz,
    is_current boolean
) AS $$
DECLARE
    v_last_step text;
BEGIN
    -- Get the last completed step
    SELECT osl.step_key INTO v_last_step
    FROM onboarding_step_logs osl
    WHERE osl.onboarding_session_id = p_session_id
    AND osl.status = 'in_progress'
    ORDER BY osl.created_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT 
        osl.step_key,
        osl.status,
        osl.completion_method,
        osl.completed_at,
        (osl.step_key = v_last_step) as is_current
    FROM onboarding_step_logs osl
    WHERE osl.onboarding_session_id = p_session_id
    ORDER BY 
        CASE osl.step_key
            WHEN 'experience_level' THEN 1
            WHEN 'client_selection' THEN 2
            WHEN 'tax_years_selection' THEN 3
            WHEN 'purchased_sections_confirmation' THEN 4
            WHEN 'scope_confirmation' THEN 5
            WHEN 'kickoff_summary_confirmation' THEN 6
            WHEN 'handoff_to_intake_package' THEN 7
            WHEN 'onboarding_complete' THEN 8
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_onboarding_progress(uuid) TO authenticated;

-- ============================================================================
-- Done
-- ============================================================================
