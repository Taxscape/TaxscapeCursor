/**
 * Intake Package Generator API Client
 * Provides functions for template generation, email drafts, and intake sessions.
 */

import { getApiUrl } from "./api";
import { getSupabaseClient } from "./supabase";

const API_URL = getApiUrl();

// ============================================================================
// Types
// ============================================================================

export interface IntakeTemplate {
  id: string;
  template_type: string;
  template_version: number;
  file_name: string;
  storage_path: string;
  download_url: string;
  status: "active" | "superseded" | "archived";
  created_at: string;
  metadata: {
    included_sections: string[];
    required_fields: string[];
    example_rows_present: boolean;
    generation_method: string;
  };
}

export interface ExpectedInput {
  required: boolean;
  status: "pending" | "received" | "verified";
  description: string;
  files: string[];
}

export interface IntakeRequirements {
  required_templates: string[];
  optional_templates: string[];
  expected_inputs: Record<string, ExpectedInput>;
}

export interface GenerateTemplatesResponse {
  success: boolean;
  templates: IntakeTemplate[];
  required_inputs: Record<string, ExpectedInput>;
  missing_fields?: string[];
  error?: string;
}

export interface UploadLinkResponse {
  success: boolean;
  upload_link: string;
  token_id: string;
  expires_at: string;
  error?: string;
}

export interface EmailDraftResponse {
  success: boolean;
  draft_id: string;
  subject: string;
  body_text: string;
  to_recipients: Array<{ name: string; email: string }>;
  cc_recipients: Array<{ name: string; email: string }>;
  missing_fields?: string[];
  error?: string;
}

export interface MarkSentResponse {
  success: boolean;
  intake_session_id: string;
  status: string;
  error?: string;
}

export interface IntakeSession {
  id: string;
  organization_id: string;
  client_company_id: string;
  tax_years: number[];
  status: "open" | "awaiting_client" | "received_partial" | "processing" | "needs_mapping" | "complete";
  expected_inputs: Record<string, ExpectedInput>;
  received_files: string[];
  source_email_draft_id?: string;
  template_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ClientIntakeSettings {
  primary_contact_name?: string;
  primary_contact_email?: string;
  purchased_sections?: {
    section_41: boolean;
    section_174: boolean;
  };
  study_scope?: string;
  intake_mode?: "upload_link" | "portal_upload_only" | "email_routing_reserved";
  has_vendors_expected?: boolean;
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
  
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Generate intake templates for a client
 */
export async function generateIntakeTemplates(
  clientCompanyId: string,
  taxYears: number[],
  templateTypes?: string[],
  onboardingSessionId?: string
): Promise<GenerateTemplatesResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/intake/templates/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: clientCompanyId,
      tax_years: taxYears,
      template_types: templateTypes,
      onboarding_session_id: onboardingSessionId,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to generate templates" }));
    throw new Error(error.detail || "Failed to generate templates");
  }
  
  return response.json();
}

/**
 * List templates for a client
 */
export async function listClientTemplates(
  clientCompanyId: string,
  status: string = "active"
): Promise<{ success: boolean; templates: IntakeTemplate[]; error?: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(
    `${API_URL}/api/intake/templates/${clientCompanyId}/list?status=${status}`,
    { headers }
  );
  
  if (!response.ok) {
    return { success: false, templates: [], error: "Failed to fetch templates" };
  }
  
  return response.json();
}

/**
 * Download a template (returns blob URL)
 */
export async function downloadTemplate(templateId: string): Promise<string> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(
    `${API_URL}/api/intake/templates/${templateId}/download`,
    { headers }
  );
  
  if (!response.ok) {
    throw new Error("Failed to download template");
  }
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Generate a secure upload link
 */
export async function generateUploadLink(
  clientCompanyId: string,
  taxYears: number[],
  expiresInDays: number = 30
): Promise<UploadLinkResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/intake/upload-link`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: clientCompanyId,
      tax_years: taxYears,
      expires_in_days: expiresInDays,
    }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to generate upload link");
  }
  
  return response.json();
}

/**
 * Generate an email draft
 */
export async function generateEmailDraft(
  clientCompanyId: string,
  taxYears: number[],
  templateIds: string[],
  uploadLink?: string,
  tone: string = "professional-friendly"
): Promise<EmailDraftResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/intake/email-draft/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: clientCompanyId,
      tax_years: taxYears,
      template_ids: templateIds,
      upload_link: uploadLink,
      tone,
    }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to generate email draft");
  }
  
  return response.json();
}

/**
 * Mark email as sent
 */
export async function markEmailSent(
  emailDraftId: string,
  sentAt?: string
): Promise<MarkSentResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/intake/email-draft/mark-sent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_draft_id: emailDraftId,
      sent_at: sentAt,
    }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to mark email as sent");
  }
  
  return response.json();
}

/**
 * Get intake session for a client
 */
export async function getIntakeSession(
  clientCompanyId: string
): Promise<{ success: boolean; session: IntakeSession | null; error?: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(
    `${API_URL}/api/intake/session/${clientCompanyId}`,
    { headers }
  );
  
  if (!response.ok) {
    return { success: false, session: null, error: "Failed to fetch session" };
  }
  
  return response.json();
}

/**
 * Update client intake settings
 */
export async function updateClientIntakeSettings(
  clientCompanyId: string,
  settings: ClientIntakeSettings
): Promise<{ success: boolean; updated_fields?: string[]; error?: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(
    `${API_URL}/api/intake/client/${clientCompanyId}/settings`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(settings),
    }
  );
  
  if (!response.ok) {
    return { success: false, error: "Failed to update settings" };
  }
  
  return response.json();
}

/**
 * Preview requirements matrix
 */
export async function previewRequirementsMatrix(
  section41: boolean = true,
  section174: boolean = false,
  hasVendors: boolean = true,
  taxYears: number[] = [2024]
): Promise<{
  success: boolean;
  requirements: IntakeRequirements;
  template_definitions: Record<string, { title: string; description: string }>;
}> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    section_41: String(section41),
    section_174: String(section174),
    has_vendors: String(hasVendors),
    tax_years: taxYears.join(","),
  });
  
  const response = await fetch(
    `${API_URL}/api/intake/requirements-matrix?${params}`,
    { headers }
  );
  
  if (!response.ok) {
    throw new Error("Failed to fetch requirements");
  }
  
  return response.json();
}

// ============================================================================
// Template Type Labels
// ============================================================================

export const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  data_request_master: "Data Request Master Checklist",
  projects_questionnaire: "R&D Projects Questionnaire",
  employee_payroll_template: "Employee Payroll Data",
  timesheet_template: "Time Allocation Template",
  vendors_contracts_template: "Vendors & Contracts",
  ap_transactions_template: "AP Transactions Export",
  supplies_template: "R&D Supplies List",
  section_174_info_request: "Section 174 Information Request",
};

export const TEMPLATE_TYPE_ICONS: Record<string, string> = {
  data_request_master: "📋",
  projects_questionnaire: "🔬",
  employee_payroll_template: "👥",
  timesheet_template: "⏱️",
  vendors_contracts_template: "📝",
  ap_transactions_template: "💳",
  supplies_template: "🧪",
  section_174_info_request: "📊",
};
