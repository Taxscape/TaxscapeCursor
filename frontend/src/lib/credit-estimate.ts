/**
 * Credit Estimate API Client
 * Handles credit range drafting, senior signoff, exports, and delivery
 */

import { getApiUrl, getAuthHeaders } from './api';

// ============================================================================
// Types
// ============================================================================

export type EstimateStatus =
  | 'draft'
  | 'pending_senior_signoff'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'sent_to_client';

export type Methodology = 'regular' | 'asc' | 'both';

export type SignoffDecision = 'approved' | 'rejected' | 'changes_requested';

export type SignoffReasonCode =
  | 'sufficient_support'
  | 'insufficient_support'
  | 'material_uncertainty'
  | 'requires_more_evidence'
  | 'methodology_change'
  | 'other';

export interface QRERange {
  wage_qre: number;
  supply_qre: number;
  contract_qre: number;
  total_qre: number;
  credit_amount_regular?: number;
  credit_amount_asc?: number;
  credit_amount_selected?: number;
  effective_rate?: number;
}

export interface Assumption {
  assumption_id: string;
  title: string;
  description: string;
  impact_direction: 'increases' | 'decreases' | 'uncertain';
  impact_band: 'low' | 'medium' | 'high';
  numeric_effect?: Record<string, number>;
  source: 'system_default' | 'user_entered' | 'senior_override';
  linked_finding_ids?: string[];
}

export interface RiskNote {
  risk_id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  authority_refs?: string[];
  linked_finding_ids?: string[];
}

export interface MissingInput {
  input_key: string;
  label: string;
  impact: string;
  source: string;
  finding_id?: string;
}

export interface CreditEstimate {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_year: number;
  intake_session_id?: string;
  estimate_version: number;
  status: EstimateStatus;
  methodology: Methodology;
  range_low: QRERange;
  range_base: QRERange;
  range_high: QRERange;
  assumptions: Assumption[];
  data_completeness_score: number;
  risk_notes: RiskNote[];
  missing_inputs: MissingInput[];
  range_strategy?: Record<string, any>;
  created_by_user_id: string;
  approved_by_user_id?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_companies?: { name: string };
}

export interface EstimateSignoff {
  id: string;
  credit_estimate_id: string;
  decision: SignoffDecision;
  reason_code: SignoffReasonCode;
  note: string;
  completion_method: string;
  modifications?: Record<string, any>;
  decided_by_user_id: string;
  decided_at: string;
  created_at: string;
  profiles?: { full_name: string };
}

export interface EstimateExport {
  id: string;
  credit_estimate_id: string;
  export_type: 'pdf' | 'docx';
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  created_by_user_id: string;
  created_at: string;
  metadata?: {
    filename?: string;
    size_bytes?: number;
    version?: number;
  };
}

export interface EstimateVersion {
  id: string;
  estimate_version: number;
  status: EstimateStatus;
  created_at: string;
  created_by_user_id: string;
}

export interface EstimateDetailResponse {
  estimate: CreditEstimate;
  signoffs: EstimateSignoff[];
  exports: EstimateExport[];
  version_history: EstimateVersion[];
  is_stale: boolean;
  stale_reason?: string;
  client_name?: string;
}

export interface DraftEstimateInput {
  client_company_id: string;
  tax_year: number;
  methodology?: Methodology;
  range_strategy?: Record<string, any>;
}

export interface UpdateEstimateInput {
  assumptions?: Assumption[];
  methodology?: Methodology;
  user_notes?: string;
}

export interface SignoffInput {
  decision: SignoffDecision;
  reason_code: SignoffReasonCode;
  note: string;
  modifications?: {
    methodology?: Methodology;
    assumptions?: Assumption[];
  };
}

// ============================================================================
// API Functions
// ============================================================================

export async function draftEstimate(
  input: DraftEstimateInput
): Promise<CreditEstimate & { version: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiUrl()}/api/estimates/draft`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Draft failed' }));
    throw new Error(error.detail || 'Failed to draft estimate');
  }

  return response.json();
}

export async function listEstimates(params: {
  client_id?: string;
  tax_year?: number;
  status?: EstimateStatus;
  limit?: number;
  offset?: number;
}): Promise<{ estimates: CreditEstimate[] }> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();

  if (params.client_id) searchParams.set('client_id', params.client_id);
  if (params.tax_year) searchParams.set('tax_year', params.tax_year.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(
    `${getApiUrl()}/api/estimates?${searchParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to list estimates');
  }

  return response.json();
}

export async function getEstimate(
  estimateId: string
): Promise<EstimateDetailResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to get estimate');
  }

  return response.json();
}

export async function updateEstimate(
  estimateId: string,
  input: UpdateEstimateInput
): Promise<{ message: string; changes: Record<string, any> }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}`,
    {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Update failed' }));
    throw new Error(error.detail || 'Failed to update estimate');
  }

  return response.json();
}

export async function submitForSignoff(
  estimateId: string
): Promise<{ status: string; is_preliminary: boolean; escalation_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/submit`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Submit failed' }));
    throw new Error(error.detail || 'Failed to submit for signoff');
  }

  return response.json();
}

export async function signoffEstimate(
  estimateId: string,
  input: SignoffInput
): Promise<{ status: string; signoff_id: string; decision: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/signoff`,
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
    const error = await response.json().catch(() => ({ detail: 'Signoff failed' }));
    throw new Error(error.detail || 'Failed to signoff estimate');
  }

  return response.json();
}

export async function exportEstimate(
  estimateId: string,
  exportType: 'pdf' | 'docx' = 'pdf'
): Promise<Blob> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/export`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ export_type: exportType }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(error.detail || 'Failed to export estimate');
  }

  return response.blob();
}

export async function generateEmailDraft(
  estimateId: string
): Promise<{ email_draft: string; to?: string; subject: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/email-draft`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate email draft');
  }

  return response.json();
}

export async function markEstimateSent(
  estimateId: string
): Promise<{ status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/mark-sent`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Mark sent failed' }));
    throw new Error(error.detail || 'Failed to mark as sent');
  }

  return response.json();
}

export async function recomputeEstimate(
  estimateId: string
): Promise<CreditEstimate & { version: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/estimates/${estimateId}/recompute`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Recompute failed' }));
    throw new Error(error.detail || 'Failed to recompute estimate');
  }

  return response.json();
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getStatusColor(status: EstimateStatus): string {
  const colors: Record<EstimateStatus, string> = {
    draft: 'bg-zinc-100 text-zinc-700',
    pending_senior_signoff: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    superseded: 'bg-gray-100 text-gray-500',
    sent_to_client: 'bg-blue-100 text-blue-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getStatusLabel(status: EstimateStatus): string {
  const labels: Record<EstimateStatus, string> = {
    draft: 'Draft',
    pending_senior_signoff: 'Pending Signoff',
    approved: 'Approved',
    rejected: 'Rejected',
    superseded: 'Superseded',
    sent_to_client: 'Sent',
  };
  return labels[status] || status;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function getImpactColor(impact: 'increases' | 'decreases' | 'uncertain'): string {
  const colors = {
    increases: 'text-green-600',
    decreases: 'text-red-600',
    uncertain: 'text-yellow-600',
  };
  return colors[impact];
}

export function getSeverityColor(severity: 'low' | 'medium' | 'high'): string {
  const colors = {
    low: 'bg-blue-100 text-blue-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  };
  return colors[severity];
}

export function getReasonCodeLabel(code: SignoffReasonCode): string {
  const labels: Record<SignoffReasonCode, string> = {
    sufficient_support: 'Sufficient Support',
    insufficient_support: 'Insufficient Support',
    material_uncertainty: 'Material Uncertainty',
    requires_more_evidence: 'Requires More Evidence',
    methodology_change: 'Methodology Change',
    other: 'Other',
  };
  return labels[code] || code;
}
