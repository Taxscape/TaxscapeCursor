/**
 * Background Jobs API Client
 * 
 * Provides functions for starting, monitoring, and managing background jobs.
 */

import { getApiUrl, getAuthHeaders } from "./api";

// =============================================================================
// Types
// =============================================================================

export type JobType =
  | "rd_parse_session"
  | "ai_evaluate_projects"
  | "ai_evaluate_single_project"
  | "generate_excel_report"
  | "generate_credit_estimate_export"
  | "generate_study_artifacts"
  | "generate_defense_pack"
  | "evidence_reprocessing"
  | "sync_expected_inputs"
  | "intake_file_processing"
  | "bulk_import"
  | "other";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "cancellation_requested";

export type JobEventType =
  | "progress_update"
  | "stage_change"
  | "log"
  | "warning"
  | "error"
  | "heartbeat"
  | "child_job_created"
  | "retry_scheduled";

export interface JobProgress {
  percent: number;
  stage: string;
  detail?: string | null;
  counters?: Record<string, number> | null;
  last_heartbeat_at?: string | null;
}

export interface JobError {
  error_type: string;
  message: string;
  hint?: string | null;
  failing_stage?: string | null;
  details?: Record<string, any> | null;
}

export interface JobResult {
  success: boolean;
  outputs: Record<string, any>;
  warnings: string[];
  metrics?: Record<string, any> | null;
}

export interface JobStartResponse {
  job_id: string;
  status: JobStatus;
  progress: JobProgress;
  existing_job: boolean;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: JobProgress;
  result?: JobResult | null;
  error?: JobError | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  can_cancel: boolean;
  can_retry: boolean;
}

export interface JobListItem {
  job_id: string;
  job_type: JobType;
  status: JobStatus;
  progress: JobProgress;
  client_company_id?: string | null;
  tax_year?: number | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface JobListResponse {
  jobs: JobListItem[];
  total_count: number;
  has_more: boolean;
}

export interface JobEvent {
  id: string;
  event_type: JobEventType;
  message: string;
  data?: Record<string, any> | null;
  created_at: string;
}

export interface JobEventsResponse {
  job_id: string;
  events: JobEvent[];
  total_count: number;
}

// SSE Event Types
export interface SSEStatusEvent {
  type: "status";
  job_id: string;
  status: JobStatus;
  progress: JobProgress;
  result?: JobResult | null;
  error?: JobError | null;
  timestamp: string;
}

export interface SSEEventEvent {
  type: "event";
  event_id: string;
  event_type: JobEventType;
  message: string;
  data?: Record<string, any> | null;
  timestamp: string;
}

export interface SSECompleteEvent {
  type: "complete";
  status: JobStatus;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export interface SSETimeoutEvent {
  type: "timeout";
  message: string;
}

export type SSEJobEvent =
  | SSEStatusEvent
  | SSEEventEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSETimeoutEvent;

// =============================================================================
// API Functions
// =============================================================================

const API_URL = getApiUrl();

/**
 * Start a new background job.
 */
export async function startJob(
  jobType: JobType,
  params: Record<string, any> = {},
  options?: {
    clientCompanyId?: string;
    taxYear?: number;
    priority?: number;
  }
): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      job_type: jobType,
      client_company_id: options?.clientCompanyId,
      tax_year: options?.taxYear,
      params,
      priority: options?.priority ?? 5,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start job: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the current status of a job.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/${jobId}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to get job status: ${response.status}`);
  }

  return response.json();
}

/**
 * Get events for a job.
 */
export async function getJobEvents(
  jobId: string,
  limit: number = 50
): Promise<JobEventsResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/${jobId}/events?limit=${limit}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to get job events: ${response.status}`);
  }

  return response.json();
}

/**
 * List jobs with optional filtering.
 */
export async function listJobs(options?: {
  clientCompanyId?: string;
  taxYear?: number;
  status?: JobStatus | JobStatus[];
  jobType?: JobType;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();

  if (options?.clientCompanyId) {
    params.set("client_company_id", options.clientCompanyId);
  }
  if (options?.taxYear) {
    params.set("tax_year", options.taxYear.toString());
  }
  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    params.set("status", statuses.join(","));
  }
  if (options?.jobType) {
    params.set("job_type", options.jobType);
  }
  if (options?.limit) {
    params.set("limit", options.limit.toString());
  }
  if (options?.offset) {
    params.set("offset", options.offset.toString());
  }

  const response = await fetch(`${API_URL}/api/jobs/list?${params.toString()}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to list jobs: ${response.status}`);
  }

  return response.json();
}

/**
 * Cancel a running or queued job.
 */
export async function cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/${jobId}/cancel`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to cancel job: ${response.status}`);
  }

  return response.json();
}

/**
 * Retry a failed or cancelled job.
 */
export async function retryJob(
  jobId: string,
  force: boolean = false
): Promise<{
  success: boolean;
  message: string;
  new_job_id?: string;
  new_job?: JobStartResponse;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/${jobId}/retry?force=${force}`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to retry job: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Convenience Functions for Specific Job Types
// =============================================================================

/**
 * Start an R&D parse job.
 */
export async function startRDParseJob(
  sessionId: string,
  options?: {
    includeAIEval?: boolean;
    fileIds?: string[];
  }
): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/rd-parse`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      include_ai_eval: options?.includeAIEval ?? true,
      file_ids: options?.fileIds,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start RD parse job: ${response.status}`);
  }

  return response.json();
}

/**
 * Start an AI evaluation job.
 */
export async function startAIEvalJob(options: {
  projectIds?: string[];
  clientCompanyId?: string;
  taxYear?: number;
  useEvidence?: boolean;
  force?: boolean;
  concurrency?: number;
}): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/ai-evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_ids: options.projectIds,
      client_company_id: options.clientCompanyId,
      tax_year: options.taxYear ?? 2024,
      use_evidence: options.useEvidence ?? true,
      force: options.force ?? false,
      concurrency: options.concurrency ?? 3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start AI evaluation job: ${response.status}`);
  }

  return response.json();
}

/**
 * Start an Excel report generation job.
 */
export async function startExcelReportJob(
  clientCompanyId: string,
  taxYear: number = 2024,
  studyId?: string
): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/generate-excel`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: clientCompanyId,
      tax_year: taxYear,
      study_id: studyId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start Excel report job: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a study artifacts generation job.
 */
export async function startStudyArtifactsJob(
  studyId: string,
  studyVersion: number,
  options?: {
    artifactTypes?: string[];
    forceRegenerate?: boolean;
  }
): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/generate-study-artifacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      study_id: studyId,
      study_version: studyVersion,
      artifact_types: options?.artifactTypes,
      force_regenerate: options?.forceRegenerate ?? false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start study artifacts job: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a defense pack generation job.
 */
export async function startDefensePackJob(
  studyId: string,
  options?: {
    includeEvidence?: boolean;
    includeAuditTrail?: boolean;
  }
): Promise<JobStartResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/jobs/generate-defense-pack`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      study_id: studyId,
      include_evidence: options?.includeEvidence ?? true,
      include_audit_trail: options?.includeAuditTrail ?? true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to start defense pack job: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// SSE Streaming
// =============================================================================

/**
 * Subscribe to job events using Server-Sent Events.
 * 
 * @param jobId - The job ID to subscribe to
 * @param onEvent - Callback for each event
 * @param onError - Callback for errors
 * @returns A function to close the connection
 */
export function subscribeToJob(
  jobId: string,
  onEvent: (event: SSEJobEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`${API_URL}/api/jobs/${jobId}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as SSEJobEvent;
      onEvent(data);

      // Close on completion
      if (data.type === "complete" || data.type === "error" || data.type === "timeout") {
        eventSource.close();
      }
    } catch (e) {
      console.error("Error parsing SSE event:", e);
    }
  };

  eventSource.onerror = (event) => {
    console.error("SSE error:", event);
    onError?.(new Error("Connection error"));
    eventSource.close();
  };

  return () => eventSource.close();
}

// =============================================================================
// Polling Helper
// =============================================================================

/**
 * Poll job status until completion.
 * 
 * @param jobId - The job ID to poll
 * @param options - Polling options
 * @returns Promise that resolves with final job status
 */
export async function pollJobUntilComplete(
  jobId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (status: JobStatusResponse) => void;
  }
): Promise<JobStatusResponse> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 600000; // 10 minutes
  const startTime = Date.now();

  while (true) {
    const status = await getJobStatus(jobId);
    
    options?.onProgress?.(status);

    if (
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "cancelled"
    ) {
      return status;
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Job polling timeout exceeded");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get human-readable job type label.
 */
export function getJobTypeLabel(jobType: JobType): string {
  const labels: Record<JobType, string> = {
    rd_parse_session: "R&D Analysis Parse",
    ai_evaluate_projects: "AI Project Evaluation",
    ai_evaluate_single_project: "AI Project Evaluation",
    generate_excel_report: "Excel Report Generation",
    generate_credit_estimate_export: "Credit Estimate Export",
    generate_study_artifacts: "Study Artifacts Generation",
    generate_defense_pack: "Defense Pack Generation",
    evidence_reprocessing: "Evidence Reprocessing",
    sync_expected_inputs: "Sync Expected Inputs",
    intake_file_processing: "Intake File Processing",
    bulk_import: "Bulk Import",
    other: "Background Task",
  };
  return labels[jobType] || jobType;
}

/**
 * Get status badge color.
 */
export function getJobStatusColor(status: JobStatus): string {
  const colors: Record<JobStatus, string> = {
    queued: "gray",
    running: "blue",
    completed: "green",
    failed: "red",
    cancelled: "orange",
    cancellation_requested: "yellow",
  };
  return colors[status] || "gray";
}

/**
 * Check if job is in a terminal state.
 */
export function isJobComplete(status: JobStatus): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}

/**
 * Check if job is currently active.
 */
export function isJobActive(status: JobStatus): boolean {
  return ["queued", "running", "cancellation_requested"].includes(status);
}
