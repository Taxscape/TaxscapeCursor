/**
 * Admin / Executive Controls API client
 */

import { getApiUrl, getAuthHeaders } from "./api";

// =============================================================================
// TYPES
// =============================================================================

// Authority Library
export interface AuthorityRef {
  id: string;
  authority_type: string;
  citation_label: string;
  citation_key: string;
  summary: string;
  excerpt?: string;
  tags: string[];
  url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthorityCreate {
  authority_type: string;
  citation_label: string;
  citation_key: string;
  summary: string;
  excerpt?: string;
  tags?: string[];
  url?: string;
}

export interface AuthorityUpdate {
  citation_label?: string;
  summary?: string;
  excerpt?: string;
  tags?: string[];
  url?: string;
}

// Org Settings
export interface OrgDefaults {
  wage_outlier_threshold: number;
  large_tx_threshold: number;
  allocation_upper_bound: number;
  allocation_lower_bound: number;
  senior_required_credit_at_risk: number;
  senior_required_qre_at_risk: number;
  block_finalize_with_open_high_findings: boolean;
  allow_preliminary_credit_export: boolean;
  evidence_token_expiration_days: number;
}

export interface OrgFeatureFlags {
  enable_client_upload_portal: boolean;
  enable_section_174_module: boolean;
  enable_ai_narratives: boolean;
  enable_auto_reprocessing: boolean;
  enable_study_locking: boolean;
  enable_credit_range_module: boolean;
}

export interface OrgSettings {
  id?: string;
  organization_id: string;
  defaults: OrgDefaults;
  feature_flags: OrgFeatureFlags;
  purchased_sections: string[];
  created_at?: string;
  updated_at?: string;
}

export interface OrgSettingsUpdate {
  defaults?: Partial<OrgDefaults>;
  feature_flags?: Partial<OrgFeatureFlags>;
  purchased_sections?: string[];
}

// Audit Exports
export interface AuditExport {
  id: string;
  export_type: "audit_log_csv" | "defense_pack_zip";
  status: "queued" | "running" | "completed" | "failed";
  storage_path?: string;
  sha256?: string;
  file_size_bytes?: number;
  metadata: Record<string, unknown>;
  download_url?: string;
  created_at: string;
}

// =============================================================================
// AUTHORITY LIBRARY API
// =============================================================================

export async function listAuthorityRefs(options?: {
  activeOnly?: boolean;
  tag?: string;
  search?: string;
}): Promise<AuthorityRef[]> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (options?.activeOnly !== undefined) params.set("active_only", String(options.activeOnly));
  if (options?.tag) params.set("tag", options.tag);
  if (options?.search) params.set("search", options.search);
  
  const url = `${getApiUrl()}/api/admin/authority${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to list authority refs");
  }
  return res.json();
}

export async function createAuthorityRef(data: AuthorityCreate): Promise<AuthorityRef> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/authority`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create authority ref");
  }
  return res.json();
}

export async function updateAuthorityRef(
  authorityId: string,
  data: AuthorityUpdate
): Promise<AuthorityRef> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/authority/${authorityId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update authority ref");
  }
  return res.json();
}

export async function deactivateAuthorityRef(
  authorityId: string
): Promise<{ message: string; warning?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/authority/${authorityId}/deactivate`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to deactivate");
  }
  return res.json();
}

export async function reactivateAuthorityRef(authorityId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/authority/${authorityId}/reactivate`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reactivate");
  }
  return res.json();
}

// =============================================================================
// ORG SETTINGS API
// =============================================================================

export async function getOrgSettings(): Promise<OrgSettings> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/org-settings`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to get org settings");
  }
  return res.json();
}

export async function updateOrgSettings(data: OrgSettingsUpdate): Promise<OrgSettings> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/org-settings`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update org settings");
  }
  return res.json();
}

// =============================================================================
// AUDIT EXPORT API
// =============================================================================

export async function exportAuditLogs(
  clientId: string,
  taxYear: number
): Promise<AuditExport> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/audit-export/logs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ client_company_id: clientId, tax_year: taxYear }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to export audit logs");
  }
  return res.json();
}

export async function exportDefensePack(
  clientId: string,
  taxYear: number,
  options?: { includeArtifacts?: boolean; includeEvidenceIndex?: boolean }
): Promise<AuditExport> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiUrl()}/api/admin/audit-export/defense-pack`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      client_company_id: clientId,
      tax_year: taxYear,
      include_artifacts: options?.includeArtifacts ?? true,
      include_evidence_index: options?.includeEvidenceIndex ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to export defense pack");
  }
  return res.json();
}

export async function listAuditExports(clientId?: string): Promise<AuditExport[]> {
  const headers = await getAuthHeaders();
  let url = `${getApiUrl()}/api/admin/audit-export/list`;
  if (clientId) url += `?client_id=${clientId}`;
  
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to list exports");
  }
  return res.json();
}

export function getExportDownloadUrl(exportId: string): string {
  return `${getApiUrl()}/api/admin/audit-export/${exportId}/download`;
}

// =============================================================================
// HELPERS
// =============================================================================

export const AUTHORITY_TYPES = [
  { value: "irc_section", label: "IRC Section" },
  { value: "regulation", label: "Regulation" },
  { value: "irs_guidance", label: "IRS Guidance" },
  { value: "form_instruction", label: "Form Instruction" },
  { value: "case_law", label: "Case Law" },
  { value: "internal_policy", label: "Internal Policy" },
];

export const COMMON_TAGS = [
  "four_part_test",
  "qre",
  "wages",
  "supplies",
  "contract_research",
  "foreign_research",
  "section_174",
  "65_percent_rule",
  "form_6765",
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
