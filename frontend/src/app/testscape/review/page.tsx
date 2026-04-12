"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listFindings, resolveFinding, dismissFinding, type ReviewFinding } from '@/lib/review';

export default function ReviewPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('open');
  const [selectedFinding, setSelectedFinding] = useState<ReviewFinding | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  
  // Fetch findings
  const { data: findingsData, isLoading, refetch } = useQuery({
    queryKey: ['review-findings', clientId, taxYear, selectedSeverity, selectedStatus],
    queryFn: () => listFindings(
      clientId!,
      parseInt(taxYear),
      {
        severity: selectedSeverity !== 'all' ? selectedSeverity as any : undefined,
        status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
      }
    ),
    enabled: !!clientId,
  });
  
  const findings = findingsData?.findings || [];
  
  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: (finding: ReviewFinding) => resolveFinding(finding.id, resolveNote),
    onSuccess: () => {
      refetch();
      setSelectedFinding(null);
      setResolveNote('');
    },
  });
  
  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: (finding: ReviewFinding) => dismissFinding(finding.id, resolveNote),
    onSuccess: () => {
      refetch();
      setSelectedFinding(null);
      setResolveNote('');
    },
  });
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
          <CheckIcon className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to review findings.</p>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const severityCounts = {
    high: findings.filter((f: ReviewFinding) => f.severity === 'high').length,
    medium: findings.filter((f: ReviewFinding) => f.severity === 'medium').length,
    low: findings.filter((f: ReviewFinding) => f.severity === 'low').length,
  };
  
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Review Findings</h1>
        <p className="text-gray-400">Review and resolve compliance findings for your study</p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Findings</p>
          <p className="text-2xl font-bold text-white">{findings.length}</p>
        </div>
        <div className="bg-[#12121a] border border-red-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">High Severity</p>
          <p className="text-2xl font-bold text-red-400">{severityCounts.high}</p>
        </div>
        <div className="bg-[#12121a] border border-yellow-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Medium</p>
          <p className="text-2xl font-bold text-yellow-400">{severityCounts.medium}</p>
        </div>
        <div className="bg-[#12121a] border border-blue-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Low</p>
          <p className="text-2xl font-bold text-blue-400">{severityCounts.low}</p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Severity</label>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>
      
      {/* Findings List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {findings.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckIcon className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-gray-400">No findings match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {findings.map((finding: ReviewFinding) => (
              <div
                key={finding.id}
                className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => setSelectedFinding(finding)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityStyle(finding.severity)}`}>
                        {finding.severity}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        finding.status === 'open' ? 'bg-white/10 text-white' :
                        finding.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {finding.status}
                      </span>
                    </div>
                    <p className="text-white font-medium">{finding.title}</p>
                    <p className="text-sm text-gray-400 mt-1">{finding.description}</p>
                    {finding.remediation && (
                      <p className="text-sm text-blue-400 mt-2">
                        Remediation: {finding.remediation}
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
      
      {/* Finding Detail Modal */}
      {selectedFinding && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityStyle(selectedFinding.severity)}`}>
                  {selectedFinding.severity}
                </span>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-gray-400 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            
            <h3 className="text-lg font-semibold text-white mb-2">{selectedFinding.title}</h3>
            <p className="text-gray-400 mb-4">{selectedFinding.description}</p>
            
            {selectedFinding.remediation && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-400 font-medium mb-1">Recommended Remediation</p>
                <p className="text-sm text-blue-300">{selectedFinding.remediation}</p>
              </div>
            )}
            
            {selectedFinding.authority_refs && selectedFinding.authority_refs.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-2">Authority References:</p>
                <div className="text-sm text-gray-300">
                  {selectedFinding.authority_refs.join(', ')}
                </div>
              </div>
            )}
            
            {selectedFinding.status === 'open' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Resolution Note</label>
                  <textarea
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                    placeholder="Explain how this finding was addressed..."
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => dismissMutation.mutate(selectedFinding)}
                    disabled={dismissMutation.isPending}
                    className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => resolveMutation.mutate(selectedFinding)}
                    disabled={resolveMutation.isPending}
                    className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {resolveMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
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
