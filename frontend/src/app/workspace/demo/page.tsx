"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

// =============================================================================
// STATIC DEMO DATA - Pre-populated showcase
// =============================================================================

const DEMO_DASHBOARD = {
  client_name: "TechInnovate Solutions Inc.",
  tax_year: 2024,
  readiness_score: 78,
  total_qre: 847500,
  estimated_credit: 55087,
  projects_count: 12,
  qualified_projects_count: 9,
  employees_count: 45,
  
  pipeline_steps: [
    { id: "import", name: "Import Data", status: "completed", percent: 100 },
    { id: "verify", name: "Verify & Clean", status: "completed", percent: 100 },
    { id: "recompute", name: "Recompute QREs", status: "completed", percent: 100 },
    { id: "evaluate", name: "AI Evaluation", status: "in_progress", percent: 75 },
    { id: "review", name: "CPA Review", status: "not_started", percent: 0 },
    { id: "finalize", name: "Finalize Study", status: "not_started", percent: 0 },
    { id: "deliver", name: "Deliver", status: "not_started", percent: 0 },
  ],
  
  readiness_breakdown: {
    data_completeness: 95,
    questionnaire_completeness: 72,
    gaps_resolved: 85,
    evidence_coverage: 60,
    ai_evaluation_freshness: 90,
    automated_review_resolved: 70,
    study_decisions_locked: 45,
  },
  
  top_blockers: [
    { id: "1", type: "missing_data", severity: "high", title: "3 employees missing R&D percentage", description: "Update employee records with R&D time allocation" },
    { id: "2", type: "questionnaire", severity: "medium", title: "5 projects need questionnaire completion", description: "Complete technical uncertainty documentation" },
    { id: "3", type: "evidence", severity: "low", title: "Missing contractor invoices", description: "Upload supporting documentation for 2 contractors" },
  ],
  
  next_actions: [
    { id: "1", priority: "critical", title: "Complete employee R&D allocations", reason: "Required for QRE calculation", effort: "15 min", blocking: true },
    { id: "2", priority: "high", title: "Run AI evaluation on new projects", reason: "3 projects added since last evaluation", effort: "5 min", blocking: false },
    { id: "3", priority: "medium", title: "Review flagged expenses", reason: "12 expenses need categorization", effort: "20 min", blocking: false },
  ],
  
  risk_flags: [
    { id: "1", type: "high_wage", severity: "medium", title: "Above-average wage rates", description: "2 employees have wages 40% above industry average" },
    { id: "2", type: "foreign", severity: "low", title: "Foreign contractor activity", description: "1 contractor based outside US - verify qualified research" },
  ],
};

const DEMO_PROJECTS = [
  { id: "1", name: "AI-Powered Inventory Optimization", status: "qualified", confidence: 92, qre: 125000, uncertainty: "Novel ML algorithms for demand forecasting" },
  { id: "2", name: "Cloud Migration Platform", status: "qualified", confidence: 88, qre: 98500, uncertainty: "Automated legacy system translation" },
  { id: "3", name: "Real-time Analytics Engine", status: "qualified", confidence: 95, qre: 156000, uncertainty: "Sub-millisecond query optimization" },
  { id: "4", name: "Mobile Payment SDK", status: "qualified", confidence: 85, qre: 87000, uncertainty: "Cross-platform biometric authentication" },
  { id: "5", name: "IoT Sensor Network", status: "under_review", confidence: 72, qre: 45000, uncertainty: "Low-power mesh networking protocols" },
  { id: "6", name: "Blockchain Integration", status: "not_qualified", confidence: 35, qre: 0, uncertainty: "Standard implementation - no uncertainty" },
];

const DEMO_EMPLOYEES = [
  { id: "1", name: "Sarah Chen", title: "Lead Engineer", department: "R&D", rd_percent: 85, wages: 165000, qre_contribution: 140250 },
  { id: "2", name: "Marcus Johnson", title: "Senior Developer", department: "Engineering", rd_percent: 75, wages: 145000, qre_contribution: 108750 },
  { id: "3", name: "Emily Rodriguez", title: "Data Scientist", department: "AI/ML", rd_percent: 90, wages: 155000, qre_contribution: 139500 },
  { id: "4", name: "David Kim", title: "Software Architect", department: "Platform", rd_percent: 80, wages: 175000, qre_contribution: 140000 },
  { id: "5", name: "Lisa Wang", title: "QA Engineer", department: "Quality", rd_percent: 40, wages: 95000, qre_contribution: 38000 },
];

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
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" x2="12" y1="8" y2="12"/>
    <line x1="12" x2="12.01" y1="16" y2="16"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
  </svg>
);

const SparklesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
  </svg>
);

const DollarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusColors: Record<string, string> = {
  completed: "bg-green-500/20 text-green-400 border-green-500/50",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  not_started: "bg-[#3a3a3c] text-[#8e8e93] border-[#3a3a3c]",
  qualified: "bg-green-500/20 text-green-400",
  under_review: "bg-yellow-500/20 text-yellow-400",
  not_qualified: "bg-red-500/20 text-red-400",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DemoShowcasePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "projects" | "employees">("dashboard");
  const d = DEMO_DASHBOARD;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-[#0a84ff] to-[#5856d6] px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparklesIcon />
            <span className="font-medium text-white">Demo Mode - Showcasing TaxScape Pro with sample data</span>
          </div>
          <button
            onClick={() => router.push("/workspace" as Route)}
            className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium text-white"
          >
            Exit Demo
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-[#3a3a3c] bg-[#1c1c1e]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{d.client_name}</h1>
              <p className="text-[#8e8e93] mt-1">Tax Year {d.tax_year} • R&D Tax Credit Study</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-[#8e8e93]">Estimated Credit</p>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(d.estimated_credit)}</p>
              </div>
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#5856d6] flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{d.readiness_score}%</span>
              </div>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 mt-6">
            {["dashboard", "projects", "employees"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 rounded-lg font-medium capitalize ${
                  activeTab === tab
                    ? "bg-[#0a84ff] text-white"
                    : "text-[#8e8e93] hover:bg-[#2c2c2e]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Pipeline Steps */}
            <div className="grid grid-cols-7 gap-2">
              {d.pipeline_steps.map((step, i) => (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border ${
                    step.status === "completed"
                      ? "bg-green-500/10 border-green-500/30"
                      : step.status === "in_progress"
                      ? "bg-[#0a84ff]/10 border-[#0a84ff]/30"
                      : "bg-[#1c1c1e] border-[#3a3a3c]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      step.status === "completed" ? "bg-green-500 text-white" :
                      step.status === "in_progress" ? "bg-[#0a84ff] text-white" :
                      "bg-[#3a3a3c] text-[#8e8e93]"
                    }`}>
                      {step.status === "completed" ? "✓" : i + 1}
                    </span>
                  </div>
                  <p className={`text-sm font-medium ${
                    step.status === "completed" ? "text-green-400" :
                    step.status === "in_progress" ? "text-[#0a84ff]" :
                    "text-[#8e8e93]"
                  }`}>
                    {step.name}
                  </p>
                  <div className="mt-2 h-1 bg-[#2c2c2e] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        step.status === "completed" ? "bg-green-500" :
                        step.status === "in_progress" ? "bg-[#0a84ff]" : "bg-[#3a3a3c]"
                      }`}
                      style={{ width: `${step.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-[#0a84ff]/20 rounded-lg text-[#0a84ff]">
                    <FolderIcon />
                  </div>
                  <span className="text-[#8e8e93]">Projects</span>
                </div>
                <p className="text-3xl font-bold text-white">{d.projects_count}</p>
                <p className="text-sm text-green-400 mt-1">{d.qualified_projects_count} qualified</p>
              </div>
              
              <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                    <UsersIcon />
                  </div>
                  <span className="text-[#8e8e93]">Employees</span>
                </div>
                <p className="text-3xl font-bold text-white">{d.employees_count}</p>
                <p className="text-sm text-[#8e8e93] mt-1">Performing R&D</p>
              </div>
              
              <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                    <DollarIcon />
                  </div>
                  <span className="text-[#8e8e93]">Total QRE</span>
                </div>
                <p className="text-3xl font-bold text-white">{formatCurrency(d.total_qre)}</p>
                <p className="text-sm text-[#8e8e93] mt-1">Qualified expenses</p>
              </div>
              
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl border border-green-500/30 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-500/30 rounded-lg text-green-400">
                    <CheckCircleIcon />
                  </div>
                  <span className="text-green-300">Est. Credit</span>
                </div>
                <p className="text-3xl font-bold text-green-400">{formatCurrency(d.estimated_credit)}</p>
                <p className="text-sm text-green-300/70 mt-1">6.5% of QRE</p>
              </div>
            </div>

            {/* Blockers & Actions */}
            <div className="grid grid-cols-2 gap-6">
              {/* Blockers */}
              <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#3a3a3c]">
                  <h3 className="font-semibold text-white">Active Blockers</h3>
                </div>
                <div className="divide-y divide-[#2c2c2e]">
                  {d.top_blockers.map((blocker) => (
                    <div key={blocker.id} className="px-5 py-4 flex items-start gap-3">
                      <div className={`p-1 rounded ${
                        blocker.severity === "high" ? "bg-red-500/20 text-red-400" :
                        blocker.severity === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>
                        <AlertCircleIcon />
                      </div>
                      <div>
                        <p className="font-medium text-white">{blocker.title}</p>
                        <p className="text-sm text-[#8e8e93] mt-0.5">{blocker.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Actions */}
              <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#3a3a3c]">
                  <h3 className="font-semibold text-white">Recommended Actions</h3>
                </div>
                <div className="divide-y divide-[#2c2c2e]">
                  {d.next_actions.map((action) => (
                    <div key={action.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${priorityColors[action.priority]}`} />
                        <span className="font-medium text-white">{action.title}</span>
                        {action.blocking && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">Blocking</span>
                        )}
                      </div>
                      <p className="text-sm text-[#8e8e93]">{action.reason}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-[#8e8e93]">~{action.effort}</span>
                        <button className="text-[#0a84ff] text-sm font-medium flex items-center gap-1 hover:underline">
                          Take action <ArrowRightIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Readiness Breakdown */}
            <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-6">
              <h3 className="font-semibold text-white mb-4">Readiness Breakdown</h3>
              <div className="grid grid-cols-7 gap-4">
                {Object.entries(d.readiness_breakdown).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-2">
                      <svg className="w-16 h-16 transform -rotate-90">
                        <circle cx="32" cy="32" r="28" stroke="#2c2c2e" strokeWidth="6" fill="none" />
                        <circle
                          cx="32" cy="32" r="28"
                          stroke={value >= 80 ? "#22c55e" : value >= 50 ? "#eab308" : "#ef4444"}
                          strokeWidth="6"
                          fill="none"
                          strokeDasharray={`${(value / 100) * 176} 176`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                        {value}%
                      </span>
                    </div>
                    <p className="text-xs text-[#8e8e93] capitalize">
                      {key.replace(/_/g, " ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "projects" && (
          <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#2c2c2e]">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Project Name</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Status</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">AI Confidence</th>
                  <th className="px-5 py-3 text-right text-sm font-medium text-[#8e8e93]">QRE Amount</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Technical Uncertainty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2c2c2e]">
                {DEMO_PROJECTS.map((project) => (
                  <tr key={project.id} className="hover:bg-[#2c2c2e]/50">
                    <td className="px-5 py-4 font-medium text-white">{project.name}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[project.status]}`}>
                        {project.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-[#2c2c2e] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              project.confidence >= 80 ? "bg-green-500" :
                              project.confidence >= 60 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${project.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm text-[#8e8e93]">{project.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-white">
                      {project.qre > 0 ? formatCurrency(project.qre) : "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8e8e93] max-w-xs truncate">
                      {project.uncertainty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "employees" && (
          <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#2c2c2e]">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Employee</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Title</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-[#8e8e93]">Department</th>
                  <th className="px-5 py-3 text-right text-sm font-medium text-[#8e8e93]">R&D %</th>
                  <th className="px-5 py-3 text-right text-sm font-medium text-[#8e8e93]">Total Wages</th>
                  <th className="px-5 py-3 text-right text-sm font-medium text-[#8e8e93]">QRE Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2c2c2e]">
                {DEMO_EMPLOYEES.map((emp) => (
                  <tr key={emp.id} className="hover:bg-[#2c2c2e]/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0a84ff] to-[#5856d6] flex items-center justify-center text-white text-sm font-medium">
                          {emp.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <span className="font-medium text-white">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#8e8e93]">{emp.title}</td>
                    <td className="px-5 py-4 text-[#8e8e93]">{emp.department}</td>
                    <td className="px-5 py-4 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        emp.rd_percent >= 75 ? "bg-green-500/20 text-green-400" :
                        emp.rd_percent >= 50 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-[#3a3a3c] text-[#8e8e93]"
                      }`}>
                        {emp.rd_percent}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-white">{formatCurrency(emp.wages)}</td>
                    <td className="px-5 py-4 text-right font-medium text-green-400">
                      {formatCurrency(emp.qre_contribution)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
