"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery } from '@tanstack/react-query';
import { listStudies } from '@/lib/study-packaging';

export default function ReportsPage() {
  const { clientId } = useActiveContext();
  
  // Fetch studies/reports
  const { data: studiesData, isLoading } = useQuery({
    queryKey: ['studies', clientId],
    queryFn: () => listStudies(clientId!),
    enabled: !!clientId,
  });
  const studies = studiesData?.studies || [];
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <ReportIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view generated reports.
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Reports</h1>
          <p className="text-gray-400">Manage and download generated study artifacts</p>
        </div>
      </div>
      
      {/* List */}
      <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading reports...</p>
          </div>
        ) : studies.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-gray-500">
              <ReportIcon />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Reports Generated</h3>
            <p className="text-gray-400 max-w-md mx-auto mb-6">
              Generate your first R&D tax credit study in the Finalization section.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {studies.map((study: any) => (
              <div key={study.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <FileTextIcon />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{study.title}</h3>
                    <p className="text-sm text-gray-500">
                      Generated on {new Date(study.created_at).toLocaleDateString()} • {study.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold mr-4">
                    ${Number(study.total_credit || 0).toLocaleString()}
                  </span>
                  <button className="px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors">
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
