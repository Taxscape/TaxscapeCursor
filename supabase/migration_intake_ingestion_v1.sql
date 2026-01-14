-- ============================================================================
-- INTAKE INGESTION PIPELINE MIGRATION (Prompt 9)
-- ============================================================================
-- Implements:
-- 1. Expand client_intake_sessions with processing fields
-- 2. intake_files - uploaded file tracking with classification
-- 3. intake_mappings - mapping tasks for user resolution
-- 4. Canonical table extensions for full intake data
-- 5. section_174_responses for questionnaire data
-- ============================================================================

-- ============================================================================
-- 1. EXPAND CLIENT_INTAKE_SESSIONS
-- ============================================================================

-- Add processing fields if not present
ALTER TABLE public.client_intake_sessions
ADD COLUMN IF NOT EXISTS received_files_count INTEGER DEFAULT 0;

ALTER TABLE public.client_intake_sessions
ADD COLUMN IF NOT EXISTS parsed_summary JSONB DEFAULT '{}';

-- Ensure status enum covers all states
-- Status should be: open | awaiting_client | received_partial | processing | needs_mapping | complete | abandoned
-- Note: The constraint was added in previous migration, this just documents the states

-- ============================================================================
-- 2. CREATE INTAKE_FILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.intake_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_intake_session_id UUID REFERENCES public.client_intake_sessions(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Upload info
    uploaded_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'intake-files',
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes INTEGER,
    sha256 TEXT NOT NULL,
    
    -- Upload source
    upload_source TEXT DEFAULT 'portal_upload' CHECK (upload_source IN ('portal_upload', 'email_ingest_reserved')),
    
    -- Classification
    classification_domain TEXT DEFAULT 'unknown' CHECK (classification_domain IN (
        'employees_payroll',
        'projects',
        'timesheets',
        'vendors',
        'contracts',
        'ap_transactions',
        'supplies',
        'section_174_support',
        'unknown'
    )),
    classification_confidence FLOAT DEFAULT 0,
    classification_reason TEXT,
    classification_method TEXT DEFAULT 'heuristic' CHECK (classification_method IN ('heuristic', 'ai', 'user_override')),
    
    -- Status
    status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded',
        'classifying',
        'classified',
        'parsing',
        'needs_mapping',
        'parsed',
        'failed',
        'archived'
    )),
    
    -- Parse results
    parse_error TEXT,
    parse_summary JSONB DEFAULT '{}',
    -- parse_summary structure:
    -- { rows_parsed: int, rows_inserted: int, rows_updated: int, 
    --   columns_recognized: [], columns_missing: [], mapping_needed: bool }
    
    -- Metadata
    sheet_names JSONB DEFAULT '[]',  -- For Excel files
    header_row JSONB DEFAULT '[]',   -- First row of data
    preview_data JSONB DEFAULT '[]', -- First 20 rows for UI preview
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for intake_files
CREATE INDEX IF NOT EXISTS idx_intake_files_session ON public.intake_files(client_intake_session_id);
CREATE INDEX IF NOT EXISTS idx_intake_files_sha256 ON public.intake_files(sha256);
CREATE INDEX IF NOT EXISTS idx_intake_files_domain_status ON public.intake_files(classification_domain, status);
CREATE INDEX IF NOT EXISTS idx_intake_files_org ON public.intake_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_intake_files_client ON public.intake_files(client_company_id);

-- ============================================================================
-- 3. CREATE INTAKE_MAPPINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.intake_mappings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE CASCADE NOT NULL,
    
    -- Mapping type
    mapping_type TEXT NOT NULL CHECK (mapping_type IN (
        'column_mapping',
        'project_name_matching',
        'employee_matching',
        'vendor_matching',
        'category_classification',
        'tax_year_assignment',
        'sheet_domain_assignment'
    )),
    
    -- Status
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    
    -- Task details
    prompt TEXT NOT NULL,           -- Human-readable description
    context JSONB DEFAULT '{}',     -- Additional context (row data, etc.)
    options JSONB DEFAULT '[]',     -- Suggested options
    
    -- Resolution
    resolution JSONB,               -- Final mapping choice
    resolved_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for intake_mappings
CREATE INDEX IF NOT EXISTS idx_intake_mappings_file ON public.intake_mappings(intake_file_id);
CREATE INDEX IF NOT EXISTS idx_intake_mappings_status ON public.intake_mappings(status);
CREATE INDEX IF NOT EXISTS idx_intake_mappings_type ON public.intake_mappings(mapping_type);

-- ============================================================================
-- 4. EXTEND CANONICAL TABLES FOR INTAKE DATA
-- ============================================================================

-- Extend employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS tax_year TEXT;

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS location_state TEXT;

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS w2_wages DECIMAL(15, 2);

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS stock_compensation DECIMAL(15, 2);

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS severance DECIMAL(15, 2);

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS bonus DECIMAL(15, 2);

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL;

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS employee_external_id TEXT;  -- Client's employee ID

-- Extend projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS tax_year TEXT;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS project_owner TEXT;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS project_contact TEXT;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL;

-- Extend time_logs table (or create if not exists)
-- Note: May already exist as time_logs from earlier migrations
ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS tax_year TEXT;

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'timesheet' CHECK (source IN ('timesheet', 'allocation', 'estimate'));

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS period_start DATE;

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS period_end DATE;

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS allocation_method TEXT;

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL;

-- Extend contractors table (used for vendors)
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS tax_year TEXT;

ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States';

ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS risk_bearer TEXT CHECK (risk_bearer IN ('client', 'vendor', 'shared', 'unknown'));

ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS ip_rights TEXT CHECK (ip_rights IN ('client', 'vendor', 'shared', 'unknown'));

ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS is_foreign_research BOOLEAN DEFAULT FALSE;

ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL;

-- Create contracts table if not exists
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Vendor link
    contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
    vendor_name TEXT,
    
    -- Contract details
    contract_name TEXT,
    contract_type TEXT,
    effective_date DATE,
    expiration_date DATE,
    contract_value DECIMAL(15, 2),
    
    -- R&D specific
    risk_bearer TEXT CHECK (risk_bearer IN ('client', 'vendor', 'shared', 'unknown')),
    ip_rights TEXT CHECK (ip_rights IN ('client', 'vendor', 'shared', 'unknown')),
    scope_of_work TEXT,
    
    -- Storage
    storage_bucket TEXT,
    storage_path TEXT,
    
    -- Metadata
    tax_year TEXT,
    needs_review BOOLEAN DEFAULT TRUE,
    source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts(client_company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON public.contracts(contractor_id);

-- Extend expenses table for AP transactions
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS tax_year TEXT;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS vendor_name TEXT;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS gl_account TEXT;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS invoice_id TEXT;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS expense_date DATE;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS rd_category TEXT CHECK (rd_category IN (
    'wages', 'contract_research', 'supplies', 'non_qualified', 'needs_review', NULL
));

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL;

-- Create supplies table if not exists
CREATE TABLE IF NOT EXISTS public.supplies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Item details
    item_name TEXT NOT NULL,
    description TEXT,
    vendor_name TEXT,
    vendor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
    
    -- Project link
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT,
    
    -- Financial
    amount DECIMAL(15, 2),
    purchase_date DATE,
    
    -- R&D qualification
    consumed BOOLEAN DEFAULT TRUE,
    capitalized BOOLEAN DEFAULT FALSE,
    rd_qualified BOOLEAN DEFAULT TRUE,
    qualification_status TEXT DEFAULT 'pending' CHECK (qualification_status IN ('pending', 'qualified', 'not_qualified', 'needs_review')),
    
    -- Metadata
    tax_year TEXT,
    source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplies_org ON public.supplies(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplies_client ON public.supplies(client_company_id);
CREATE INDEX IF NOT EXISTS idx_supplies_project ON public.supplies(project_id);

-- Create section_174_responses table
CREATE TABLE IF NOT EXISTS public.section_174_responses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Context
    tax_year TEXT NOT NULL,
    
    -- Questionnaire responses (structured)
    has_software_development BOOLEAN,
    software_dev_nature TEXT,  -- internal_use, external_sale, both
    dev_vs_maintenance_ratio TEXT,
    has_foreign_development BOOLEAN,
    
    -- R&E expenditure categories
    labor_us DECIMAL(15, 2),
    labor_foreign DECIMAL(15, 2),
    supplies_total DECIMAL(15, 2),
    contract_research_us DECIMAL(15, 2),
    contract_research_foreign DECIMAL(15, 2),
    
    -- Treatment info
    book_treatment TEXT,
    currently_capitalized_costs BOOLEAN,
    has_167f_software_amortization BOOLEAN,
    has_patent_acquisition_costs BOOLEAN,
    
    -- Additional structured answers
    responses JSONB DEFAULT '{}',
    
    -- Source
    source_intake_file_id UUID REFERENCES public.intake_files(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_174_responses_client ON public.section_174_responses(client_company_id, tax_year);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.intake_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_174_responses ENABLE ROW LEVEL SECURITY;

-- intake_files policies
CREATE POLICY "Users can view org intake files" ON public.intake_files
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can create intake files" ON public.intake_files
    FOR INSERT WITH CHECK (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

CREATE POLICY "CPAs can update intake files" ON public.intake_files
    FOR UPDATE USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- intake_mappings policies (inherit from files)
CREATE POLICY "Users can view org mappings" ON public.intake_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.intake_files f
            WHERE f.id = intake_file_id
            AND f.organization_id = public.get_user_org_id()
        )
    );

CREATE POLICY "CPAs can manage mappings" ON public.intake_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.intake_files f
            WHERE f.id = intake_file_id
            AND f.organization_id = public.get_user_org_id()
            AND (public.is_org_admin(f.organization_id) OR public.is_org_cpa(f.organization_id))
        )
    );

-- contracts policies
CREATE POLICY "Users can view org contracts" ON public.contracts
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can manage contracts" ON public.contracts
    FOR ALL USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- supplies policies
CREATE POLICY "Users can view org supplies" ON public.supplies
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can manage supplies" ON public.supplies
    FOR ALL USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- section_174_responses policies
CREATE POLICY "Users can view org 174 responses" ON public.section_174_responses
    FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "CPAs can manage 174 responses" ON public.section_174_responses
    FOR ALL USING (
        organization_id = public.get_user_org_id() AND
        (public.is_org_admin(organization_id) OR public.is_org_cpa(organization_id))
    );

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Auto-update triggers
DROP TRIGGER IF EXISTS update_intake_files_updated_at ON public.intake_files;
CREATE TRIGGER update_intake_files_updated_at 
    BEFORE UPDATE ON public.intake_files
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at 
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplies_updated_at ON public.supplies;
CREATE TRIGGER update_supplies_updated_at 
    BEFORE UPDATE ON public.supplies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_174_responses_updated_at ON public.section_174_responses;
CREATE TRIGGER update_174_responses_updated_at 
    BEFORE UPDATE ON public.section_174_responses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
