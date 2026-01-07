"use client";

import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

// =============================================================================
// TYPES
// =============================================================================

interface RealtimeContextType {
  isConnected: boolean;
  subscriptionCount: number;
  reconnect: () => void;
  lastEvent: RealtimeEvent | null;
}

interface RealtimeEvent {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  timestamp: string;
  id?: string;
}

// =============================================================================
// CONTEXT
// =============================================================================

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}

// =============================================================================
// DEBOUNCE HELPER
// =============================================================================

function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;
}

// =============================================================================
// PROVIDER
// =============================================================================

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const { clientId, taxYear } = useActiveContext();
  const [isConnected, setIsConnected] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced invalidation to prevent refetch storms
  const invalidateQueries = useDebouncedCallback((queryKeys: string[][]) => {
    // Batch invalidations in a single tick
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey as string[];
        return queryKeys.some((pattern) =>
          pattern.every((part, index) => key[index] === part || part === "*")
        );
      },
    });
  }, 250);

  // Handle realtime events
  const handleEvent = useCallback(
    (table: string, eventType: "INSERT" | "UPDATE" | "DELETE", payload: any) => {
      console.log(`[Realtime] ${eventType} on ${table}:`, payload);
      
      setLastEvent({
        table,
        eventType,
        timestamp: new Date().toISOString(),
        id: payload?.new?.id || payload?.old?.id,
      });

      // Map table changes to query key invalidations
      const invalidationMap: Record<string, string[][]> = {
        projects: [["projects"], ["projects-extended"], ["evaluation"], ["suggestions"]],
        employees: [["employees"], ["suggestions"]],
        vendors: [["vendors"]],
        contracts: [["contracts"]],
        timesheets: [["timesheets"], ["suggestions"]],
        ap_transactions: [["ap-transactions"]],
        supplies: [["supplies"]],
        project_evidence_items: [["evidence"], ["suggestions"]],
        project_gaps: [["gaps"], ["suggestions"]],
        tasks: [["tasks"], ["suggestions"]],
        studies: [["studies"]],
        project_ai_evaluations: [["evaluation"], ["suggestions"]],
        qre_summaries: [["qre-summary"], ["suggestions"]],
      };

      const keysToInvalidate = invalidationMap[table];
      if (keysToInvalidate) {
        invalidateQueries(keysToInvalidate);
      }
    },
    [invalidateQueries]
  );

  // Setup subscriptions
  const setupSubscriptions = useCallback(() => {
    if (!clientId) {
      console.log("[Realtime] No client selected, skipping subscriptions");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("[Realtime] Supabase credentials not configured");
      return;
    }

    // Initialize Supabase client if not already
    if (!supabaseRef.current) {
      supabaseRef.current = createClient(supabaseUrl, supabaseKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    }

    // Clean up existing channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    // Tables to subscribe to
    const tables = [
      "projects",
      "employees",
      "vendors",
      "contracts",
      "timesheets",
      "ap_transactions",
      "supplies",
      "project_evidence_items",
      "project_gaps",
      "tasks",
      "studies",
      "project_ai_evaluations",
      "qre_summaries",
    ];

    // Create channel with filter for client_company_id
    const channel = supabaseRef.current.channel(`workspace:${clientId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    // Subscribe to each table
    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `client_company_id=eq.${clientId}`,
        },
        (payload) => {
          handleEvent(table, payload.eventType as any, payload);
        }
      );
    });

    // Subscribe
    channel.subscribe((status) => {
      console.log(`[Realtime] Subscription status: ${status}`);
      setIsConnected(status === "SUBSCRIBED");
      
      if (status === "SUBSCRIBED") {
        setSubscriptionCount(tables.length);
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        // Auto-reconnect after delay
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("[Realtime] Attempting reconnect...");
          setupSubscriptions();
        }, 5000);
      }
    });

    channelRef.current = channel;
  }, [clientId, handleEvent]);

  // Reconnect function
  const reconnect = useCallback(() => {
    console.log("[Realtime] Manual reconnect triggered");
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }
    setupSubscriptions();
  }, [setupSubscriptions]);

  // Setup on client change
  useEffect(() => {
    setupSubscriptions();

    return () => {
      if (channelRef.current) {
        console.log("[Realtime] Cleaning up subscriptions");
        channelRef.current.unsubscribe();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [setupSubscriptions]);

  // Handle token refresh
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "supabase.auth.token" && e.newValue) {
        console.log("[Realtime] Token refreshed, reconnecting...");
        reconnect();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [reconnect]);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        subscriptionCount,
        reconnect,
        lastEvent,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

// =============================================================================
// DEBUG COMPONENT
// =============================================================================

export function RealtimeDebugBadge() {
  const { isConnected, subscriptionCount, lastEvent, reconnect } = useRealtime();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`px-3 py-2 rounded-lg text-xs font-mono shadow-lg cursor-pointer ${
          isConnected
            ? "bg-green-500/20 text-green-400 border border-green-500/50"
            : "bg-red-500/20 text-red-400 border border-red-500/50"
        }`}
        onClick={reconnect}
        title="Click to reconnect"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span>
            {isConnected ? `RT: ${subscriptionCount} tables` : "RT: Disconnected"}
          </span>
        </div>
        {lastEvent && (
          <div className="text-[10px] text-[#8e8e93] mt-1">
            Last: {lastEvent.table} {lastEvent.eventType}
          </div>
        )}
      </div>
    </div>
  );
}

