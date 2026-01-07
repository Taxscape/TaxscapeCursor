"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
import {
  listClientStudies,
  generateWorkspaceStudy,
  generateAuditPackage,
  submitStudyForReview,
  approveStudy,
  getProjects,
  type StudySummary,
  type StudyGenerateOptions,
} from "@/lib/api";
import toast from "react-hot-toast";

type WizardStep = "scope" | "review" | "generate" | "complete";

// Simple SVG Icons
const FileSpreadsheetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
    <path d="M8 13h2"/>
    <path d="M8 17h2"/>
    <path d="M14 13h2"/>
    <path d="M14 17h2"/>
  </svg>
);

const CheckCircleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/>
    <path d="M12 17h.01"/>
  </svg>
);

const Loader2Icon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const PackageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m7.5 4.27 9 5.15"/>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/>
    <path d="M12 22V12"/>
  </svg>
);

const LockIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const UnlockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14"/>
    <path d="M12 5v14"/>
  </svg>
);

const SparklesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const FileTextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" x2="8" y1="13" y2="13"/>
    <line x1="16" x2="8" y1="17" y2="17"/>
  </svg>
);

export default function StudiesPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"builder" | "history">("builder");
  const [wizardStep, setWizardStep] = useState<WizardStep>("scope");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [includeUnqualified, setIncludeUnqualified] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [generatedStudy, setGeneratedStudy] = useState<StudySummary | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<Record<string, boolean>>({});

  // Fetch studies for this client
  const { data: studiesData, isLoading: studiesLoading } = useQuery({
    queryKey: ["studies", clientId, taxYear],
    queryFn: () => listClientStudies(clientId!, Number(taxYear)),
    enabled: !!clientId,
  });

  // Fetch projects for selection
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", clientId],
    queryFn: () => getProjects(),
    enabled: !!clientId,
  });

  // Generate study mutation
  const generateMutation = useMutation({
    mutationFn: (options: StudyGenerateOptions) =>
      generateWorkspaceStudy(clientId!, Number(taxYear), options),
    onSuccess: (data) => {
      setGeneratedStudy(data);
      setWizardStep("complete");
      queryClient.invalidateQueries({ queryKey: ["studies", clientId] });
      toast.success("Study generated successfully!");
    },
    onError: (error: any) => {
      toast.error(`Failed to generate study: ${error.message}`);
    },
  });

  // Audit package mutation
  const auditPackageMutation = useMutation({
    mutationFn: (studyId: string) => generateAuditPackage(studyId),
    onSuccess: (data) => {
      toast.success("Audit package generated!");
      window.open(data.download_url, "_blank");
    },
    onError: (error: any) => {
      toast.error(`Failed to generate audit package: ${error.message}`);
    },
  });

  // Submit for review mutation
  const submitMutation = useMutation({
    mutationFn: (studyId: string) => submitStudyForReview(studyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies", clientId] });
      toast.success("Study submitted for review!");
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ studyId, notes }: { studyId: string; notes?: string }) =>
      approveStudy(studyId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies", clientId] });
      toast.success("Study approved and locked!");
    },
  });

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return (projects as any[]).filter((p: any) => {
      if (!p.client_company_id || p.client_company_id !== clientId) return false;
      return true;
    });
  }, [projects, clientId]);

  const qualifiedProjects = filteredProjects.filter((p: any) => p.status === "qualified" || p.qualified);
  const unqualifiedProjects = filteredProjects.filter((p: any) => p.status !== "qualified" && !p.qualified);

  const handleGenerateStudy = () => {
    const options: StudyGenerateOptions = {
      include_unqualified: includeUnqualified,
      project_filter_ids: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
      regenerate_if_same_inputs: true,
      credit_method: "both",
    };
    generateMutation.mutate(options);
  };

  const handleDownloadExcel = (studyId: string) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || "https://taxscape-api.onrender.com"}/api/studies/${studyId}/download?artifact=excel`;
    window.open(url, "_blank");
  };

  const renderScopeStep = () => (
    <div className="space-y-6">
      <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileSpreadsheetIcon />
          Study Scope
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-[#2c2c2e]">
            <div>
              <p className="font-medium text-white">Tax Year</p>
              <p className="text-sm text-[#8e8e93]">Fiscal year for the R&D study</p>
            </div>
            <div className="text-2xl font-bold text-[#0a84ff]">{taxYear}</div>
          </div>

          <div className="p-4 rounded-lg bg-[#2c2c2e]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeUnqualified}
                onChange={(e) => setIncludeUnqualified(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <div>
                <p className="font-medium text-white">Include Unqualified Projects</p>
                <p className="text-sm text-[#8e8e93]">
                  Show all projects in report, not just qualified ones
                </p>
              </div>
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">Project Selection</p>
              <button
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="text-sm text-[#0a84ff] hover:underline flex items-center gap-1"
              >
                {showAllProjects ? "Hide" : "Customize"} selection
                {showAllProjects ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </button>
            </div>

            {!showAllProjects ? (
              <div className="p-4 rounded-lg border border-[#3a3a3c] bg-[#1c1c1e]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">All Qualified Projects</p>
                    <p className="text-sm text-[#8e8e93]">
                      {qualifiedProjects.length} qualified, {unqualifiedProjects.length} unqualified
                    </p>
                  </div>
                  <CheckCircleIcon className="text-green-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredProjects.map((proj: any) => (
                  <label
                    key={proj.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[#3a3a3c] hover:bg-[#2c2c2e] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(proj.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjectIds([...selectedProjectIds, proj.id]);
                        } else {
                          setSelectedProjectIds(selectedProjectIds.filter((id) => id !== proj.id));
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-white">{proj.name}</p>
                      <p className="text-xs text-[#8e8e93]">
                        {proj.status === "qualified" || proj.qualified ? "Qualified" : "Not Qualified"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setWizardStep("review")}
          className="px-6 py-2 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0] flex items-center gap-2"
        >
          Continue to Review <ChevronRightIcon />
        </button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <EyeIcon />
          Review & Confirm Decisions
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
              <p className="text-2xl font-bold text-green-500">{qualifiedProjects.length}</p>
              <p className="text-sm text-green-400">Qualified</p>
            </div>
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
              <p className="text-2xl font-bold text-yellow-500">{unqualifiedProjects.length}</p>
              <p className="text-sm text-yellow-400">Not Qualified</p>
            </div>
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
              <p className="text-2xl font-bold text-red-500">0</p>
              <p className="text-sm text-red-400">High Risk Flags</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setWizardStep("scope")}
          className="px-6 py-2 border border-[#3a3a3c] text-white rounded-lg font-medium hover:bg-[#2c2c2e]"
        >
          Back
        </button>
        <button
          onClick={() => setWizardStep("generate")}
          className="px-6 py-2 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0] flex items-center gap-2"
        >
          Continue to Generate <ChevronRightIcon />
        </button>
      </div>
    </div>
  );

  const renderGenerateStep = () => (
    <div className="space-y-6">
      <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <SparklesIcon />
          Generate Study
        </h3>

        <div className="text-center py-8">
          {generateMutation.isPending ? (
            <div className="space-y-4">
              <Loader2Icon className="w-12 h-12 mx-auto animate-spin text-[#0a84ff]" />
              <p className="text-lg font-medium text-white">Generating your R&D Tax Credit Study...</p>
              <p className="text-sm text-[#8e8e93]">This may take a moment</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-[#0a84ff]/10 flex items-center justify-center">
                <FileSpreadsheetIcon />
              </div>
              <div>
                <p className="text-lg font-medium text-white">Ready to Generate</p>
                <p className="text-sm text-[#8e8e93]">
                  This will create a 13-worksheet Excel report with all R&D documentation
                </p>
              </div>
              <button
                onClick={handleGenerateStudy}
                disabled={generateMutation.isPending}
                className="px-8 py-3 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0] flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                <SparklesIcon />
                Generate Study
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-start">
        <button
          onClick={() => setWizardStep("review")}
          disabled={generateMutation.isPending}
          className="px-6 py-2 border border-[#3a3a3c] text-white rounded-lg font-medium hover:bg-[#2c2c2e] disabled:opacity-50"
        >
          Back
        </button>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6">
      <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-6">
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-6">
            <CheckCircleIcon className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Study Generated!</h3>
          <p className="text-[#8e8e93] mb-6">Your R&D Tax Credit Study is ready for download</p>

          {generatedStudy && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 rounded-lg bg-[#2c2c2e]">
                <p className="text-2xl font-bold text-white">${generatedStudy.total_qre.toLocaleString()}</p>
                <p className="text-sm text-[#8e8e93]">Total QRE</p>
              </div>
              <div className="p-4 rounded-lg bg-[#2c2c2e]">
                <p className="text-2xl font-bold text-[#0a84ff]">${generatedStudy.total_credit.toLocaleString()}</p>
                <p className="text-sm text-[#8e8e93]">Estimated Credit</p>
              </div>
              <div className="p-4 rounded-lg bg-[#2c2c2e]">
                <p className="text-2xl font-bold text-green-500">{generatedStudy.qualified_projects}</p>
                <p className="text-sm text-[#8e8e93]">Qualified Projects</p>
              </div>
              <div className="p-4 rounded-lg bg-[#2c2c2e]">
                <p className="text-2xl font-bold text-white">v{generatedStudy.version}</p>
                <p className="text-sm text-[#8e8e93]">Study Version</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => generatedStudy && handleDownloadExcel(generatedStudy.study_id)}
              className="px-6 py-2 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0] flex items-center gap-2"
            >
              <DownloadIcon /> Download Excel
            </button>
            <button
              onClick={() => generatedStudy && auditPackageMutation.mutate(generatedStudy.study_id)}
              disabled={auditPackageMutation.isPending}
              className="px-6 py-2 border border-[#3a3a3c] text-white rounded-lg font-medium hover:bg-[#2c2c2e] flex items-center gap-2 disabled:opacity-50"
            >
              {auditPackageMutation.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PackageIcon />}
              Generate Audit Package
            </button>
            <button
              onClick={() => generatedStudy && submitMutation.mutate(generatedStudy.study_id)}
              disabled={submitMutation.isPending}
              className="px-6 py-2 border border-[#3a3a3c] text-white rounded-lg font-medium hover:bg-[#2c2c2e] flex items-center gap-2 disabled:opacity-50"
            >
              <FileTextIcon /> Submit for Review
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => { setWizardStep("scope"); setGeneratedStudy(null); }}
          className="px-4 py-2 text-[#8e8e93] hover:text-white"
        >
          Generate Another Study
        </button>
      </div>
    </div>
  );

  const renderStudyHistory = () => (
    <div className="space-y-4">
      {studiesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="w-8 h-8 animate-spin text-[#0a84ff]" />
        </div>
      ) : !studiesData?.studies?.length ? (
        <div className="text-center py-12">
          <HistoryIcon />
          <p className="text-lg font-medium text-white mt-4">No Studies Yet</p>
          <p className="text-[#8e8e93]">Generate your first study using the builder above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {studiesData.studies.map((study: any) => (
            <div
              key={study.id}
              className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  study.status === "approved" ? "bg-green-500/10" :
                  study.status === "rejected" ? "bg-red-500/10" :
                  study.status === "in_review" ? "bg-yellow-500/10" :
                  "bg-[#2c2c2e]"
                }`}>
                  {study.locked ? (
                    <LockIcon className={study.status === "approved" ? "text-green-500" : "text-[#8e8e93]"} />
                  ) : (
                    <UnlockIcon />
                  )}
                </div>
                <div>
                  <p className="font-medium text-white">
                    Study v{study.version} - {study.tax_year}
                  </p>
                  <p className="text-sm text-[#8e8e93]">
                    {new Date(study.generated_at).toLocaleDateString()} • 
                    {" "}${study.total_qre?.toLocaleString() || 0} QRE • 
                    {" "}{study.qualified_projects_count || 0} qualified projects
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  study.status === "approved" ? "bg-green-500/20 text-green-500" :
                  study.status === "rejected" ? "bg-red-500/20 text-red-500" :
                  study.status === "in_review" ? "bg-yellow-500/20 text-yellow-500" :
                  study.status === "superseded" ? "bg-gray-500/20 text-gray-500" :
                  "bg-blue-500/20 text-blue-500"
                }`}>
                  {study.status}
                </span>
                <button onClick={() => handleDownloadExcel(study.id)} className="p-2 hover:bg-[#2c2c2e] rounded-lg">
                  <DownloadIcon />
                </button>
                {study.status === "draft" && (
                  <button
                    onClick={() => submitMutation.mutate(study.id)}
                    className="px-3 py-1 text-sm text-[#0a84ff] hover:bg-[#0a84ff]/10 rounded-lg"
                  >
                    Submit
                  </button>
                )}
                {study.status === "in_review" && (
                  <button
                    onClick={() => approveMutation.mutate({ studyId: study.id })}
                    className="px-3 py-1 text-sm text-green-500 hover:bg-green-500/10 rounded-lg"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!clientId) {
    return (
      <div className="p-8 text-center">
        <AlertIcon />
        <p className="text-lg font-medium text-white mt-4">No Client Selected</p>
        <p className="text-[#8e8e93]">Please select a client from the header to generate studies</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Study Builder</h1>
        <p className="text-[#8e8e93]">
          Generate defensible R&D tax credit studies with full audit documentation
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("builder")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            activeTab === "builder"
              ? "bg-[#0a84ff] text-white"
              : "bg-[#2c2c2e] text-[#8e8e93] hover:text-white"
          }`}
        >
          <PlusIcon /> New Study
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            activeTab === "history"
              ? "bg-[#0a84ff] text-white"
              : "bg-[#2c2c2e] text-[#8e8e93] hover:text-white"
          }`}
        >
          <HistoryIcon /> Study History
        </button>
      </div>

      {activeTab === "builder" ? (
        <div>
          {/* Wizard Progress */}
          <div className="flex items-center justify-between mb-8">
            {(["scope", "review", "generate", "complete"] as WizardStep[]).map((step, idx) => (
              <React.Fragment key={step}>
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    wizardStep === step ? "bg-[#0a84ff] text-white" :
                    (["scope", "review", "generate", "complete"].indexOf(wizardStep) > idx)
                      ? "bg-green-500 text-white"
                      : "bg-[#2c2c2e] text-[#8e8e93]"
                  }`}>
                    {(["scope", "review", "generate", "complete"].indexOf(wizardStep) > idx) ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium hidden sm:inline ${
                    wizardStep === step ? "text-white" : "text-[#8e8e93]"
                  }`}>
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                  </span>
                </div>
                {idx < 3 && (
                  <div className={`flex-1 h-0.5 mx-4 ${
                    (["scope", "review", "generate", "complete"].indexOf(wizardStep) > idx)
                      ? "bg-green-500"
                      : "bg-[#2c2c2e]"
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {wizardStep === "scope" && renderScopeStep()}
          {wizardStep === "review" && renderReviewStep()}
          {wizardStep === "generate" && renderGenerateStep()}
          {wizardStep === "complete" && renderCompleteStep()}
        </div>
      ) : (
        renderStudyHistory()
      )}
    </div>
  );
}
