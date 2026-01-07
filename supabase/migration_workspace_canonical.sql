-- ============================================
-- WORKSPACE CANONICAL MODEL MIGRATION
-- ============================================
-- Aligns database with training blueprint sheets:
-- Employees, Projects, Timesheets, Project_Questionnaire, 
-- Vendors, Contracts, AP_Transactions, Supplies,
-- Section_174, Automated_Review, QRE_Summary_2024
-- ============================================
-- Strategy: Option A - Extend existing tables + minimal new tables
-- ============================================

-- ============================================
-- SECTION 1: SOURCE ENUM FOR IMPORT LINEAGE
-- ============================================
DO $$ BEGIN
    CREATE TYPE source_type_enum AS ENUM ('manual', 'import_excel', 'import_csv', 'api');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- SECTION 2: EXTEND EXISTING EMPLOYEES TABLE
-- ============================================
-- Add fields for full payroll/compensation tracking
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_id_natural TEXT; -- Natural key from Excel
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS exempt_status TEXT DEFAULT 'exempt' CHECK (exempt_status IN ('exempt', 'non_exempt'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_date DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS w2_box1_wages DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS payroll_taxes DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bonus DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS stock_compensation DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS severance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS qre_wage_base DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS rd_eligibility TEXT DEFAULT 'partial' CHECK (rd_eligibility IN ('full', 'partial', 'none'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_year INTEGER DEFAULT 2024;

-- Import lineage fields
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS source_type source_type_enum DEFAULT 'manual';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS source_file_id UUID;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS source_row_hash TEXT;

-- Create unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_natural_key 
    ON public.employees (client_company_id, employee_id_natural, tax_year) 
    WHERE employee_id_natural IS NOT NULL;

-- ============================================
-- SECTION 3: EXTEND EXISTING PROJECTS TABLE
-- ============================================
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_id_natural TEXT; -- Natural key from Excel
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS product_line TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS permitted_purpose_type TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS uncertainty_type TEXT CHECK (uncertainty_type IN ('capability', 'method', 'design', 'multiple'));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS experimentation_summary TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pm_system TEXT; -- Jira, Asana, etc.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS budget DECIMAL(12, 2);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tax_year INTEGER DEFAULT 2024;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE;

-- Import lineage fields
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_type source_type_enum DEFAULT 'manual';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_file_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_row_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_natural_key 
    ON public.projects (client_company_id, project_id_natural, tax_year) 
    WHERE project_id_natural IS NOT NULL;

-- ============================================
-- SECTION 4: NEW TIMESHEETS TABLE
-- ============================================
-- Distinct from time_logs which is for task tracking
-- Timesheets are for employee-project allocation by period
CREATE TABLE IF NOT EXISTS public.timesheets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- Natural key fields
    timesheet_id_natural TEXT, -- e.g. "EMP001-PROJ001-2024-01"
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Time allocation
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    hours DECIMAL(8, 2) NOT NULL DEFAULT 0,
    activity_code TEXT, -- R&D activity classification
    
    -- Approval workflow
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'needs_review')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approver_notes TEXT,
    
    -- Import lineage
    source_type source_type_enum DEFAULT 'manual',
    source_file_id UUID,
    source_row_hash TEXT,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_natural_key 
    ON public.timesheets (client_company_id, timesheet_id_natural, tax_year) 
    WHERE timesheet_id_natural IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON public.timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_project ON public.timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON public.timesheets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_timesheets_client_year ON public.timesheets(client_company_id, tax_year);

-- ============================================
-- SECTION 5: NEW VENDORS TABLE
-- ============================================
-- Separate from contractors - vendors have contract research fields
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Natural key
    vendor_id_natural TEXT NOT NULL, -- e.g. "VENDOR001"
    
    -- Vendor info
    name TEXT NOT NULL,
    service_type TEXT, -- Engineering, Testing, Consulting, etc.
    country TEXT DEFAULT 'US',
    location_state TEXT,
    
    -- Contract research qualification (IRC Sec 41)
    risk_bearer TEXT CHECK (risk_bearer IN ('company', 'vendor', 'shared', 'unknown')),
    ip_rights TEXT CHECK (ip_rights IN ('company', 'vendor', 'shared', 'unknown')),
    is_qualified_contract_research BOOLEAN DEFAULT FALSE,
    sec41_risk_flags JSONB DEFAULT '[]', -- [{flag, description, severity}]
    
    -- Import lineage
    source_type source_type_enum DEFAULT 'manual',
    source_file_id UUID,
    source_row_hash TEXT,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_natural_key 
    ON public.vendors (client_company_id, vendor_id_natural);
CREATE INDEX IF NOT EXISTS idx_vendors_client ON public.vendors(client_company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_qualified ON public.vendors(is_qualified_contract_research);

-- ============================================
-- SECTION 6: NEW CONTRACTS TABLE
-- ============================================
-- Links vendors to projects with SOW details
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    
    -- Natural key
    contract_id_natural TEXT NOT NULL, -- e.g. "CONTRACT001"
    
    -- Contract details
    title TEXT NOT NULL,
    sow_summary TEXT,
    effective_date DATE,
    expiration_date DATE,
    total_value DECIMAL(12, 2),
    
    -- Contract research qualification
    risk_terms TEXT, -- Description of risk allocation
    ip_ownership_terms TEXT, -- Description of IP ownership
    is_qualified_contract_research BOOLEAN DEFAULT FALSE,
    
    -- Project linkage (many-to-many stored as JSONB for flexibility)
    project_ids UUID[] DEFAULT '{}',
    
    -- Import lineage
    source_type source_type_enum DEFAULT 'manual',
    source_file_id UUID,
    source_row_hash TEXT,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_natural_key 
    ON public.contracts (client_company_id, contract_id_natural);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON public.contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts(client_company_id);

-- ============================================
-- SECTION 7: NEW AP_TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.ap_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    
    -- Natural key
    transaction_id_natural TEXT NOT NULL, -- e.g. "INV-2024-001"
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Transaction details
    invoice_number TEXT,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    category TEXT, -- Contract Research, Professional Services, etc.
    gl_account TEXT,
    invoice_date DATE,
    payment_date DATE,
    
    -- QRE calculation
    qre_eligible_percent DECIMAL(5, 2) DEFAULT 0, -- 0-100
    qre_amount DECIMAL(12, 2) DEFAULT 0, -- Calculated: amount * eligible% * 0.65 for contract research
    is_qualified_contract_research BOOLEAN DEFAULT FALSE,
    
    -- Project linkage
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- Import lineage
    source_type source_type_enum DEFAULT 'manual',
    source_file_id UUID,
    source_row_hash TEXT,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_transactions_natural_key 
    ON public.ap_transactions (client_company_id, transaction_id_natural, tax_year);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_vendor ON public.ap_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_project ON public.ap_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_ap_transactions_client_year ON public.ap_transactions(client_company_id, tax_year);

-- ============================================
-- SECTION 8: NEW SUPPLIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.supplies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- Natural key
    supply_id_natural TEXT NOT NULL, -- e.g. "SUPPLY-2024-001"
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Supply details
    item_description TEXT NOT NULL,
    category TEXT, -- Materials, Lab Supplies, Prototyping, etc.
    purchase_date DATE,
    gl_account TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    
    -- QRE eligibility
    is_qre_eligible BOOLEAN DEFAULT FALSE,
    qre_amount DECIMAL(12, 2) DEFAULT 0,
    eligibility_notes TEXT,
    
    -- Import lineage
    source_type source_type_enum DEFAULT 'manual',
    source_file_id UUID,
    source_row_hash TEXT,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplies_natural_key 
    ON public.supplies (client_company_id, supply_id_natural, tax_year);
CREATE INDEX IF NOT EXISTS idx_supplies_project ON public.supplies(project_id);
CREATE INDEX IF NOT EXISTS idx_supplies_client_year ON public.supplies(client_company_id, tax_year);

-- ============================================
-- SECTION 9: PROJECT QUESTIONNAIRE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_questionnaire_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Question details
    question_domain TEXT NOT NULL CHECK (question_domain IN (
        'permitted_purpose', 
        'uncertainty', 
        'experimentation', 
        'technological_nature', 
        'documentation_evidence',
        'missing_info'
    )),
    question_text TEXT NOT NULL,
    question_order INTEGER DEFAULT 0,
    
    -- Response
    response_text TEXT,
    response_status TEXT DEFAULT 'unanswered' CHECK (response_status IN (
        'unanswered', 'answered', 'needs_review', 'satisfied'
    )),
    
    -- Evidence linkage
    evidence_ids UUID[] DEFAULT '{}',
    
    -- Generation metadata
    generated_by TEXT DEFAULT 'system', -- 'system', 'ai', 'manual'
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_project ON public.project_questionnaire_items(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_status ON public.project_questionnaire_items(response_status);
CREATE INDEX IF NOT EXISTS idx_questionnaire_domain ON public.project_questionnaire_items(question_domain);

-- ============================================
-- SECTION 10: SECTION 174 ENTRIES
-- ============================================
CREATE TABLE IF NOT EXISTS public.section_174_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Cost categorization
    cost_type TEXT NOT NULL CHECK (cost_type IN ('wages', 'supplies', 'contract_research', 'other')),
    cost_amount DECIMAL(12, 2) NOT NULL,
    
    -- §174 amortization (5 years domestic, 15 years foreign)
    is_domestic BOOLEAN DEFAULT TRUE,
    amortization_years INTEGER DEFAULT 5, -- 5 or 15
    
    -- Capitalization schedule
    capitalized_amount DECIMAL(12, 2) NOT NULL,
    amortization_start_date DATE,
    current_year_expense DECIMAL(12, 2) DEFAULT 0, -- Amortization for current year
    remaining_basis DECIMAL(12, 2) DEFAULT 0,
    
    -- Computation details
    computation_notes TEXT,
    
    -- Audit fields
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    last_modified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_s174_client_year ON public.section_174_entries(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_s174_project ON public.section_174_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_s174_cost_type ON public.section_174_entries(cost_type);

-- ============================================
-- SECTION 11: AUTOMATED REVIEW ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.automated_review_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- Review item category
    category TEXT NOT NULL CHECK (category IN (
        'wage_anomaly',
        'timesheet_approval',
        'foreign_vendor',
        'ap_vendor_link',
        'supply_project_link',
        'project_documentation',
        'qre_calculation',
        'general'
    )),
    severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    
    -- Target entity
    entity_type TEXT, -- 'employee', 'project', 'vendor', 'supply', 'ap_transaction'
    entity_id UUID,
    entity_name TEXT,
    
    -- Metric details
    metric_name TEXT NOT NULL,
    metric_value TEXT,
    threshold_value TEXT,
    
    -- Status
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'waived')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Message
    message TEXT NOT NULL,
    
    -- Audit fields
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_client_year ON public.automated_review_items(client_company_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_review_category ON public.automated_review_items(category);
CREATE INDEX IF NOT EXISTS idx_review_status ON public.automated_review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_severity ON public.automated_review_items(severity);

-- ============================================
-- SECTION 12: QRE SUMMARIES
-- ============================================
CREATE TABLE IF NOT EXISTS public.qre_summaries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    tax_year INTEGER NOT NULL DEFAULT 2024,
    
    -- QRE totals
    wage_qre DECIMAL(12, 2) DEFAULT 0,
    supply_qre DECIMAL(12, 2) DEFAULT 0,
    contract_qre DECIMAL(12, 2) DEFAULT 0,
    total_qre DECIMAL(12, 2) DEFAULT 0,
    
    -- Breakdown details (JSONB for flexibility)
    wage_breakdown JSONB DEFAULT '{}', -- {by_department, by_project, by_employee_type}
    supply_breakdown JSONB DEFAULT '{}', -- {by_category, by_project}
    contract_breakdown JSONB DEFAULT '{}', -- {by_vendor, by_project}
    
    -- Credit calculation (simplified)
    estimated_credit DECIMAL(12, 2) DEFAULT 0,
    credit_method TEXT DEFAULT 'asc' CHECK (credit_method IN ('regular', 'asc')), -- Alternative Simplified Credit
    
    -- Staleness tracking
    last_inputs_updated_at TIMESTAMP WITH TIME ZONE,
    last_recompute_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_stale BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    version INTEGER DEFAULT 1,
    computed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique per client per year
    UNIQUE(client_company_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_qre_summary_client ON public.qre_summaries(client_company_id);
CREATE INDEX IF NOT EXISTS idx_qre_summary_year ON public.qre_summaries(tax_year);

-- ============================================
-- SECTION 13: IMPORT FILES TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS public.import_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    client_company_id UUID REFERENCES public.client_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- File metadata
    filename TEXT NOT NULL,
    file_type TEXT, -- 'xlsx', 'csv'
    file_size_bytes INTEGER,
    file_hash TEXT, -- SHA256 for deduplication
    
    -- Import status
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'previewing', 'committed', 'failed', 'rolled_back')),
    
    -- Preview results
    preview_summary JSONB DEFAULT '{}', -- {sheets, row_counts, conflicts}
    
    -- Commit results
    commit_summary JSONB DEFAULT '{}', -- {inserted, updated, errors}
    committed_at TIMESTAMP WITH TIME ZONE,
    committed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Error tracking
    error_message TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_files_client ON public.import_files(client_company_id);
CREATE INDEX IF NOT EXISTS idx_import_files_status ON public.import_files(status);

-- ============================================
-- SECTION 14: RLS POLICIES FOR NEW TABLES
-- ============================================

-- Timesheets
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org timesheets" ON public.timesheets;
CREATE POLICY "Users can view org timesheets" ON public.timesheets
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org timesheets" ON public.timesheets;
CREATE POLICY "Users can insert org timesheets" ON public.timesheets
    FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update org timesheets" ON public.timesheets;
CREATE POLICY "Users can update org timesheets" ON public.timesheets
    FOR UPDATE USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can delete org timesheets" ON public.timesheets;
CREATE POLICY "Users can delete org timesheets" ON public.timesheets
    FOR DELETE USING (organization_id = public.get_user_org_id());

-- Vendors
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org vendors" ON public.vendors;
CREATE POLICY "Users can view org vendors" ON public.vendors
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org vendors" ON public.vendors;
CREATE POLICY "Users can manage org vendors" ON public.vendors
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org contracts" ON public.contracts;
CREATE POLICY "Users can view org contracts" ON public.contracts
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org contracts" ON public.contracts;
CREATE POLICY "Users can manage org contracts" ON public.contracts
    FOR ALL USING (organization_id = public.get_user_org_id());

-- AP Transactions
ALTER TABLE public.ap_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org ap_transactions" ON public.ap_transactions;
CREATE POLICY "Users can view org ap_transactions" ON public.ap_transactions
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org ap_transactions" ON public.ap_transactions;
CREATE POLICY "Users can manage org ap_transactions" ON public.ap_transactions
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Supplies
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org supplies" ON public.supplies;
CREATE POLICY "Users can view org supplies" ON public.supplies
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org supplies" ON public.supplies;
CREATE POLICY "Users can manage org supplies" ON public.supplies
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Questionnaire Items
ALTER TABLE public.project_questionnaire_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org questionnaires" ON public.project_questionnaire_items;
CREATE POLICY "Users can view org questionnaires" ON public.project_questionnaire_items
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org questionnaires" ON public.project_questionnaire_items;
CREATE POLICY "Users can manage org questionnaires" ON public.project_questionnaire_items
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Section 174
ALTER TABLE public.section_174_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org s174" ON public.section_174_entries;
CREATE POLICY "Users can view org s174" ON public.section_174_entries
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org s174" ON public.section_174_entries;
CREATE POLICY "Users can manage org s174" ON public.section_174_entries
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Automated Review
ALTER TABLE public.automated_review_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org reviews" ON public.automated_review_items;
CREATE POLICY "Users can view org reviews" ON public.automated_review_items
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org reviews" ON public.automated_review_items;
CREATE POLICY "Users can manage org reviews" ON public.automated_review_items
    FOR ALL USING (organization_id = public.get_user_org_id());

-- QRE Summaries
ALTER TABLE public.qre_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org qre summaries" ON public.qre_summaries;
CREATE POLICY "Users can view org qre summaries" ON public.qre_summaries
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org qre summaries" ON public.qre_summaries;
CREATE POLICY "Users can manage org qre summaries" ON public.qre_summaries
    FOR ALL USING (organization_id = public.get_user_org_id());

-- Import Files
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org import files" ON public.import_files;
CREATE POLICY "Users can view org import files" ON public.import_files
    FOR SELECT USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can manage org import files" ON public.import_files;
CREATE POLICY "Users can manage org import files" ON public.import_files
    FOR ALL USING (organization_id = public.get_user_org_id());

-- ============================================
-- SECTION 15: UPDATED_AT TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS update_timesheets_updated_at ON public.timesheets;
CREATE TRIGGER update_timesheets_updated_at BEFORE UPDATE ON public.timesheets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendors_updated_at ON public.vendors;
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ap_transactions_updated_at ON public.ap_transactions;
CREATE TRIGGER update_ap_transactions_updated_at BEFORE UPDATE ON public.ap_transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplies_updated_at ON public.supplies;
CREATE TRIGGER update_supplies_updated_at BEFORE UPDATE ON public.supplies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_questionnaire_updated_at ON public.project_questionnaire_items;
CREATE TRIGGER update_questionnaire_updated_at BEFORE UPDATE ON public.project_questionnaire_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_s174_updated_at ON public.section_174_entries;
CREATE TRIGGER update_s174_updated_at BEFORE UPDATE ON public.section_174_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_review_items_updated_at ON public.automated_review_items;
CREATE TRIGGER update_review_items_updated_at BEFORE UPDATE ON public.automated_review_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qre_summaries_updated_at ON public.qre_summaries;
CREATE TRIGGER update_qre_summaries_updated_at BEFORE UPDATE ON public.qre_summaries
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_files_updated_at ON public.import_files;
CREATE TRIGGER update_import_files_updated_at BEFORE UPDATE ON public.import_files
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- COMPLETE!
-- ============================================
-- New tables created:
-- ✅ timesheets
-- ✅ vendors
-- ✅ contracts
-- ✅ ap_transactions
-- ✅ supplies
-- ✅ project_questionnaire_items
-- ✅ section_174_entries
-- ✅ automated_review_items
-- ✅ qre_summaries
-- ✅ import_files
-- 
-- Extended tables:
-- ✅ employees (added payroll fields, import lineage)
-- ✅ projects (added blueprint fields, import lineage)
-- ============================================


