import { getSupabaseClient } from "./supabase";

// API URL configuration
// In production, this should be set to your Railway backend URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// Track if we've logged API info
let hasLoggedApiInfo = false;

// Log API URL for debugging (once per session)
if (typeof window !== "undefined" && !hasLoggedApiInfo) {
  hasLoggedApiInfo = true;
  const isLocalhost = API_URL.includes("localhost");
  console.log(`[TaxScape API] URL: ${API_URL}`);
  if (isLocalhost && process.env.NODE_ENV === "production") {
    console.error("[TaxScape API] WARNING: API URL is set to localhost in production! Set NEXT_PUBLIC_API_URL environment variable.");
  }
}

// Helper to check if error is a network/connection error
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  if (error instanceof Error && (
    error.message.includes("NetworkError") ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("Network request failed") ||
    error.message.includes("CORS") ||
    error.message.includes("ERR_CONNECTION")
  )) {
    return true;
  }
  return false;
}

// Wrapper for fetch with better error handling
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (isNetworkError(error)) {
      const isLocalhost = API_URL.includes("localhost");
      if (isLocalhost) {
        throw new Error(`Cannot connect to API server. The API URL is set to localhost (${API_URL}). Please set NEXT_PUBLIC_API_URL to your production backend URL.`);
      } else {
        throw new Error(`Cannot connect to API server at ${API_URL}. Please check your network connection or try again later.`);
      }
    }
    throw error;
  }
}

// Export for debugging
export function getApiUrl(): string {
  return API_URL;
}

// Check API connectivity
export async function checkApiConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/health`, { 
      method: "GET",
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    if (response.ok) {
      return { connected: true };
    }
    return { connected: false, error: `Server returned status ${response.status}` };
  } catch (error) {
    const isLocalhost = API_URL.includes("localhost");
    if (isLocalhost) {
      return { 
        connected: false, 
        error: `API URL is set to localhost. Set NEXT_PUBLIC_API_URL in Vercel environment variables.` 
      };
    }
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  
  return headers;
}

// Helper to get auth headers for file uploads (no Content-Type)
async function getAuthHeadersForUpload(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers: HeadersInit = {};
  
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  
  return headers;
}

// Types
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

// Public endpoints (no auth required)
export async function sendChatMessageDemo(messages: ChatMessage[]): Promise<ChatResult> {
  const response = await apiFetch(`${API_URL}/api/chat_demo`, {
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
  const response = await apiFetch(`${API_URL}/api/chat_excel`, {
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

// Authenticated endpoints
export async function sendChatMessage(
  messages: ChatMessage[], 
  sessionId?: string,
  includeContext?: boolean
): Promise<ChatResult> {
  const headers = await getAuthHeaders();
  
  const response = await apiFetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      messages, 
      session_id: sessionId,
      include_context: includeContext ?? true,
    }),
  });

  if (!response.ok) {
    // Fall back to demo endpoint if not authenticated
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
  
  const response = await apiFetch(`${API_URL}/api/dashboard`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  return await response.json();
}

export async function getUserContext(): Promise<UserContext> {
  const headers = await getAuthHeaders();
  
  const response = await apiFetch(`${API_URL}/api/user_context`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user context");
  }

  return await response.json();
}

export async function getProjects(): Promise<Project[]> {
  const headers = await getAuthHeaders();
  
  const response = await apiFetch(`${API_URL}/api/projects`, {
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
  
  const response = await apiFetch(`${API_URL}/api/projects`, {
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
  
  const response = await apiFetch(`${API_URL}/api/employees`, {
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
  
  const response = await apiFetch(`${API_URL}/api/employees`, {
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
  
  const response = await apiFetch(`${API_URL}/api/contractors`, {
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
  
  const response = await apiFetch(`${API_URL}/api/contractors`, {
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
  
  const response = await apiFetch(`${API_URL}/api/studies`, {
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
  
  const response = await apiFetch(`${API_URL}/api/generate_study`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      payload,
      session_id: sessionId,
      title: title || "R&D Tax Credit Study",
    }),
  });

  if (!response.ok) {
    // Fall back to public endpoint
    return downloadChatExcel(payload, title);
  }

  return await response.blob();
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const headers = await getAuthHeaders();
  
  const response = await apiFetch(`${API_URL}/api/chat/sessions`, {
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
  
  const response = await apiFetch(`${API_URL}/api/chat/sessions/${sessionId}/messages`, {
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
  
  const response = await apiFetch(`${API_URL}/api/upload_payroll`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload payroll. Please check file format (CSV, XLS, XLSX).");
  }

  return await response.json();
}

export async function uploadContractors(file: File): Promise<{ message: string; count: number }> {
  const headers = await getAuthHeadersForUpload();
  
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await apiFetch(`${API_URL}/api/upload_contractors`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload contractors. Please check file format (CSV, XLS, XLSX).");
  }

  return await response.json();
}

// Chat with file attachments
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
  
  // Append all files
  files.forEach((file) => {
    formData.append("files", file);
  });
  
  const response = await apiFetch(`${API_URL}/api/chat_with_files`, {
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

// Demo request (public)
export async function submitDemoRequest(data: {
  name: string;
  email: string;
  company?: string;
  message?: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await apiFetch(`${API_URL}/api/demo_request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to submit demo request");
  }

  return await response.json();
}

// Admin endpoints
export async function adminGetUsers(): Promise<unknown[]> {
  const headers = await getAuthHeaders();
  
  const response = await apiFetch(`${API_URL}/admin/users`, {
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
  
  const response = await apiFetch(`${API_URL}/admin/studies`, {
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
  
  const response = await apiFetch(`${API_URL}/admin/chat_sessions`, {
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
  
  const response = await apiFetch(`${API_URL}/admin/stats`, {
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }

  return await response.json();
}
