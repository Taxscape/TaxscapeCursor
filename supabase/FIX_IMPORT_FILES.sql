-- ============================================
-- FIX: Create import_files table if missing
-- Run this in Supabase SQL Editor
-- ============================================

-- First ensure the get_user_org_id function exists (needed for RLS)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Create import_files table with all needed columns
CREATE TABLE IF NOT EXISTS public.import_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER DEFAULT 2024,
    
    -- File metadata
    filename TEXT NOT NULL,
    file_type TEXT, -- 'xlsx', 'csv'
    file_size_bytes INTEGER,
    file_hash TEXT, -- SHA256 for deduplication
    
    -- Import status
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'previewing', 'committed', 'failed', 'rolled_back')),
    
    -- Preview results
    preview_summary JSONB DEFAULT '{}',
    sheet_mapping JSONB DEFAULT '{}',
    
    -- Commit results
    commit_summary JSONB DEFAULT '{}',
    committed_at TIMESTAMP WITH TIME ZONE,
    committed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Error tracking
    error_message TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if table exists but columns are missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_files' AND column_name = 'tax_year') THEN
        ALTER TABLE public.import_files ADD COLUMN tax_year INTEGER DEFAULT 2024;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'import_files' AND column_name = 'sheet_mapping') THEN
        ALTER TABLE public.import_files ADD COLUMN sheet_mapping JSONB DEFAULT '{}';
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_import_files_client ON public.import_files(client_company_id);
CREATE INDEX IF NOT EXISTS idx_import_files_status ON public.import_files(status);
CREATE INDEX IF NOT EXISTS idx_import_files_org ON public.import_files(organization_id);

-- Enable RLS
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view org import files" ON public.import_files;
CREATE POLICY "Users can view org import files" ON public.import_files
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org import files" ON public.import_files;
CREATE POLICY "Users can manage org import files" ON public.import_files
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_import_files_updated_at ON public.import_files;
CREATE TRIGGER update_import_files_updated_at BEFORE UPDATE ON public.import_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify
SELECT 'import_files table ready' as status;
