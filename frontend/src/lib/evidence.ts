/**
 * Evidence System API Client
 * Handles evidence requests, file uploads, linking, and reprocessing
 */

import { getApiUrl, getFreshSession, getAuthHeaders } from './api';

// ============================================================================
// Types
// ============================================================================

export type EvidenceRequestType =
  | 'timesheets_support'
  | 'vendor_contract'
  | 'foreign_research_support'
  | 'supply_consumption_support'
  | 'wage_support'
  | 'project_narrative_support'
  | 'section_174_support'
  | 'other';

export type EvidenceRequestStatus =
  | 'draft'
  | 'sent'
  | 'awaiting_upload'
  | 'received'
  | 'partially_received'
  | 'completed'
  | 'cancelled';

export type EvidenceUploadSource = 'client_link' | 'portal_user';

export type EvidenceFileStatus = 'uploaded' | 'linked' | 'processed' | 'rejected';

export type ReprocessingStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RequestedItem {
  item_key: string;
  label: string;
  description: string;
  accepted_formats: string[];
  required: boolean;
  mapping_hint: string;
  example: string;
}

export interface EvidenceRequest {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year?: number;
  status: EvidenceRequestStatus;
  title: string;
  request_type: EvidenceRequestType;
  requested_items: RequestedItem[];
  reason: string;
  authority_refs: string[];
  linked_finding_ids: string[];
  linked_task_id?: string;
  linked_intake_session_id?: string;
  client_upload_token_id?: string;
  due_date?: string;
  email_draft?: string;
  email_sent_at?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  client_name?: string;
  files_count?: number;
  client_companies?: {
    name: string;
    primary_contact_name?: string;
    primary_contact_email?: string;
  };
}

export interface EvidenceFile {
  id: string;
  organization_id: string;
  client_company_id: string;
  uploaded_by_user_id?: string;
  uploaded_via: EvidenceUploadSource;
  evidence_request_id?: string;
  intake_session_id?: string;
  review_finding_id?: string;
  task_id?: string;
  entity_type?: string;
  entity_id?: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string;
  file_size_bytes?: number;
  sha256?: string;
  status: EvidenceFileStatus;
  notes?: string;
  matched_item_key?: string;
  created_at: string;
  evidence_requests?: {
    title: string;
    request_type: string;
    requested_items?: RequestedItem[];
  };
}

export interface AuthorityDetail {
  id: string;
  citation_label: string;
  citation_key: string;
  summary: string;
}

export interface LinkedFinding {
  id: string;
  title: string;
  status: string;
  severity: string;
}

export interface TokenInfo {
  id: string;
  expires_at: string;
  revoked_at?: string;
  uploads_count: number;
}

export interface ReprocessingJob {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year?: number;
  trigger_type: string;
  trigger_id: string;
  target: string;
  status: ReprocessingStatus;
  impacted_domains?: string[];
  impacted_finding_ids?: string[];
  impacted_project_ids?: string[];
  job_summary?: {
    rules_run?: number;
    findings_updated?: number;
    findings_auto_resolved?: number;
    ai_evals_run?: number;
    errors?: string[];
  };
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRequestDetail {
  request: EvidenceRequest;
  files: EvidenceFile[];
  authority_details: AuthorityDetail[];
  linked_findings: LinkedFinding[];
  reprocessing_jobs: ReprocessingJob[];
  token_info?: TokenInfo;
}

export interface CreateEvidenceRequestInput {
  client_company_id: string;
  tax_year?: number;
  request_type: EvidenceRequestType;
  title?: string;
  reason: string;
  linked_finding_ids?: string[];
  due_date?: string;
  custom_items?: RequestedItem[];
}

export interface CreateEvidenceRequestResponse {
  id: string;
  status: string;
  client_upload_url: string;
  email_draft: string;
  upload_token: string;
  expires_at: string;
}

export interface LinkEvidenceInput {
  evidence_request_id?: string;
  review_finding_id?: string;
  task_id?: string;
  entity_type?: string;
  entity_id?: string;
  notes?: string;
}

// ============================================================================
// Evidence Request Functions
// ============================================================================

export async function createEvidenceRequest(
  input: CreateEvidenceRequestInput
): Promise<CreateEvidenceRequestResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiUrl()}/api/evidence/requests`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Failed to create evidence request');
  }

  return response.json();
}

export async function listEvidenceRequests(params: {
  client_id?: string;
  status?: EvidenceRequestStatus;
  limit?: number;
  offset?: number;
}): Promise<{ requests: EvidenceRequest[] }> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();
  
  if (params.client_id) searchParams.set('client_id', params.client_id);
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests?${searchParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to list evidence requests');
  }

  return response.json();
}

export async function getEvidenceRequest(
  requestId: string
): Promise<EvidenceRequestDetail> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to get evidence request');
  }

  return response.json();
}

export async function regenerateEmailDraft(
  requestId: string
): Promise<{ email_draft: string; client_upload_url: string; expires_at: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/email-draft`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to regenerate email draft');
  }

  return response.json();
}

export async function markRequestSent(
  requestId: string
): Promise<{ status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/mark-sent`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to mark request as sent');
  }

  return response.json();
}

export async function completeEvidenceRequest(
  requestId: string
): Promise<{ status: string; reprocessing_job_id: string; missing_required: string[] }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/complete`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to complete evidence request');
  }

  return response.json();
}

export async function revokeUploadToken(
  requestId: string
): Promise<{ status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/revoke-token`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to revoke upload token');
  }

  return response.json();
}

export async function regenerateUploadToken(
  requestId: string
): Promise<{ client_upload_url: string; expires_at: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/regenerate-token`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to regenerate upload token');
  }

  return response.json();
}

// ============================================================================
// File Upload Functions
// ============================================================================

export async function uploadEvidenceFiles(
  requestId: string,
  files: File[],
  matchedItemKey?: string,
  notes?: string
): Promise<{ files: { id: string; filename: string }[]; reprocessing_job_id: string }> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('files', file);
  });
  
  if (matchedItemKey) {
    formData.append('matched_item_key', matchedItemKey);
  }
  if (notes) {
    formData.append('notes', notes);
  }

  // Remove Content-Type to let browser set it with boundary for multipart/form-data
  const headersObj = headers as Record<string, string>;
  const { 'Content-Type': _, ...restHeaders } = headersObj;

  const response = await fetch(
    `${getApiUrl()}/api/evidence/requests/${requestId}/upload`,
    {
      method: 'POST',
      headers: restHeaders,
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to upload files');
  }

  return response.json();
}

export async function listEvidenceFiles(params: {
  client_id?: string;
  evidence_request_id?: string;
  status?: EvidenceFileStatus;
  limit?: number;
  offset?: number;
}): Promise<{ files: EvidenceFile[] }> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();
  
  if (params.client_id) searchParams.set('client_id', params.client_id);
  if (params.evidence_request_id) searchParams.set('evidence_request_id', params.evidence_request_id);
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(
    `${getApiUrl()}/api/evidence/files?${searchParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to list evidence files');
  }

  return response.json();
}

export async function getEvidenceFile(fileId: string): Promise<EvidenceFile> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/files/${fileId}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to get evidence file');
  }

  return response.json();
}

export async function linkEvidenceFile(
  fileId: string,
  input: LinkEvidenceInput
): Promise<{ status: string; reprocessing_job_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/files/${fileId}/link`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to link evidence file');
  }

  return response.json();
}

// ============================================================================
// Client Upload Functions (no auth, token-based)
// ============================================================================

export async function checkUploadTokenStatus(token: string): Promise<{
  valid: boolean;
  client_name?: string;
  organization_name?: string;
  scope: string;
  title?: string;
  requested_items?: RequestedItem[];
  due_date?: string;
  uploads_remaining?: number;
}> {
  const response = await fetch(
    `${getApiUrl()}/api/client-upload/token-status?token=${encodeURIComponent(token)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Token invalid' }));
    throw new Error(error.detail || 'Invalid or expired token');
  }

  return response.json();
}

export async function clientUploadEvidence(
  token: string,
  files: File[],
  matchedItemKey?: string
): Promise<{
  success: boolean;
  uploaded: { id: string; filename: string }[];
  rejected: { filename: string; reason: string }[];
  message: string;
}> {
  const formData = new FormData();
  formData.append('token', token);
  
  files.forEach((file) => {
    formData.append('files', file);
  });
  
  if (matchedItemKey) {
    formData.append('matched_item_key', matchedItemKey);
  }

  const response = await fetch(
    `${getApiUrl()}/api/client-upload/evidence`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to upload files');
  }

  return response.json();
}

// ============================================================================
// Reprocessing Functions
// ============================================================================

export async function listReprocessingJobs(params: {
  client_id?: string;
  status?: ReprocessingStatus;
  limit?: number;
}): Promise<{ jobs: ReprocessingJob[] }> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();
  
  if (params.client_id) searchParams.set('client_id', params.client_id);
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const response = await fetch(
    `${getApiUrl()}/api/evidence/reprocessing/jobs?${searchParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to list reprocessing jobs');
  }

  return response.json();
}

export async function runReprocessingJob(
  jobId: string
): Promise<{ status: string; summary: ReprocessingJob['job_summary'] }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/evidence/reprocessing/run/${jobId}`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Reprocessing failed' }));
    throw new Error(error.detail || 'Failed to run reprocessing');
  }

  return response.json();
}

export async function runReprocessingNow(params: {
  client_company_id: string;
  tax_year: number;
  target?: string;
}): Promise<{ status: string; job_id: string; summary: ReprocessingJob['job_summary'] }> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams({
    client_company_id: params.client_company_id,
    tax_year: params.tax_year.toString(),
  });
  
  if (params.target) searchParams.set('target', params.target);

  const response = await fetch(
    `${getApiUrl()}/api/evidence/reprocessing/run-now?${searchParams.toString()}`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Reprocessing failed' }));
    throw new Error(error.detail || 'Failed to run reprocessing');
  }

  return response.json();
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getRequestTypeLabel(type: EvidenceRequestType): string {
  const labels: Record<EvidenceRequestType, string> = {
    timesheets_support: 'Timesheet Support',
    vendor_contract: 'Vendor Contract',
    foreign_research_support: 'Foreign Research Support',
    supply_consumption_support: 'Supply Consumption',
    wage_support: 'Wage Documentation',
    project_narrative_support: 'Project Documentation',
    section_174_support: 'Section 174 Support',
    other: 'Other Documents',
  };
  return labels[type] || type;
}

export function getStatusBadgeColor(status: EvidenceRequestStatus): string {
  const colors: Record<EvidenceRequestStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    awaiting_upload: 'bg-yellow-100 text-yellow-700',
    received: 'bg-green-100 text-green-700',
    partially_received: 'bg-orange-100 text-orange-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function inferRequestTypeFromRuleId(ruleId: string): EvidenceRequestType {
  const mapping: Record<string, EvidenceRequestType> = {
    'EMP_HIGH_WAGE_001': 'wage_support',
    'EMP_MISSING_LOCATION_002': 'wage_support',
    'EMP_ZERO_ALLOCATION_003': 'timesheets_support',
    'EMP_OUTLIER_ALLOCATION_004': 'timesheets_support',
    'VEN_FOREIGN_001': 'foreign_research_support',
    'VEN_MISSING_RISK_IP_002': 'vendor_contract',
    'VEN_CONTRACT_MISSING_003': 'vendor_contract',
    'PROJ_MISSING_FOUR_PART_FIELDS_001': 'project_narrative_support',
    'PROJ_NO_TIME_LINK_002': 'timesheets_support',
    'AP_LARGE_SINGLE_TX_001': 'supply_consumption_support',
    'AP_UNCATEGORIZED_002': 'supply_consumption_support',
    'SUP_CAPITAL_INDICATOR_001': 'supply_consumption_support',
    'SUP_NO_PROJECT_LINK_002': 'supply_consumption_support',
  };
  return mapping[ruleId] || 'other';
}
