/**
 * Intake Ingestion Pipeline API Client
 * Handles file upload, classification, parsing, and mapping resolution.
 */

import { getApiUrl } from "./api";
import { getSupabaseClient } from "./supabase";

const API_URL = getApiUrl();

// ============================================================================
// Types
// ============================================================================

export interface IntakeFile {
  id: string;
  client_intake_session_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  sha256: string;
  classification_domain: ClassificationDomain;
  classification_confidence: number;
  classification_reason: string;
  classification_method: "heuristic" | "ai" | "user_override";
  status: FileStatus;
  parse_error?: string;
  parse_summary?: ParseSummary;
  sheet_names: string[];
  header_row: string[];
  preview_data: string[][];
  created_at: string;
  updated_at: string;
}

export type ClassificationDomain =
  | "employees_payroll"
  | "projects"
  | "timesheets"
  | "vendors"
  | "contracts"
  | "ap_transactions"
  | "supplies"
  | "section_174_support"
  | "unknown";

export type FileStatus =
  | "uploaded"
  | "classifying"
  | "classified"
  | "parsing"
  | "needs_mapping"
  | "parsed"
  | "failed"
  | "archived";

export interface ParseSummary {
  rows_parsed: number;
  rows_inserted: number;
  rows_updated: number;
  columns_recognized: string[];
  columns_missing: string[];
  mappings_needed: MappingInfo[];
  errors: string[];
}

export interface MappingInfo {
  type: MappingType;
  prompt: string;
  options?: string[];
  target_field?: string;
  unmatched?: string[];
  context?: Record<string, unknown>;
}

export interface IntakeMapping {
  id: string;
  intake_file_id: string;
  mapping_type: MappingType;
  status: "open" | "resolved" | "ignored";
  prompt: string;
  context: Record<string, unknown>;
  options: string[];
  resolution?: Record<string, unknown>;
  resolved_by_user_id?: string;
  resolved_at?: string;
  created_at: string;
}

export type MappingType =
  | "column_mapping"
  | "project_name_matching"
  | "employee_matching"
  | "vendor_matching"
  | "category_classification"
  | "tax_year_assignment"
  | "sheet_domain_assignment";

export interface ExpectedInput {
  required: boolean;
  status: "missing" | "received" | "parsed" | "needs_mapping" | "verified";
  description: string;
  files: string[];
}

export interface IntakeSessionDetail {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_years: number[];
  status: string;
  expected_inputs: Record<string, ExpectedInput>;
  received_files_count: number;
  parsed_summary?: Record<string, unknown>;
  client_companies?: { name: string; tax_year: string };
}

export interface UploadResult {
  id: string;
  filename: string;
  status: string;
  classification_domain?: ClassificationDomain;
  classification_confidence?: number;
  classification_reason?: string;
  existing_file?: string;
}

export interface ProcessResult {
  file_id: string;
  filename: string;
  domain?: ClassificationDomain;
  status: string;
  rows_parsed?: number;
  rows_inserted?: number;
  note?: string;
  error?: string;
  reason?: string;
}

export interface MissingInputSummary {
  category: string;
  status: string;
  required: boolean;
  icon: string;
  description: string;
}

// ============================================================================
// Auth Helper
// ============================================================================

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();
  let { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult.data.session) {
      session = refreshResult.data.session;
    }
  }
  
  const headers: HeadersInit = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload files to an intake session
 */
export async function uploadIntakeFiles(
  sessionId: string,
  files: File[]
): Promise<{ success: boolean; files: UploadResult[]; session_id: string }> {
  const headers = await getAuthHeaders() as Record<string, string>;
  
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}/upload`, {
    method: "POST",
    headers: {
      Authorization: headers["Authorization"] || "",
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || "Upload failed");
  }
  
  return response.json();
}

/**
 * Get intake session details
 */
export async function getIntakeSessionDetail(
  sessionId: string
): Promise<{
  success: boolean;
  session: IntakeSessionDetail;
  files_count: number;
  files_summary: Partial<IntakeFile>[];
  open_mappings_count: number;
}> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}`, {
    headers,
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch session");
  }
  
  return response.json();
}

/**
 * List files in a session
 */
export async function listSessionFiles(
  sessionId: string
): Promise<{ success: boolean; files: IntakeFile[] }> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}/files`, {
    headers,
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch files");
  }
  
  return response.json();
}

/**
 * Override file classification
 */
export async function overrideClassification(
  fileId: string,
  domain: ClassificationDomain,
  reason: string
): Promise<{ success: boolean; new_domain: ClassificationDomain }> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/files/${fileId}/override-classification`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      classification_domain: domain,
      reason,
    }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to override classification");
  }
  
  return response.json();
}

/**
 * Process intake session (parse all files)
 */
export async function processIntakeSession(
  sessionId: string
): Promise<{
  success: boolean;
  session_status: string;
  results: ProcessResult[];
  mappings_created: number;
  summary: { total_rows_parsed: number; total_records_inserted: number };
}> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}/process`, {
    method: "POST",
    headers,
  });
  
  if (!response.ok) {
    throw new Error("Failed to process session");
  }
  
  return response.json();
}

/**
 * Get file mappings
 */
export async function getFileMappings(
  fileId: string
): Promise<{ success: boolean; mappings: IntakeMapping[] }> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/files/${fileId}/mappings`, {
    headers,
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch mappings");
  }
  
  return response.json();
}

/**
 * Resolve a mapping
 */
export async function resolveMapping(
  mappingId: string,
  resolution: Record<string, unknown>
): Promise<{ success: boolean; remaining_mappings: number }> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/mappings/${mappingId}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resolution }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to resolve mapping");
  }
  
  return response.json();
}

/**
 * Finalize intake session
 */
export async function finalizeIntakeSession(
  sessionId: string,
  confirm: boolean = true
): Promise<{
  success: boolean;
  can_finalize?: boolean;
  blockers?: Array<{ type: string; count?: number; category?: string; status?: string; details?: string[] }>;
  status?: string;
  record_counts?: Record<string, number>;
  next_action?: string;
}> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ confirm }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to finalize session");
  }
  
  return response.json();
}

/**
 * Get missing inputs tracker
 */
export async function getMissingInputs(
  sessionId: string
): Promise<{
  success: boolean;
  session_status: string;
  inputs: MissingInputSummary[];
  can_finalize: boolean;
}> {
  const headers = await getAuthHeaders();
  headers["Content-Type"] = "application/json";
  
  const response = await fetch(`${API_URL}/api/intake/sessions/${sessionId}/missing-inputs`, {
    headers,
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch missing inputs");
  }
  
  return response.json();
}

// ============================================================================
// Domain Labels
// ============================================================================

export const DOMAIN_LABELS: Record<ClassificationDomain, string> = {
  employees_payroll: "Employee Payroll",
  projects: "R&D Projects",
  timesheets: "Timesheets / Time Allocation",
  vendors: "Vendors / Contractors",
  contracts: "Contracts / Agreements",
  ap_transactions: "AP Transactions",
  supplies: "R&D Supplies",
  section_174_support: "Section 174 Support",
  unknown: "Unknown / Unclassified",
};

export const DOMAIN_ICONS: Record<ClassificationDomain, string> = {
  employees_payroll: "👥",
  projects: "🔬",
  timesheets: "⏱️",
  vendors: "🏢",
  contracts: "📝",
  ap_transactions: "💳",
  supplies: "🧪",
  section_174_support: "📊",
  unknown: "❓",
};

export const STATUS_COLORS: Record<FileStatus, string> = {
  uploaded: "bg-blue-500/20 text-blue-400",
  classifying: "bg-yellow-500/20 text-yellow-400",
  classified: "bg-cyan-500/20 text-cyan-400",
  parsing: "bg-purple-500/20 text-purple-400",
  needs_mapping: "bg-amber-500/20 text-amber-400",
  parsed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  archived: "bg-gray-500/20 text-gray-400",
};
