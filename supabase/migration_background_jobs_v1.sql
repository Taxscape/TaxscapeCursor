-- ============================================================================
-- BACKGROUND JOBS MIGRATION v1
-- ============================================================================
-- Implements reliability + performance infrastructure for TaxScape Pro
-- Run this ONCE in Supabase SQL Editor
-- This file is IDEMPOTENT - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE ENUM TYPES
-- ============================================================================

-- Job type enum
DO $$ BEGIN
    CREATE TYPE background_job_type AS ENUM (
        'rd_parse_session',
        'ai_evaluate_projects',
        'ai_evaluate_single_project',
        'generate_excel_report',
        'generate_credit_estimate_export',
        'generate_study_artifacts',
        'generate_defense_pack',
        'evidence_reprocessing',
        'sync_expected_inputs',
        'intake_file_processing',
        'bulk_import',
        'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Job status enum
DO $$ BEGIN
    CREATE TYPE background_job_status AS ENUM (
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled',
        'cancellation_requested'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Job event type enum
DO $$ BEGIN
    CREATE TYPE job_event_type AS ENUM (
        'progress_update',
        'stage_change',
        'log',
        'warning',
        'error',
        'heartbeat',
        'child_job_created',
        'retry_scheduled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- PART 2: CREATE BACKGROUND_JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_company_id UUID REFERENCES client_companies(id) ON DELETE SET NULL,
    tax_year INTEGER,
    
    -- Job definition
    job_type background_job_type NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    idempotency_key TEXT NOT NULL,
    
    -- Job state
    status background_job_status DEFAULT 'queued' NOT NULL,
    params JSONB DEFAULT '{}' NOT NULL,
    progress JSONB DEFAULT '{"percent": 0, "stage": "queued", "detail": null, "counters": null, "last_heartbeat_at": null}' NOT NULL,
    result JSONB,
    error JSONB,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Parent/child relationships
    parent_job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
    retry_of_job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Worker tracking
    worker_id TEXT,
    last_heartbeat_at TIMESTAMPTZ,
    heartbeat_timeout_seconds INTEGER DEFAULT 300,
    
    -- Audit
    created_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Unique constraint for idempotency within organization
    CONSTRAINT background_jobs_idempotency_unique UNIQUE (organization_id, idempotency_key)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_background_jobs_org_status 
    ON background_jobs(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_client_year_status 
    ON background_jobs(client_company_id, tax_year, status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status 
    ON background_jobs(job_type, status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_parent 
    ON background_jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_background_jobs_queued_priority 
    ON background_jobs(priority DESC, created_at ASC) 
    WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_background_jobs_running_heartbeat 
    ON background_jobs(last_heartbeat_at) 
    WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_background_jobs_created_by 
    ON background_jobs(created_by_user_id, created_at DESC);

-- ============================================================================
-- PART 3: CREATE JOB_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
    
    event_type job_event_type NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fetching events by job
CREATE INDEX IF NOT EXISTS idx_job_events_job_id_created 
    ON job_events(job_id, created_at DESC);

-- Index for recent events across all jobs (for monitoring)
CREATE INDEX IF NOT EXISTS idx_job_events_created_at 
    ON job_events(created_at DESC);

-- ============================================================================
-- PART 4: CREATE JOB_LOCKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lock_key TEXT NOT NULL UNIQUE,
    job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
    
    acquired_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    released_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    -- Metadata
    lock_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for checking active locks
CREATE INDEX IF NOT EXISTS idx_job_locks_active 
    ON job_locks(lock_key) 
    WHERE released_at IS NULL;

-- Index for cleanup of expired locks
CREATE INDEX IF NOT EXISTS idx_job_locks_expires 
    ON job_locks(expires_at) 
    WHERE released_at IS NULL AND expires_at IS NOT NULL;

-- ============================================================================
-- PART 5: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_background_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_background_jobs_updated_at ON background_jobs;
CREATE TRIGGER trigger_background_jobs_updated_at
    BEFORE UPDATE ON background_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_background_job_timestamp();

-- Function to compute idempotency key
CREATE OR REPLACE FUNCTION compute_job_idempotency_key(
    p_job_type TEXT,
    p_client_company_id UUID,
    p_tax_year INTEGER,
    p_params JSONB
) RETURNS TEXT AS $$
DECLARE
    key_parts TEXT[];
    params_hash TEXT;
BEGIN
    key_parts := ARRAY[p_job_type];
    
    IF p_client_company_id IS NOT NULL THEN
        key_parts := array_append(key_parts, 'client:' || p_client_company_id::TEXT);
    END IF;
    
    IF p_tax_year IS NOT NULL THEN
        key_parts := array_append(key_parts, 'year:' || p_tax_year::TEXT);
    END IF;
    
    -- Hash relevant params (exclude transient data)
    params_hash := md5(COALESCE(p_params - 'force' - 'timestamp' - 'request_id', '{}')::TEXT);
    key_parts := array_append(key_parts, 'params:' || params_hash);
    
    RETURN array_to_string(key_parts, ':');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to claim next queued job (for worker)
CREATE OR REPLACE FUNCTION claim_next_job(
    p_worker_id TEXT,
    p_job_types background_job_type[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    claimed_job_id UUID;
BEGIN
    -- Select and update in single transaction
    UPDATE background_jobs
    SET 
        status = 'running',
        worker_id = p_worker_id,
        started_at = NOW(),
        last_heartbeat_at = NOW(),
        progress = jsonb_set(progress, '{stage}', '"starting"')
    WHERE id = (
        SELECT id FROM background_jobs
        WHERE status = 'queued'
        AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id INTO claimed_job_id;
    
    RETURN claimed_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark stuck jobs as failed
CREATE OR REPLACE FUNCTION mark_stuck_jobs_failed()
RETURNS INTEGER AS $$
DECLARE
    stuck_count INTEGER;
BEGIN
    WITH stuck_jobs AS (
        UPDATE background_jobs
        SET 
            status = 'failed',
            completed_at = NOW(),
            error = jsonb_build_object(
                'error_type', 'worker_lost',
                'message', 'Job worker stopped responding',
                'hint', 'The worker processing this job may have crashed or restarted. You can retry this job.',
                'last_heartbeat', last_heartbeat_at
            )
        WHERE status = 'running'
        AND last_heartbeat_at < NOW() - (heartbeat_timeout_seconds || ' seconds')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO stuck_count FROM stuck_jobs;
    
    -- Log events for stuck jobs
    INSERT INTO job_events (job_id, event_type, message, data)
    SELECT 
        id, 
        'error'::job_event_type, 
        'Job marked as failed due to worker timeout',
        jsonb_build_object('reason', 'heartbeat_timeout')
    FROM background_jobs
    WHERE status = 'failed'
    AND error->>'error_type' = 'worker_lost'
    AND completed_at > NOW() - INTERVAL '5 seconds';
    
    RETURN stuck_count;
END;
$$ LANGUAGE plpgsql;

-- Function to acquire a lock
CREATE OR REPLACE FUNCTION acquire_job_lock(
    p_lock_key TEXT,
    p_job_id UUID,
    p_expires_in_seconds INTEGER DEFAULT 3600,
    p_lock_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    lock_acquired BOOLEAN := FALSE;
BEGIN
    -- Try to insert lock, fail if exists and not expired
    INSERT INTO job_locks (lock_key, job_id, expires_at, lock_reason)
    VALUES (
        p_lock_key, 
        p_job_id, 
        NOW() + (p_expires_in_seconds || ' seconds')::INTERVAL,
        p_lock_reason
    )
    ON CONFLICT (lock_key) DO UPDATE
    SET 
        job_id = EXCLUDED.job_id,
        acquired_at = NOW(),
        released_at = NULL,
        expires_at = EXCLUDED.expires_at,
        lock_reason = EXCLUDED.lock_reason
    WHERE 
        job_locks.released_at IS NOT NULL 
        OR job_locks.expires_at < NOW();
    
    -- Check if we got the lock
    SELECT EXISTS (
        SELECT 1 FROM job_locks 
        WHERE lock_key = p_lock_key 
        AND job_id = p_job_id 
        AND released_at IS NULL
    ) INTO lock_acquired;
    
    RETURN lock_acquired;
END;
$$ LANGUAGE plpgsql;

-- Function to release a lock
CREATE OR REPLACE FUNCTION release_job_lock(
    p_lock_key TEXT,
    p_job_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    released BOOLEAN := FALSE;
BEGIN
    UPDATE job_locks
    SET released_at = NOW()
    WHERE lock_key = p_lock_key
    AND job_id = p_job_id
    AND released_at IS NULL
    RETURNING TRUE INTO released;
    
    RETURN COALESCE(released, FALSE);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_locks ENABLE ROW LEVEL SECURITY;

-- background_jobs policies
DROP POLICY IF EXISTS "Users can view jobs in their organization" ON background_jobs;
CREATE POLICY "Users can view jobs in their organization"
    ON background_jobs FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create jobs in their organization" ON background_jobs;
CREATE POLICY "Users can create jobs in their organization"
    ON background_jobs FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update jobs they created or are admin" ON background_jobs;
CREATE POLICY "Users can update jobs they created or are admin"
    ON background_jobs FOR UPDATE
    USING (
        created_by_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (is_admin = TRUE OR role IN ('executive', 'cpa'))
        )
    );

-- job_events policies
DROP POLICY IF EXISTS "Users can view events for jobs in their org" ON job_events;
CREATE POLICY "Users can view events for jobs in their org"
    ON job_events FOR SELECT
    USING (
        job_id IN (
            SELECT id FROM background_jobs 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "System can insert job events" ON job_events;
CREATE POLICY "System can insert job events"
    ON job_events FOR INSERT
    WITH CHECK (TRUE);  -- Events are created by the system

-- job_locks policies
DROP POLICY IF EXISTS "Users can view locks for jobs in their org" ON job_locks;
CREATE POLICY "Users can view locks for jobs in their org"
    ON job_locks FOR SELECT
    USING (
        job_id IN (
            SELECT id FROM background_jobs 
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- ============================================================================
-- PART 7: REALTIME SUBSCRIPTION (Optional)
-- ============================================================================

-- Enable realtime for job progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE background_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE job_events;

-- ============================================================================
-- PART 8: AUDIT LOG INTEGRATION
-- ============================================================================

-- Function to log job completion/failure to audit_log
CREATE OR REPLACE FUNCTION log_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log when job completes or fails (status changes)
    IF OLD.status IN ('queued', 'running') 
       AND NEW.status IN ('completed', 'failed', 'cancelled') THEN
        INSERT INTO audit_log (
            organization_id,
            user_id,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
        ) VALUES (
            NEW.organization_id,
            NEW.created_by_user_id,
            CASE 
                WHEN NEW.status = 'completed' THEN 'job_completed'
                WHEN NEW.status = 'failed' THEN 'job_failed'
                WHEN NEW.status = 'cancelled' THEN 'job_cancelled'
            END,
            'background_job',
            NEW.id,
            jsonb_build_object(
                'job_type', NEW.job_type,
                'status', NEW.status,
                'client_company_id', NEW.client_company_id,
                'tax_year', NEW.tax_year,
                'duration_seconds', EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)),
                'retry_count', NEW.retry_count,
                'error_type', NEW.error->>'error_type'
            ),
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create audit log table if not exists (may already exist from other migrations)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_action 
    ON audit_log(organization_id, action, created_at DESC);

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS trigger_log_job_completion ON background_jobs;
CREATE TRIGGER trigger_log_job_completion
    AFTER UPDATE ON background_jobs
    FOR EACH ROW
    EXECUTE FUNCTION log_job_completion();

-- ============================================================================
-- PART 9: SCHEDULED CLEANUP (Manual or via pg_cron if available)
-- ============================================================================

-- Function to clean up old completed jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(
    p_days_to_keep INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete job events for old jobs first
    DELETE FROM job_events
    WHERE job_id IN (
        SELECT id FROM background_jobs
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND completed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
    );
    
    -- Delete old completed jobs
    WITH deleted AS (
        DELETE FROM background_jobs
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND completed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Clean up expired locks
    DELETE FROM job_locks
    WHERE released_at IS NOT NULL
    AND released_at < NOW() - INTERVAL '1 day';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Background Jobs migration v1 completed successfully';
    RAISE NOTICE 'Tables created: background_jobs, job_events, job_locks';
    RAISE NOTICE 'Functions created: claim_next_job, mark_stuck_jobs_failed, acquire_job_lock, release_job_lock';
END $$;
