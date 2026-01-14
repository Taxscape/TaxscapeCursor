/**
 * Review System API Client
 * Post-ingestion review lifecycle management
 */

import { getApiUrl, getFreshSession } from './api';

// ============================================================================
// Types
// ============================================================================

export type FindingSeverity = 'low' | 'medium' | 'high';
export type FindingStatus = 'open' | 'in_review' | 'resolved_verified' | 'resolved_fixed' | 'resolved_escalated' | 'dismissed';
export type FindingDomain = 'employees' | 'projects' | 'timesheets' | 'vendors' | 'contracts' | 'ap_transactions' | 'supplies' | 'section_174' | 'cross_domain';
export type ResolutionType = 'verified_no_change' | 'field_updated' | 'client_evidence_requested' | 'task_created' | 'escalated_to_senior' | 'dismissed_with_reason';
export type CompletionMethod = 'manual_user_action' | 'ai_validated' | 'senior_override';

export interface RecommendedAction {
  action_type: string;
  label: string;
  description: string;
  target_field?: string;
  payload?: Record<string, any>;
}

export interface EstimatedImpact {
  qre_at_risk: number;
  credit_at_risk: number;
  confidence: number;
}

export interface AuthorityReference {
  id: string;
  citation_label: string;
  citation_key: string;
  summary: string;
  excerpt?: string;
  url?: string;
  tags?: string[];
}

export interface ReviewFinding {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year: number;
  intake_session_id?: string;
  domain: FindingDomain;
  entity_type: string;
  entity_id?: string;
  rule_id: string;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  description: string;
  trigger_evidence: Record<string, any>;
  recommended_actions: RecommendedAction[];
  authority_refs: string[];
  authority_details?: AuthorityReference[];
  estimated_impact: EstimatedImpact;
  created_at: string;
  updated_at: string;
}

export interface FindingResolution {
  id: string;
  review_finding_id: string;
  resolution_type: ResolutionType;
  completion_method: CompletionMethod;
  resolution_note?: string;
  changes: Record<string, any>;
  artifacts: any[];
  resolved_by_user_id: string;
  resolved_at: string;
  created_at: string;
  profiles?: {
    full_name?: string;
    email?: string;
  };
}

export interface ReviewRunResponse {
  run_id: string;
  rules_executed: number;
  findings_created: number;
  findings_updated: number;
  findings_by_severity: Record<string, number>;
  findings_by_domain: Record<string, number>;
  errors: string[];
}

export interface FindingsListResponse {
  findings: ReviewFinding[];
  total: number;
  summary: {
    total: number;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
    qre_at_risk: number;
  };
}

export interface FindingDetailResponse {
  finding: ReviewFinding;
  entity_snapshot: Record<string, any> | null;
  resolutions: FindingResolution[];
}

export interface CopilotSummaryResponse {
  summary_text: string;
  highlighted_findings: string[];
  next_best_actions: {
    action_type: string;
    label: string;
    description?: string;
    finding_id?: string;
    filter?: Record<string, any>;
  }[];
  stats: {
    total_open: number;
    high_severity: number;
    qre_at_risk: number;
  };
}

export interface CopilotExplainResponse {
  finding_id: string;
  explanation: string;
  next_best_actions: {
    action_type: string;
    label: string;
    description: string;
    target_field?: string;
  }[];
  authority_refs: string[];
}

export interface ReviewStats {
  total: number;
  open: number;
  in_review: number;
  resolved: number;
  dismissed: number;
  by_severity: {
    high: number;
    medium: number;
    low: number;
  };
  by_domain: Record<string, { total: number; open: number }>;
  qre_at_risk: number;
  credit_at_risk: number;
  readiness_score: number;
}

// ============================================================================
// Auth Helper
// ============================================================================

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getFreshSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('No authentication token available');
  }
  
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Run automated review rules for a client/year
 */
export async function runReview(
  clientCompanyId: string,
  taxYear: number,
  intakeSessionId?: string
): Promise<ReviewRunResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      client_company_id: clientCompanyId,
      tax_year: taxYear,
      intake_session_id: intakeSessionId
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to run review');
  }
  
  return response.json();
}

/**
 * List findings with filters
 */
export async function listFindings(
  clientId: string,
  taxYear: number,
  filters?: {
    status?: FindingStatus;
    severity?: FindingSeverity;
    domain?: FindingDomain;
    limit?: number;
    offset?: number;
  }
): Promise<FindingsListResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: taxYear.toString()
  });
  
  if (filters?.status) params.append('status', filters.status);
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.domain) params.append('domain', filters.domain);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  
  const response = await fetch(`${apiUrl}/api/review/findings?${params}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to list findings');
  }
  
  return response.json();
}

/**
 * Get finding detail with entity snapshot and resolutions
 */
export async function getFindingDetail(findingId: string): Promise<FindingDetailResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/findings/${findingId}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get finding');
  }
  
  return response.json();
}

/**
 * Resolve a finding
 */
export async function resolveFinding(
  findingId: string,
  resolutionType: ResolutionType,
  options?: {
    completionMethod?: CompletionMethod;
    resolutionNote?: string;
    fieldChanges?: Record<string, any>;
    createTaskPayload?: {
      title?: string;
      description?: string;
      assign_to?: string;
    };
  }
): Promise<{ finding_id: string; resolution_id: string; new_status: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/findings/${findingId}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      resolution_type: resolutionType,
      completion_method: options?.completionMethod || 'manual_user_action',
      resolution_note: options?.resolutionNote,
      field_changes: options?.fieldChanges,
      create_task_payload: options?.createTaskPayload
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to resolve finding');
  }
  
  return response.json();
}

/**
 * Dismiss a finding
 */
export async function dismissFinding(
  findingId: string,
  reasonCode: string,
  reasonNote: string
): Promise<{ finding_id: string; status: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/findings/${findingId}/dismiss`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      reason_code: reasonCode,
      reason_note: reasonNote
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to dismiss finding');
  }
  
  return response.json();
}

/**
 * Escalate finding to senior
 */
export async function escalateFinding(
  findingId: string,
  note?: string,
  assignToUserId?: string
): Promise<{ finding_id: string; status: string; task_id: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/findings/${findingId}/escalate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      note,
      assign_to_user_id: assignToUserId
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to escalate finding');
  }
  
  return response.json();
}

/**
 * Get review statistics for dashboard
 */
export async function getReviewStats(
  clientId: string,
  taxYear: number
): Promise<ReviewStats> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: taxYear.toString()
  });
  
  const response = await fetch(`${apiUrl}/api/review/stats?${params}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get review stats');
  }
  
  return response.json();
}

/**
 * Get copilot review summary
 */
export async function getCopilotSummary(
  clientId: string,
  taxYear: number
): Promise<CopilotSummaryResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: taxYear.toString()
  });
  
  const response = await fetch(`${apiUrl}/api/review/copilot/summarize?${params}`, {
    method: 'POST',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get copilot summary');
  }
  
  return response.json();
}

/**
 * Get copilot explanation for a finding
 */
export async function getCopilotExplanation(
  findingId: string
): Promise<CopilotExplainResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    finding_id: findingId
  });
  
  const response = await fetch(`${apiUrl}/api/review/copilot/explain?${params}`, {
    method: 'POST',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get copilot explanation');
  }
  
  return response.json();
}

/**
 * List authority references
 */
export async function listAuthorityReferences(
  tags?: string[]
): Promise<{ authorities: AuthorityReference[] }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  let url = `${apiUrl}/api/review/authority`;
  if (tags?.length) {
    url += `?tags=${tags.join(',')}`;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to list authority references');
  }
  
  return response.json();
}

/**
 * Get authority reference by citation key
 */
export async function getAuthorityByKey(
  citationKey: string
): Promise<AuthorityReference> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/review/authority/${citationKey}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Authority reference not found');
  }
  
  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get severity badge color
 */
export function getSeverityColor(severity: FindingSeverity): string {
  switch (severity) {
    case 'high': return 'red';
    case 'medium': return 'yellow';
    case 'low': return 'blue';
    default: return 'gray';
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status: FindingStatus): string {
  switch (status) {
    case 'open': return 'red';
    case 'in_review': return 'yellow';
    case 'resolved_verified':
    case 'resolved_fixed':
    case 'resolved_escalated': return 'green';
    case 'dismissed': return 'gray';
    default: return 'gray';
  }
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Get domain display name
 */
export function getDomainDisplayName(domain: FindingDomain): string {
  const names: Record<FindingDomain, string> = {
    employees: 'Employees',
    projects: 'Projects',
    timesheets: 'Timesheets',
    vendors: 'Vendors',
    contracts: 'Contracts',
    ap_transactions: 'AP Transactions',
    supplies: 'Supplies',
    section_174: 'Section 174',
    cross_domain: 'Cross-Domain'
  };
  return names[domain] || domain;
}
