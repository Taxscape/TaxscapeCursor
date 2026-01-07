"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useActiveContext } from "@/context/workspace-context";

// Types
interface Suggestion {
  id: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  reason: string;
  action_label: string;
  action_route?: string;
  action_params?: Record<string, any>;
  target_type?: string;
  target_id?: string;
  estimated_effort: string;
  blocking: boolean;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  total_count: number;
  critical_count: number;
  dismissed_count: number;
}

// API functions
async function getSuggestions(clientId: string, taxYear: number): Promise<SuggestionsResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/copilot/suggestions?client_company_id=${clientId}&tax_year=${taxYear}`,
    {
      headers: {
        Authorization: token ? `Bearer ${JSON.parse(token).access_token}` : "",
      },
    }
  );
  if (!response.ok) throw new Error("Failed to fetch suggestions");
  return response.json();
}

async function dismissSuggestion(
  clientId: string,
  taxYear: number,
  suggestionKey: string,
  snoozeHours?: number
): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/copilot/suggestions/dismiss?client_company_id=${clientId}&tax_year=${taxYear}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${JSON.parse(token).access_token}` : "",
      },
      body: JSON.stringify({
        suggestion_key: suggestionKey,
        snooze_hours: snoozeHours,
      }),
    }
  );
}

// Icons
const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18"/>
    <path d="m6 6 12 12"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14"/>
    <path d="m12 5 7 7-7 7"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" x2="12" y1="8" y2="12"/>
    <line x1="12" x2="12.01" y1="16" y2="16"/>
  </svg>
);

// Priority colors and badges
const priorityConfig = {
  critical: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    border: "border-red-500/50",
    badge: "bg-red-500",
  },
  high: {
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/50",
    badge: "bg-orange-500",
  },
  medium: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/50",
    badge: "bg-yellow-500",
  },
  low: {
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/50",
    badge: "bg-blue-500",
  },
};

export function ActionCenter() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId, taxYear } = useActiveContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions
  const { data, isLoading } = useQuery({
    queryKey: ["suggestions", clientId, taxYear],
    queryFn: () => getSuggestions(clientId!, Number(taxYear)),
    enabled: !!clientId,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: ({ key, snooze }: { key: string; snooze?: number }) =>
      dismissSuggestion(clientId!, Number(taxYear), key, snooze),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", clientId] });
    },
  });

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = data?.suggestions || [];
  const criticalCount = data?.critical_count || 0;
  const totalCount = data?.total_count || 0;

  const handleAction = (suggestion: Suggestion) => {
    if (suggestion.action_route) {
      const params = new URLSearchParams();
      if (suggestion.action_params) {
        Object.entries(suggestion.action_params).forEach(([key, value]) => {
          params.set(key, String(value));
        });
      }
      const url = params.toString()
        ? `${suggestion.action_route}?${params}`
        : suggestion.action_route;
      router.push(url as Route);
      setIsOpen(false);
    }
  };

  const handleDismiss = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissMutation.mutate({ key });
  };

  const handleSnooze = (key: string, hours: number, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissMutation.mutate({ key, snooze: hours });
  };

  if (!clientId) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
          criticalCount > 0
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : totalCount > 0
            ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
            : "border-[#3a3a3c] hover:bg-[#2c2c2e] text-[#8e8e93]"
        }`}
        title="Action Center"
      >
        <BellIcon />
        {totalCount > 0 && (
          <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white ${
            criticalCount > 0 ? "bg-red-500" : "bg-yellow-500"
          }`}>
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-[#3a3a3c] flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Action Center</h3>
              <p className="text-xs text-[#8e8e93]">
                {totalCount} action{totalCount !== 1 ? "s" : ""} needed
              </p>
            </div>
            {criticalCount > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
                <AlertIcon /> {criticalCount} critical
              </span>
            )}
          </div>

          {/* Suggestions List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-[#8e8e93]">
                Loading suggestions...
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckIcon />
                </div>
                <p className="text-white font-medium">All caught up!</p>
                <p className="text-sm text-[#8e8e93]">No pending actions</p>
              </div>
            ) : (
              <div className="divide-y divide-[#3a3a3c]">
                {suggestions.map((suggestion) => {
                  const config = priorityConfig[suggestion.priority];
                  return (
                    <div
                      key={suggestion.id}
                      className={`p-4 hover:bg-[#2c2c2e] cursor-pointer transition-colors ${
                        suggestion.blocking ? config.bg : ""
                      }`}
                      onClick={() => handleAction(suggestion)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Priority Indicator */}
                        <div className={`w-2 h-2 rounded-full mt-2 ${config.badge}`} />
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-white truncate">
                              {suggestion.title}
                            </p>
                            {suggestion.blocking && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
                                BLOCKING
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#8e8e93] line-clamp-2">
                            {suggestion.reason}
                          </p>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction(suggestion);
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.text} hover:opacity-80 flex items-center gap-1`}
                            >
                              {suggestion.action_label}
                              <ArrowRightIcon />
                            </button>
                            <button
                              onClick={(e) => handleSnooze(suggestion.id, 24, e)}
                              className="px-2 py-1 rounded-lg text-xs text-[#8e8e93] hover:bg-[#3a3a3c] flex items-center gap-1"
                              title="Snooze for 24 hours"
                            >
                              <ClockIcon /> Later
                            </button>
                            <button
                              onClick={(e) => handleDismiss(suggestion.id, e)}
                              className="px-2 py-1 rounded-lg text-xs text-[#8e8e93] hover:bg-[#3a3a3c]"
                              title="Dismiss permanently"
                            >
                              <XIcon />
                            </button>
                          </div>
                        </div>
                        
                        {/* Effort badge */}
                        <span className="text-xs text-[#8e8e93] bg-[#2c2c2e] px-2 py-1 rounded">
                          {suggestion.estimated_effort}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {suggestions.length > 0 && (
            <div className="p-3 border-t border-[#3a3a3c] bg-[#2c2c2e]/50">
              <button
                onClick={() => {
                  router.push("/workspace/tasks" as Route);
                  setIsOpen(false);
                }}
                className="w-full text-center text-sm text-[#0a84ff] hover:underline"
              >
                View all tasks →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ActionCenter;

