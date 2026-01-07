"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { getSupabaseClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { Route } from "next";

// =============================================================================
// TYPES
// =============================================================================

interface DemoTourStep {
  id: string;
  title: string;
  description: string;
  target_route: string;
  target_element?: string;
  action_type: string;
  hints: string[];
}

interface DemoSession {
  id: string;
  user_id: string;
  organization_id?: string;
  client_company_id?: string;
  demo_type: string;
  current_step: number;
  completed_steps: string[];
  started_at: string;
  completed_at?: string;
}

interface SeededData {
  projects: number;
  employees: number;
  vendors: number;
  timesheets: number;
  ap_transactions: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated. Please log in again.");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function seedDemoData(clientName: string, taxYear: number): Promise<{
  success: boolean;
  client_company_id: string;
  seeded_data: SeededData;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_URL}/api/demo/seed?client_name=${encodeURIComponent(clientName)}&tax_year=${taxYear}`,
    { method: "POST", headers }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to seed demo data");
  }
  return response.json();
}

async function getDemoTourSteps(): Promise<DemoTourStep[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/demo/tour/steps`, { headers });
  if (!response.ok) throw new Error("Failed to fetch tour steps");
  return response.json();
}

async function getDemoSession(): Promise<DemoSession | null> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/demo/session`, { headers });
  if (!response.ok) return null;
  return response.json();
}

async function startDemoSession(clientCompanyId: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_URL}/api/demo/session/start?client_company_id=${clientCompanyId}`,
    { method: "POST", headers }
  );
  if (!response.ok) throw new Error("Failed to start demo session");
  return response.json();
}

async function advanceDemoStep(stepId: string): Promise<{
  success: boolean;
  current_step: number;
  is_complete: boolean;
  next_step?: DemoTourStep;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/demo/session/advance?step_id=${stepId}`, {
    method: "POST",
    headers,
  });
  if (!response.ok) throw new Error("Failed to advance demo step");
  return response.json();
}

// =============================================================================
// ICONS
// =============================================================================

const SparklesIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const RotateCwIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function GuidedDemoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { organization } = useAuth();
  const { state, setClient } = useWorkspace();
  const clientId = state.clientId;

  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [tourSteps, setTourSteps] = useState<DemoTourStep[]>([]);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [seededData, setSeededData] = useState<SeededData | null>(null);
  const [demoClientId, setDemoClientId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Load tour steps and session on mount
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [steps, existingSession] = await Promise.all([
          getDemoTourSteps(),
          getDemoSession(),
        ]);
        setTourSteps(steps);
        if (existingSession) {
          setSession(existingSession);
          setDemoClientId(existingSession.client_company_id || null);
          setCurrentStepIndex(existingSession.current_step);
        }
      } catch (err) {
        console.error("Failed to load demo data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Seed demo data
  const handleSeedDemo = useCallback(async () => {
    setIsSeeding(true);
    try {
      const result = await seedDemoData("Demo Tech Company", 2024);
      setSeededData(result.seeded_data);
      setDemoClientId(result.client_company_id);
      
      // Start demo session
      await startDemoSession(result.client_company_id);
      const newSession = await getDemoSession();
      setSession(newSession);
      setCurrentStepIndex(0);
      
      // Set as active client
      setClient(result.client_company_id);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      
      toast.success("Demo data created successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create demo data");
    } finally {
      setIsSeeding(false);
    }
  }, [queryClient, setClient]);

  // Advance to next step
  const handleNextStep = useCallback(async () => {
    if (!tourSteps[currentStepIndex]) return;
    
    try {
      const result = await advanceDemoStep(tourSteps[currentStepIndex].id);
      setCurrentStepIndex(result.current_step);
      
      if (result.is_complete) {
        toast.success("🎉 Congratulations! You've completed the demo tour!");
        setSession((prev) => prev ? { ...prev, completed_at: new Date().toISOString() } : null);
      }
    } catch (err) {
      console.error("Failed to advance step:", err);
    }
  }, [currentStepIndex, tourSteps]);

  // Navigate to current step's target
  const handleGoToStep = useCallback(() => {
    const step = tourSteps[currentStepIndex];
    if (step?.target_route) {
      router.push(step.target_route as Route);
    }
  }, [currentStepIndex, tourSteps, router]);

  // Reset demo
  const handleResetDemo = useCallback(() => {
    setSession(null);
    setSeededData(null);
    setDemoClientId(null);
    setCurrentStepIndex(0);
  }, []);

  const currentStep = tourSteps[currentStepIndex];
  const isComplete = session?.completed_at != null;

  if (isLoading) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#5856d6] flex items-center justify-center text-white">
          <SparklesIcon />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Guided Demo</h1>
        <p className="text-lg text-[#8e8e93] max-w-xl mx-auto">
          Experience TaxScape Pro with realistic sample data. Learn the complete R&D tax credit workflow step-by-step.
        </p>
      </div>

      {/* Demo Not Started */}
      {!demoClientId && (
        <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Create Demo Data</h2>
          <p className="text-[#8e8e93] mb-6 max-w-md mx-auto">
            This will create a sample tech company with R&D projects, employees, timesheets, and expenses. 
            You can explore the full workflow without affecting any real data.
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <DataPreview label="Projects" count={5} />
            <DataPreview label="Employees" count={8} />
            <DataPreview label="Vendors" count={4} />
            <DataPreview label="Timesheets" count="~180" />
            <DataPreview label="AP Transactions" count="~48" />
          </div>

          <button
            onClick={handleSeedDemo}
            disabled={isSeeding}
            className="px-8 py-4 bg-gradient-to-r from-[#0a84ff] to-[#5856d6] text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
          >
            {isSeeding ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating Demo Data...
              </>
            ) : (
              <>
                <PlayIcon /> Start Guided Demo
              </>
            )}
          </button>
        </div>
      )}

      {/* Demo Active */}
      {demoClientId && (
        <>
          {/* Seeded Data Summary */}
          {seededData && (
            <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4">
              <p className="text-green-400 font-medium mb-2">✓ Demo Data Created Successfully</p>
              <div className="flex flex-wrap gap-4 text-sm text-green-300">
                <span>{seededData.projects} projects</span>
                <span>{seededData.employees} employees</span>
                <span>{seededData.vendors} vendors</span>
                <span>{seededData.timesheets} timesheets</span>
                <span>{seededData.ap_transactions} AP transactions</span>
              </div>
            </div>
          )}

          {/* Tour Progress */}
          <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] overflow-hidden">
            <div className="p-4 border-b border-[#3a3a3c] flex items-center justify-between">
              <h2 className="font-semibold text-white">Tour Progress</h2>
              <span className="text-sm text-[#8e8e93]">
                Step {currentStepIndex + 1} of {tourSteps.length}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 bg-[#2c2c2e]">
              <div
                className="h-full bg-gradient-to-r from-[#0a84ff] to-[#5856d6] transition-all"
                style={{ width: `${((currentStepIndex + (isComplete ? 1 : 0)) / tourSteps.length) * 100}%` }}
              />
            </div>

            {/* Steps List */}
            <div className="divide-y divide-[#2c2c2e]">
              {tourSteps.map((step, index) => {
                const isCompleted = index < currentStepIndex || isComplete;
                const isCurrent = index === currentStepIndex && !isComplete;
                
                return (
                  <div
                    key={step.id}
                    className={`p-4 flex items-start gap-4 ${isCurrent ? "bg-[#0a84ff]/10" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : isCurrent
                          ? "bg-[#0a84ff] text-white"
                          : "bg-[#2c2c2e] text-[#8e8e93]"
                      }`}
                    >
                      {isCompleted ? <CheckIcon /> : index + 1}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${isCurrent ? "text-white" : isCompleted ? "text-[#8e8e93]" : "text-[#8e8e93]"}`}>
                        {step.title}
                      </p>
                      <p className="text-sm text-[#8e8e93]">{step.description}</p>
                      {isCurrent && step.hints.length > 0 && (
                        <ul className="mt-2 text-sm text-[#0a84ff]">
                          {step.hints.map((hint, i) => (
                            <li key={i}>💡 {hint}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {isCurrent && (
                      <button
                        onClick={handleGoToStep}
                        className="px-3 py-1 bg-[#0a84ff] text-white rounded-lg text-sm flex items-center gap-1"
                      >
                        Go <ArrowRightIcon />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Step Actions */}
          {!isComplete && currentStep && (
            <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Current Step: {currentStep.title}
              </h3>
              <p className="text-[#8e8e93] mb-4">{currentStep.description}</p>
              
              <div className="flex gap-4">
                <button
                  onClick={handleGoToStep}
                  className="flex-1 px-4 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0] flex items-center justify-center gap-2"
                >
                  Go to {currentStep.title.split(" ")[0]} <ArrowRightIcon />
                </button>
                <button
                  onClick={handleNextStep}
                  className="px-4 py-3 border border-[#3a3a3c] text-white rounded-xl hover:bg-[#2c2c2e]"
                >
                  Skip Step
                </button>
              </div>
            </div>
          )}

          {/* Completion */}
          {isComplete && (
            <div className="bg-gradient-to-r from-green-500/20 to-[#0a84ff]/20 rounded-2xl border border-green-500/50 p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                <CheckIcon />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Tour Complete! 🎉</h3>
              <p className="text-[#8e8e93] mb-6">
                You&apos;ve completed the guided tour. Continue exploring on your own or restart with fresh data.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.push("/workspace")}
                  className="px-6 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0]"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={handleResetDemo}
                  className="px-6 py-3 border border-[#3a3a3c] text-white rounded-xl hover:bg-[#2c2c2e] flex items-center gap-2"
                >
                  <RotateCwIcon /> Restart Demo
                </button>
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickLink label="Dashboard" href="/workspace" />
            <QuickLink label="Projects" href="/workspace/projects" />
            <QuickLink label="Import Data" href="/workspace/rd-analysis" />
            <QuickLink label="Studies" href="/workspace/studies" />
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function DataPreview({ label, count }: { label: string; count: number | string }) {
  return (
    <div className="p-3 bg-[#2c2c2e] rounded-lg text-center">
      <p className="text-xl font-bold text-white">{count}</p>
      <p className="text-xs text-[#8e8e93]">{label}</p>
    </div>
  );
}

function QuickLink({ label, href }: { label: string; href: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href as Route)}
      className="p-4 bg-[#1c1c1e] border border-[#3a3a3c] rounded-xl text-left hover:bg-[#2c2c2e] transition-colors"
    >
      <p className="text-white font-medium">{label}</p>
      <p className="text-xs text-[#8e8e93]">Go to page →</p>
    </button>
  );
}

