import { getSupabaseClient } from "./supabase";
import type {
  ProjectAIEvaluation,
  ProjectEvidenceItem,
  ProjectGap,
  EvaluateProjectResponse,
  EvaluateClientResponse,
  EvidenceUploadResponse,
  DraftNarrativeResponse,
  NextBestActionsResponse,
} from "./types";

// =============================================================================
// API URL CONFIGURATION
// =============================================================================
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://taxscapecursor-production.up.railway.app";

// Log API URL for debugging
if (typeof window !== "undefined") {
  console.log(`[TaxScape API] Connected to: ${API_URL}`);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Export for debugging
export function getApiUrl(): string {
  return API_URL;
}

// Check API connectivity
export async function checkApiConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/health`, { 
      method: "GET",
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    if (response.ok) {
      return { connected: true };
    }
    return { connected: false, error: `Server returned status ${response.status}` };
  } catch (error) {
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : "Connection failed" 
    };
  }
}

// Helper to get a fresh session, refreshing token if needed
async function getFreshSession() {
  const supabase = getSupabaseClient();
  
  console.log('[API] getFreshSession called');
  
  // Try to get session with retry (handles race condition on page refresh)
  let session = null;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase.auth.getSession();
    console.log(`[API] getSession attempt ${i + 1}:`, {
      hasSession: !!data?.session,
      hasAccessToken: !!data?.session?.access_token,
      tokenLength: data?.session?.access_token?.length || 0,
      error: error?.message
    });
    session = data.session;
    if (session) break;
    await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
  }
  
  if (!session) {
    console.log('[API] No session found after retries');
    return null;
  }
  
  console.log('[API] Session found:', {
    userId: session.user?.id,
    email: session.user?.email,
    tokenLength: session.access_token?.length || 0
  });
  
  // Check if token is about to expire (within 5 minutes)
  const expiresAt = session.expires_at;
  if (expiresAt) {
    const expiresAtMs = expiresAt * 1000; // Convert to milliseconds
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    
    if (expiresAtMs < fiveMinutesFromNow) {
      console.log('[API] Token expiring soon, refreshing...');
      try {
        const { data: refreshData, error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('[API] Token refresh failed:', error.message);
        } else if (refreshData.session) {
          console.log('[API] Token refreshed successfully');
          return refreshData.session;
        }
      } catch (e) {
        console.error('[API] Token refresh error:', e);
      }
    }
  }
  
  return session;
}

// Helper to get auth headers with retry logic and token refresh
async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await getFreshSession();
  
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// Helper to get auth headers for file uploads (no Content-Type)
async function getAuthHeadersForUpload(): Promise<HeadersInit> {
  const session = await getFreshSession();
  
  const headers: HeadersInit = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

import { 
  ChatMessage, ChatResult, DashboardData, Project, Employee, Contractor, 
  Study, ChatSession, UserContext, WorkflowSummary, ProjectWorkflowStatus,
  WorkflowOverallState
} from "./types";
import { SavedView } from "./schemas";

// Re-export types from types.ts for backward compatibility
export type { 
  ChatMessage, ChatResult, DashboardData, Project, Employee, Contractor, 
  Study, ChatSession, UserContext, WorkflowSummary, ProjectWorkflowStatus,
  WorkflowOverallState
} from "./types";

// =============================================================================
// TASK MANAGEMENT ENDPOINTS (RBAC)
// =============================================================================

export type TaskType = 
  | 'request_project_narrative'
  | 'request_process_of_experimentation_details'
  | 'request_uncertainty_statement'
  | 'request_technical_document_upload'
  | 'request_test_results_upload'
  | 'resolve_financial_anomaly'
  | 'verify_employee_allocation'
  | 'verify_contractor_qualification'
  | 'confirm_supply_eligibility'
  | 'review_ai_evaluation'
  | 'final_review_and_signoff'
  | 'generic';

export type TaskStatus = 
  | 'draft' | 'assigned' | 'in_progress' | 'submitted'
  | 'changes_requested' | 'accepted' | 'denied'
  | 'blocked' | 'escalated' | 'closed';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface StructuredTask {
  id: string;
  organization_id: string;
  client_id: string;
  project_id?: string;
  criterion_key?: string;
  task_type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  assigned_to?: string;
  created_by: string;
  related_entities?: any;
  acceptance_criteria?: any[];
  required_artifacts?: any[];
  submission?: any;
  review?: any;
  escalation_state?: any;
  initiated_by_ai?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskCreatePayload {
  client_id: string;
  project_id?: string;
  criterion_key?: string;
  task_type: TaskType;
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string;
  assigned_to?: string;
  related_entities?: any;
  acceptance_criteria?: any[];
  required_artifacts?: any[];
  initiated_by_ai?: boolean;
}

export async function createTask(payload: TaskCreatePayload): Promise<StructuredTask> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.detail || "Failed to create task");
  }
  const result = await response.json();
  return result.data;
}

export async function getMyTasks(status?: string): Promise<StructuredTask[]> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}/api/tasks/my${status ? `?status=${status}` : ''}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Failed to fetch tasks");
  const result = await response.json();
  return result.data;
}

export async function getClientTasks(clientId: string, status?: string): Promise<StructuredTask[]> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}/api/tasks/client/${clientId}${status ? `?status=${status}` : ''}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Failed to fetch client tasks");
  const result = await response.json();
  return result.data;
}

export async function getReviewQueue(): Promise<StructuredTask[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/review-queue`, { headers });
  if (!response.ok) throw new Error("Failed to fetch review queue");
  const result = await response.json();
  return result.data;
}

export async function getBlockerTasks(): Promise<StructuredTask[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/blockers`, { headers });
  if (!response.ok) throw new Error("Failed to fetch blockers");
  const result = await response.json();
  return result.data;
}

export async function updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/status?new_status=${newStatus}`, {
    method: "PATCH",
    headers,
  });
  if (!response.ok) throw new Error("Failed to update task status");
  return await response.json();
}

export async function submitTask(taskId: string, artifacts: any[], notes?: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ artifacts, notes }),
  });
  if (!response.ok) throw new Error("Failed to submit task");
  return await response.json();
}

export async function reviewTask(taskId: string, decision: string, reasonCode: string, notes?: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/review`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision, reason_code: reasonCode, notes }),
  });
  if (!response.ok) throw new Error("Failed to review task");
  return await response.json();
}

export async function escalateTask(taskId: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/escalate`, {
    method: "POST",
    headers,
  });
  if (!response.ok) throw new Error("Failed to escalate task");
  return await response.json();
}

export async function getUserPermissions(): Promise<{ role: string; permissions: string[] }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/tasks/permissions`, { headers });
  if (!response.ok) throw new Error("Failed to fetch permissions");
  return await response.json();
}

// =============================================================================
// COPILOT ENGINE ENDPOINTS
// =============================================================================

export interface CopilotCitation {
  evidence_id?: string;
  file_id?: string;
  task_id?: string;
  project_id?: string;
  criterion_key?: string;
  snippet?: string;
  location?: string;
}

export interface CopilotFinding {
  severity: 'info' | 'warning' | 'critical';
  reason_code: string;
  affected_entities: string[];
  message: string;
}

export interface CopilotResponse {
  summary: string;
  findings: CopilotFinding[];
  citations: CopilotCitation[];
  suggested_actions: any[];
  questions_for_user: string[];
  confidence: number;
  confidence_explanation: string;
}

export async function queryCopilot(prompt: string, clientId: string, projectId?: string): Promise<CopilotResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/copilot/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, client_id: clientId, project_id: projectId }),
  });
  if (!response.ok) throw new Error("Copilot query failed");
  return await response.json();
}

export async function getCopilotSuggestions(clientId: string, projectId?: string): Promise<any[]> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}/api/copilot/suggestions?client_id=${clientId}${projectId ? `&project_id=${projectId}` : ''}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Failed to fetch suggestions");
  const result = await response.json();
  return result.data;
}

export async function decideCopilotAction(actionId: string, approve: boolean): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/copilot/action/decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action_id: actionId, approve }),
  });
  if (!response.ok) throw new Error("Failed to decide on action");
  return await response.json();
}

export async function executeCopilotAction(actionId: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/copilot/action/execute?action_id=${actionId}`, {
    method: "POST",
    headers,
  });
  if (!response.ok) throw new Error("Failed to execute action");
  return await response.json();
}

export async function getSavedViews(entityType: string): Promise<SavedView[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/workspace/views/${entityType}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch views");
  const result = await response.json();
  return result.data;
}

export async function createSavedView(view: Partial<SavedView>): Promise<SavedView> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/workspace/views`, {
    method: "POST",
    headers,
    body: JSON.stringify(view),
  });
  if (!response.ok) throw new Error("Failed to create view");
  const result = await response.json();
  return result.data;
}

export async function inlineEditEntity(table: string, id: string, updates: Record<string, any>): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/workspace/${table}/${id}/inline-edit`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error("CONFLICT");
    }
    throw new Error("Failed to edit entity");
  }
  const result = await response.json();
  return result.data;
}

// =============================================================================
// WORKFLOW ENGINE ENDPOINTS
// =============================================================================

export async function getClientWorkflowSummary(clientId: string): Promise<WorkflowSummary> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/workflow/client/${clientId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch client workflow summary");
  }

  return await response.json();
}

export async function getProjectWorkflowDetails(projectId: string): Promise<{
  status: ProjectWorkflowStatus;
  criteria: any[];
  evidence: any[];
}> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/workflow/project/${projectId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch project workflow details");
  }

  return await response.json();
}

export async function triggerWorkflowRecompute(projectId: string): Promise<{ summary: any }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/workflow/project/${projectId}/recompute`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to trigger workflow recompute");
  }

  return await response.json();
}

export async function submitProjectDecision(
  projectId: string, 
  decision: WorkflowOverallState, 
  reasonCode: string, 
  comment?: string
): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/workflow/project/${projectId}/decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision, reason_code: reasonCode, comment }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit project decision");
  }

  return await response.json();
}

// =============================================================================
// PUBLIC ENDPOINTS (NO AUTH REQUIRED)
// =============================================================================

export async function sendChatMessageDemo(messages: ChatMessage[]): Promise<ChatResult> {
  const response = await fetch(`${API_URL}/api/chat_demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return await response.json();
}

export async function downloadChatExcel(payload: Record<string, unknown>, title?: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/api/chat_excel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, title: title || "R&D Tax Credit Study" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to generate Excel");
  }

  return await response.blob();
}

// =============================================================================
// AUTHENTICATED ENDPOINTS
// =============================================================================

export async function sendChatMessage(
  messages: ChatMessage[], 
  sessionId?: string,
  includeContext?: boolean
): Promise<ChatResult> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      messages, 
      session_id: sessionId,
      include_context: includeContext ?? true,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      return sendChatMessageDemo(messages);
    }
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return await response.json();
}

export async function getDashboard(): Promise<DashboardData> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/dashboard`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  return await response.json();
}

export async function getUserContext(): Promise<UserContext> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/user_context`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user context");
  }

  return await response.json();
}

export async function getProjects(): Promise<Project[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/projects`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }

  const data = await response.json();
  return data.projects;
}

export async function createProject(project: Partial<Project>): Promise<Project> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    throw new Error("Failed to create project");
  }

  const data = await response.json();
  return data.project;
}

export async function getEmployees(): Promise<Employee[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/employees`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch employees");
  }

  const data = await response.json();
  return data.employees;
}

export async function createEmployee(employee: Partial<Employee>): Promise<Employee> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/employees`, {
    method: "POST",
    headers,
    body: JSON.stringify(employee),
  });

  if (!response.ok) {
    throw new Error("Failed to create employee");
  }

  const data = await response.json();
  return data.employee;
}

export async function getContractors(): Promise<Contractor[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/contractors`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch contractors");
  }

  const data = await response.json();
  return data.contractors;
}

export async function createContractor(contractor: Partial<Contractor>): Promise<Contractor> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/contractors`, {
    method: "POST",
    headers,
    body: JSON.stringify(contractor),
  });

  if (!response.ok) {
    throw new Error("Failed to create contractor");
  }

  const data = await response.json();
  return data.contractor;
}

export async function getStudies(): Promise<Study[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/studies`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch studies");
  }

  const data = await response.json();
  return data.studies;
}

export async function generateStudy(
  payload: Record<string, unknown>,
  sessionId?: string,
  title?: string
): Promise<Blob> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/generate_study`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      payload,
      session_id: sessionId,
      title: title || "R&D Tax Credit Study",
    }),
  });

  if (!response.ok) {
    return downloadChatExcel(payload, title);
  }

  return await response.blob();
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/chat/sessions`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch chat sessions");
  }

  const data = await response.json();
  return data.sessions;
}

export async function getSessionMessages(sessionId: string): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/chat/sessions/${sessionId}/messages`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch session messages");
  }

  return await response.json();
}

export async function uploadPayroll(file: File): Promise<{ message: string; count: number }> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${API_URL}/api/upload_payroll`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload payroll");
  }

  return await response.json();
}

export async function uploadContractors(file: File): Promise<{ message: string; count: number }> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${API_URL}/api/upload_contractors`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload contractors");
  }

  return await response.json();
}

export async function sendChatWithFiles(
  messages: ChatMessage[],
  files: File[],
  sessionId?: string
): Promise<ChatResult> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("messages_json", JSON.stringify(messages));
  
  if (sessionId) {
    formData.append("session_id", sessionId);
  }
  
  files.forEach((file) => {
    formData.append("files", file);
  });
  
  const response = await fetch(`${API_URL}/api/chat_with_files`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to send chat with files");
  }

  return await response.json();
}

export async function submitDemoRequest(data: {
  name: string;
  email: string;
  company?: string;
  message?: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/api/demo_request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to submit demo request");
  }

  return await response.json();
}

// =============================================================================
// ORGANIZATION TYPES
// =============================================================================

export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  tax_year: string;
  settings: Record<string, unknown>;
  user_role?: string;
  user_status?: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
};

export type VerificationTask = {
  id: string;
  organization_id: string;
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  category: 'projects' | 'vendors' | 'supplies' | 'wages';
  item_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'verified' | 'denied';
  priority: 'high' | 'medium' | 'low';
  due_date: string | null;
  comment: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  item_type: string | null;
  item_id: string | null;
  details: Record<string, unknown>;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
};

// =============================================================================
// ORGANIZATION ENDPOINTS
// =============================================================================

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  // Public endpoint - no auth required
  const response = await fetch(`${API_URL}/organizations/by-slug/${slug}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to fetch organization");
  }

  const data = await response.json();
  return data.organization;
}

export async function getCurrentOrganization(): Promise<Organization | null> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/current`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch current organization");
  }

  const data = await response.json();
  return data.organization;
}

export async function createOrganization(data: {
  name: string;
  industry?: string;
  tax_year?: string;
}): Promise<Organization> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create organization");
  }

  const result = await response.json();
  return result.organization;
}

export async function updateOrganization(orgId: string, data: {
  name?: string;
  industry?: string;
  tax_year?: string;
  settings?: Record<string, unknown>;
}): Promise<Organization> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update organization");
  }

  const result = await response.json();
  return result.organization;
}

// =============================================================================
// ORGANIZATION MEMBERS ENDPOINTS
// =============================================================================

export async function getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/members`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch organization members");
  }

  const data = await response.json();
  return data.members;
}

export async function inviteOrganizationMember(orgId: string, data: {
  email: string;
  role: string;
}): Promise<{ success: boolean; message: string; member?: OrganizationMember; pending?: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/invite`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to invite member");
  }

  return await response.json();
}

export async function updateOrganizationMember(orgId: string, userId: string, data: {
  role?: string;
  status?: string;
}): Promise<{ success: boolean; member?: OrganizationMember }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/members/${userId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update member");
  }

  return await response.json();
}

export async function removeOrganizationMember(orgId: string, userId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/members/${userId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to remove member");
  }

  return await response.json();
}

// =============================================================================
// VERIFICATION TASKS ENDPOINTS
// =============================================================================

export async function getVerificationTasks(orgId: string, filters?: {
  status?: string;
  category?: string;
}): Promise<VerificationTask[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  
  const url = `${API_URL}/organizations/${orgId}/tasks${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch tasks");
  }

  const data = await response.json();
  return data.tasks;
}

export async function createVerificationTask(orgId: string, data: {
  title: string;
  category: string;
  assigned_to?: string;
  item_id?: string;
  description?: string;
  priority?: string;
  due_date?: string;
}): Promise<VerificationTask> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to create task");
  }

  const result = await response.json();
  return result.task;
}

export async function updateVerificationTask(orgId: string, taskId: string, data: {
  status?: string;
  comment?: string;
  assigned_to?: string;
  priority?: string;
}): Promise<VerificationTask> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/tasks/${taskId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update task");
  }

  const result = await response.json();
  return result.task;
}

// =============================================================================
// AUDIT LOG ENDPOINTS
// =============================================================================

export async function getAuditLog(orgId: string, limit?: number): Promise<AuditLogEntry[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit.toString());
  
  const url = `${API_URL}/organizations/${orgId}/audit-log${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch audit log");
  }

  const data = await response.json();
  return data.logs;
}

// =============================================================================
// EXECUTIVE OVERVIEW ENDPOINTS
// =============================================================================

export type ExecutiveOverview = {
  budget: {
    total: number;
    spent: number;
    remaining: number;
    usage_percent: number;
  };
  tasks: {
    total: number;
    completed: number;
    in_progress: number;
    blocked: number;
    completion_percent: number;
  };
  projects: number;
  team_size: number;
  burn_rate: number;
  alerts: Array<{
    type: 'critical' | 'warning' | 'info';
    message: string;
  }>;
};

export async function getExecutiveOverview(orgId: string): Promise<ExecutiveOverview | null> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/overview`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch executive overview");
  }

  const data = await response.json();
  return data.overview;
}

// =============================================================================
// BUDGET ENDPOINTS (CPA)
// =============================================================================

export type Budget = {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  total_amount: number;
  allocated_amount: number;
  category: string | null;
  fiscal_year: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string | null;
  creator_name?: string | null;
  spent?: number;
  remaining?: number;
};

export async function getBudgets(orgId: string, projectId?: string): Promise<Budget[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  
  const url = `${API_URL}/organizations/${orgId}/budgets${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch budgets");
  }

  const data = await response.json();
  return data.budgets;
}

export async function createBudget(orgId: string, data: {
  name: string;
  project_id?: string;
  total_amount?: number;
  category?: string;
  fiscal_year?: string;
  notes?: string;
}): Promise<Budget> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/budgets`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create budget");
  }

  const result = await response.json();
  return result.budget;
}

export async function updateBudget(orgId: string, budgetId: string, data: {
  name?: string;
  total_amount?: number;
  allocated_amount?: number;
  category?: string;
  status?: string;
  notes?: string;
}): Promise<Budget> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/budgets/${budgetId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update budget");
  }

  const result = await response.json();
  return result.budget;
}

export async function deleteBudget(orgId: string, budgetId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/budgets/${budgetId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete budget");
  }

  return await response.json();
}

// =============================================================================
// EXPENSE ENDPOINTS (CPA)
// =============================================================================

export type Expense = {
  id: string;
  organization_id: string;
  budget_id: string | null;
  project_id: string | null;
  description: string;
  amount: number;
  category: string | null;
  vendor_name: string | null;
  expense_date: string;
  receipt_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  logged_by: string | null;
  created_at: string;
  updated_at: string;
  budget_name?: string | null;
  project_name?: string | null;
  logged_by_name?: string | null;
};

export type ExpenseSummary = {
  total: number;
  by_category: Record<string, number>;
  by_status: {
    pending: number;
    approved: number;
    rejected: number;
  };
};

export async function getExpenses(orgId: string, filters?: {
  budget_id?: string;
  project_id?: string;
  status?: string;
}): Promise<Expense[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (filters?.budget_id) params.set("budget_id", filters.budget_id);
  if (filters?.project_id) params.set("project_id", filters.project_id);
  if (filters?.status) params.set("status", filters.status);
  
  const url = `${API_URL}/organizations/${orgId}/expenses${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch expenses");
  }

  const data = await response.json();
  return data.expenses;
}

export async function getExpenseSummary(orgId: string): Promise<ExpenseSummary> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/expenses/summary`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch expense summary");
  }

  const data = await response.json();
  return data.summary;
}

export async function createExpense(orgId: string, data: {
  description: string;
  amount: number;
  budget_id?: string;
  project_id?: string;
  category?: string;
  vendor_name?: string;
  expense_date?: string;
}): Promise<Expense> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/expenses`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create expense");
  }

  const result = await response.json();
  return result.expense;
}

export async function updateExpense(orgId: string, expenseId: string, data: {
  description?: string;
  amount?: number;
  category?: string;
  vendor_name?: string;
  status?: string;
}): Promise<Expense> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/expenses/${expenseId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update expense");
  }

  const result = await response.json();
  return result.expense;
}

// =============================================================================
// ENGINEERING TASK ENDPOINTS
// =============================================================================

export type EngineeringTask = {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  estimated_hours: number;
  hours_logged: number;
  milestone: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
};

export async function getEngineeringTasks(orgId: string, filters?: {
  project_id?: string;
  status?: string;
  assigned_to?: string;
}): Promise<EngineeringTask[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (filters?.project_id) params.set("project_id", filters.project_id);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.assigned_to) params.set("assigned_to", filters.assigned_to);
  
  const url = `${API_URL}/organizations/${orgId}/engineering-tasks${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch engineering tasks");
  }

  const data = await response.json();
  return data.tasks;
}

export async function createEngineeringTask(orgId: string, data: {
  title: string;
  project_id?: string;
  description?: string;
  priority?: string;
  assigned_to?: string;
  due_date?: string;
  estimated_hours?: number;
  milestone?: string;
}): Promise<EngineeringTask> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/engineering-tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create task");
  }

  const result = await response.json();
  return result.task;
}

export async function updateEngineeringTask(orgId: string, taskId: string, data: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  due_date?: string;
  hours_logged?: number;
  milestone?: string;
}): Promise<EngineeringTask> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/engineering-tasks/${taskId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update task");
  }

  const result = await response.json();
  return result.task;
}

export async function deleteEngineeringTask(orgId: string, taskId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/engineering-tasks/${taskId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete task");
  }

  return await response.json();
}

// =============================================================================
// TIME LOG ENDPOINTS
// =============================================================================

export type TimeLog = {
  id: string;
  organization_id: string;
  task_id: string | null;
  project_id: string | null;
  user_id: string;
  hours: number;
  description: string | null;
  log_date: string;
  billable: boolean;
  hourly_rate: number | null;
  created_at: string;
  task_title?: string | null;
  project_name?: string | null;
  user_name?: string | null;
};

export async function getTimeLogs(orgId: string, filters?: {
  task_id?: string;
  project_id?: string;
  user_id?: string;
}): Promise<TimeLog[]> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (filters?.task_id) params.set("task_id", filters.task_id);
  if (filters?.project_id) params.set("project_id", filters.project_id);
  if (filters?.user_id) params.set("user_id", filters.user_id);
  
  const url = `${API_URL}/organizations/${orgId}/time-logs${params.toString() ? `?${params}` : ""}`;
  
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch time logs");
  }

  const data = await response.json();
  return data.time_logs;
}

export async function createTimeLog(orgId: string, data: {
  hours: number;
  task_id?: string;
  project_id?: string;
  description?: string;
  log_date?: string;
  billable?: boolean;
  hourly_rate?: number;
}): Promise<TimeLog> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/time-logs`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create time log");
  }

  const result = await response.json();
  return result.time_log;
}

export async function deleteTimeLog(orgId: string, logId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/time-logs/${logId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete time log");
  }

  return await response.json();
}

// =============================================================================
// CLIENT COMPANY TYPES & ENDPOINTS (CPA-CENTRIC)
// =============================================================================

export type ClientCompany = {
  id: string;
  organization_id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  tax_year: string;
  ein: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  settings: Record<string, unknown>;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getClientCompanies(orgId: string): Promise<ClientCompany[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/clients`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch client companies");
  }

  const data = await response.json();
  return data.clients;
}

export async function getClientCompany(orgId: string, clientId: string): Promise<ClientCompany | null> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/clients/${clientId}`, {
    headers,
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Failed to fetch client company");
  }

  const data = await response.json();
  return data.client;
}

export async function createClientCompany(orgId: string, data: {
  name: string;
  industry?: string;
  tax_year?: string;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}): Promise<ClientCompany> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create client company");
  }

  const result = await response.json();
  return result.client;
}

export async function updateClientCompany(orgId: string, clientId: string, data: {
  name?: string;
  industry?: string;
  tax_year?: string;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: string;
}): Promise<ClientCompany> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/clients/${clientId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update client company");
  }

  const result = await response.json();
  return result.client;
}

export async function deleteClientCompany(orgId: string, clientId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/organizations/${orgId}/clients/${clientId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete client company");
  }

  return await response.json();
}

export async function setSelectedClient(clientId: string | null): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/profile/selected-client`, {
    method: "POST",
    headers,
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!response.ok) {
    throw new Error("Failed to set selected client");
  }

  return await response.json();
}

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

export async function adminGetUsers(): Promise<unknown[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/admin/users`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }

  const data = await response.json();
  return data.users;
}

export async function adminGetStudies(): Promise<unknown[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/admin/studies`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch studies");
  }

  const data = await response.json();
  return data.studies;
}

export async function adminGetChatSessions(): Promise<unknown[]> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/admin/chat_sessions`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch chat sessions");
  }

  const data = await response.json();
  return data.sessions;
}

export async function adminGetStats(): Promise<{ total_users: number; total_studies: number; total_sessions: number }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/admin/stats`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }

  return await response.json();
}

// =============================================================================
// R&D ANALYSIS TYPES & ENDPOINTS
// =============================================================================

export type TestStatus = "pass" | "fail" | "needs_review" | "missing_data";

export type FourPartTestResult = {
  permitted_purpose: TestStatus;
  permitted_purpose_reasoning: string;
  elimination_uncertainty: TestStatus;
  elimination_uncertainty_reasoning: string;
  process_experimentation: TestStatus;
  process_experimentation_reasoning: string;
  technological_nature: TestStatus;
  technological_nature_reasoning: string;
};

export type RDProject = {
  project_id: string;
  project_name: string;
  category: string | null;
  description: string | null;
  budget: number | null;
  four_part_test: FourPartTestResult;
  confidence_score: number;
  missing_info: string[];
  ai_summary: string;
  qualified: boolean;
};

export type RDEmployee = {
  employee_id: string;
  name: string;
  job_title: string | null;
  department: string | null;
  location: string | null;
  w2_wages: number;
  qre_wage_base: number;
  rd_allocation_percent: number;
  stock_compensation: number;
  severance: number;
};

export type RDVendor = {
  vendor_id: string;
  vendor_name: string;
  risk_bearer: string;
  ip_rights: string;
  country: string;
  qualified: boolean;
};

export type RDExpense = {
  transaction_id: string;
  vendor_id: string | null;
  description: string;
  amount: number;
  qre_amount: number;
  qualified: boolean;
  category: string;
};

export type GapItem = {
  gap_id: string;
  category: string;
  item_id: string;
  item_name: string;
  gap_type: string;
  description: string;
  required_info: string[];
  priority: string;
};

export type RDAnalysisSession = {
  session_id: string;
  created_at: string;
  company_name: string;
  industry: string;
  tax_year: number;
  projects: RDProject[];
  employees: RDEmployee[];
  vendors: RDVendor[];
  expenses: RDExpense[];
  gaps: GapItem[];
  total_qre: number;
  wage_qre: number;
  supply_qre: number;
  contract_qre: number;
  total_employees: number;
  rd_employees: number;
  qualified_projects: number;
  parsing_complete: boolean;
  analysis_complete: boolean;
  errors: string[];
};

export async function uploadRDFiles(files: File[]): Promise<{ session_id: string; files_received: number; message: string }> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  
  const response = await fetch(`${API_URL}/api/rd-analysis/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload files");
  }

  return await response.json();
}

export async function parseRDSession(sessionId: string, useAI: boolean = true): Promise<{ session: RDAnalysisSession }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/rd-analysis/parse/${sessionId}?use_ai=${useAI}`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to parse files");
  }

  return await response.json();
}

export async function getRDSession(sessionId: string): Promise<{
  session_id: string;
  status: string;
  created_at: string;
  files_count: number;
  analysis: RDAnalysisSession | null;
}> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/rd-analysis/session/${sessionId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch session");
  }

  return await response.json();
}

export async function evaluateRDProject(
  sessionId: string, 
  projectId: string, 
  additionalContext: string = ""
): Promise<{ project: RDProject }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(
    `${API_URL}/api/rd-analysis/session/${sessionId}/evaluate-project/${projectId}?additional_context=${encodeURIComponent(additionalContext)}`,
    {
      method: "POST",
      headers,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to evaluate project");
  }

  return await response.json();
}

export type GapUploadReEvaluation = {
  project_id?: string;
  project_name?: string;
  qualified?: boolean;
  four_part_test?: FourPartTestResult;
  ai_summary?: string;
  confidence_score?: number;
  error?: string;
};

export type GapUploadResponse = {
  message: string;
  files_total: number;
  re_evaluation: GapUploadReEvaluation | null;
  updated_gaps_count: number;
};

export async function uploadRDGapDocumentation(
  sessionId: string,
  gapId: string,
  files: File[]
): Promise<GapUploadResponse> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  
  const response = await fetch(
    `${API_URL}/api/rd-analysis/session/${sessionId}/upload-gap/${gapId}`,
    {
      method: "POST",
      headers,
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to upload gap documentation");
  }

  return await response.json();
}

export type AIStatus = {
  available: boolean;
  gemini_installed: boolean;
  api_key_set: boolean;
  error: string | null;
};

export async function getAIStatus(): Promise<AIStatus> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/rd-analysis/ai-status`, {
    headers,
  });

  if (!response.ok) {
    return {
      available: false,
      gemini_installed: false,
      api_key_set: false,
      error: "Failed to check AI status"
    };
  }

  return await response.json();
}

export async function downloadRDReport(sessionId: string): Promise<Blob> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/rd-analysis/session/${sessionId}/download`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to download report");
  }

  return await response.blob();
}

export async function deleteRDSession(sessionId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/rd-analysis/session/${sessionId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to delete session");
  }

  return await response.json();
}

// =============================================================================
// WORKSPACE DATA ENDPOINTS (Blueprint Aligned)
// =============================================================================

import type {
  Timesheet, Vendor, Contract, APTransaction, Supply,
  EmployeeExtended, ProjectExtended, QuestionnaireItem, Section174Entry,
  AutomatedReviewItem, QRESummary, ImportPreview, RecomputeResult, StalenessCheck
} from "./types";

const WORKSPACE_API = `${API_URL}/api/workspace-data`;

// --- TIMESHEETS ---

export async function getTimesheets(
  clientId: string,
  taxYear: number = 2024,
  filters?: { employeeId?: string; projectId?: string; approvalStatus?: string },
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: Timesheet[]; pagination: { total: number; limit: number; offset: number } }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
    limit: String(pagination?.limit ?? 50),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (filters?.employeeId) params.set("employee_id", filters.employeeId);
  if (filters?.projectId) params.set("project_id", filters.projectId);
  if (filters?.approvalStatus) params.set("approval_status", filters.approvalStatus);
  
  const response = await fetch(`${WORKSPACE_API}/timesheets?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch timesheets");
  return response.json();
}

export async function createTimesheet(clientId: string, data: Partial<Timesheet>): Promise<{ data: Timesheet }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/timesheets?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create timesheet");
  return response.json();
}

export async function updateTimesheet(timesheetId: string, data: Partial<Timesheet>): Promise<{ data: Timesheet }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/timesheets/${timesheetId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update timesheet");
  return response.json();
}

export async function deleteTimesheet(timesheetId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/timesheets/${timesheetId}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) throw new Error("Failed to delete timesheet");
  return response.json();
}

// --- VENDORS ---

export async function getVendors(
  clientId: string,
  qualifiedOnly: boolean = false,
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: Vendor[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    qualified_only: String(qualifiedOnly),
    limit: String(pagination?.limit ?? 50),
    offset: String(pagination?.offset ?? 0),
  });
  
  const response = await fetch(`${WORKSPACE_API}/vendors?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch vendors");
  return response.json();
}

export async function createVendor(clientId: string, data: Partial<Vendor>): Promise<{ data: Vendor }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/vendors?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create vendor");
  return response.json();
}

export async function updateVendor(vendorId: string, data: Partial<Vendor>): Promise<{ data: Vendor }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/vendors/${vendorId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update vendor");
  return response.json();
}

export async function deleteVendor(vendorId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/vendors/${vendorId}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) throw new Error("Failed to delete vendor");
  return response.json();
}

// --- CONTRACTS ---

export async function getContracts(
  clientId: string,
  vendorId?: string,
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: Contract[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    limit: String(pagination?.limit ?? 50),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (vendorId) params.set("vendor_id", vendorId);
  
  const response = await fetch(`${WORKSPACE_API}/contracts?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch contracts");
  return response.json();
}

export async function createContract(clientId: string, data: Partial<Contract>): Promise<{ data: Contract }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/contracts?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create contract");
  return response.json();
}

// --- AP TRANSACTIONS ---

export async function getAPTransactions(
  clientId: string,
  taxYear: number = 2024,
  filters?: { vendorId?: string; projectId?: string },
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: APTransaction[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
    limit: String(pagination?.limit ?? 100),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (filters?.vendorId) params.set("vendor_id", filters.vendorId);
  if (filters?.projectId) params.set("project_id", filters.projectId);
  
  const response = await fetch(`${WORKSPACE_API}/ap-transactions?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch AP transactions");
  return response.json();
}

export async function createAPTransaction(clientId: string, data: Partial<APTransaction>): Promise<{ data: APTransaction }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/ap-transactions?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create AP transaction");
  return response.json();
}

// --- SUPPLIES ---

export async function getSupplies(
  clientId: string,
  taxYear: number = 2024,
  filters?: { projectId?: string; qreEligibleOnly?: boolean },
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: Supply[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
    limit: String(pagination?.limit ?? 100),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (filters?.projectId) params.set("project_id", filters.projectId);
  if (filters?.qreEligibleOnly) params.set("qre_eligible_only", "true");
  
  const response = await fetch(`${WORKSPACE_API}/supplies?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch supplies");
  return response.json();
}

export async function createSupply(clientId: string, data: Partial<Supply>): Promise<{ data: Supply }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/supplies?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create supply");
  return response.json();
}

// --- EXTENDED EMPLOYEES/PROJECTS ---

export async function getEmployeesExtended(
  clientId: string,
  taxYear: number = 2024,
  rdEligibility?: string,
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: EmployeeExtended[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
    limit: String(pagination?.limit ?? 100),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (rdEligibility) params.set("rd_eligibility", rdEligibility);
  
  const response = await fetch(`${WORKSPACE_API}/employees-extended?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch employees");
  return response.json();
}

export async function createEmployeeExtended(clientId: string, data: Partial<EmployeeExtended>): Promise<{ data: EmployeeExtended }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/employees-extended?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create employee");
  return response.json();
}

export async function getProjectsExtended(
  clientId: string,
  taxYear: number = 2024,
  qualificationStatus?: string,
  pagination?: { limit?: number; offset?: number }
): Promise<{ data: ProjectExtended[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
    limit: String(pagination?.limit ?? 100),
    offset: String(pagination?.offset ?? 0),
  });
  
  if (qualificationStatus) params.set("qualification_status", qualificationStatus);
  
  const response = await fetch(`${WORKSPACE_API}/projects-extended?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch projects");
  return response.json();
}

export async function createProjectExtended(clientId: string, data: Partial<ProjectExtended>): Promise<{ data: ProjectExtended }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${WORKSPACE_API}/projects-extended?client_id=${clientId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create project");
  return response.json();
}

// --- QUESTIONNAIRE ITEMS ---

export async function getQuestionnaireItems(
  clientId: string,
  taxYear: number = 2024,
  projectId?: string,
  responseStatus?: string
): Promise<{ data: QuestionnaireItem[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
  });
  
  if (projectId) params.set("project_id", projectId);
  if (responseStatus) params.set("response_status", responseStatus);
  
  const response = await fetch(`${WORKSPACE_API}/questionnaire-items?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch questionnaire items");
  return response.json();
}

export async function updateQuestionnaireItem(
  itemId: string,
  responseText?: string,
  responseStatus?: string
): Promise<{ data: QuestionnaireItem }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (responseText !== undefined) params.set("response_text", responseText);
  if (responseStatus) params.set("response_status", responseStatus);
  
  const response = await fetch(`${WORKSPACE_API}/questionnaire-items/${itemId}?${params}`, {
    method: "PATCH",
    headers,
  });
  if (!response.ok) throw new Error("Failed to update questionnaire item");
  return response.json();
}

// --- SECTION 174 ---

export async function getSection174Entries(
  clientId: string,
  taxYear: number = 2024,
  projectId?: string
): Promise<{ data: Section174Entry[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
  });
  
  if (projectId) params.set("project_id", projectId);
  
  const response = await fetch(`${WORKSPACE_API}/section-174?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch §174 entries");
  return response.json();
}

// --- AUTOMATED REVIEW ---

export async function getReviewItems(
  clientId: string,
  taxYear: number = 2024,
  filters?: { category?: string; severity?: string; status?: string }
): Promise<{ data: AutomatedReviewItem[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
  });
  
  if (filters?.category) params.set("category", filters.category);
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.status) params.set("status", filters.status);
  
  const response = await fetch(`${WORKSPACE_API}/review-items?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch review items");
  return response.json();
}

export async function updateReviewItem(
  itemId: string,
  status: string,
  resolutionNotes?: string
): Promise<{ data: AutomatedReviewItem }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({ status });
  if (resolutionNotes) params.set("resolution_notes", resolutionNotes);
  
  const response = await fetch(`${WORKSPACE_API}/review-items/${itemId}?${params}`, {
    method: "PATCH",
    headers,
  });
  if (!response.ok) throw new Error("Failed to update review item");
  return response.json();
}

// --- QRE SUMMARY ---

export async function getQRESummary(
  clientId: string,
  taxYear: number = 2024
): Promise<{ data: QRESummary | null; message?: string }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
  });
  
  const response = await fetch(`${WORKSPACE_API}/qre-summary?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to fetch QRE summary");
  return response.json();
}

// --- IMPORT ---

export async function previewImport(
  file: File,
  clientId: string,
  taxYear: number = 2024
): Promise<ImportPreview> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("client_id", clientId);
  formData.append("tax_year", String(taxYear));
  
  const response = await fetch(`${WORKSPACE_API}/import/preview`, {
    method: "POST",
    headers,
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to preview import");
  }
  
  return response.json();
}

export async function commitImport(importFileId: string): Promise<{
  success: boolean;
  commit_summary: Record<string, unknown>;
  message: string;
}> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${WORKSPACE_API}/import/commit?import_file_id=${importFileId}`, {
    method: "POST",
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to commit import");
  }
  
  return response.json();
}

// --- RECOMPUTE ---

export async function recomputeDerivedData(options: {
  clientCompanyId: string;
  taxYear: number;
  regenerateQuestionnaire?: boolean;
  recompute174?: boolean;
  recomputeReview?: boolean;
  recomputeQre?: boolean;
}): Promise<RecomputeResult> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${WORKSPACE_API}/recompute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: options.clientCompanyId,
      tax_year: options.taxYear,
      regenerate_questionnaire: options.regenerateQuestionnaire ?? true,
      recompute_174: options.recompute174 ?? true,
      recompute_review: options.recomputeReview ?? true,
      recompute_qre: options.recomputeQre ?? true,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to recompute data");
  }
  
  return response.json();
}

// --- STALENESS CHECK ---

export async function checkStaleness(
  clientId: string,
  taxYear: number = 2024
): Promise<StalenessCheck> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    client_id: clientId,
    tax_year: String(taxYear),
  });
  
  const response = await fetch(`${WORKSPACE_API}/staleness?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to check staleness");
  return response.json();
}

// =============================================================================
// AI EVALUATION API
// =============================================================================

const AI_API = `${API_URL}/api/workspace/ai`;

// --- PROJECT EVALUATION ---

export async function evaluateProject(options: {
  projectId: string;
  taxYear?: number;
  useEvidence?: boolean;
  force?: boolean;
}): Promise<EvaluateProjectResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/evaluate-project`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: options.projectId,
      tax_year: options.taxYear ?? 2024,
      use_evidence: options.useEvidence ?? true,
      force: options.force ?? false,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to evaluate project");
  }
  
  return response.json();
}

export async function evaluateClient(options: {
  clientCompanyId: string;
  taxYear?: number;
  useEvidence?: boolean;
  concurrency?: number;
}): Promise<EvaluateClientResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/evaluate-client`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_company_id: options.clientCompanyId,
      tax_year: options.taxYear ?? 2024,
      use_evidence: options.useEvidence ?? true,
      concurrency: options.concurrency ?? 3,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to evaluate client projects");
  }
  
  return response.json();
}

export async function getLatestEvaluation(
  projectId: string,
  taxYear: number = 2024
): Promise<{ data: ProjectAIEvaluation | null; message?: string }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    project_id: projectId,
    tax_year: String(taxYear),
  });
  
  const response = await fetch(`${AI_API}/evaluations/latest?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to get evaluation");
  return response.json();
}

export async function getEvaluationHistory(
  projectId: string,
  taxYear: number = 2024,
  limit: number = 10
): Promise<{ data: ProjectAIEvaluation[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({
    project_id: projectId,
    tax_year: String(taxYear),
    limit: String(limit),
  });
  
  const response = await fetch(`${AI_API}/evaluations?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to get evaluation history");
  return response.json();
}

// --- EVIDENCE ---

export async function uploadEvidence(options: {
  file: File;
  projectId: string;
  evidenceType?: string;
  description?: string;
  tags?: string[];
}): Promise<EvidenceUploadResponse> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("file", options.file);
  formData.append("project_id", options.projectId);
  formData.append("evidence_type", options.evidenceType ?? "other");
  if (options.description) formData.append("description", options.description);
  if (options.tags?.length) formData.append("tags", options.tags.join(","));
  
  const response = await fetch(`${AI_API}/evidence/upload`, {
    method: "POST",
    headers,
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to upload evidence");
  }
  
  return response.json();
}

export async function getProjectEvidence(
  projectId: string,
  evidenceType?: string
): Promise<{ data: ProjectEvidenceItem[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({ project_id: projectId });
  if (evidenceType) params.append("evidence_type", evidenceType);
  
  const response = await fetch(`${AI_API}/evidence?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to get evidence");
  return response.json();
}

export async function extractEvidenceText(
  evidenceId: string
): Promise<{ evidence_id: string; extraction_status: string; extracted_text_length: number; message: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/evidence/${evidenceId}/extract`, {
    method: "POST",
    headers,
  });
  
  if (!response.ok) throw new Error("Failed to extract text");
  return response.json();
}

// --- GAPS ---

export async function getProjectGaps(options: {
  projectId?: string;
  clientCompanyId?: string;
  status?: string;
  severity?: string;
  taxYear?: number;
}): Promise<{ data: ProjectGap[] }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (options.projectId) params.append("project_id", options.projectId);
  if (options.clientCompanyId) params.append("client_company_id", options.clientCompanyId);
  if (options.status) params.append("status", options.status);
  if (options.severity) params.append("severity", options.severity);
  params.append("tax_year", String(options.taxYear ?? 2024));
  
  const response = await fetch(`${AI_API}/gaps?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to get gaps");
  return response.json();
}

export async function createGap(data: {
  projectId: string;
  gapType: string;
  severity?: string;
  title: string;
  description?: string;
  requiredInfo?: string[];
  linkedCriterionKey?: string;
}): Promise<{ data: ProjectGap }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/gaps`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: data.projectId,
      gap_type: data.gapType,
      severity: data.severity ?? "medium",
      title: data.title,
      description: data.description,
      required_info: data.requiredInfo ?? [],
      linked_criterion_key: data.linkedCriterionKey,
    }),
  });
  
  if (!response.ok) throw new Error("Failed to create gap");
  return response.json();
}

export async function updateGap(
  gapId: string,
  updates: {
    status?: string;
    resolutionNotes?: string;
    waivedReason?: string;
  }
): Promise<{ data: ProjectGap }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/gaps/${gapId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: updates.status,
      resolution_notes: updates.resolutionNotes,
      waived_reason: updates.waivedReason,
    }),
  });
  
  if (!response.ok) throw new Error("Failed to update gap");
  return response.json();
}

export async function createTaskFromGap(options: {
  gapId: string;
  title?: string;
  assignedTo?: string;
  dueDate?: string;
}): Promise<{ task: any; gap_id: string; message: string }> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/gaps/${options.gapId}/create-task`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      gap_id: options.gapId,
      title: options.title,
      assigned_to: options.assignedTo,
      due_date: options.dueDate,
    }),
  });
  
  if (!response.ok) throw new Error("Failed to create task from gap");
  return response.json();
}

// --- NARRATIVE DRAFTS ---

export async function draftNarrative(options: {
  projectId: string;
  narrativeType?: string;
  includeEvidenceCitations?: boolean;
}): Promise<DraftNarrativeResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${AI_API}/draft-narrative`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: options.projectId,
      narrative_type: options.narrativeType ?? "full_narrative",
      include_evidence_citations: options.includeEvidenceCitations ?? true,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to draft narrative");
  }
  
  return response.json();
}

export async function acceptNarrativeDraft(
  draftId: string,
  targetField: string = "description"
): Promise<{ message: string; draft_id: string; project_id: string }> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams({ target_field: targetField });
  
  const response = await fetch(`${AI_API}/narratives/${draftId}/accept?${params}`, {
    method: "POST",
    headers,
  });
  
  if (!response.ok) throw new Error("Failed to accept narrative draft");
  return response.json();
}

// --- NEXT BEST ACTIONS ---

export async function getNextBestActions(options?: {
  projectId?: string;
  clientCompanyId?: string;
  taxYear?: number;
}): Promise<NextBestActionsResponse> {
  const headers = await getAuthHeaders();
  
  const params = new URLSearchParams();
  if (options?.projectId) params.append("project_id", options.projectId);
  if (options?.clientCompanyId) params.append("client_company_id", options.clientCompanyId);
  params.append("tax_year", String(options?.taxYear ?? 2024));
  
  const response = await fetch(`${AI_API}/next-best-actions?${params}`, { headers });
  if (!response.ok) throw new Error("Failed to get next best actions");
  return response.json();
}
