/**
 * Escalation System API Client
 * Senior CPA escalation and override workflow
 */

import { getApiUrl, getFreshSession } from './api';

// ============================================================================
// Types
// ============================================================================

export type EscalationSourceType = 'review_finding' | 'intake_mapping' | 'manual';
export type EscalationStatus = 'queued' | 'assigned' | 'in_review' | 'returned_to_junior' | 'resolved' | 'cancelled';
export type DecisionType = 'approve_junior_resolution' | 'override_fields' | 'request_more_evidence' | 'return_guidance' | 'dismiss';
export type ReasonCode = 
  | 'materiality_threshold'
  | 'client_confirmation_received'
  | 'reasonable_estimate_method'
  | 'documentation_sufficient'
  | 'documentation_insufficient'
  | 'classification_corrected'
  | 'legal_interpretation'
  | 'audit_risk_mitigation'
  | 'process_improvement'
  | 'other';
export type RoleLevel = 'junior' | 'senior' | 'director' | 'partner';

export interface EscalationRequest {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year?: number;
  source_type: EscalationSourceType;
  source_id: string;
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high';
  estimated_impact: {
    qre_at_risk?: number;
    credit_at_risk?: number;
  };
  proposed_action: Record<string, any>;
  authority_refs: string[];
  status: EscalationStatus;
  assigned_to_user_id?: string;
  decision_type?: DecisionType;
  decision_reason_code?: ReasonCode;
  decision_note?: string;
  decision_field_changes?: Record<string, any>;
  decision_at?: string;
  decided_by_user_id?: string;
  guidance_text?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  // Enhanced fields
  created_by?: UserInfo;
  assigned_to?: UserInfo;
  decided_by?: UserInfo;
  client_name?: string;
  days_open?: number;
}

export interface UserInfo {
  id: string;
  full_name?: string;
  email?: string;
  role?: string;
  role_level?: RoleLevel;
}

export interface EscalationHistory {
  id: string;
  escalation_request_id: string;
  action: string;
  previous_status?: EscalationStatus;
  new_status?: EscalationStatus;
  previous_assigned_to?: string;
  new_assigned_to?: string;
  note?: string;
  performed_by_user_id: string;
  created_at: string;
  profiles?: {
    full_name?: string;
    email?: string;
  };
}

export interface AuthorityReference {
  id: string;
  citation_label: string;
  citation_key: string;
  summary: string;
  url?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  message?: string;
  payload: Record<string, any>;
  read_at?: string;
  created_at: string;
}

export interface EscalationDetailResponse {
  escalation: EscalationRequest;
  source_object: Record<string, any> | null;
  entity_snapshot: Record<string, any> | null;
  authority_details: AuthorityReference[];
  history: EscalationHistory[];
  available_seniors: UserInfo[];
}

export interface EscalationQueueResponse {
  escalations: EscalationRequest[];
  total_active: number;
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
 * Create escalation from a review finding
 */
export async function createEscalationFromFinding(
  findingId: string,
  summary: string,
  proposedAction: Record<string, any>,
  assignedToUserId?: string
): Promise<{ id: string; status: string; message: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/from-finding`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      finding_id: findingId,
      summary,
      proposed_action: proposedAction,
      assigned_to_user_id: assignedToUserId
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create escalation');
  }
  
  return response.json();
}

/**
 * Create escalation from an intake mapping
 */
export async function createEscalationFromMapping(
  mappingId: string,
  summary: string,
  proposedAction: Record<string, any>,
  assignedToUserId?: string
): Promise<{ id: string; status: string; message: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/from-mapping`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mapping_id: mappingId,
      summary,
      proposed_action: proposedAction,
      assigned_to_user_id: assignedToUserId
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create escalation');
  }
  
  return response.json();
}

/**
 * List escalation queue
 */
export async function listEscalationQueue(
  filters?: {
    status?: EscalationStatus;
    assigned_to_me?: boolean;
    client_id?: string;
    severity?: string;
    min_qre_at_risk?: number;
    limit?: number;
    offset?: number;
  }
): Promise<EscalationQueueResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.assigned_to_me) params.append('assigned_to_me', 'true');
  if (filters?.client_id) params.append('client_id', filters.client_id);
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.min_qre_at_risk) params.append('min_qre_at_risk', filters.min_qre_at_risk.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  
  const response = await fetch(`${apiUrl}/api/escalations/queue?${params}`, { headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to list escalations');
  }
  
  return response.json();
}

/**
 * Get escalation detail
 */
export async function getEscalationDetail(escalationId: string): Promise<EscalationDetailResponse> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/${escalationId}`, { headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get escalation');
  }
  
  return response.json();
}

/**
 * Assign escalation to a senior
 */
export async function assignEscalation(
  escalationId: string,
  assignedToUserId: string
): Promise<{ status: string; assigned_to_user_id: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/${escalationId}/assign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assigned_to_user_id: assignedToUserId })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to assign escalation');
  }
  
  return response.json();
}

/**
 * Resolve an escalation with decision
 */
export async function resolveEscalation(
  escalationId: string,
  decisionType: DecisionType,
  reasonCode: ReasonCode,
  decisionNote: string,
  options?: {
    fieldChanges?: Record<string, any>;
    guidanceText?: string;
    newTasks?: { title: string; description?: string }[];
  }
): Promise<{ escalation_id: string; status: string; decision_type: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/${escalationId}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      decision_type: decisionType,
      reason_code: reasonCode,
      decision_note: decisionNote,
      field_changes: options?.fieldChanges,
      guidance_text: options?.guidanceText,
      new_tasks: options?.newTasks
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to resolve escalation');
  }
  
  return response.json();
}

/**
 * Cancel an escalation
 */
export async function cancelEscalation(
  escalationId: string
): Promise<{ escalation_id: string; status: string }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/${escalationId}/cancel`, {
    method: 'POST',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to cancel escalation');
  }
  
  return response.json();
}

/**
 * Get user notifications
 */
export async function getNotifications(
  unreadOnly: boolean = true,
  limit: number = 20
): Promise<{ notifications: Notification[] }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    unread_only: unreadOnly.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${apiUrl}/api/escalations/notifications?${params}`, { headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get notifications');
  }
  
  return response.json();
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  await fetch(`${apiUrl}/api/escalations/notifications/${notificationId}/read`, {
    method: 'POST',
    headers
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<void> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  await fetch(`${apiUrl}/api/escalations/notifications/read-all`, {
    method: 'POST',
    headers
  });
}

/**
 * Get list of senior users for assignment
 */
export async function getSeniorUsers(): Promise<{ seniors: UserInfo[] }> {
  const headers = await getAuthHeaders();
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/api/escalations/seniors`, { headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to get seniors');
  }
  
  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getStatusColor(status: EscalationStatus): string {
  const colors: Record<EscalationStatus, string> = {
    queued: 'bg-gray-100 text-gray-700',
    assigned: 'bg-blue-100 text-blue-700',
    in_review: 'bg-amber-100 text-amber-700',
    returned_to_junior: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500'
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getStatusLabel(status: EscalationStatus): string {
  const labels: Record<EscalationStatus, string> = {
    queued: 'Queued',
    assigned: 'Assigned',
    in_review: 'In Review',
    returned_to_junior: 'Returned',
    resolved: 'Resolved',
    cancelled: 'Cancelled'
  };
  return labels[status] || status;
}

export function getDecisionTypeLabel(type: DecisionType): string {
  const labels: Record<DecisionType, string> = {
    approve_junior_resolution: 'Approve Resolution',
    override_fields: 'Override Fields',
    request_more_evidence: 'Request Evidence',
    return_guidance: 'Return with Guidance',
    dismiss: 'Dismiss'
  };
  return labels[type] || type;
}

export function getReasonCodeLabel(code: ReasonCode): string {
  const labels: Record<ReasonCode, string> = {
    materiality_threshold: 'Below Materiality Threshold',
    client_confirmation_received: 'Client Confirmation Received',
    reasonable_estimate_method: 'Reasonable Estimate Method',
    documentation_sufficient: 'Documentation Sufficient',
    documentation_insufficient: 'Documentation Insufficient',
    classification_corrected: 'Classification Corrected',
    legal_interpretation: 'Legal Interpretation',
    audit_risk_mitigation: 'Audit Risk Mitigation',
    process_improvement: 'Process Improvement',
    other: 'Other'
  };
  return labels[code] || code;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export const REASON_CODES: { value: ReasonCode; label: string }[] = [
  { value: 'materiality_threshold', label: 'Below Materiality Threshold' },
  { value: 'client_confirmation_received', label: 'Client Confirmation Received' },
  { value: 'reasonable_estimate_method', label: 'Reasonable Estimate Method' },
  { value: 'documentation_sufficient', label: 'Documentation Sufficient' },
  { value: 'documentation_insufficient', label: 'Documentation Insufficient' },
  { value: 'classification_corrected', label: 'Classification Corrected' },
  { value: 'legal_interpretation', label: 'Legal Interpretation' },
  { value: 'audit_risk_mitigation', label: 'Audit Risk Mitigation' },
  { value: 'process_improvement', label: 'Process Improvement' },
  { value: 'other', label: 'Other (requires detailed note)' }
];

export const DECISION_TYPES: { value: DecisionType; label: string; description: string }[] = [
  { value: 'approve_junior_resolution', label: 'Approve Resolution', description: 'Accept the junior\'s proposed resolution' },
  { value: 'override_fields', label: 'Override Fields', description: 'Make changes to the underlying data' },
  { value: 'request_more_evidence', label: 'Request Evidence', description: 'Request additional documentation' },
  { value: 'return_guidance', label: 'Return with Guidance', description: 'Send back with instructions' },
  { value: 'dismiss', label: 'Dismiss', description: 'Close without action' }
];
