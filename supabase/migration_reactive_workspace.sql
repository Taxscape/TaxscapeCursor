-- ============================================
-- REACTIVE WORKSPACE MIGRATION
-- ============================================

-- 1. ADD VERSIONING AND AUDIT COLUMNS TO CORE TABLES
-- Adding version (int) and last_modified_by (uuid) to ensure reliable caching and conflict resolution.

DO $$ 
DECLARE 
    t TEXT;
BEGIN 
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'profiles', 'client_companies', 'projects', 
            'employees', 'contractors', 'expenses', 'budgets', 
            'time_logs', 'verification_tasks', 'project_workflow_status',
            'project_criterion_status', 'project_evidence'
        )
    LOOP 
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;', t);
    END LOOP;
END $$;

-- 2. CREATE SAVED VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.saved_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('projects', 'employees', 'contractors', 'tasks', 'expenses')),
    name TEXT NOT NULL,
    filters JSONB DEFAULT '[]',
    sort JSONB DEFAULT '[]',
    grouping JSONB DEFAULT '[]',
    visible_columns JSONB DEFAULT '[]',
    pinned BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_org_user ON public.saved_views(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_entity ON public.saved_views(entity_type);

-- 3. ENHANCE AUDIT LOGS FOR DIFFS
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS before_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS after_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS request_id TEXT;

-- 4. RLS FOR SAVED VIEWS
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own or shared org views" ON public.saved_views
    FOR SELECT USING (
        organization_id = public.get_user_org_id() AND (
            user_id = auth.uid() OR is_shared = TRUE
        )
    );

CREATE POLICY "Users can create their own views" ON public.saved_views
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND user_id = auth.uid()
    );

CREATE POLICY "Users can update their own views" ON public.saved_views
    FOR UPDATE USING (
        user_id = auth.uid()
    );

CREATE POLICY "Users can delete their own views" ON public.saved_views
    FOR DELETE USING (
        user_id = auth.uid()
    );

-- 5. FUNCTION TO AUTO-INCREMENT VERSION
CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for version increment
DO $$ 
DECLARE 
    t TEXT;
BEGIN 
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'profiles', 'client_companies', 'projects', 
            'employees', 'contractors', 'expenses', 'budgets', 
            'time_logs', 'verification_tasks', 'saved_views'
        )
    LOOP 
        EXECUTE format('DROP TRIGGER IF EXISTS tr_increment_version_%I ON public.%I;', t, t);
        EXECUTE format('CREATE TRIGGER tr_increment_version_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.increment_version();', t, t);
    END LOOP;
END $$;



