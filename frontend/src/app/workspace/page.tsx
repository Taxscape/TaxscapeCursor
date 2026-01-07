"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useActiveContext } from "@/context/workspace-context";
import { useAuth } from "@/context/auth-context";
import toast from "react-hot-toast";

// =============================================================================
// TYPES
// =============================================================================

interface PipelineStep {
  id: string;
  name: string;
  description: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  completion_percent: number;
  blockers_count: number;
  next_action: string | null;
  next_action_route: string | null;
  last_updated: string | null;
}

interface ReadinessBreakdown {
  data_completeness: number;
  questionnaire_completeness: number;
  gaps_resolved: number;
  evidence_coverage: number;
  ai_evaluation_freshness: number;
  automated_review_resolved: number;
  study_decisions_locked: number;
}

interface Blocker {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  action_route?: string;
  action_label?: string;
}

interface RiskFlag {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  entity_route?: string;
}

interface NextAction {
  id: string;
  priority: string;
  title: string;
  reason: string;
  effort: string;
  blocking: boolean;
  action_label: string;
  action_route?: string;
}

interface StudyStatus {
  has_draft: boolean;
  has_approved: boolean;
  latest_draft_id?: string;
  latest_draft_version?: number;
  latest_draft_status?: string;
  latest_approved_id?: string;
  latest_approved_version?: number;
  can_generate: boolean;
  can_submit_review: boolean;
  can_download_audit_package: boolean;
}

interface ClientDashboardSummary {
  client_company_id: string;
  client_name: string;
  tax_year: number;
  organization_id: string;
  last_input_update: string | null;
  last_recompute: string | null;
  last_ai_evaluation: string | null;
  last_study_generation: string | null;
  pipeline_steps: PipelineStep[];
  current_step: number;
  readiness_score: number;
  readiness_breakdown: ReadinessBreakdown;
  top_blockers: Blocker[];
  next_actions: NextAction[];
  risk_flags: RiskFlag[];
  high_wage_flags_count: number;
  foreign_vendor_flags_count: number;
  low_confidence_projects_count: number;
  missing_documentation_count: number;
  study_status: StudyStatus;
  projects_count: number;
  qualified_projects_count: number;
  employees_count: number;
  total_qre: number;
  estimated_credit: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function getClientDashboard(clientId: string, taxYear: number): Promise<ClientDashboardSummary> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/dashboard/client-summary?client_company_id=${clientId}&tax_year=${taxYear}`,
    {
      headers: {
        Authorization: token ? `Bearer ${JSON.parse(token).access_token}` : "",
      },
    }
  );
  if (!response.ok) throw new Error("Failed to fetch dashboard");
  return response.json();
}

async function seedDemoData(clientName: string, taxYear: number): Promise<{ success: boolean; client_company_id: string }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/demo/seed?client_name=${encodeURIComponent(clientName)}&tax_year=${taxYear}`,
    {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${JSON.parse(token).access_token}` : "",
      },
    }
  );
  if (!response.ok) throw new Error("Failed to seed demo data");
  return response.json();
}

// =============================================================================
// ICONS
// =============================================================================

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const AlertCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" x2="12" y1="8" y2="12"/>
    <line x1="12" x2="12.01" y1="16" y2="16"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14"/>
    <path d="m12 5 7 7-7 7"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" x2="12" y1="15" y2="3"/>
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const SparklesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  </svg>
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatDate(dateStr: string | null): string {
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
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusColors = {
  completed: "bg-green-500/20 text-green-400 border-green-500/50",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  not_started: "bg-[#3a3a3c] text-[#8e8e93] border-[#3a3a3c]",
  blocked: "bg-red-500/20 text-red-400 border-red-500/50",
};

const priorityColors = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CPAHomeDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId, taxYear, setClientId } = useActiveContext();
  const { organization } = useAuth();
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Fetch dashboard data
  const { data: dashboard, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", clientId, taxYear],
    queryFn: () => getClientDashboard(clientId!, Number(taxYear)),
    enabled: !!clientId,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });

  // Demo seeding mutation
  const seedDemoMutation = useMutation({
    mutationFn: (name: string) => seedDemoData(name, Number(taxYear) || 2024),
    onSuccess: (data) => {
      toast.success("Demo data created successfully!");
      setClientId(data.client_company_id);
      setShowDemoModal(false);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error("Failed to create demo data");
      console.error(error);
    },
  });

  // No client selected state
  if (!clientId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#5856d6] flex items-center justify-center">
              <SparklesIcon />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Welcome to TaxScape Pro</h1>
            <p className="text-lg text-[#8e8e93] mb-8 max-w-md mx-auto">
              Select a client to view their R&D tax credit pipeline, or create a demo to explore the platform.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowDemoModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-[#0a84ff] to-[#5856d6] text-white rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-2"
              >
                <PlayIcon /> Start Guided Demo
              </button>
              <button
                onClick={() => router.push("/workspace/projects")}
                className="px-6 py-3 border border-[#3a3a3c] text-white rounded-xl font-medium hover:bg-[#2c2c2e]"
              >
                Browse Clients
              </button>
            </div>
          </div>

          {/* Demo Modal */}
          {showDemoModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-8 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-white mb-4">Create Demo Client</h2>
                <p className="text-[#8e8e93] mb-6">
                  This will create a demo client with sample projects, employees, and data for you to explore.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    seedDemoMutation.mutate(formData.get("name") as string);
                  }}
                >
                  <input
                    name="name"
                    type="text"
                    defaultValue="Demo Tech Company"
                    placeholder="Client name"
                    className="w-full px-4 py-3 bg-[#2c2c2e] border border-[#3a3a3c] rounded-xl text-white mb-4"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDemoModal(false)}
                      className="flex-1 px-4 py-3 border border-[#3a3a3c] text-white rounded-xl hover:bg-[#2c2c2e]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={seedDemoMutation.isPending}
                      className="flex-1 px-4 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0] disabled:opacity-50"
                    >
                      {seedDemoMutation.isPending ? "Creating..." : "Create Demo"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-24 bg-[#1c1c1e] rounded-2xl" />
            <div className="grid grid-cols-7 gap-4">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-32 bg-[#1c1c1e] rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-[#1c1c1e] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-8">
        <div className="max-w-4xl mx-auto text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
            <AlertCircleIcon />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Failed to Load Dashboard</h2>
          <p className="text-[#8e8e93] mb-4">Unable to fetch client data. Please try again.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-[#0a84ff] text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-gradient-to-r from-[#1c1c1e] to-[#2c2c2e] rounded-2xl border border-[#3a3a3c] p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{dashboard.client_name}</h1>
              <p className="text-[#8e8e93]">Tax Year {dashboard.tax_year} • R&D Tax Credit Study</p>
            </div>
            
            {/* Timestamps */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-[#8e8e93]">Inputs: </span>
                <span className="text-white">{formatDate(dashboard.last_input_update)}</span>
              </div>
              <div>
                <span className="text-[#8e8e93]">Recompute: </span>
                <span className="text-white">{formatDate(dashboard.last_recompute)}</span>
              </div>
              <div>
                <span className="text-[#8e8e93]">AI Eval: </span>
                <span className="text-white">{formatDate(dashboard.last_ai_evaluation)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Readiness Score + Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Readiness Score */}
          <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
            <div className="text-center">
              <div className="relative w-32 h-32 mx-auto mb-4">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#3a3a3c"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={dashboard.readiness_score >= 80 ? "#34c759" : dashboard.readiness_score >= 50 ? "#ff9f0a" : "#ff3b30"}
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${dashboard.readiness_score * 3.52} 352`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">{dashboard.readiness_score}</span>
                  <span className="text-xs text-[#8e8e93]">Readiness</span>
                </div>
              </div>
              <p className="text-sm text-[#8e8e93]">
                {dashboard.readiness_score >= 80 ? "Ready for study generation" :
                 dashboard.readiness_score >= 50 ? "Good progress, some gaps remain" :
                 "More work needed"}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total QRE"
              value={formatCurrency(dashboard.total_qre)}
              subtext="Qualified research expenses"
            />
            <StatCard
              label="Est. Credit"
              value={formatCurrency(dashboard.estimated_credit)}
              subtext="Regular method"
            />
            <StatCard
              label="Projects"
              value={`${dashboard.qualified_projects_count}/${dashboard.projects_count}`}
              subtext="Qualified"
            />
            <StatCard
              label="Employees"
              value={String(dashboard.employees_count)}
              subtext="With wage data"
            />
          </div>
        </div>

        {/* Pipeline Progress */}
        <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Pipeline Progress</h2>
          <div className="grid grid-cols-7 gap-2">
            {dashboard.pipeline_steps.map((step, index) => (
              <PipelineStepCard
                key={step.id}
                step={step}
                index={index}
                isActive={index === dashboard.current_step}
                onClick={() => step.next_action_route && router.push(step.next_action_route)}
              />
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Next Actions */}
          <div className="lg:col-span-2 bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <SparklesIcon /> Next Best Actions
            </h2>
            <div className="space-y-3">
              {dashboard.next_actions.length === 0 ? (
                <p className="text-[#8e8e93] text-center py-8">All caught up! 🎉</p>
              ) : (
                dashboard.next_actions.slice(0, 5).map((action) => (
                  <NextActionCard
                    key={action.id}
                    action={action}
                    onClick={() => action.action_route && router.push(action.action_route)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Study Status */}
          <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Study Status</h2>
            <StudyStatusPanel
              status={dashboard.study_status}
              onGenerate={() => router.push("/workspace/studies")}
              onDownload={() => router.push("/workspace/studies")}
            />
          </div>
        </div>

        {/* Risk & Blockers Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Top Blockers */}
          <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertCircleIcon /> Top Blockers
            </h2>
            <div className="space-y-3">
              {dashboard.top_blockers.length === 0 ? (
                <p className="text-[#8e8e93] text-center py-4">No blockers! Great job.</p>
              ) : (
                dashboard.top_blockers.map((blocker) => (
                  <BlockerCard
                    key={blocker.id}
                    blocker={blocker}
                    onClick={() => blocker.action_route && router.push(blocker.action_route)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Risk Flags */}
          <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Risk & Audit Defense</h2>
            <div className="space-y-3">
              {dashboard.risk_flags.length === 0 ? (
                <p className="text-[#8e8e93] text-center py-4">No risk flags identified.</p>
              ) : (
                dashboard.risk_flags.map((flag) => (
                  <RiskFlagCard
                    key={flag.id}
                    flag={flag}
                    onClick={() => flag.entity_route && router.push(flag.entity_route)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Readiness Breakdown */}
        <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Readiness Breakdown</h2>
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
            <ReadinessItem label="Data" value={dashboard.readiness_breakdown.data_completeness} />
            <ReadinessItem label="Questions" value={dashboard.readiness_breakdown.questionnaire_completeness} />
            <ReadinessItem label="Gaps" value={dashboard.readiness_breakdown.gaps_resolved} />
            <ReadinessItem label="Evidence" value={dashboard.readiness_breakdown.evidence_coverage} />
            <ReadinessItem label="AI Eval" value={dashboard.readiness_breakdown.ai_evaluation_freshness} />
            <ReadinessItem label="Review" value={dashboard.readiness_breakdown.automated_review_resolved} />
            <ReadinessItem label="Study" value={dashboard.readiness_breakdown.study_decisions_locked} />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-4">
      <p className="text-sm text-[#8e8e93] mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-[#8e8e93]">{subtext}</p>
    </div>
  );
}

function PipelineStepCard({
  step,
  index,
  isActive,
  onClick,
}: {
  step: PipelineStep;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const colors = statusColors[step.status];
  
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${colors} ${
        isActive ? "ring-2 ring-[#0a84ff]" : ""
      } hover:opacity-80`}
    >
      <div className="text-center">
        <div className="text-2xl font-bold mb-1">{index + 1}</div>
        <p className="text-xs font-medium truncate">{step.name}</p>
        {step.blockers_count > 0 && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400">
            {step.blockers_count} blocker{step.blockers_count > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function NextActionCard({
  action,
  onClick,
}: {
  action: NextAction;
  onClick: () => void;
}) {
  const priorityColor = priorityColors[action.priority as keyof typeof priorityColors] || "bg-gray-500";
  
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-colors hover:bg-[#2c2c2e] ${
        action.blocking ? "border-red-500/50 bg-red-500/5" : "border-[#3a3a3c]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 ${priorityColor}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">{action.title}</p>
          <p className="text-sm text-[#8e8e93] truncate">{action.reason}</p>
        </div>
        <button className="px-3 py-1 text-xs font-medium text-[#0a84ff] bg-[#0a84ff]/10 rounded-lg flex items-center gap-1">
          {action.action_label} <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}

function StudyStatusPanel({
  status,
  onGenerate,
  onDownload,
}: {
  status: StudyStatus;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="space-y-4">
      {status.has_approved ? (
        <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-xl">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <CheckCircleIcon />
            <span className="font-medium">Study Approved</span>
          </div>
          <p className="text-sm text-[#8e8e93]">Version {status.latest_approved_version}</p>
          <button
            onClick={onDownload}
            className="mt-3 w-full px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          >
            <DownloadIcon /> Download Audit Package
          </button>
        </div>
      ) : status.has_draft ? (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <ClockIcon />
            <span className="font-medium">Draft Ready</span>
          </div>
          <p className="text-sm text-[#8e8e93]">Version {status.latest_draft_version}</p>
          <button
            onClick={onGenerate}
            className="mt-3 w-full px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-medium"
          >
            Review & Submit
          </button>
        </div>
      ) : (
        <div className="p-4 bg-[#2c2c2e] border border-[#3a3a3c] rounded-xl">
          <p className="text-[#8e8e93] mb-3">No study generated yet</p>
          <button
            onClick={onGenerate}
            disabled={!status.can_generate}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium ${
              status.can_generate
                ? "bg-[#0a84ff] text-white hover:bg-[#0070e0]"
                : "bg-[#3a3a3c] text-[#8e8e93] cursor-not-allowed"
            }`}
          >
            {status.can_generate ? "Generate Study" : "Complete Pipeline First"}
          </button>
        </div>
      )}
    </div>
  );
}

function BlockerCard({
  blocker,
  onClick,
}: {
  blocker: Blocker;
  onClick: () => void;
}) {
  const severityColors = {
    critical: "border-red-500/50 bg-red-500/5",
    high: "border-orange-500/50 bg-orange-500/5",
    medium: "border-yellow-500/50 bg-yellow-500/5",
    low: "border-blue-500/50 bg-blue-500/5",
  };
  
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer ${severityColors[blocker.severity as keyof typeof severityColors] || "border-[#3a3a3c]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white text-sm">{blocker.title}</p>
          <p className="text-xs text-[#8e8e93]">{blocker.description}</p>
        </div>
        {blocker.action_label && (
          <span className="text-xs text-[#0a84ff]">{blocker.action_label} →</span>
        )}
      </div>
    </div>
  );
}

function RiskFlagCard({
  flag,
  onClick,
}: {
  flag: RiskFlag;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="p-3 rounded-xl border border-[#3a3a3c] cursor-pointer hover:bg-[#2c2c2e]"
    >
      <div className="flex items-start gap-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
          flag.severity === "high" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
        }`}>
          {flag.severity.toUpperCase()}
        </span>
        <div>
          <p className="font-medium text-white text-sm">{flag.title}</p>
          <p className="text-xs text-[#8e8e93]">{flag.description}</p>
        </div>
      </div>
    </div>
  );
}

function ReadinessItem({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  
  return (
    <div className="text-center">
      <div className="h-2 bg-[#3a3a3c] rounded-full mb-2 overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <p className="text-xs text-[#8e8e93]">{label}</p>
      <p className="text-sm font-medium text-white">{value}%</p>
    </div>
  );
}
