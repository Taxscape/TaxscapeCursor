import { createBrowserClient } from '@supabase/ssr';

// Types for our database
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
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
  if (!isSupabaseConfigured()) {
    // Return a mock client for development without Supabase
    return null;
  }
  try {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  } catch (e) {
    console.error("Failed to create Supabase client:", e);
    return null;
  }
}

// Singleton client for use in components
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured. Some features may not work.");
    // Return a mock client that won't throw errors but will fail gracefully
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

  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient!;
}

