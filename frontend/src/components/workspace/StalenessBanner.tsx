"use client";

import React from 'react';
import { useStaleness, useRecompute } from '@/lib/queries';
import { useActiveContext } from '@/context/workspace-context';

export function StalenessBanner() {
  const { clientId, taxYear } = useActiveContext();
  const numericTaxYear = parseInt(taxYear) || 2024;
  const { data: staleness } = useStaleness(clientId, numericTaxYear);
  const recomputeMutation = useRecompute();
  
  // Don't show if no client or not stale
  if (!clientId || !staleness?.is_stale) {
    return null;
  }
  
  const handleRecompute = () => {
    if (clientId) {
      recomputeMutation.mutate({ clientCompanyId: clientId, taxYear: numericTaxYear });
    }
  };
  
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };
  
  return (
    <div className="px-6 py-3 bg-yellow-500/10 border-b border-yellow-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-yellow-400">
              Derived data is out of sync
            </p>
            <p className="text-xs text-yellow-400/70">
              {staleness.reason || 'Data changed since last recompute'}
              {staleness.last_recompute_at && (
                <> • Last computed {formatRelativeTime(staleness.last_recompute_at)}</>
              )}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleRecompute}
          disabled={recomputeMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-yellow-950 rounded-lg hover:bg-yellow-400 disabled:opacity-50 text-sm font-medium"
        >
          <svg className={`w-4 h-4 ${recomputeMutation.isPending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {recomputeMutation.isPending ? 'Recomputing...' : 'Recompute Now'}
        </button>
      </div>
      
      {recomputeMutation.isError && (
        <p className="mt-2 text-xs text-red-400">
          Recompute failed: {recomputeMutation.error?.message || 'Unknown error'}
        </p>
      )}
      
      {recomputeMutation.isSuccess && (
        <p className="mt-2 text-xs text-green-400">
          ✓ Recompute completed successfully
        </p>
      )}
    </div>
  );
}

export default StalenessBanner;
