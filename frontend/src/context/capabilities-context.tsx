"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// =============================================================================
// TYPES
// =============================================================================

export interface Capabilities {
  can_manage_org: boolean;
  can_manage_clients: boolean;
  can_edit_financials: boolean;
  can_edit_projects: boolean;
  can_view_ai: boolean;
  can_run_ai: boolean;
  can_generate_studies: boolean;
  can_approve_studies: boolean;
  can_upload_evidence: boolean;
  can_resolve_gaps: boolean;
  can_waive_gaps: boolean;
  can_view_audit_package: boolean;
  can_manage_tasks: boolean;
  can_view_all_data: boolean;
  can_submit_timesheets: boolean;
  can_answer_questionnaires: boolean;
  can_view_assigned_tasks: boolean;
  can_complete_tasks: boolean;
}

interface CapabilitiesContextType {
  capabilities: Capabilities;
  role: string | null;
  displayRole: string;
  isLoading: boolean;
  isError: boolean;
  hasCapability: (cap: keyof Capabilities) => boolean;
  hasAnyCapability: (...caps: (keyof Capabilities)[]) => boolean;
  hasAllCapabilities: (...caps: (keyof Capabilities)[]) => boolean;
  isCPA: boolean;
  isExecutive: boolean;
  isContributor: boolean;
  canAccessFinancials: boolean;
  canAccessAI: boolean;
  canAccessStudies: boolean;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CAPABILITIES: Capabilities = {
  can_manage_org: false,
  can_manage_clients: false,
  can_edit_financials: false,
  can_edit_projects: false,
  can_view_ai: false,
  can_run_ai: false,
  can_generate_studies: false,
  can_approve_studies: false,
  can_upload_evidence: false,
  can_resolve_gaps: false,
  can_waive_gaps: false,
  can_view_audit_package: false,
  can_manage_tasks: false,
  can_view_all_data: false,
  can_submit_timesheets: false,
  can_answer_questionnaires: false,
  can_view_assigned_tasks: false,
  can_complete_tasks: false,
};

// =============================================================================
// API
// =============================================================================

async function fetchCapabilities(): Promise<{
  user_id: string;
  org_id: string | null;
  role: string | null;
  display_role: string;
  capabilities: Capabilities;
}> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  
  if (!token) {
    throw new Error("Not authenticated");
  }
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/system/capabilities`,
    {
      headers: {
        Authorization: `Bearer ${JSON.parse(token).access_token}`,
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to fetch capabilities");
  }
  
  return response.json();
}

// =============================================================================
// CONTEXT
// =============================================================================

const CapabilitiesContext = createContext<CapabilitiesContextType | null>(null);

export function useCapabilities(): CapabilitiesContextType {
  const context = useContext(CapabilitiesContext);
  if (!context) {
    throw new Error("useCapabilities must be used within a CapabilitiesProvider");
  }
  return context;
}

// Optional hook that doesn't throw
export function useCapabilitiesOptional(): CapabilitiesContextType | null {
  return useContext(CapabilitiesContext);
}

// =============================================================================
// PROVIDER
// =============================================================================

interface CapabilitiesProviderProps {
  children: React.ReactNode;
}

export function CapabilitiesProvider({ children }: CapabilitiesProviderProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["capabilities"],
    queryFn: fetchCapabilities,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const capabilities = data?.capabilities || DEFAULT_CAPABILITIES;
  const role = data?.role || null;
  const displayRole = data?.display_role || "Unknown";

  const value = useMemo<CapabilitiesContextType>(() => {
    const hasCapability = (cap: keyof Capabilities): boolean => {
      return capabilities[cap] === true;
    };

    const hasAnyCapability = (...caps: (keyof Capabilities)[]): boolean => {
      return caps.some((cap) => capabilities[cap] === true);
    };

    const hasAllCapabilities = (...caps: (keyof Capabilities)[]): boolean => {
      return caps.every((cap) => capabilities[cap] === true);
    };

    return {
      capabilities,
      role,
      displayRole,
      isLoading,
      isError,
      hasCapability,
      hasAnyCapability,
      hasAllCapabilities,
      // Convenience booleans
      isCPA: role === "cpa",
      isExecutive: role === "executive" || role === "admin",
      isContributor: role === "engineer",
      canAccessFinancials: hasCapability("can_edit_financials") || hasCapability("can_view_all_data"),
      canAccessAI: hasCapability("can_view_ai") || hasCapability("can_run_ai"),
      canAccessStudies: hasCapability("can_generate_studies") || hasCapability("can_view_audit_package"),
    };
  }, [capabilities, role, displayRole, isLoading, isError]);

  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  );
}

// =============================================================================
// PERMISSION GATE COMPONENT
// =============================================================================

interface PermissionGateProps {
  capability?: keyof Capabilities;
  capabilities?: (keyof Capabilities)[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  showMessage?: boolean;
}

export function PermissionGate({
  capability,
  capabilities = [],
  requireAll = false,
  fallback = null,
  children,
  showMessage = false,
}: PermissionGateProps) {
  const { hasCapability, hasAnyCapability, hasAllCapabilities, isLoading } = useCapabilities();

  if (isLoading) {
    return null;
  }

  const capsToCheck = capability ? [capability] : capabilities;
  
  if (capsToCheck.length === 0) {
    return <>{children}</>;
  }

  const hasPermission = requireAll
    ? hasAllCapabilities(...capsToCheck)
    : hasAnyCapability(...capsToCheck);

  if (!hasPermission) {
    if (showMessage) {
      return (
        <div className="p-4 bg-[#2c2c2e] rounded-xl border border-[#3a3a3c] text-center">
          <p className="text-[#8e8e93]">You don't have permission to access this feature.</p>
        </div>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// =============================================================================
// ROLE GATE COMPONENT
// =============================================================================

interface RoleGateProps {
  roles: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGate({ roles, fallback = null, children }: RoleGateProps) {
  const { role, isLoading } = useCapabilities();

  if (isLoading) {
    return null;
  }

  if (!role || !roles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// =============================================================================
// CPA-ONLY GATE
// =============================================================================

export function CPAOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleGate roles={["cpa", "executive", "admin"]} fallback={fallback}>
      {children}
    </RoleGate>
  );
}

// =============================================================================
// EXECUTIVE-ONLY GATE
// =============================================================================

export function ExecutiveOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleGate roles={["executive", "admin"]} fallback={fallback}>
      {children}
    </RoleGate>
  );
}

export default CapabilitiesProvider;

