export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  response: string;
  structured?: Record<string, unknown> | null;
  session_id?: string;
};

export type StructuredPayload = Record<string, unknown>;

export type WorkflowOverallState = 'not_started' | 'in_progress' | 'ready_for_review' | 'needs_follow_up' | 'approved' | 'rejected';
export type CriterionState = 'missing' | 'incomplete' | 'sufficient' | 'flagged' | 'approved' | 'rejected';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface NextBestAction {
  action_type: 'request_evidence' | 'assign_task' | 'edit_field' | 'upload_doc' | 're_evaluate_ai' | 'review_decision';
  target: string;
  reason: string;
  estimated_effort: 'S' | 'M' | 'L';
  blocking: boolean;
}

export interface WorkflowSummary {
  total_projects: number;
  by_state: Record<WorkflowOverallState, number>;
  top_blockers: string[];
  needs_follow_up: string[];
  next_best_actions?: NextBestAction[];
  project_statuses: Record<string, {
    overall_state: WorkflowOverallState;
    readiness_score: number;
    risk_level: RiskLevel;
  }>;
}

export interface ProjectWorkflowStatus {
  id: string;
  project_id: string;
  overall_state: WorkflowOverallState;
  readiness_score: number;
  risk_level: RiskLevel;
  computed_summary: {
    top_blockers: string[];
    next_best_actions: NextBestAction[];
    criterion_breakdown: Record<string, { state: CriterionState }>;
    data_freshness: Record<string, string>;
    audit_notes: string[];
  };
  last_computed_at: string;
}

// Dashboard types
export interface DashboardData {
  total_qre: number;
  total_credit: number;
  total_wages: number;
  project_count: number;
  employee_count: number;
  contractor_count: number;
  study_count: number;
  qualified_projects: number;
}

// Entity types
export interface Project {
  id: string;
  name: string;
  description?: string;
  technical_uncertainty?: string;
  process_of_experimentation?: string;
  qualification_status: 'pending' | 'qualified' | 'not_qualified';
  organization_id?: string;
  client_company_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  title?: string;
  department?: string;
  state?: string;
  total_wages: number;
  qualified_percent: number;
  rd_percentage: number;
  verification_status: 'pending' | 'verified' | 'denied';
  organization_id?: string;
  client_company_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Contractor {
  id: string;
  name: string;
  cost: number;
  is_qualified: boolean;
  location?: string;
  notes?: string;
  project_id?: string;
  organization_id?: string;
  client_company_id?: string;
  verification_status: 'pending' | 'verified' | 'denied';
  created_at: string;
  updated_at: string;
}

export interface Study {
  id: string;
  user_id: string;
  title: string;
  file_path?: string;
  file_url?: string;
  total_qre: number;
  total_credit: number;
  status: 'generating' | 'generated' | 'failed';
  created_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  structured_output?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserContext {
  user_id: string;
  organization_id?: string;
  role?: string;
}

// =============================================================================
// WORKSPACE DATA TYPES (Blueprint Aligned)
// =============================================================================

export interface Timesheet {
  id: string;
  organization_id: string;
  client_company_id: string;
  employee_id: string;
  project_id?: string;
  timesheet_id_natural?: string;
  tax_year: number;
  period_start: string;
  period_end: string;
  hours: number;
  activity_code?: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  approved_by?: string;
  approved_at?: string;
  approver_notes?: string;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  organization_id: string;
  client_company_id: string;
  vendor_id_natural: string;
  name: string;
  service_type?: string;
  country: string;
  location_state?: string;
  risk_bearer?: 'company' | 'vendor' | 'shared' | 'unknown';
  ip_rights?: 'company' | 'vendor' | 'shared' | 'unknown';
  is_qualified_contract_research: boolean;
  sec41_risk_flags?: Array<{ flag: string; description: string; severity: string }>;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  organization_id: string;
  client_company_id: string;
  vendor_id: string;
  vendor_name?: string;
  contract_id_natural: string;
  title: string;
  contract_type?: string;
  sow_summary?: string;
  start_date?: string;
  end_date?: string;
  effective_date?: string;
  expiration_date?: string;
  total_value?: number;
  risk_terms?: string;
  ip_ownership_terms?: string;
  ip_ownership?: string;
  risk_bearer?: string;
  is_qualified_contract_research: boolean;
  qre_eligible_percent?: number;
  project_ids: string[];
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface APTransaction {
  id: string;
  organization_id: string;
  client_company_id: string;
  vendor_id?: string;
  contract_id?: string;
  transaction_id_natural: string;
  tax_year: number;
  invoice_number?: string;
  description?: string;
  amount: number;
  category?: string;
  gl_account?: string;
  invoice_date?: string;
  payment_date?: string;
  qre_eligible_percent: number;
  qre_amount: number;
  is_qualified_contract_research: boolean;
  project_id?: string;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Supply {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id?: string;
  project_name?: string;
  supply_id_natural: string;
  tax_year: number;
  item_description: string;
  description?: string;
  category?: string;
  purchase_date?: string;
  gl_account?: string;
  amount: number;
  is_qre_eligible: boolean;
  qre_amount: number;
  eligibility_notes?: string;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeExtended extends Employee {
  employee_id_natural?: string;
  employment_type: 'full_time' | 'part_time' | 'contractor' | 'intern';
  exempt_status: 'exempt' | 'non_exempt';
  hire_date?: string;
  termination_date?: string;
  w2_box1_wages: number;
  payroll_taxes: number;
  bonus: number;
  stock_compensation: number;
  severance: number;
  qre_wage_base: number;
  rd_eligibility: 'full' | 'partial' | 'none';
  tax_year: number;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
}

export interface ProjectExtended extends Project {
  project_id_natural?: string;
  product_line?: string;
  start_date?: string;
  end_date?: string;
  permitted_purpose_type?: string;
  uncertainty_type?: 'capability' | 'method' | 'design' | 'multiple';
  experimentation_summary?: string;
  pm_system?: string;
  budget?: number;
  tax_year: number;
  source_type: 'manual' | 'import_excel' | 'import_csv' | 'api';
  version: number;
}

export interface QuestionnaireItem {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id: string;
  tax_year: number;
  question_domain: 'permitted_purpose' | 'uncertainty' | 'experimentation' | 'technological_nature' | 'documentation_evidence' | 'missing_info';
  question_text: string;
  question_order: number;
  response_text?: string;
  response_status: 'unanswered' | 'answered' | 'needs_review' | 'satisfied';
  evidence_ids: string[];
  generated_by: 'system' | 'ai' | 'manual';
  generated_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Section174Entry {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id?: string;
  tax_year: number;
  cost_type: 'wages' | 'supplies' | 'contract_research' | 'other';
  cost_amount: number;
  is_domestic: boolean;
  amortization_years: number;
  capitalized_amount: number;
  amortization_start_date?: string;
  current_year_expense: number;
  remaining_basis: number;
  computation_notes?: string;
  computed_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AutomatedReviewItem {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year: number;
  category: 'wage_anomaly' | 'timesheet_approval' | 'foreign_vendor' | 'ap_vendor_link' | 'supply_project_link' | 'project_documentation' | 'qre_calculation' | 'general';
  severity: 'info' | 'warning' | 'critical';
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  metric_name: string;
  metric_value?: string;
  threshold_value?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'waived';
  resolution_notes?: string;
  resolved_by?: string;
  resolved_at?: string;
  message: string;
  computed_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface QRESummary {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year: number;
  wage_qre: number;
  supply_qre: number;
  contract_qre: number;
  total_qre: number;
  wage_breakdown?: {
    by_department?: Record<string, number>;
    by_eligibility?: Record<string, number>;
  };
  supply_breakdown?: Record<string, number>;
  contract_breakdown?: Record<string, number>;
  estimated_credit: number;
  credit_method: 'regular' | 'asc';
  last_inputs_updated_at?: string;
  last_recompute_at: string;
  is_stale: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ImportPreview {
  import_file_id: string;
  preview: {
    sheets: string[];
    row_counts: Record<string, number>;
    detected_entities: Array<{
      sheet: string;
      entity: string;
      rows: number;
      columns: string[];
    }>;
    validation_issues: Array<{
      sheet: string;
      issue: string;
    }>;
    conflicts: number;
  };
  message: string;
}

export interface RecomputeResult {
  success: boolean;
  results: {
    questionnaire: { generated: number };
    section_174: { computed: number };
    review_items: { generated: number };
    qre_summary: {
      wage_qre: number;
      supply_qre: number;
      contract_qre: number;
      total_qre: number;
      estimated_credit: number;
    } | null;
  };
  message: string;
}

export interface StalenessCheck {
  is_stale: boolean;
  reason?: string;
  last_recompute_at?: string;
  last_inputs_updated_at?: string;
}

// =============================================================================
// AI EVALUATION TYPES
// =============================================================================

export type TestStatus = 'pass' | 'fail' | 'needs_review' | 'missing_data';

export interface FourPartTestResult {
  permitted_purpose: TestStatus;
  permitted_purpose_reasoning: string;
  elimination_uncertainty: TestStatus;
  elimination_uncertainty_reasoning: string;
  process_experimentation: TestStatus;
  process_experimentation_reasoning: string;
  technological_nature: TestStatus;
  technological_nature_reasoning: string;
}

export interface TestResultDetail {
  status: TestStatus;
  reasoning: string;
  citations?: Array<{
    type: 'questionnaire' | 'evidence';
    id: string;
    excerpt?: string;
  }>;
}

export interface FourPartTestJson {
  permitted_purpose: TestResultDetail;
  elimination_uncertainty: TestResultDetail;
  process_experimentation: TestResultDetail;
  technological_nature: TestResultDetail;
}

export interface ProjectAIEvaluation {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id: string;
  tax_year: number;
  evaluation_version: number;
  four_part_test_json: FourPartTestJson;
  confidence_score: number;
  qualified_boolean: boolean;
  missing_info: string[];
  ai_summary: string;
  model_provider: string;
  model_name: string;
  prompt_version: string;
  inputs_snapshot_hash: string;
  evidence_ids_used: string[];
  status: 'completed' | 'needs_review' | 'error' | 'stale';
  error_message?: string;
  is_latest: boolean;
  created_at: string;
  created_by?: string;
}

export type EvidenceType = 
  | 'project_narrative' 
  | 'technical_docs' 
  | 'test_results' 
  | 'source_control'
  | 'tickets' 
  | 'time_logs' 
  | 'financial_support' 
  | 'contract'
  | 'design_docs'
  | 'experiment_logs'
  | 'meeting_notes'
  | 'email_thread'
  | 'other';

export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProjectEvidenceItem {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id?: string;
  storage_object_key?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  mime_type?: string;
  external_url?: string;
  extraction_status: ExtractionStatus;
  extracted_text?: string;
  extracted_chunks?: Array<{
    chunk_index: number;
    text: string;
    page_number?: number;
    section?: string;
  }>;
  extraction_error?: string;
  extracted_at?: string;
  evidence_type: EvidenceType;
  tags: string[];
  description?: string;
  linked_questionnaire_item_ids: string[];
  linked_task_ids: string[];
  linked_gap_ids: string[];
  used_in_evaluation_ids: string[];
  citation_count: number;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export type GapType = 
  | 'missing_uncertainty'
  | 'missing_experimentation'
  | 'missing_tech_basis'
  | 'missing_permitted_purpose'
  | 'missing_wage_support'
  | 'missing_time_allocation'
  | 'foreign_vendor_flag'
  | 'contractor_qualification'
  | 'supply_eligibility'
  | 'missing_project_narrative'
  | 'missing_test_evidence'
  | 'missing_design_docs'
  | 'financial_anomaly'
  | 'needs_clarification'
  | 'other';

export type GapSeverity = 'low' | 'medium' | 'high' | 'critical';
export type GapStatus = 'open' | 'in_progress' | 'pending_review' | 'resolved' | 'waived' | 'rejected';

export interface ProjectGap {
  id: string;
  organization_id: string;
  client_company_id: string;
  project_id: string;
  tax_year: number;
  gap_type: GapType;
  gap_code?: string;
  severity: GapSeverity;
  priority_score: number;
  status: GapStatus;
  title: string;
  description?: string;
  required_info: string[];
  suggested_actions?: string[];
  linked_questionnaire_item_id?: string;
  linked_task_id?: string;
  linked_criterion_key?: 'permitted_purpose' | 'elimination_uncertainty' | 'process_experimentation' | 'technological_nature';
  evidence_ids: string[];
  resolution_notes?: string;
  resolution_evidence_ids: string[];
  resolved_by?: string;
  resolved_at?: string;
  waived_reason?: string;
  waived_by?: string;
  waived_at?: string;
  ai_generated: boolean;
  source_evaluation_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type NarrativeType = 
  | 'project_summary'
  | 'technical_uncertainty'
  | 'process_of_experimentation'
  | 'permitted_purpose'
  | 'full_narrative';

export interface NarrativeDraft {
  id: string;
  organization_id: string;
  project_id: string;
  narrative_type: NarrativeType;
  draft_content: string;
  evidence_ids_cited: string[];
  questionnaire_item_ids_used: string[];
  status: 'draft' | 'accepted' | 'rejected' | 'superseded';
  accepted_by?: string;
  accepted_at?: string;
  model_name?: string;
  prompt_version?: string;
  created_at: string;
  created_by?: string;
}

export interface AINextBestAction {
  action_type: string;
  target: string;
  target_id?: string;
  severity?: GapSeverity;
  reason: string;
  estimated_effort: 'S' | 'M' | 'L';
  blocking: boolean;
}

export interface EvaluateProjectResponse {
  status: 'completed' | 'not_changed' | 'error';
  message?: string;
  evaluation?: ProjectAIEvaluation;
  gaps: ProjectGap[];
  next_best_actions?: Array<{ action: string; count?: number } | null>;
}

export interface EvaluateClientResponse {
  status: string;
  message?: string;
  total: number;
  completed: number;
  failed: number;
  not_changed: number;
  project_results: Array<{
    project_id: string;
    project_name: string;
    status: string;
    gaps_count?: number;
    error?: string;
  }>;
}

export interface EvidenceUploadResponse {
  evidence_id: string;
  original_filename: string;
  file_type: string;
  extraction_status: ExtractionStatus;
  extracted_text_preview?: string;
}

export interface DraftNarrativeResponse {
  draft: NarrativeDraft;
  narrative_text: string;
  citations: {
    questionnaire_ids: string[];
    evidence_ids: string[];
  };
}

export interface NextBestActionsResponse {
  actions: AINextBestAction[];
  total_count: number;
  has_blocking: boolean;
}

