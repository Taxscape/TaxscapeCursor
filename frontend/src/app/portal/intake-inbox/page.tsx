"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  uploadIntakeFiles,
  getIntakeSessionDetail,
  listSessionFiles,
  overrideClassification,
  processIntakeSession,
  getFileMappings,
  resolveMapping,
  finalizeIntakeSession,
  getMissingInputs,
  DOMAIN_LABELS,
  DOMAIN_ICONS,
  STATUS_COLORS,
  type IntakeFile,
  type IntakeMapping,
  type ClassificationDomain,
  type MissingInputSummary,
} from "@/lib/intake-ingestion";
import { getIntakeSession } from "@/lib/intake";
import { getClientCompanies, type ClientCompany } from "@/lib/api";

// ============================================================================
// Icons
// ============================================================================

const Icons = {
  upload: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  ),
  file: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </svg>
  ),
  alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  ),
  arrowLeft: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="19" x2="5" y1="12" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  checkCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  refresh: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  eye: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  inbox: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
};

// ============================================================================
// Components
// ============================================================================

function FileDropzone({
  onUpload,
  isUploading,
}: {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
        isDragging
          ? "border-blue-500 bg-blue-500/10"
          : "border-white/20 hover:border-white/40"
      } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            onUpload(files);
          }
        }}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          {isUploading ? (
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            Icons.upload
          )}
        </div>
        <div>
          <p className="text-lg font-medium">
            {isUploading ? "Uploading..." : "Drop files here or click to upload"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Excel, CSV, PDF, or Word documents
          </p>
        </div>
      </div>
    </div>
  );
}

function ExpectedInputsChecklist({
  inputs,
  canFinalize,
}: {
  inputs: MissingInputSummary[];
  canFinalize: boolean;
}) {
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
      <h3 className="font-medium mb-4 flex items-center gap-2">
        📋 Expected Inputs
      </h3>
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.category}
            className={`flex items-center justify-between p-2 rounded-lg ${
              input.status === "parsed" || input.status === "verified"
                ? "bg-green-500/10"
                : input.status === "needs_mapping"
                ? "bg-amber-500/10"
                : input.status === "received"
                ? "bg-blue-500/10"
                : "bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{input.icon}</span>
              <span className="text-sm">{input.description || input.category}</span>
            </div>
            <div className="flex items-center gap-2">
              {input.required && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  REQ
                </span>
              )}
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  input.status === "parsed" || input.status === "verified"
                    ? "bg-green-500/20 text-green-400"
                    : input.status === "needs_mapping"
                    ? "bg-amber-500/20 text-amber-400"
                    : input.status === "received"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-gray-500/20 text-gray-400"
                }`}
              >
                {input.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10">
        <div
          className={`text-sm flex items-center gap-2 ${
            canFinalize ? "text-green-400" : "text-amber-400"
          }`}
        >
          {canFinalize ? Icons.checkCircle : Icons.alert}
          {canFinalize ? "Ready to finalize" : "Missing required inputs"}
        </div>
      </div>
    </div>
  );
}

function FileCard({
  file,
  onViewDetails,
  onOverride,
}: {
  file: IntakeFile;
  onViewDetails: () => void;
  onOverride: () => void;
}) {
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{DOMAIN_ICONS[file.classification_domain]}</span>
          <div>
            <p className="font-medium truncate max-w-[200px]">{file.original_filename}</p>
            <p className="text-xs text-gray-400">
              {DOMAIN_LABELS[file.classification_domain]}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[file.status]}`}>
          {file.status}
        </span>
      </div>

      {/* Confidence indicator */}
      {file.classification_confidence > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Confidence</span>
            <span>{Math.round(file.classification_confidence * 100)}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                file.classification_confidence >= 0.8
                  ? "bg-green-500"
                  : file.classification_confidence >= 0.5
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${file.classification_confidence * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Parse summary */}
      {file.parse_summary && (
        <div className="text-xs text-gray-400 mb-3">
          {file.parse_summary.rows_parsed} rows • {file.parse_summary.rows_inserted} inserted
          {file.parse_summary.errors?.length > 0 && (
            <span className="text-red-400 ml-2">
              {file.parse_summary.errors.length} errors
            </span>
          )}
        </div>
      )}

      {/* Parse error */}
      {file.parse_error && (
        <div className="text-xs text-red-400 mb-3 p-2 bg-red-500/10 rounded">
          {file.parse_error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          {Icons.eye}
          Details
        </button>
        <button
          onClick={onOverride}
          className="flex-1 text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          {Icons.settings}
          Reclassify
        </button>
      </div>
    </div>
  );
}

function FileDetailsModal({
  file,
  mappings,
  onClose,
  onResolveMapping,
}: {
  file: IntakeFile;
  mappings: IntakeMapping[];
  onClose: () => void;
  onResolveMapping: (mappingId: string, resolution: Record<string, unknown>) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold">{file.original_filename}</h2>
            <p className="text-sm text-gray-400">
              {DOMAIN_LABELS[file.classification_domain]} • {file.status}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {Icons.x}
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Classification info */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Classification</h3>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Domain:</span>
                  <p>{DOMAIN_LABELS[file.classification_domain]}</p>
                </div>
                <div>
                  <span className="text-gray-500">Confidence:</span>
                  <p>{Math.round(file.classification_confidence * 100)}%</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Reason:</span>
                  <p>{file.classification_reason}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview data */}
          {file.preview_data && file.preview_data.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                Data Preview ({file.header_row?.length || 0} columns)
              </h3>
              <div className="bg-white/5 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      {file.header_row?.map((col, i) => (
                        <th key={i} className="px-3 py-2 text-left text-gray-400 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {file.preview_data.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-white/5">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 truncate max-w-[150px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mappings */}
          {mappings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                Mapping Tasks ({mappings.filter((m) => m.status === "open").length} open)
              </h3>
              <div className="space-y-3">
                {mappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className={`bg-white/5 rounded-lg p-4 ${
                      mapping.status === "open" ? "border border-amber-500/30" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-medium">{mapping.prompt}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          mapping.status === "open"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {mapping.status}
                      </span>
                    </div>
                    {mapping.status === "open" && mapping.options && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-400 mb-2">Select an option:</p>
                        <div className="flex flex-wrap gap-2">
                          {mapping.options.slice(0, 10).map((option, i) => (
                            <button
                              key={i}
                              onClick={() =>
                                onResolveMapping(mapping.id, { selected: option })
                              }
                              className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassificationOverrideModal({
  file,
  onClose,
  onOverride,
}: {
  file: IntakeFile;
  onClose: () => void;
  onOverride: (domain: ClassificationDomain, reason: string) => void;
}) {
  const [selectedDomain, setSelectedDomain] = useState<ClassificationDomain>(
    file.classification_domain
  );
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">Reclassify File</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {Icons.x}
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-400 mb-4">{file.original_filename}</p>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Data Domain</label>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value as ClassificationDomain)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Reason for override *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 h-24 resize-none"
              placeholder="Explain why this classification is correct..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (reason.trim()) {
                  onOverride(selectedDomain, reason);
                }
              }}
              disabled={!reason.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function IntakeInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, profile, isLoading: authLoading } = useAuth();

  const clientIdParam = searchParams.get("client_id");
  const sessionIdParam = searchParams.get("session_id");

  // State
  const [selectedClientId, setSelectedClientId] = useState<string>(clientIdParam || "");
  const [sessionId, setSessionId] = useState<string>(sessionIdParam || "");
  const [selectedFile, setSelectedFile] = useState<IntakeFile | null>(null);
  const [overrideFile, setOverrideFile] = useState<IntakeFile | null>(null);

  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const result = await getClientCompanies(profile.organization_id);
      return result || [];
    },
    enabled: !!profile?.organization_id,
  });

  const clients = clientsData || [];

  // Find or create session when client selected
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["intake-session", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const result = await getIntakeSession(selectedClientId);
      return result.session;
    },
    enabled: !!selectedClientId,
  });

  // Auto-set session ID
  useEffect(() => {
    if (sessionData?.id && !sessionId) {
      setSessionId(sessionData.id);
    }
  }, [sessionData, sessionId]);

  // Fetch session details
  const { data: sessionDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["intake-session-detail", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const result = await getIntakeSessionDetail(sessionId);
      return result;
    },
    enabled: !!sessionId,
  });

  // Fetch files
  const { data: filesData, refetch: refetchFiles } = useQuery({
    queryKey: ["intake-files", sessionId],
    queryFn: async () => {
      if (!sessionId) return { files: [] };
      return listSessionFiles(sessionId);
    },
    enabled: !!sessionId,
  });

  const files = filesData?.files || [];

  // Fetch missing inputs
  const { data: missingInputsData, refetch: refetchMissing } = useQuery({
    queryKey: ["missing-inputs", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      return getMissingInputs(sessionId);
    },
    enabled: !!sessionId,
  });

  // Fetch file mappings
  const { data: mappingsData } = useQuery({
    queryKey: ["file-mappings", selectedFile?.id],
    queryFn: async () => {
      if (!selectedFile?.id) return { mappings: [] };
      return getFileMappings(selectedFile.id);
    },
    enabled: !!selectedFile?.id,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (uploadFiles: File[]) => {
      if (!sessionId) throw new Error("No session");
      return uploadIntakeFiles(sessionId, uploadFiles);
    },
    onSuccess: () => {
      refetchFiles();
      refetchDetail();
      refetchMissing();
    },
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session");
      return processIntakeSession(sessionId);
    },
    onSuccess: () => {
      refetchFiles();
      refetchDetail();
      refetchMissing();
    },
  });

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: async ({
      fileId,
      domain,
      reason,
    }: {
      fileId: string;
      domain: ClassificationDomain;
      reason: string;
    }) => {
      return overrideClassification(fileId, domain, reason);
    },
    onSuccess: () => {
      setOverrideFile(null);
      refetchFiles();
    },
  });

  // Resolve mapping mutation
  const resolveMappingMutation = useMutation({
    mutationFn: async ({
      mappingId,
      resolution,
    }: {
      mappingId: string;
      resolution: Record<string, unknown>;
    }) => {
      return resolveMapping(mappingId, resolution);
    },
    onSuccess: () => {
      refetchFiles();
      refetchMissing();
      queryClient.invalidateQueries({ queryKey: ["file-mappings"] });
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session");
      return finalizeIntakeSession(sessionId);
    },
    onSuccess: (data) => {
      if (data.success) {
        refetchDetail();
        refetchMissing();
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      }
    },
  });

  // Auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/portal/intake-inbox");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/portal")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              {Icons.arrowLeft}
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/20 rounded-lg">{Icons.inbox}</div>
              <div>
                <h1 className="text-xl font-semibold">Intake Inbox</h1>
                <p className="text-sm text-gray-400">
                  Upload, classify, and process client data
                </p>
              </div>
            </div>
          </div>
          {sessionDetail?.session?.status === "complete" && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg">
              {Icons.checkCircle}
              <span className="text-sm">Intake Complete</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Client Selector */}
        {!sessionId && (
          <div className="mb-8">
            <label className="block text-sm text-gray-400 mb-2">Select Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="">Choose a client...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {sessionId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main content area */}
            <div className="lg:col-span-2 space-y-8">
              {/* Upload area */}
              <FileDropzone
                onUpload={(f) => uploadMutation.mutate(f)}
                isUploading={uploadMutation.isPending}
              />

              {/* Action bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">
                    {files.length} files uploaded
                  </span>
                  {sessionDetail?.open_mappings_count ? (
                    <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                      {sessionDetail.open_mappings_count} mappings pending
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => processMutation.mutate()}
                    disabled={processMutation.isPending || files.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {processMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      Icons.play
                    )}
                    Process Files
                  </button>
                  <button
                    onClick={() => finalizeMutation.mutate()}
                    disabled={
                      finalizeMutation.isPending ||
                      !missingInputsData?.can_finalize ||
                      sessionDetail?.session?.status === "complete"
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {finalizeMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      Icons.checkCircle
                    )}
                    Finalize Intake
                  </button>
                </div>
              </div>

              {/* Files grid */}
              {files.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {files.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onViewDetails={() => setSelectedFile(file)}
                      onOverride={() => setOverrideFile(file)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p>No files uploaded yet.</p>
                  <p className="text-sm mt-1">
                    Drop files above or click to upload.
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Session info */}
              <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
                <h3 className="font-medium mb-3">Session Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span className="capitalize">
                      {sessionDetail?.session?.status || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Files</span>
                    <span>{files.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tax Years</span>
                    <span>
                      {sessionDetail?.session?.tax_years?.join(", ") || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expected inputs checklist */}
              {missingInputsData && (
                <ExpectedInputsChecklist
                  inputs={missingInputsData.inputs}
                  canFinalize={missingInputsData.can_finalize}
                />
              )}

              {/* Finalize blockers */}
              {finalizeMutation.data && !finalizeMutation.data.success && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <h3 className="font-medium text-red-400 mb-2">
                    Cannot Finalize
                  </h3>
                  <ul className="text-sm space-y-1">
                    {finalizeMutation.data.blockers?.map((blocker, i) => (
                      <li key={i} className="text-gray-300">
                        • {blocker.type}: {blocker.category || blocker.count}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Success message */}
              {finalizeMutation.data?.success && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                  <h3 className="font-medium text-green-400 mb-2">
                    Intake Finalized!
                  </h3>
                  <div className="text-sm space-y-1">
                    {Object.entries(finalizeMutation.data.record_counts || {}).map(
                      ([key, count]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-400 capitalize">{key}</span>
                          <span>{count}</span>
                        </div>
                      )
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-3">
                    Next: {finalizeMutation.data.next_action}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* File details modal */}
      {selectedFile && (
        <FileDetailsModal
          file={selectedFile}
          mappings={mappingsData?.mappings || []}
          onClose={() => setSelectedFile(null)}
          onResolveMapping={(mappingId, resolution) =>
            resolveMappingMutation.mutate({ mappingId, resolution })
          }
        />
      )}

      {/* Classification override modal */}
      {overrideFile && (
        <ClassificationOverrideModal
          file={overrideFile}
          onClose={() => setOverrideFile(null)}
          onOverride={(domain, reason) =>
            overrideMutation.mutate({
              fileId: overrideFile.id,
              domain,
              reason,
            })
          }
        />
      )}
    </div>
  );
}

export default function IntakeInboxPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <IntakeInboxContent />
    </Suspense>
  );
}
