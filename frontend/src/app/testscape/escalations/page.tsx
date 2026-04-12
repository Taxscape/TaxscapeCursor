"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { 
  listEscalationQueue, 
  resolveEscalation, 
  type EscalationRequest,
  getStatusColor,
  getStatusLabel,
  formatCurrency,
} from '@/lib/escalation';

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-500/20 text-red-400',
    medium: 'bg-amber-500/20 text-amber-400',
    low: 'bg-blue-500/20 text-blue-400',
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[severity] || colors.medium}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(status as any)}`}>
      {getStatusLabel(status as any)}
    </span>
  );
}

export default function EscalationsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const { isExecutive } = useAuth();
  
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEscalation, setSelectedEscalation] = useState<EscalationRequest | null>(null);
  const [resolution, setResolution] = useState({ decision: 'approve_junior_resolution', reason: '' });
  
  // Fetch escalations
  const { data: escalationsData, isLoading, refetch } = useQuery({
    queryKey: ['escalations', clientId, selectedStatus],
    queryFn: () => listEscalationQueue({
      client_id: clientId || undefined,
      status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
    }),
    enabled: !!clientId,
  });
  
  const escalations = escalationsData?.escalations || [];
  
  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: (data: { id: string; decision: string; reason: string }) =>
      resolveEscalation(data.id, data.decision as any, 'other', data.reason),
    onSuccess: () => {
      setSelectedEscalation(null);
      queryClient.invalidateQueries({ queryKey: ['escalations'] });
    },
  });

  // No client selected state
  if (!clientId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Client Selected</h2>
          <p className="text-gray-400">Select a client from the header to view escalations.</p>
        </div>
      </div>
    );
  }

  const pendingCount = escalations.filter((e: EscalationRequest) => e.status === 'queued' || e.status === 'assigned').length;
  const resolvedCount = escalations.filter((e: EscalationRequest) => e.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Escalations</h1>
        <p className="text-gray-400">Senior review queue for complex issues requiring expert judgment.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Total Escalations</p>
          <p className="text-2xl font-bold text-white">{escalations.length}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Pending Review</p>
          <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-400">{resolvedCount}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Access Level</p>
          <p className="text-lg font-semibold text-blue-400">{isExecutive ? 'Senior/Executive' : 'View Only'}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'queued', 'assigned', 'in_review', 'resolved'].map((status) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedStatus === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {status === 'all' ? 'All' : status.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {/* Escalations List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading escalations...</div>
        ) : escalations.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No escalations found.
          </div>
        ) : (
          escalations.map((escalation: EscalationRequest) => (
            <div
              key={escalation.id}
              className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 cursor-pointer transition-all"
              onClick={() => setSelectedEscalation(escalation)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={escalation.severity} />
                    <StatusBadge status={escalation.status} />
                  </div>
                  <h3 className="text-white font-medium">{escalation.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{escalation.summary}</p>
                </div>
                <div className="text-right">
                  {escalation.estimated_impact?.credit_at_risk && (
                    <p className="text-red-400 font-medium">
                      {formatCurrency(escalation.estimated_impact.credit_at_risk)} at risk
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{escalation.source_type.replace(/_/g, ' ')}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Escalation Detail Modal */}
      {selectedEscalation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={selectedEscalation.severity} />
                <StatusBadge status={selectedEscalation.status} />
              </div>
              <button
                onClick={() => setSelectedEscalation(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">{selectedEscalation.title}</h3>
            <p className="text-gray-400 mb-4">{selectedEscalation.summary}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-400">Source Type</p>
                <p className="text-white">{selectedEscalation.source_type.replace(/_/g, ' ')}</p>
              </div>
              {selectedEscalation.estimated_impact?.credit_at_risk && (
                <div>
                  <p className="text-sm text-gray-400">Credit at Risk</p>
                  <p className="text-red-400 font-semibold">
                    {formatCurrency(selectedEscalation.estimated_impact.credit_at_risk)}
                  </p>
                </div>
              )}
              {selectedEscalation.estimated_impact?.qre_at_risk && (
                <div>
                  <p className="text-sm text-gray-400">QRE at Risk</p>
                  <p className="text-orange-400 font-semibold">
                    {formatCurrency(selectedEscalation.estimated_impact.qre_at_risk)}
                  </p>
                </div>
              )}
            </div>

            {selectedEscalation.status !== 'resolved' && isExecutive && (
              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-semibold text-white mb-3">Resolve Escalation</h4>
                <select
                  value={resolution.decision}
                  onChange={(e) => setResolution({ ...resolution, decision: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-3"
                >
                  <option value="approve_junior_resolution">Approve Junior Resolution</option>
                  <option value="override_fields">Override Fields</option>
                  <option value="request_more_evidence">Request More Evidence</option>
                  <option value="return_guidance">Return with Guidance</option>
                  <option value="dismiss">Dismiss</option>
                </select>
                <textarea
                  value={resolution.reason}
                  onChange={(e) => setResolution({ ...resolution, reason: e.target.value })}
                  placeholder="Resolution reason..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-3"
                  rows={3}
                />
                <button
                  onClick={() => resolveMutation.mutate({
                    id: selectedEscalation.id,
                    decision: resolution.decision,
                    reason: resolution.reason,
                  })}
                  disabled={resolveMutation.isPending || !resolution.reason}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg px-4 py-2"
                >
                  {resolveMutation.isPending ? 'Resolving...' : 'Submit Resolution'}
                </button>
              </div>
            )}

            {selectedEscalation.status === 'resolved' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 font-medium">This escalation has been resolved.</p>
                {selectedEscalation.decision_note && (
                  <p className="text-gray-400 mt-2">{selectedEscalation.decision_note}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
