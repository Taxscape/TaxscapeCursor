/**
 * Onboarding utilities and API functions
 */

import { getApiUrl } from "./api";
import { getSupabaseClient } from "./supabase";

const API_URL = getApiUrl();

export interface OnboardingCheckResult {
  needs_onboarding: boolean;
  reason: string;
  session_id?: string;
  redirect?: string;
  error?: string;
}

export interface OnboardingSession {
  id: string;
  organization_id: string;
  user_id: string;
  client_company_id?: string;
  tax_years: number[];
  purchased_sections: Record<string, boolean>;
  study_scope?: string;
  status: "active" | "completed" | "abandoned";
  context_snapshot: {
    known_fields: Record<string, unknown>;
    missing_fields: string[];
    last_step_key: string;
    last_agent_message_id?: string;
  };
  created_at: string;
  updated_at: string;
}

// Get a fresh session, with retry logic for token refresh
async function getFreshSession() {
  const supabase = getSupabaseClient();
  
  // First try to get the session
  let { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    // Try refreshing
    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult.data.session) {
      session = refreshResult.data.session;
    }
  }
  
  return session;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await getFreshSession();
  
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Check if the current user needs to go through onboarding
 */
export async function checkOnboardingRequired(): Promise<OnboardingCheckResult> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/api/onboarding/check`, {
      headers,
    });

    if (!response.ok) {
      return {
        needs_onboarding: false,
        reason: "api_error",
        error: `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return {
      needs_onboarding: false,
      reason: "network_error",
      error: String(error),
    };
  }
}

/**
 * Start or resume an onboarding session
 */
export async function startOnboarding() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/onboarding/start`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to start onboarding");
  }

  return response.json();
}

/**
 * Get the current onboarding status
 */
export async function getOnboardingStatus(sessionId: string) {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_URL}/api/onboarding/status?session_id=${sessionId}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error("Failed to get onboarding status");
  }

  return response.json();
}

/**
 * Skip the onboarding process
 */
export async function skipOnboarding() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/onboarding/skip`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to skip onboarding");
  }

  return response.json();
}

/**
 * Restart the onboarding process
 */
export async function restartOnboarding() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/onboarding/restart`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to restart onboarding");
  }

  return response.json();
}
