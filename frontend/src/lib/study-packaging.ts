/**
 * Study Packaging API client
 */

import { getApiUrl, getAuthHeaders } from "./api";

// Types
export interface ReadinessCheck {
  check_id: string;
  status: "pass" | "fail" | "warn";
  blocking: boolean;
  severity: "info" | "warning" | "error";
  message: string;
  remediation?: {
    target?: string;
    href?: string;
  };
}

export interface ReadinessResponse {
  checks: ReadinessCheck[];
  blocking_count: number;
  warning_count: number;
}

export interface ArtifactInfo {
  artifact_type: string;
  generation_status: "queued" | "running" | "completed" | "failed";
  mime_type?: string;
  sha256?: string;
  error?: string;
  download_url?: string;
}

export interface StudySignoff {
  id: string;
  decision: "approved" | "rejected" | "changes_requested";
  reason_code: string;
  note: string;
  completion_method: string;
  decided_by_user_id: string;
  decided_at: string;
}

export interface Study {
  id: string;
  client_company_id: string;
  tax_year: number;
  study_version: number;
  status: "draft" | "ready_for_finalization" | "finalizing" | "final" | "complete" | "superseded";
  finalized_by_user_id?: string;
  finalized_at?: string;
  locked_at?: string;
  snapshot_metadata: Record<string, unknown>;
  artifacts: ArtifactInfo[];
  signoffs: StudySignoff[];
}

export interface FinalizeRequest {
  client_company_id: string;
  tax_year: number;
  allow_overrides?: boolean;
  override_reasons?: Array<{ check_id: string; reason: string }>;
}

export interface CompleteRequest {
  reason_code: string;
  note: string;
}

export interface EmailDraft {
  id: string;
  to_email?: string;
  subject: string;
  body: string;
}

// API Functions

export async function getStudyReadiness(
  clientId: string,
  taxYear: number
): Promise<ReadinessResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${getApiUrl()}/api/study/readiness?client_id=${clientId}&tax_year=${taxYear}`,
    { headers }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to get readiness");
  }
  return res.json();
}

export async function finalizeStudy(
  request: FinalizeRequest
): Promise<{ study_id: string; version: number; status: string; message: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/study/finalize`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to finalize study");
  }
  return res.json();
}

export async function getStudy(studyId: string): Promise<Study> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/study/${studyId}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to get study");
  }
  return res.json();
}

export async function listStudies(
  clientId: string,
  taxYear?: number,
  status?: string
): Promise<{ studies: Study[] }> {
  const headers = await getAuthHeaders();
  let url = `${getApiUrl()}/api/study/list?client_id=${clientId}`;
  if (taxYear) url += `&tax_year=${taxYear}`;
  if (status) url += `&status=${status}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to list studies");
  }
  return res.json();
}

export async function retryArtifact(
  studyId: string,
  artifactType: string
): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${getApiUrl()}/api/study/${studyId}/retry-artifact?artifact_type=${artifactType}`,
    { method: "POST", headers }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to retry artifact");
  }
  return res.json();
}

export async function completeStudy(
  studyId: string,
  request: CompleteRequest
): Promise<{ status: string; locked_at: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/study/${studyId}/complete`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to complete study");
  }
  return res.json();
}

export async function generateEmailDraft(studyId: string): Promise<EmailDraft> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/study/${studyId}/email-draft`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to generate email draft");
  }
  return res.json();
}

export async function markEmailSent(
  studyId: string
): Promise<{ message: string; marked_sent_at: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/study/${studyId}/email-draft/mark-sent`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to mark email sent");
  }
  return res.json();
}

export function getArtifactDownloadUrl(studyId: string, artifactType: string): string {
  return `${getApiUrl()}/api/study/${studyId}/download/${artifactType}`;
}

// Helper to get artifact label
export function getArtifactLabel(artifactType: string): string {
  const labels: Record<string, string> = {
    excel_study_workbook: "Final Excel Study Workbook",
    form_6765_export: "Form 6765 Export",
    section_41_narratives_docx: "Section 41 Narratives (DOCX)",
    section_174_narratives_docx: "Section 174 Narratives (DOCX)",
    project_narrative_packets_zip: "Project Narrative Packets (ZIP)",
    client_cover_summary_pdf: "Client Cover Summary (PDF)",
    client_package_zip: "Client Package (ZIP)",
  };
  return labels[artifactType] || artifactType;
}

// Reason codes for study completion
export const STUDY_COMPLETION_REASON_CODES = [
  { value: "all_findings_resolved", label: "All findings resolved" },
  { value: "senior_override_allowed", label: "Senior override — proceed with open items" },
  { value: "documentation_sufficient", label: "Documentation sufficient for audit" },
  { value: "client_scope_change", label: "Client-requested scope change" },
  { value: "other", label: "Other (specify in note)" },
];
