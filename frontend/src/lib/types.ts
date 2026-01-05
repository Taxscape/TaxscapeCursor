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

