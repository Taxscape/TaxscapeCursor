import { createBrowserClient } from '@supabase/ssr';

// Types for our database
export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  tax_year: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'executive' | 'cpa' | 'engineer';
  status: 'active' | 'pending' | 'inactive';
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Budget = {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  total_amount: number;
  allocated_amount: number;
  category: 'personnel' | 'materials' | 'software' | 'contractors' | 'other' | null;
  fiscal_year: string;
  status: 'active' | 'closed' | 'draft';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields from API
  project_name?: string | null;
  creator_name?: string | null;
  spent?: number;
  remaining?: number;
};

export type Expense = {
  id: string;
  organization_id: string;
  budget_id: string | null;
  project_id: string | null;
  description: string;
  amount: number;
  category: 'personnel' | 'materials' | 'software' | 'contractors' | 'other' | null;
  vendor_name: string | null;
  expense_date: string;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  logged_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields from API
  budget_name?: string | null;
  project_name?: string | null;
  logged_by_name?: string | null;
};

export type EngineeringTask = {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  assigned_to: string | null;
  due_date: string | null;
  estimated_hours: number;
  hours_logged: number;
  milestone: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields from API
  project_name?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
};

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
  // Computed fields from API
  task_title?: string | null;
  project_name?: string | null;
  user_name?: string | null;
};

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

export type VerificationTask = {
  id: string;
  organization_id: string;
  assigned_to: string | null;
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

export type AuditLog = {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  item_type: string | null;
  item_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  organization_id: string | null;
  selected_client_id: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_active_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  technical_uncertainty: string | null;
  process_of_experimentation: string | null;
  qualification_status: 'pending' | 'qualified' | 'not_qualified';
  created_at: string;
  updated_at: string;
};

export type Employee = {
  id: string;
  user_id: string;
  name: string;
  title: string | null;
  state: string | null;
  total_wages: number;
  qualified_percent: number;
  created_at: string;
  updated_at: string;
};

export type Contractor = {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  cost: number;
  is_qualified: boolean;
  location: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatSession = {
  id: string;
  user_id: string;
  title: string;
  structured_output: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type Study = {
  id: string;
  user_id: string;
  chat_session_id: string | null;
  title: string;
  file_path: string | null;
  file_url: string | null;
  total_qre: number;
  total_credit: number;
  status: 'generating' | 'generated' | 'failed';
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Create Supabase client for browser
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (typeof window !== 'undefined') {
    console.log('[Supabase] Initializing client...', { 
      hasUrl: !!url, 
      hasKey: !!key,
      urlLength: url?.length,
      keyLength: key?.length 
    });
  }
  
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase] Not configured - missing URL or key');
    return null;
  }
  
  try {
    const client = createBrowserClient(url!, key!);
    if (typeof window !== 'undefined') {
      console.log('[Supabase] Client created successfully');
    }
    return client;
  } catch (e) {
    console.error("[Supabase] Failed to create client:", e);
    return null;
  }
}

// Singleton client for use in components
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

// Mock client for when Supabase isn't configured or fails to initialize
function getMockClient() {
  console.warn("[Supabase] Using mock client - auth will not work");
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: new Error('Supabase not configured') }),
      signUp: async () => ({ data: { session: null, user: null }, error: new Error('Supabase not configured') }),
      signOut: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { session: null, user: null }, error: new Error('Supabase not configured') }),
      resend: async () => ({ error: new Error('Supabase not configured') }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), execute: async () => ({ data: [], error: null }) }), execute: async () => ({ data: [], error: null }) }),
      insert: () => ({ execute: async () => ({ data: null, error: null }) }),
      update: () => ({ eq: () => ({ execute: async () => ({ data: null, error: null }) }) }),
    }),
  } as unknown as ReturnType<typeof createBrowserClient>;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return getMockClient();
  }

  if (!browserClient) {
    browserClient = createClient();
  }
  
  // If createClient returned null (failed), use mock client
  if (!browserClient) {
    return getMockClient();
  }
  
  return browserClient;
}

