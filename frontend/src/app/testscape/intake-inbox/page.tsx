"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
import { useAuth } from "@/context/auth-context";
import {
  uploadIntakeFiles,
  getIntakeSessionDetail,
  listSessionFiles,
  processIntakeSession,
  finalizeIntakeSession,
  getMissingInputs,
  DOMAIN_LABELS,
  STATUS_COLORS,
  type IntakeFile,
  type MissingInputSummary,
} from "@/lib/intake-ingestion";
import { getIntakeSession } from "@/lib/intake";

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
  alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  refresh: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
};

const SESSION_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400',
  awaiting_client: 'bg-yellow-500/20 text-yellow-400',
  received_partial: 'bg-orange-500/20 text-orange-400',
  processing: 'bg-blue-500/20 text-blue-400',
  needs_mapping: 'bg-purple-500/20 text-purple-400',
  complete: 'bg-green-500/20 text-green-400',
};

// ============================================================================
// Main Component
// ============================================================================

export default function IntakeInboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId, taxYear } = useActiveContext();
  const { profile } = useAuth();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Fetch session
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["intake-session", clientId],
    queryFn: async () => {
      if (!clientId) return { session: null };
      return getIntakeSession(clientId);
    },
    enabled: !!clientId,
  });

  const session = sessionData?.session;

  // Fetch session detail
  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ["intake-session-detail", session?.id],
    queryFn: async () => {
      if (!session?.id) return null;
      return getIntakeSessionDetail(session.id);
    },
    enabled: !!session?.id,
  });

  // Fetch files
  const { data: filesData, refetch: refetchFiles } = useQuery({
    queryKey: ["intake-files", session?.id],
    queryFn: async () => {
      if (!session?.id) return { files: [] };
      return listSessionFiles(session.id);
    },
    enabled: !!session?.id,
  });

  const files = filesData?.files || [];

  // Fetch missing inputs
  const { data: missingData } = useQuery({
    queryKey: ["missing-inputs", session?.id],
    queryFn: async () => {
      if (!session?.id) return null;
      return getMissingInputs(session.id);
    },
    enabled: !!session?.id,
  });

  const missingSummary: MissingInputSummary[] = missingData?.inputs || [];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      if (!session?.id) throw new Error("No session");
      return uploadIntakeFiles(session.id, filesToUpload);
    },
    onSuccess: () => {
      refetchFiles();
      refetchDetail();
      setSelectedFiles([]);
    },
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!session?.id) throw new Error("No session");
      return processIntakeSession(session.id);
    },
    onSuccess: () => {
      refetchSession();
      refetchDetail();
      refetchFiles();
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!session?.id) throw new Error("No session");
      return finalizeIntakeSession(session.id);
    },
    onSuccess: () => {
      refetchSession();
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/testscape/review");
    },
  });

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  }, []);

  // Handle upload
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      await uploadMutation.mutateAsync(selectedFiles);
    } finally {
      setUploading(false);
    }
  };

  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          {Icons.file}
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their intake inbox.
        </p>
      </div>
    );
  }

  // No session yet
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center mb-4 text-yellow-400">
          {Icons.alert}
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No Intake Session</h2>
        <p className="text-gray-400 text-center max-w-md mb-6">
          Generate an intake package first to create a session for this client.
        </p>
        <button
          onClick={() => router.push("/testscape/intake")}
          className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600"
        >
          Create Intake Package
        </button>
      </div>
    );
  }

  // Group files by domain
  const filesByDomain: Record<string, IntakeFile[]> = {};
  files.forEach((file) => {
    const domain = file.classification_domain || "unclassified";
    if (!filesByDomain[domain]) filesByDomain[domain] = [];
    filesByDomain[domain].push(file);
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Intake Inbox</h1>
          <p className="text-gray-400">
            Process and validate uploaded client data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            SESSION_STATUS_COLORS[session.status] || 'bg-gray-500/20 text-gray-400'
          }`}>
            {session.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Files Uploaded</p>
          <p className="text-2xl font-bold text-white">{files.length}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Processed</p>
          <p className="text-2xl font-bold text-green-400">
            {files.filter(f => f.status === 'parsed').length}
          </p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">
            {files.filter(f => f.status === 'uploaded' || f.status === 'classifying' || f.status === 'parsing' || f.status === 'needs_mapping').length}
          </p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Errors</p>
          <p className="text-2xl font-bold text-red-400">
            {files.filter(f => f.status === 'failed').length}
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-4">Upload Files</h3>
        <div 
          className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-blue-500/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
          />
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4 text-blue-400">
            {Icons.upload}
          </div>
          <p className="text-white font-medium mb-1">
            {selectedFiles.length > 0 
              ? `${selectedFiles.length} file(s) selected`
              : 'Click to upload files'
            }
          </p>
          <p className="text-sm text-gray-500">
            Supported: Excel, CSV, PDF, Word documents
          </p>
        </div>
        {selectedFiles.length > 0 && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-4 w-full py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        )}
      </div>

      {/* Files by Domain */}
      {Object.keys(filesByDomain).length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-white">Uploaded Files</h3>
          {Object.entries(filesByDomain).map(([domain, domainFiles]) => (
            <div key={domain} className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <span className="font-medium text-white">
                   {(DOMAIN_LABELS as any)[domain] || domain}
                </span>
                <span className="text-sm text-gray-400">{domainFiles.length} file(s)</span>
              </div>
              <div className="divide-y divide-white/5">
                {domainFiles.map((file) => (
                  <div key={file.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">{Icons.file}</span>
                      <div>
                        <p className="text-white text-sm">{file.original_filename}</p>
                        <p className="text-xs text-gray-500">
                           {file.parse_summary?.rows_parsed ? `${file.parse_summary.rows_parsed} rows` : 'Processing...'}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      file.status === 'parsed' ? 'bg-green-500/20 text-green-400' :
                      file.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing Inputs */}
      {missingSummary.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
          <h3 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
            {Icons.alert}
            Missing Data ({missingSummary.filter(i => i.required).length} required)
          </h3>
          <p className="text-sm text-yellow-400/80 mb-4">
            The following data is still needed to complete the intake:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {missingSummary.map((item, idx) => (
              <div key={idx} className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-white">{item.category.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </div>
                {item.required && (
                  <span className="ml-auto px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded">REQ</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => processMutation.mutate()}
          disabled={processMutation.isPending || files.length === 0}
          className="flex-1 py-3 bg-white/5 text-white rounded-xl font-medium hover:bg-white/10 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {Icons.play}
          {processMutation.isPending ? 'Processing...' : 'Process Files'}
        </button>
        <button
          onClick={() => finalizeMutation.mutate()}
          disabled={finalizeMutation.isPending || session.status === 'complete' || session.status === 'processing'}
          className="flex-1 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {Icons.check}
          {finalizeMutation.isPending ? 'Finalizing...' : 'Finalize Intake'}
        </button>
      </div>
    </div>
  );
}
