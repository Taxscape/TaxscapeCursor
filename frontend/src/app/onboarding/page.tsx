"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { getApiUrl } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

interface OnboardingAction {
  type: string;
  label: string;
  payload: Record<string, unknown>;
  blocking: boolean;
  reason?: string;
}

interface OnboardingUpdate {
  field: string;
  value: unknown;
  step_key?: string;
}

interface OnboardingSession {
  id: string;
  organization_id: string;
  user_id: string;
  client_company_id?: string;
  tax_years: number[];
  purchased_sections: Record<string, boolean>;
  study_scope?: string;
  status: string;
  context_snapshot: {
    known_fields: Record<string, unknown>;
    missing_fields: string[];
    last_step_key: string;
    last_agent_message_id?: string;
  };
  created_at: string;
  updated_at: string;
}

interface StepLog {
  id: string;
  onboarding_session_id: string;
  step_key: string;
  status: string;
  completion_method?: string;
  completed_at?: string;
  metadata: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  content: string;
  timestamp: Date;
  actions?: OnboardingAction[];
}

interface ClientCompany {
  id: string;
  name: string;
  industry?: string;
  tax_year?: string;
}

// ============================================================================
// API Functions
// ============================================================================

const API_URL = getApiUrl();

// Use the shared Supabase client to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();

  // Try to get the session
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Try refreshing
    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult.data.session) {
      session = refreshResult.data.session;
    }
  }

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function startOnboarding() {
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

async function sendOnboardingMessage(
  sessionId: string,
  message: string,
  clientAction?: Record<string, unknown>
) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/onboarding/message`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      message,
      client_action: clientAction,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to send message");
  }
  return response.json();
}

async function getOnboardingStatus(sessionId: string) {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_URL}/api/onboarding/status?session_id=${sessionId}`,
    { headers }
  );
  if (!response.ok) {
    throw new Error("Failed to get status");
  }
  return response.json();
}

async function completeOnboardingStep(
  sessionId: string,
  stepKey: string,
  metadata: Record<string, unknown>
) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/onboarding/step/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      step_key: stepKey,
      completion_method: "manual_user_action",
      metadata,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to complete step");
  }
  return response.json();
}

async function skipOnboarding() {
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

async function restartOnboarding() {
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

async function fetchClients(orgId?: string): Promise<ClientCompany[]> {
  const headers = await getAuthHeaders();
  const url = orgId
    ? `${API_URL}/api/clients?organization_id=${orgId}`
    : `${API_URL}/api/clients`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.clients || [];
}

// ============================================================================
// Step Info
// ============================================================================

const STEP_INFO: Record<
  string,
  { label: string; icon: string; description: string }
> = {
  experience_level: {
    label: "Experience Level",
    icon: "👤",
    description: "Set your R&D credit experience",
  },
  client_selection: {
    label: "Select Client",
    icon: "🏢",
    description: "Choose the client company",
  },
  tax_years_selection: {
    label: "Tax Years",
    icon: "📅",
    description: "Select study tax years",
  },
  purchased_sections_confirmation: {
    label: "Credit Sections",
    icon: "📋",
    description: "Confirm applicable sections",
  },
  scope_confirmation: {
    label: "Study Scope",
    icon: "🎯",
    description: "Define engagement scope",
  },
  kickoff_summary_confirmation: {
    label: "Review Summary",
    icon: "✅",
    description: "Confirm study setup",
  },
  handoff_to_intake_package: {
    label: "Intake Package",
    icon: "📦",
    description: "Generate data collection template",
  },
  onboarding_complete: {
    label: "Complete",
    icon: "🎉",
    description: "Onboarding finished",
  },
};

const STEP_ORDER = [
  "experience_level",
  "client_selection",
  "tax_years_selection",
  "purchased_sections_confirmation",
  "scope_confirmation",
  "kickoff_summary_confirmation",
  "handoff_to_intake_package",
  "onboarding_complete",
];

// ============================================================================
// Components
// ============================================================================

function ChatBubble({ message }: { message: ChatMessage }) {
  const isAgent = message.role === "agent";

  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-4 ${
          isAgent
            ? "bg-white border border-gray-200 text-gray-800"
            : "bg-blue-600 text-white"
        }`}
      >
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: message.content
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br />"),
          }}
        />
        <div
          className={`text-xs mt-2 ${
            isAgent ? "text-gray-400" : "text-blue-200"
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  onClick,
  disabled,
}: {
  action: OnboardingAction;
  onClick: () => void;
  disabled: boolean;
}) {
  const getButtonStyle = () => {
    if (action.blocking) {
      return "bg-blue-600 text-white hover:bg-blue-700 border-blue-600";
    }
    return "bg-white text-gray-700 hover:bg-gray-50 border-gray-200";
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-3 rounded-xl border-2 font-medium text-sm
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${getButtonStyle()}
      `}
    >
      {action.label}
    </button>
  );
}

function ProgressChecklist({
  steps,
  currentStep,
}: {
  steps: StepLog[];
  currentStep: string;
}) {
  return (
    <div className="space-y-2">
      {STEP_ORDER.map((stepKey) => {
        const stepLog = steps.find((s) => s.step_key === stepKey);
        const info = STEP_INFO[stepKey];
        const isComplete = stepLog?.status === "completed";
        const isCurrent = stepKey === currentStep;
        const isNotStarted = stepLog?.status === "not_started";

        return (
          <div
            key={stepKey}
            className={`
              flex items-center gap-3 p-3 rounded-xl transition-all
              ${isCurrent ? "bg-blue-50 border border-blue-200" : ""}
              ${isComplete ? "opacity-60" : ""}
            `}
          >
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm
              ${isComplete ? "bg-green-100 text-green-600" : ""}
              ${isCurrent ? "bg-blue-100 text-blue-600" : ""}
              ${isNotStarted ? "bg-gray-100 text-gray-400" : ""}
            `}
            >
              {isComplete ? "✓" : info.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm font-medium truncate ${
                  isCurrent ? "text-blue-700" : "text-gray-700"
                }`}
              >
                {info.label}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {info.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EngagementContextCard({
  session,
  clientName,
}: {
  session: OnboardingSession | null;
  clientName?: string;
}) {
  if (!session) return null;

  const taxYears = session.tax_years || [];
  const sections = session.purchased_sections || {};
  const scope = session.study_scope;

  const enabledSections = Object.entries(sections)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-bold text-gray-900">Engagement Context</h3>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Client
          </div>
          <div className="text-sm font-medium text-gray-700">
            {clientName || session.client_company_id || (
              <span className="text-gray-400 italic">Not selected</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Tax Year(s)
          </div>
          <div className="text-sm font-medium text-gray-700">
            {taxYears.length > 0 ? (
              taxYears.join(", ")
            ) : (
              <span className="text-gray-400 italic">Not selected</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Sections
          </div>
          <div className="text-sm font-medium text-gray-700">
            {enabledSections.length > 0 ? (
              enabledSections.join(", ")
            ) : (
              <span className="text-gray-400 italic">Not confirmed</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Scope
          </div>
          <div className="text-sm font-medium text-gray-700">
            {scope || <span className="text-gray-400 italic">Not defined</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientPickerModal({
  isOpen,
  onClose,
  onSelect,
  clients,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (client: ClientCompany) => void;
  clients: ClientCompany[];
  isLoading: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  if (!isOpen) return null;

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Select Client</h3>
          <input
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-3 w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto p-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No clients found
            </div>
          ) : (
            filteredClients.map((client) => (
              <button
                key={client.id}
                onClick={() => onSelect(client)}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-900">{client.name}</div>
                {client.industry && (
                  <div className="text-sm text-gray-400">{client.industry}</div>
                )}
              </button>
            ))
          )}
        </div>

        <div className="p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TaxYearSelectorModal({
  isOpen,
  onClose,
  onConfirm,
  selectedYears,
  onToggleYear,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedYears: number[];
  onToggleYear: (year: number) => void;
}) {
  if (!isOpen) return null;

  const currentYear = new Date().getFullYear();
  const years = [
    currentYear - 1,
    currentYear - 2,
    currentYear - 3,
    currentYear - 4,
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Select Tax Years</h3>
          <p className="text-sm text-gray-500 mt-1">
            Choose one or more years for this study
          </p>
        </div>

        <div className="p-5 space-y-3">
          {years.map((year) => {
            const isSelected = selectedYears.includes(year);
            return (
              <button
                key={year}
                onClick={() => onToggleYear(year)}
                className={`
                  w-full px-4 py-3 rounded-xl border-2 font-medium text-left
                  transition-all duration-200
                  ${
                    isSelected
                      ? "bg-blue-50 border-blue-500 text-blue-700"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span>{year}</span>
                  {isSelected && (
                    <span className="text-blue-600 text-lg">✓</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={selectedYears.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Confirm ({selectedYears.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentActions, setCurrentActions] = useState<OnboardingAction[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("experience_level");
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal states
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showYearSelector, setShowYearSelector] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(
    null
  );

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch clients for picker
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["onboarding-clients"],
    queryFn: () => fetchClients(),
    enabled: showClientPicker,
  });

  // Fetch onboarding status
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["onboarding-status", sessionId],
    queryFn: () => getOnboardingStatus(sessionId!),
    enabled: !!sessionId,
    staleTime: 10000,
  });

  // Start onboarding mutation
  const startMutation = useMutation({
    mutationFn: startOnboarding,
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setCurrentStep(data.current_step_key);
      setCurrentActions(data.actions || []);

      // Add agent message
      addMessage({
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.agent_message,
        timestamp: new Date(),
        actions: data.actions,
      });
    },
    onError: (error) => {
      console.error("Failed to start onboarding:", error);
      addMessage({
        id: `error-${Date.now()}`,
        role: "agent",
        content:
          "Sorry, I encountered an error starting the onboarding. Please refresh and try again.",
        timestamp: new Date(),
      });
    },
  });

  // Send message mutation
  const messageMutation = useMutation({
    mutationFn: ({
      message,
      action,
    }: {
      message: string;
      action?: Record<string, unknown>;
    }) => sendOnboardingMessage(sessionId!, message, action),
    onSuccess: (data) => {
      setCurrentStep(data.next_step_key);
      setCurrentActions(data.actions || []);

      // Add agent response
      addMessage({
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.message_text,
        timestamp: new Date(),
        actions: data.actions,
      });

      // Refetch status
      refetchStatus();

      // Check if onboarding is complete
      if (data.next_step_key === "onboarding_complete") {
        setTimeout(() => {
          router.push("/portal");
        }, 3000);
      }
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      addMessage({
        id: `error-${Date.now()}`,
        role: "agent",
        content: "Sorry, I had trouble processing that. Please try again.",
        timestamp: new Date(),
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: skipOnboarding,
    onSuccess: () => {
      router.push("/portal");
    },
  });

  // Restart mutation
  const restartMutation = useMutation({
    mutationFn: restartOnboarding,
    onSuccess: (data) => {
      setMessages([]);
      setSessionId(data.session_id);
      setCurrentStep(data.current_step_key);
      setCurrentActions(data.actions || []);

      addMessage({
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.agent_message,
        timestamp: new Date(),
        actions: data.actions,
      });
    },
  });

  // Helper to add messages
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize on mount
  useEffect(() => {
    if (!authLoading && user && !sessionId && !startMutation.isPending) {
      startMutation.mutate();
    }
  }, [authLoading, user, sessionId, startMutation]);

  // Handle action click
  const handleActionClick = (action: OnboardingAction) => {
    if (isProcessing) return;

    // Handle special actions that need modals
    if (action.type === "select_client") {
      if (action.payload?.action === "select") {
        setShowClientPicker(true);
        return;
      }
      // Handle create client - for now just show picker
      setShowClientPicker(true);
      return;
    }

    if (action.type === "set_tax_years" && action.payload?.action !== "confirm") {
      setShowYearSelector(true);
      return;
    }

    // Handle navigation to intake generator
    if (action.type === "generate_intake_package") {
      // Build URL with context from onboarding
      const params = new URLSearchParams({
        client_id: selectedClientId || "",
        from: "onboarding",
        onboarding_session_id: sessionId || "",
      });
      router.push(`/portal/intake?${params.toString()}`);
      return;
    }

    // Handle skip to portal
    if (action.type === "skip_to_portal") {
      router.push("/portal");
      return;
    }

    // Add user message for context
    addMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: action.label,
      timestamp: new Date(),
    });

    setIsProcessing(true);
    messageMutation.mutate({
      message: action.label,
      action: { type: action.type, payload: action.payload },
    });
  };

  // Handle client selection
  const handleClientSelect = (client: ClientCompany) => {
    setShowClientPicker(false);
    setSelectedClientId(client.id);
    setSelectedClientName(client.name);

    addMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: `Selected: ${client.name}`,
      timestamp: new Date(),
    });

    setIsProcessing(true);
    messageMutation.mutate({
      message: `Selected client: ${client.name}`,
      action: {
        type: "select_client",
        payload: { client_id: client.id, client_name: client.name },
      },
    });
  };

  // Handle year toggle
  const handleYearToggle = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  // Handle year confirmation
  const handleYearConfirm = () => {
    setShowYearSelector(false);

    // First send year selections
    selectedYears.forEach((year) => {
      messageMutation.mutate({
        message: `Selected year: ${year}`,
        action: { type: "set_tax_years", payload: { year } },
      });
    });

    // Then confirm
    addMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: `Selected years: ${selectedYears.sort().reverse().join(", ")}`,
      timestamp: new Date(),
    });

    setIsProcessing(true);
    messageMutation.mutate({
      message: "Confirm years",
      action: { type: "set_tax_years", payload: { action: "confirm" } },
    });
  };

  // Handle text input
  const handleSendMessage = () => {
    if (!inputValue.trim() || isProcessing) return;

    addMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    });

    setIsProcessing(true);
    messageMutation.mutate({ message: inputValue });
    setInputValue("");
  };

  // Loading state
  if (authLoading || startMutation.isPending) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Setting up your onboarding...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please sign in to continue</p>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Panel - Chat */}
      <div className="flex-1 flex flex-col max-w-[70%]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Welcome to TaxScape
              </h1>
              <p className="text-sm text-gray-500">
                Let&apos;s set up your first R&D tax credit study
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                Step {STEP_ORDER.indexOf(currentStep) + 1} of {STEP_ORDER.length}
              </span>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}

          {isProcessing && (
            <div className="flex justify-start mb-4">
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Chips */}
        {currentActions.length > 0 && !isProcessing && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              {currentActions.map((action, idx) => (
                <ActionButton
                  key={idx}
                  action={action}
                  onClick={() => handleActionClick(action)}
                  disabled={isProcessing}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message..."
              disabled={isProcessing}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isProcessing || !inputValue.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Context & Progress */}
      <div className="w-[30%] border-l border-gray-200 bg-white p-6 space-y-6 overflow-y-auto">
        {/* Engagement Context */}
        <EngagementContextCard
          session={statusData?.session || null}
          clientName={selectedClientName || undefined}
        />

        {/* Progress Checklist */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <h3 className="font-bold text-gray-900 mb-4">Progress</h3>
          <ProgressChecklist
            steps={statusData?.steps || []}
            currentStep={currentStep}
          />
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <button
            onClick={() => skipMutation.mutate()}
            disabled={skipMutation.isPending}
            className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-sm"
          >
            Skip Onboarding
          </button>
          <button
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-sm"
          >
            Restart
          </button>
          <button
            onClick={() => router.push("/portal")}
            className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-sm"
          >
            Resume Later
          </button>
        </div>
      </div>

      {/* Modals */}
      <ClientPickerModal
        isOpen={showClientPicker}
        onClose={() => setShowClientPicker(false)}
        onSelect={handleClientSelect}
        clients={clients}
        isLoading={clientsLoading}
      />

      <TaxYearSelectorModal
        isOpen={showYearSelector}
        onClose={() => setShowYearSelector(false)}
        onConfirm={handleYearConfirm}
        selectedYears={selectedYears}
        onToggleYear={handleYearToggle}
      />
    </div>
  );
}
