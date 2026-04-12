"use client";

import React, { useState, useRef } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  listEvidenceRequests, 
  createEvidenceRequest, 
  uploadEvidenceFiles,
  type EvidenceRequest 
} from '@/lib/evidence';

export default function EvidencePage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EvidenceRequest | null>(null);
  const [newRequest, setNewRequest] = useState({
    description: '',
    entity_type: 'project',
    entity_id: '',
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch evidence requests
  const { data: requestsData, isLoading, refetch } = useQuery({
    queryKey: ['evidence-requests', clientId],
    queryFn: () => listEvidenceRequests({
      client_id: clientId || undefined,
    }),
    enabled: !!clientId,
  });
  
  const requests = requestsData?.requests || [];
  
  // Create request mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof newRequest) => createEvidenceRequest({
      client_company_id: clientId!,
      tax_year: parseInt(taxYear),
      reason: data.description,
      request_type: (data.entity_type === 'project' ? 'project_narrative_support' : 'other') as any,
    }),
    onSuccess: () => {
      refetch();
      setShowCreateModal(false);
      setNewRequest({ description: '', entity_type: 'project', entity_id: '' });
    },
  });
  
  // Handle file upload
  const handleUpload = async (requestId: string, files: FileList) => {
    setUploading(true);
    try {
      await uploadEvidenceFiles(requestId, Array.from(files));
      refetch();
    } finally {
      setUploading(false);
    }
  };
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-4">
          <FileIcon className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to manage evidence.</p>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const pendingRequests = requests.filter((r: EvidenceRequest) => r.status === 'sent' || r.status === 'awaiting_upload').length;
  const completedRequests = requests.filter((r: EvidenceRequest) => r.status === 'completed' || r.status === 'received').length;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Evidence Center</h1>
          <p className="text-gray-400">Request and manage supporting documentation</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
        >
          <PlusIcon />
          New Request
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Requests</p>
          <p className="text-2xl font-bold text-white">{requests.length}</p>
        </div>
        <div className="bg-[#12121a] border border-yellow-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{pendingRequests}</p>
        </div>
        <div className="bg-[#12121a] border border-green-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-400">{completedRequests}</p>
        </div>
      </div>
      
      {/* Requests List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <FileIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No evidence requests yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Create First Request
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {requests.map((request: EvidenceRequest) => (
              <div
                key={request.id}
                className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        request.status === 'completed' || request.status === 'received' 
                          ? 'bg-green-500/20 text-green-400' 
                          : request.status === 'sent' || request.status === 'awaiting_upload'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-white/10 text-white'
                      }`}>
                        {request.status.replace(/_/g, ' ')}
                      </span>
                       <span className="text-xs text-gray-500">
                         {request.request_type.replace(/_/g, ' ')}
                       </span>
                     </div>
                     <p className="text-white font-medium">{request.reason}</p>
                     {request.files_count !== undefined && (
                       <p className="text-sm text-gray-400 mt-1">
                         {request.files_count} file(s) uploaded
                       </p>
                     )}
                  </div>
                  <ChevronRightIcon />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Create Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">New Evidence Request</h3>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newRequest); }} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Description *</label>
                <textarea
                  value={newRequest.description}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                  placeholder="Describe the evidence needed..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Entity Type</label>
                <select
                  value={newRequest.entity_type}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, entity_type: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                >
                  <option value="project">Project</option>
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                  <option value="expense">Expense</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newRequest.description}
                  className="flex-1 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-start justify-between mb-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                selectedRequest.status === 'completed' || selectedRequest.status === 'received' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {selectedRequest.status.replace(/_/g, ' ')}
              </span>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-gray-400 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            
            <h3 className="text-lg font-semibold text-white mb-2">{selectedRequest.reason}</h3>
            <p className="text-sm text-gray-400 mb-4">
              Type: {selectedRequest.request_type.replace(/_/g, ' ')}
            </p>
            
            {/* Upload Section */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-sm text-gray-400 mb-3">Upload Evidence</p>
              <div 
                className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => e.target.files && handleUpload(selectedRequest.id, e.target.files)}
                  className="hidden"
                />
                <UploadIcon className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                <p className="text-sm text-gray-400">
                  {uploading ? 'Uploading...' : 'Click to upload files'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
