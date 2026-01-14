'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import {
  listEvidenceRequests,
  getEvidenceRequest,
  createEvidenceRequest,
  markRequestSent,
  completeEvidenceRequest,
  uploadEvidenceFiles,
  linkEvidenceFile,
  revokeUploadToken,
  regenerateUploadToken,
  runReprocessingJob,
  listReprocessingJobs,
  EvidenceRequest,
  EvidenceRequestDetail,
  EvidenceFile,
  EvidenceRequestType,
  ReprocessingJob,
  getRequestTypeLabel,
  getStatusBadgeColor,
  formatFileSize,
} from '@/lib/evidence';

// ============================================================================
// Page Component
// ============================================================================

export default function EvidenceCenterPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const clientId = profile?.selected_client_id;

  // Fetch requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['evidence-requests', clientId, statusFilter],
    queryFn: () =>
      listEvidenceRequests({
        client_id: clientId,
        status: statusFilter as any || undefined,
      }),
    enabled: !!clientId,
  });

  const requests = requestsData?.requests || [];

  // Fetch reprocessing jobs
  const { data: jobsData } = useQuery({
    queryKey: ['reprocessing-jobs', clientId],
    queryFn: () => listReprocessingJobs({ client_id: clientId, limit: 10 }),
    enabled: !!clientId,
  });

  const recentJobs = jobsData?.jobs || [];
  const runningJobs = recentJobs.filter((j) => j.status === 'running' || j.status === 'queued');

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Evidence Center</h1>
            <p className="text-zinc-400 mt-1">
              Request and manage supporting documentation from clients
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Evidence Request
          </button>
        </div>

        {/* Running Jobs Banner */}
        {runningJobs.length > 0 && (
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent" />
            <span className="text-blue-200">
              {runningJobs.length} reprocessing job{runningJobs.length > 1 ? 's' : ''} running...
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StatCard
            label="Total Requests"
            value={requests.length}
            color="zinc"
          />
          <StatCard
            label="Awaiting Upload"
            value={requests.filter((r) => r.status === 'awaiting_upload').length}
            color="yellow"
          />
          <StatCard
            label="Received"
            value={requests.filter((r) => r.status === 'received' || r.status === 'partially_received').length}
            color="blue"
          />
          <StatCard
            label="Completed"
            value={requests.filter((r) => r.status === 'completed').length}
            color="green"
          />
          <StatCard
            label="Files Uploaded"
            value={requests.reduce((acc, r) => acc + (r.files_count || 0), 0)}
            color="purple"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="awaiting_upload">Awaiting Upload</option>
            <option value="partially_received">Partially Received</option>
            <option value="received">Received</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-2 gap-6">
          {/* Requests List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-300">Evidence Requests</h2>
            
            {isLoading ? (
              <div className="text-center py-12 text-zinc-500">Loading...</div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900 rounded-xl border border-zinc-800">
                <svg className="w-12 h-12 mx-auto text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-zinc-400">No evidence requests yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 text-emerald-400 hover:text-emerald-300"
                >
                  Create your first request →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    isSelected={selectedRequestId === request.id}
                    onClick={() => setSelectedRequestId(request.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Request Detail */}
          <div>
            {selectedRequestId ? (
              <RequestDetailPanel
                requestId={selectedRequestId}
                onClose={() => setSelectedRequestId(null)}
              />
            ) : (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <svg className="w-16 h-16 mx-auto text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-zinc-500">Select a request to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <CreateRequestModal
            clientId={clientId!}
            onClose={() => setShowCreateModal(false)}
            onCreated={(id) => {
              setShowCreateModal(false);
              setSelectedRequestId(id);
              queryClient.invalidateQueries({ queryKey: ['evidence-requests'] });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    zinc: 'bg-zinc-800 border-zinc-700',
    yellow: 'bg-yellow-900/30 border-yellow-500/30',
    blue: 'bg-blue-900/30 border-blue-500/30',
    green: 'bg-emerald-900/30 border-emerald-500/30',
    purple: 'bg-purple-900/30 border-purple-500/30',
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}

function RequestCard({
  request,
  isSelected,
  onClick,
}: {
  request: EvidenceRequest;
  isSelected: boolean;
  onClick: () => void;
}) {
  const dueDate = request.due_date
    ? new Date(request.due_date).toLocaleDateString()
    : null;
  const isOverdue = request.due_date && new Date(request.due_date) < new Date() && 
    !['completed', 'cancelled'].includes(request.status);

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-zinc-800 border-emerald-500'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-white line-clamp-1">{request.title}</h3>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(request.status)}`}>
          {request.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="px-2 py-0.5 bg-zinc-800 rounded">
          {getRequestTypeLabel(request.request_type)}
        </span>
        {request.files_count !== undefined && (
          <span>{request.files_count} file{request.files_count !== 1 ? 's' : ''}</span>
        )}
        {dueDate && (
          <span className={isOverdue ? 'text-red-400' : ''}>
            Due: {dueDate}
          </span>
        )}
      </div>
    </div>
  );
}

function RequestDetailPanel({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'email' | 'jobs'>('details');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [linkingFileId, setLinkingFileId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['evidence-request', requestId],
    queryFn: () => getEvidenceRequest(requestId),
  });

  const markSentMutation = useMutation({
    mutationFn: () => markRequestSent(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['evidence-requests'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => completeEvidenceRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['evidence-requests'] });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: () => revokeUploadToken(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-request', requestId] });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: () => regenerateUploadToken(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-request', requestId] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent mx-auto" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center text-red-400">
        Failed to load request details
      </div>
    );
  }

  const { request, files, authority_details, linked_findings, reprocessing_jobs, token_info } = data;

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{request.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(request.status)}`}>
                {request.status.replace(/_/g, ' ')}
              </span>
              <span className="text-sm text-zinc-500">
                {getRequestTypeLabel(request.request_type)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {(['details', 'files', 'email', 'jobs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            {tab}
            {tab === 'files' && files.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-zinc-700 rounded text-xs">
                {files.length}
              </span>
            )}
            {tab === 'jobs' && reprocessing_jobs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-zinc-700 rounded text-xs">
                {reprocessing_jobs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Reason */}
            <div>
              <h4 className="text-sm font-medium text-zinc-400 mb-1">Reason</h4>
              <p className="text-sm text-white">{request.reason}</p>
            </div>

            {/* Due Date */}
            {request.due_date && (
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-1">Due Date</h4>
                <p className="text-sm text-white">
                  {new Date(request.due_date).toLocaleDateString()}
                </p>
              </div>
            )}

            {/* Requested Items */}
            <div>
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Requested Items</h4>
              <div className="space-y-2">
                {request.requested_items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{item.label}</span>
                      {item.required && (
                        <span className="text-xs text-red-400">Required</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{item.description}</p>
                    <div className="text-xs text-zinc-500 mt-1">
                      Formats: {item.accepted_formats.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Authority References */}
            {authority_details.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Authority References</h4>
                <div className="space-y-2">
                  {authority_details.map((auth) => (
                    <div key={auth.id} className="p-3 bg-zinc-800 rounded-lg">
                      <div className="font-medium text-emerald-400">{auth.citation_label}</div>
                      <p className="text-sm text-zinc-400 mt-1">{auth.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Findings */}
            {linked_findings.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Linked Findings</h4>
                <div className="space-y-2">
                  {linked_findings.map((finding) => (
                    <div key={finding.id} className="p-3 bg-zinc-800 rounded-lg flex items-center justify-between">
                      <span className="text-white">{finding.title}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        finding.severity === 'high' ? 'bg-red-900/50 text-red-300' :
                        finding.severity === 'medium' ? 'bg-yellow-900/50 text-yellow-300' :
                        'bg-green-900/50 text-green-300'
                      }`}>
                        {finding.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Token Info */}
            {token_info && (
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Upload Token</h4>
                <div className="p-3 bg-zinc-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={token_info.revoked_at ? 'text-red-400' : 'text-green-400'}>
                        {token_info.revoked_at ? 'Revoked' : 'Active'}
                      </span>
                      <span className="text-zinc-500 ml-2">
                        Expires: {new Date(token_info.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {!token_info.revoked_at && (
                        <button
                          onClick={() => revokeTokenMutation.mutate()}
                          disabled={revokeTokenMutation.isPending}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => regenerateTokenMutation.mutate()}
                        disabled={regenerateTokenMutation.isPending}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        {regenerateTokenMutation.isPending ? 'Generating...' : 'New Token'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium text-zinc-400">Uploaded Files</h4>
              <button
                onClick={() => setShowUploadModal(true)}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                + Upload Files
              </button>
            </div>

            {files.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No files uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="p-3 bg-zinc-800 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-white">{file.original_filename}</div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {file.mime_type} • {formatFileSize(file.file_size_bytes || 0)}
                          <span className="mx-2">•</span>
                          {file.uploaded_via === 'client_link' ? 'Client upload' : 'Portal upload'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          file.status === 'linked' ? 'bg-emerald-900/50 text-emerald-300' :
                          file.status === 'processed' ? 'bg-blue-900/50 text-blue-300' :
                          file.status === 'rejected' ? 'bg-red-900/50 text-red-300' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {file.status}
                        </span>
                        {file.status === 'uploaded' && (
                          <button
                            onClick={() => setLinkingFileId(file.id)}
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                          >
                            Link
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'email' && (
          <div className="space-y-4">
            {request.email_draft ? (
              <>
                <div className="p-4 bg-zinc-800 rounded-lg">
                  <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">
                    {request.email_draft}
                  </pre>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => navigator.clipboard.writeText(request.email_draft || '')}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                  {request.status === 'draft' && (
                    <button
                      onClick={() => markSentMutation.mutate()}
                      disabled={markSentMutation.isPending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {markSentMutation.isPending ? 'Marking...' : 'Mark as Sent'}
                    </button>
                  )}
                </div>
                {request.email_sent_at && (
                  <p className="text-sm text-zinc-500">
                    Sent on: {new Date(request.email_sent_at).toLocaleString()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-zinc-500">No email draft available</p>
            )}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-zinc-400">Reprocessing Jobs</h4>
            {reprocessing_jobs.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No reprocessing jobs</p>
            ) : (
              <div className="space-y-2">
                {reprocessing_jobs.map((job) => (
                  <ReprocessingJobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!['completed', 'cancelled'].includes(request.status) && (
        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
          >
            Upload Files
          </button>
          {files.length > 0 && (
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {completeMutation.isPending ? 'Completing...' : 'Complete Request'}
            </button>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          requestId={requestId}
          requestedItems={request.requested_items}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Link Modal */}
      {linkingFileId && (
        <LinkFileModal
          fileId={linkingFileId}
          linkedFindings={linked_findings}
          onClose={() => setLinkingFileId(null)}
        />
      )}
    </div>
  );
}

function ReprocessingJobCard({ job }: { job: ReprocessingJob }) {
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: () => runReprocessingJob(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reprocessing-jobs'] });
    },
  });

  return (
    <div className="p-3 bg-zinc-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <span className={`px-2 py-0.5 rounded text-xs ${
            job.status === 'completed' ? 'bg-emerald-900/50 text-emerald-300' :
            job.status === 'running' ? 'bg-blue-900/50 text-blue-300' :
            job.status === 'failed' ? 'bg-red-900/50 text-red-300' :
            'bg-yellow-900/50 text-yellow-300'
          }`}>
            {job.status}
          </span>
          <span className="text-zinc-500 text-sm ml-2">
            {job.target} • {new Date(job.created_at).toLocaleString()}
          </span>
        </div>
        {job.status === 'failed' && (
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            {retryMutation.isPending ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      {job.job_summary && (
        <div className="mt-2 text-xs text-zinc-400">
          {job.job_summary.rules_run !== undefined && (
            <span className="mr-3">Rules: {job.job_summary.rules_run}</span>
          )}
          {job.job_summary.findings_updated !== undefined && (
            <span className="mr-3">Updated: {job.job_summary.findings_updated}</span>
          )}
          {job.job_summary.findings_auto_resolved !== undefined && (
            <span>Auto-resolved: {job.job_summary.findings_auto_resolved}</span>
          )}
        </div>
      )}
      {job.error && (
        <div className="mt-2 text-xs text-red-400">{job.error}</div>
      )}
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================

function CreateRequestModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [requestType, setRequestType] = useState<EvidenceRequestType>('vendor_contract');
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await createEvidenceRequest({
        client_company_id: clientId,
        request_type: requestType,
        reason: reason.trim(),
        title: title.trim() || undefined,
      });
      onCreated(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg">New Evidence Request</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Request Type</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as EvidenceRequestType)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
            >
              <option value="vendor_contract">Vendor Contract</option>
              <option value="timesheets_support">Timesheet Support</option>
              <option value="wage_support">Wage Documentation</option>
              <option value="project_narrative_support">Project Documentation</option>
              <option value="foreign_research_support">Foreign Research Support</option>
              <option value="supply_consumption_support">Supply Consumption</option>
              <option value="section_174_support">Section 174 Support</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Title (Optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Custom title (uses default if empty)"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need this documentation?"
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadModal({
  requestId,
  requestedItems,
  onClose,
}: {
  requestId: string;
  requestedItems: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [matchedItemKey, setMatchedItemKey] = useState('');
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      await uploadEvidenceFiles(requestId, files, matchedItemKey || undefined, notes || undefined);
      queryClient.invalidateQueries({ queryKey: ['evidence-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['evidence-requests'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg">Upload Evidence Files</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-600 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <svg className="w-12 h-12 mx-auto text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-zinc-400">
              Drag files here or <span className="text-emerald-400">browse</span>
            </p>
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-zinc-800 rounded-lg">
                  <span className="text-sm truncate">{file.name}</span>
                  <button
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 ml-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Matched Item */}
          {requestedItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Link to Requested Item</label>
              <select
                value={matchedItemKey}
                onChange={(e) => setMatchedItemKey(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
              >
                <option value="">Select item (optional)</option>
                {requestedItems.map((item) => (
                  <option key={item.item_key} value={item.item_key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about these files..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isUploading || files.length === 0}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkFileModal({
  fileId,
  linkedFindings,
  onClose,
}: {
  fileId: string;
  linkedFindings: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [findingId, setFindingId] = useState('');
  const [notes, setNotes] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setIsLinking(true);
    setError('');

    try {
      await linkEvidenceFile(fileId, {
        review_finding_id: findingId || undefined,
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['evidence-request'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to link file');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-md">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold">Link Evidence File</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {linkedFindings.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Link to Finding</label>
              <select
                value={findingId}
                onChange={(e) => setFindingId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
              >
                <option value="">Select finding...</option>
                {linkedFindings.map((finding) => (
                  <option key={finding.id} value={finding.id}>
                    {finding.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No findings linked to this request</p>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes about this linkage..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLinking}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLinking ? 'Linking...' : 'Link File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
