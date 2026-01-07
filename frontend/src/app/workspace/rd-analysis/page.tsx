"use client";

import React, { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { getSupabaseClient } from "@/lib/supabase";
import toast from "react-hot-toast";

// =============================================================================
// TYPES
// =============================================================================

interface ImportPreview {
  sheets: string[];
  row_counts: Record<string, number>;
  detected_entities: Array<{
    sheet: string;
    entity: string;
    rows: number;
    columns: string[];
  }>;
  validation_issues: Array<{
    sheet: string;
    issue: string;
  }>;
  sample_data?: Record<string, any[]>;
}

interface CommitSummary {
  inserted: Record<string, number>;
  updated: Record<string, number>;
  errors: Record<string, string[]>;
  total_inserted: number;
  total_updated: number;
}

type ImportStep = "upload" | "preview" | "importing" | "complete";

// =============================================================================
// API FUNCTIONS
// =============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com";

async function getAuthToken(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated. Please log in again.");
  }
  return session.access_token;
}

async function previewImport(
  file: File,
  clientId: string,
  taxYear: number
): Promise<{ import_file_id: string; preview: ImportPreview; sheet_mapping: Record<string, string> }> {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("client_id", clientId);
  formData.append("tax_year", String(taxYear));

  const response = await fetch(
    `${API_URL}/api/workspace-data/import/preview`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to preview import");
  }
  return response.json();
}

async function commitImport(importFileId: string): Promise<{ success: boolean; commit_summary: CommitSummary; message: string }> {
  const token = await getAuthToken();
  const response = await fetch(
    `${API_URL}/api/workspace-data/import/commit?import_file_id=${importFileId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to commit import");
  }
  return response.json();
}

async function triggerRecompute(clientId: string, taxYear: number): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(
    `${API_URL}/api/workspace-data/recompute`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_company_id: clientId,
        tax_year: taxYear,
        regenerate_questionnaire: true,
        recompute_174: true,
        recompute_review: true,
      }),
    }
  );

  if (!response.ok) {
    console.warn("Recompute failed, but import succeeded");
  }
}

// =============================================================================
// ICONS
// =============================================================================

const UploadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </svg>
);

const FileSpreadsheetIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" x2="16" y1="13" y2="13" />
    <line x1="8" x2="16" y1="17" y2="17" />
    <line x1="8" x2="10" y1="9" y2="9" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

const entityLabels: Record<string, string> = {
  employees: "Employees",
  projects: "R&D Projects",
  timesheets: "Timesheets",
  vendors: "Vendors/Contractors",
  contracts: "Contracts",
  ap_transactions: "AP Transactions",
  supplies: "Supplies",
};

const entityColors: Record<string, string> = {
  employees: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  projects: "bg-purple-500/20 text-purple-400 border-purple-500/50",
  timesheets: "bg-green-500/20 text-green-400 border-green-500/50",
  vendors: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  contracts: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  ap_transactions: "bg-pink-500/20 text-pink-400 border-pink-500/50",
  supplies: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RDAnalysisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId, taxYear } = useActiveContext();

  const [step, setStep] = useState<ImportStep>("upload");
  const [importFileId, setImportFileId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Handle file upload and preview
  const handleUpload = useCallback(
    async (file: File) => {
      if (!clientId) {
        setError("Please select a client first");
        return;
      }

      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Please upload an Excel file (.xlsx, .xls) or CSV file");
        return;
      }

      setError(null);
      setStep("importing");
      setUploadedFileName(file.name);

      try {
        const result = await previewImport(file, clientId, Number(taxYear) || 2024);
        setImportFileId(result.import_file_id);
        setPreview(result.preview);
        setStep("preview");
        toast.success(`Found ${result.preview.detected_entities.length} data sheets to import`);
      } catch (err: any) {
        setError(err.message || "Failed to process file");
        setStep("upload");
        toast.error(err.message || "Upload failed");
      }
    },
    [clientId, taxYear]
  );

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (!importFileId || !clientId) return;

    setStep("importing");
    setError(null);

    try {
      const result = await commitImport(importFileId);
      setCommitSummary(result.commit_summary);
      
      // Trigger recompute in the background
      triggerRecompute(clientId, Number(taxYear) || 2024).catch(console.error);
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["ap-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      
      setStep("complete");
      toast.success(result.message);
    } catch (err: any) {
      setError(err.message || "Import failed");
      setStep("preview");
      toast.error(err.message || "Import failed");
    }
  }, [importFileId, clientId, taxYear, queryClient]);

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  // Reset to start over
  const handleReset = useCallback(() => {
    setStep("upload");
    setImportFileId(null);
    setPreview(null);
    setCommitSummary(null);
    setError(null);
    setUploadedFileName("");
  }, []);

  // No client selected
  if (!clientId) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#2c2c2e] flex items-center justify-center text-[#8e8e93]">
            <FileSpreadsheetIcon />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Select a Client</h2>
          <p className="text-[#8e8e93]">
            Choose a client from the header dropdown to import their R&D data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Import R&D Data</h1>
        <p className="text-[#8e8e93]">
          Upload an Excel file to automatically populate employees, projects, timesheets, and expenses.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-8">
        <StepIndicator step={1} label="Upload" active={step === "upload"} complete={step !== "upload"} />
        <div className="flex-1 h-px bg-[#3a3a3c]" />
        <StepIndicator step={2} label="Preview" active={step === "preview"} complete={step === "complete" || step === "importing" && !!preview} />
        <div className="flex-1 h-px bg-[#3a3a3c]" />
        <StepIndicator step={3} label="Complete" active={step === "complete"} complete={step === "complete"} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3">
          <AlertIcon />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all ${
            isDragging
              ? "border-[#0a84ff] bg-[#0a84ff]/10"
              : "border-[#3a3a3c] hover:border-[#4a4a4c]"
          }`}
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#2c2c2e] flex items-center justify-center text-[#8e8e93]">
            <UploadIcon />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Drop your Excel file here
          </h3>
          <p className="text-[#8e8e93] mb-6">
            or click to browse. Supports .xlsx, .xls, and .csv files.
          </p>
          <label className="inline-flex px-6 py-3 bg-[#0a84ff] text-white rounded-xl cursor-pointer font-medium hover:bg-[#0070e0] transition-colors">
            Select File
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              className="hidden"
            />
          </label>

          {/* Expected Format */}
          <div className="mt-8 p-4 bg-[#1c1c1e] rounded-xl text-left">
            <p className="text-sm font-medium text-white mb-2">Expected Sheet Names:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(entityLabels).map(([key, label]) => (
                <span key={key} className={`px-2 py-1 text-xs rounded border ${entityColors[key]}`}>
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-[#8e8e93] mt-2">
              Sheet names are matched flexibly (e.g., &quot;Employees&quot;, &quot;Employee List&quot;, &quot;employees&quot; all work)
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* File Info */}
          <div className="p-4 bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#2c2c2e] flex items-center justify-center text-[#8e8e93]">
              <FileSpreadsheetIcon />
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">{uploadedFileName}</p>
              <p className="text-sm text-[#8e8e93]">
                {preview.sheets.length} sheets • {Object.values(preview.row_counts).reduce((a, b) => a + b, 0)} total rows
              </p>
            </div>
            <button onClick={handleReset} className="px-3 py-1 text-sm text-[#8e8e93] hover:text-white">
              Change File
            </button>
          </div>

          {/* Detected Entities */}
          <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
            <div className="p-4 border-b border-[#3a3a3c]">
              <h3 className="font-semibold text-white">Data to Import</h3>
            </div>
            <div className="divide-y divide-[#2c2c2e]">
              {preview.detected_entities.length === 0 ? (
                <div className="p-8 text-center text-[#8e8e93]">
                  No recognizable data sheets found. Make sure your sheet names match the expected format.
                </div>
              ) : (
                preview.detected_entities.map((entity) => (
                  <div key={entity.sheet} className="p-4 flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-lg text-sm font-medium ${entityColors[entity.entity]}`}>
                      {entityLabels[entity.entity] || entity.entity}
                    </div>
                    <div className="flex-1">
                      <p className="text-white">Sheet: &quot;{entity.sheet}&quot;</p>
                      <p className="text-sm text-[#8e8e93]">
                        {entity.rows} rows • {entity.columns.length} columns
                      </p>
                    </div>
                    <div className="text-sm text-green-400">Ready</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Validation Issues */}
          {preview.validation_issues.length > 0 && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl">
              <p className="font-medium text-yellow-400 mb-2">Validation Notes</p>
              <ul className="space-y-1 text-sm text-yellow-300">
                {preview.validation_issues.map((issue, i) => (
                  <li key={i}>• {issue.sheet}: {issue.issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="px-6 py-3 border border-[#3a3a3c] text-white rounded-xl hover:bg-[#2c2c2e]"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={preview.detected_entities.length === 0}
              className="flex-1 px-6 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {preview.detected_entities.length} Data {preview.detected_entities.length === 1 ? "Sheet" : "Sheets"}
            </button>
          </div>
        </div>
      )}

      {/* Importing State */}
      {step === "importing" && (
        <div className="p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-6 border-4 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {preview ? "Importing Data..." : "Processing File..."}
          </h3>
          <p className="text-[#8e8e93]">
            {preview
              ? "Inserting records into your workspace. This may take a moment."
              : "Analyzing your Excel file and detecting data sheets."}
          </p>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === "complete" && commitSummary && (
        <div className="space-y-6">
          <div className="p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
              <CheckCircleIcon />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Import Complete!</h3>
            <p className="text-[#8e8e93]">
              Successfully imported {commitSummary.total_inserted} new records
              {commitSummary.total_updated > 0 && ` and updated ${commitSummary.total_updated} existing records`}.
            </p>
          </div>

          {/* Summary */}
          <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden">
            <div className="p-4 border-b border-[#3a3a3c]">
              <h3 className="font-semibold text-white">Import Summary</h3>
            </div>
            <div className="divide-y divide-[#2c2c2e]">
              {Object.entries(commitSummary.inserted).map(([entity, count]) => (
                <div key={entity} className="p-4 flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${entityColors[entity]}`}>
                    {entityLabels[entity] || entity}
                  </span>
                  <div className="text-right">
                    <span className="text-white font-medium">{count} inserted</span>
                    {commitSummary.updated[entity] > 0 && (
                      <span className="text-[#8e8e93] ml-2">
                        ({commitSummary.updated[entity]} updated)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Errors */}
          {Object.values(commitSummary.errors).some((errs) => errs.length > 0) && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl">
              <p className="font-medium text-yellow-400 mb-2">Some rows had issues:</p>
              {Object.entries(commitSummary.errors).map(([entity, errors]) =>
                errors.length > 0 ? (
                  <div key={entity} className="mb-2">
                    <p className="text-sm text-yellow-300">{entityLabels[entity]}:</p>
                    <ul className="text-xs text-yellow-200">
                      {errors.slice(0, 3).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {errors.length > 3 && <li>• ...and {errors.length - 3} more</li>}
                    </ul>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* Next Steps */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleReset}
              className="px-6 py-4 border border-[#3a3a3c] text-white rounded-xl hover:bg-[#2c2c2e]"
            >
              Import More Data
            </button>
            <button
              onClick={() => router.push("/workspace")}
              className="px-6 py-4 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0]"
            >
              View Dashboard →
            </button>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-3 gap-3">
            <QuickLink label="View Projects" href="/workspace/projects" count={commitSummary.inserted.projects} />
            <QuickLink label="View Employees" href="/workspace/employees" count={commitSummary.inserted.employees} />
            <QuickLink label="View Timesheets" href="/workspace/timesheets" count={commitSummary.inserted.timesheets} />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StepIndicator({
  step,
  label,
  active,
  complete,
}: {
  step: number;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          complete
            ? "bg-green-500 text-white"
            : active
            ? "bg-[#0a84ff] text-white"
            : "bg-[#2c2c2e] text-[#8e8e93]"
        }`}
      >
        {complete ? "✓" : step}
      </div>
      <span className={active || complete ? "text-white" : "text-[#8e8e93]"}>{label}</span>
    </div>
  );
}

function QuickLink({ label, href, count }: { label: string; href: string; count?: number }) {
  const router = useRouter();
  
  if (!count) return null;
  
  return (
    <button
      onClick={() => router.push(href as Route)}
      className="p-3 bg-[#2c2c2e] rounded-xl text-left hover:bg-[#3a3a3c] transition-colors"
    >
      <p className="text-sm text-[#8e8e93]">{label}</p>
      <p className="text-lg font-semibold text-white">{count} records</p>
    </button>
  );
}
