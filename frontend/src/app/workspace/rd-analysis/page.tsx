"use client";

import React, { useState, useCallback } from 'react';
import { useActiveContext, useWorkspace } from '@/context/workspace-context';
import { getRDSession, downloadRDReport, uploadRDFiles } from '@/lib/api';

export default function RDAnalysisPage() {
  const { clientId } = useActiveContext();
  const { state, selectSession } = useWorkspace();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // All hooks must be called before any conditional returns
  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setUploadError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const result = await uploadRDFiles([file]);
      if (result.session_id) {
        selectSession(result.session_id);
        const sessionData = await getRDSession(result.session_id);
        setSession(sessionData);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [selectSession]);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);
  
  const handleDownloadReport = useCallback(async () => {
    if (state.selectedSessionId) {
      try {
        await downloadRDReport(state.selectedSessionId);
      } catch (err: any) {
        console.error('Download failed:', err);
      }
    }
  }, [state.selectedSessionId]);
  
  // Conditional render AFTER all hooks
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to upload R&D analysis files." />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">R&D Analysis</h1>
          <p className="text-muted-foreground">Upload Excel files for AI-powered four-part test evaluation</p>
        </div>
        {state.selectedSessionId && (
          <button
            onClick={handleDownloadReport}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium"
          >
            Download Report
          </button>
        )}
      </div>
      
      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging ? 'border-accent bg-accent/5' : 'border-border'
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-foreground font-medium">Processing R&D data...</p>
            <p className="text-sm text-muted-foreground">Running four-part test AI evaluation</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <UploadIcon />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Upload R&D Data</h3>
            <p className="text-muted-foreground mb-4">Drag and drop your Excel file or click to browse</p>
            <label className="inline-flex px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 cursor-pointer font-medium">
              Select File
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="hidden"
              />
            </label>
            {uploadError && (
              <p className="mt-4 text-destructive text-sm">{uploadError}</p>
            )}
          </>
        )}
      </div>
      
      {/* Session Results */}
      {session && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-6">
          <h3 className="text-lg font-semibold text-foreground">Analysis Results</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Total QRE" value={`$${(session.total_qre || 0).toLocaleString()}`} />
            <StatCard title="Projects" value={session.projects?.length || 0} />
            <StatCard title="Employees" value={session.employees?.length || 0} />
            <StatCard title="Four-Part Test" value={session.four_part_test_complete ? 'Complete' : 'Pending'} />
          </div>
          
          {session.projects?.length > 0 && (
            <div>
              <h4 className="font-medium text-foreground mb-3">Projects Analyzed</h4>
              <div className="space-y-2">
                {session.projects.slice(0, 5).map((project: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="font-medium text-foreground">{project.name}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      project.qualification_status === 'qualified'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {project.qualification_status || 'pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <RDIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function RDIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}
