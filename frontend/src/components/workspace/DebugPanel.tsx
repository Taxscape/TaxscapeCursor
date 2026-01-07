"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
import { useAuth } from "@/context/auth-context";

// Types
interface DebugInfo {
  user_id: string;
  org_id: string | null;
  role: string | null;
  capabilities: Record<string, boolean>;
  active_client_id: string | null;
  last_recompute: string | null;
  last_ai_eval: string | null;
  snapshot_hash: string | null;
  realtime_connected: boolean;
}

// API function
async function getDebugInfo(clientId?: string, taxYear?: number): Promise<DebugInfo> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  const params = new URLSearchParams();
  if (clientId) params.set("client_company_id", clientId);
  if (taxYear) params.set("tax_year", String(taxYear));
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/system/debug?${params}`,
    {
      headers: {
        Authorization: token ? `Bearer ${JSON.parse(token).access_token}` : "",
      },
    }
  );
  if (!response.ok) throw new Error("Failed to fetch debug info");
  return response.json();
}

// Icons
const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
    className={`transform transition-transform ${isOpen ? "rotate-180" : ""}`}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const TerminalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" x2="20" y1="19" y2="19"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

interface DebugPanelProps {
  defaultOpen?: boolean;
}

export function DebugPanel({ defaultOpen = false }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { clientId, taxYear } = useActiveContext();
  const { user, organization } = useAuth();

  // Fetch debug info
  const { data: debugInfo, isLoading, error } = useQuery({
    queryKey: ["debug-info", clientId, taxYear],
    queryFn: () => getDebugInfo(clientId || undefined, Number(taxYear) || undefined),
    enabled: isOpen,
    staleTime: 10000,
    refetchInterval: isOpen ? 30000 : false,
  });

  // Check if user has capability to see debug panel
  const canViewDebug = debugInfo?.capabilities?.can_manage_org || 
                       debugInfo?.role === "executive" || 
                       debugInfo?.role === "admin" ||
                       debugInfo?.role === "cpa";

  // Don't render if user doesn't have permission (once we know)
  if (debugInfo && !canViewDebug) {
    return null;
  }

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return "N/A";
    return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg text-xs font-mono text-[#8e8e93] hover:text-white hover:border-[#4a4a4c] transition-colors"
      >
        <TerminalIcon />
        Debug
        <ChevronIcon isOpen={isOpen} />
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-[#1c1c1e] border border-[#3a3a3c] rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#3a3a3c] bg-[#2c2c2e]">
            <h3 className="text-sm font-semibold text-white">Debug Info</h3>
            <p className="text-xs text-[#8e8e93]">Development diagnostics</p>
          </div>

          {/* Content */}
          <div className="p-4 max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-4 text-[#8e8e93]">Loading...</div>
            ) : error ? (
              <div className="text-center py-4 text-red-400 text-sm">
                Failed to load debug info
              </div>
            ) : (
              <div className="space-y-4 text-xs font-mono">
                {/* User Info */}
                <section>
                  <h4 className="text-[#8e8e93] uppercase tracking-wider mb-2">User</h4>
                  <div className="space-y-1">
                    <DebugRow 
                      label="User ID" 
                      value={debugInfo?.user_id || user?.id || "N/A"} 
                      truncate
                      onCopy={() => copyToClipboard(debugInfo?.user_id || "", "user_id")}
                      copied={copiedField === "user_id"}
                    />
                    <DebugRow 
                      label="Org ID" 
                      value={debugInfo?.org_id || organization?.id || "N/A"} 
                      truncate
                      onCopy={() => copyToClipboard(debugInfo?.org_id || "", "org_id")}
                      copied={copiedField === "org_id"}
                    />
                    <DebugRow 
                      label="Role" 
                      value={debugInfo?.role || "Unknown"} 
                      highlight
                    />
                  </div>
                </section>

                {/* Context Info */}
                <section>
                  <h4 className="text-[#8e8e93] uppercase tracking-wider mb-2">Context</h4>
                  <div className="space-y-1">
                    <DebugRow 
                      label="Client ID" 
                      value={clientId || "None selected"} 
                      truncate
                      onCopy={() => copyToClipboard(clientId || "", "client_id")}
                      copied={copiedField === "client_id"}
                    />
                    <DebugRow label="Tax Year" value={String(taxYear)} />
                    <DebugRow 
                      label="Last Recompute" 
                      value={formatDate(debugInfo?.last_recompute || null)} 
                    />
                    <DebugRow 
                      label="Last AI Eval" 
                      value={formatDate(debugInfo?.last_ai_eval || null)} 
                    />
                    <DebugRow 
                      label="Snapshot Hash" 
                      value={truncateHash(debugInfo?.snapshot_hash || null)}
                      onCopy={() => copyToClipboard(debugInfo?.snapshot_hash || "", "hash")}
                      copied={copiedField === "hash"}
                    />
                  </div>
                </section>

                {/* Connection Status */}
                <section>
                  <h4 className="text-[#8e8e93] uppercase tracking-wider mb-2">Status</h4>
                  <div className="space-y-1">
                    <DebugRow 
                      label="Realtime" 
                      value={debugInfo?.realtime_connected ? "Connected" : "Disconnected"}
                      status={debugInfo?.realtime_connected ? "success" : "error"}
                    />
                  </div>
                </section>

                {/* Capabilities */}
                <section>
                  <h4 className="text-[#8e8e93] uppercase tracking-wider mb-2">Capabilities</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {debugInfo?.capabilities && Object.entries(debugInfo.capabilities)
                      .filter(([, value]) => value)
                      .slice(0, 8)
                      .map(([cap]) => (
                        <span 
                          key={cap} 
                          className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] truncate"
                          title={cap}
                        >
                          {cap.replace("can_", "")}
                        </span>
                      ))}
                  </div>
                </section>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[#3a3a3c] bg-[#2c2c2e] text-xs text-[#8e8e93]">
            v1.0.0 • {process.env.NODE_ENV}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for debug rows
interface DebugRowProps {
  label: string;
  value: string;
  truncate?: boolean;
  highlight?: boolean;
  status?: "success" | "error";
  onCopy?: () => void;
  copied?: boolean;
}

function DebugRow({ label, value, truncate, highlight, status, onCopy, copied }: DebugRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[#8e8e93]">{label}</span>
      <div className="flex items-center gap-1">
        <span 
          className={`${
            status === "success" ? "text-green-400" : 
            status === "error" ? "text-red-400" : 
            highlight ? "text-[#0a84ff]" : "text-white"
          } ${truncate ? "truncate max-w-32" : ""}`}
          title={truncate ? value : undefined}
        >
          {value}
        </span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="p-1 hover:bg-[#3a3a3c] rounded text-[#8e8e93] hover:text-white"
            title="Copy to clipboard"
          >
            {copied ? "✓" : <CopyIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

export default DebugPanel;

