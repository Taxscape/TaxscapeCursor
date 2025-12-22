import { getSupabaseClient } from "./supabase";

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

// =============================================================================
// TYPES
// =============================================================================

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  response: string;
  structured?: Record<string, unknown> | null;
  session_id?: string;
};

export type DashboardData = {
  total_credit: number;
  total_wages: number;
  total_qre: number;
  project_count: number;
  employee_count: number;
  contractor_count: number;
  study_count: number;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  technical_uncertainty: string | null;
  process_of_experimentation: string | null;
  qualification_status: string;
  created_at: string;
};

export type Employee = {
  id: string;
  name: string;
  title: string | null;
  state: string | null;
  total_wages: number;
  qualified_percent: number;
  created_at: string;
};

export type Contractor = {
  id: string;
  name: string;
  cost: number;
  is_qualified: boolean;
  location: string;
  notes: string | null;
  created_at: string;
};

export type Study = {
  id: string;
  title: string;
  file_url: string | null;
  total_qre: number;
  total_credit: number;
  status: string;
  created_at: string;
};

export type ChatSession = {
  id: string;
  title: string;
  structured_output: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserContext = {
  employees: Employee[];
  contractors: Contractor[];
  projects: Project[];
  summary: {
    total_employees: number;
    total_wages: number;
    total_contractors: number;
    total_contractor_costs: number;
    total_projects: number;
  };
};

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
