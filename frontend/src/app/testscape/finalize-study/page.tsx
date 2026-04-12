"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { 
  getStudyReadiness, 
  finalizeStudy, 
  listStudies, 
  completeStudy,
  type ReadinessResponse,
  type Study 
} from '@/lib/study-packaging';

export default function FinalizeStudyPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const { isExecutive } = useAuth();
  
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  
  // Fetch readiness
  const { data: readinessData, isLoading: readinessLoading } = useQuery({
    queryKey: ['study-readiness', clientId, taxYear],
    queryFn: () => getStudyReadiness(clientId!, parseInt(taxYear)),
    enabled: !!clientId,
  });
  
  // Fetch current study status via listStudies
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['study-status', clientId, taxYear],
    queryFn: async () => {
      const result = await listStudies(clientId!, parseInt(taxYear));
      // Return the most recent study or null
      return result.studies.length > 0 ? result.studies[0] : null;
    },
    enabled: !!clientId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'finalizing' ? 3000 : false;
    },
  });
  
  const readiness: ReadinessResponse | null = readinessData || null;
  const studyStatus: Study | null = statusData || null;
  
  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: (data: { allowOverrides: boolean; overrideReasons: Record<string, string> }) => 
      finalizeStudy({
        client_company_id: clientId!,
        tax_year: parseInt(taxYear),
        allow_overrides: data.allowOverrides,
        override_reasons: Object.values(data.overrideReasons),
      }),
    onSuccess: () => {
      refetchStatus();
      setShowOverrideModal(false);
    },
  });
  
  // Complete mutation
  const completeMutation = useMutation({
    mutationFn: () => completeStudy(studyStatus!.study_id!),
    onSuccess: () => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
          <PackageIcon className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to finalize their study.</p>
      </div>
    );
  }
  
  if (readinessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const hasBlockers = readiness?.blocking_count && readiness.blocking_count > 0;
  const isReady = !hasBlockers;
  const isStudyComplete = studyStatus?.status === 'complete';
  const isStudyFinalizing = studyStatus?.status === 'finalizing';
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Finalize Study</h1>
        <p className="text-gray-400">Generate final deliverables and complete the R&D tax credit study</p>
      </div>
      
      {/* Status Banner */}
      {isStudyComplete ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircleIcon className="w-6 h-6 text-green-400" />
            <p className="text-green-400 font-semibold text-lg">Study Complete</p>
          </div>
          <p className="text-gray-400 mb-4">
            Version {studyStatus?.study_version} has been finalized and locked.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {studyStatus?.artifacts?.map((artifact) => (
              <a
                key={artifact.artifact_type}
                href={artifact.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <DownloadIcon className="w-5 h-5 text-green-400" />
                <span className="text-sm text-white truncate">
                  {artifact.artifact_type.replace(/_/g, ' ')}
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : isStudyFinalizing ? (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 font-semibold text-lg">Generating Artifacts...</p>
          </div>
          <p className="text-gray-400">
            This may take a few minutes. Do not close this page.
          </p>
        </div>
      ) : null}
      
      {/* Readiness Checklist */}
      {!isStudyComplete && (
        <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <p className="font-semibold text-white">Readiness Checklist</p>
            {isReady ? (
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
                Ready to Finalize
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm rounded-full">
                {readiness?.blocking_count} Blocker(s)
              </span>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {readiness?.checks?.map((check) => (
              <div key={check.check_id} className="px-4 py-3 flex items-start gap-3">
                {check.status === 'pass' ? (
                  <CheckIcon className="w-5 h-5 text-green-400 mt-0.5" />
                ) : check.blocking ? (
                  <XIcon className="w-5 h-5 text-red-400 mt-0.5" />
                ) : (
                  <AlertIcon className="w-5 h-5 text-yellow-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    check.status === 'pass' ? 'text-white' : 
                    check.blocking ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {check.message}
                  </p>
                  {check.remediation && check.status !== 'pass' && (
                    <p className="text-sm text-gray-400 mt-1">
                      {check.remediation}
                    </p>
                  )}
                </div>
                {check.link && (
                  <Link
                    href={check.link}
                    className="px-3 py-1 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Fix →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Actions */}
      {!isStudyComplete && !isStudyFinalizing && (
        <div className="flex gap-4">
          {isReady ? (
            <button
              onClick={() => finalizeMutation.mutate({ allowOverrides: false, overrideReasons: {} })}
              disabled={!isExecutive || finalizeMutation.isPending}
              className="flex-1 py-4 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {finalizeMutation.isPending ? 'Starting...' : 'Finalize Study'}
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowOverrideModal(true)}
                disabled={!isExecutive}
                className="flex-1 py-4 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-xl font-semibold hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Finalize with Override (Senior Only)
              </button>
            </>
          )}
        </div>
      )}
      
      {/* Complete Study Button */}
      {studyStatus?.status === 'final' && (
        <button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="w-full py-4 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 disabled:opacity-50"
        >
          {completeMutation.isPending ? 'Completing...' : 'Mark Study Complete'}
        </button>
      )}
      
      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Override Blockers</h3>
            <p className="text-gray-400 mb-4">
              You are proceeding with {readiness?.blocking_count} unresolved blocker(s). 
              Please provide a reason for each override:
            </p>
            <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
              {readiness?.checks?.filter(c => c.blocking && c.status !== 'pass').map((check) => (
                <div key={check.check_id}>
                  <p className="text-sm text-red-400 mb-1">{check.message}</p>
                  <input
                    type="text"
                    placeholder="Reason for override..."
                    value={overrideReasons[check.check_id] || ''}
                    onChange={(e) => setOverrideReasons(prev => ({
                      ...prev,
                      [check.check_id]: e.target.value
                    }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => finalizeMutation.mutate({ allowOverrides: true, overrideReasons })}
                disabled={finalizeMutation.isPending}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? 'Starting...' : 'Proceed with Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" x2="12" y1="22" y2="12" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}
