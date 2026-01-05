export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  response: string;
  structured?: Record<string, unknown> | null;
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

