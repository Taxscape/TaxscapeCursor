"use client";

import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { previewImport, commitImport, recomputeDerivedData } from '@/lib/api';
import type { ImportPreview } from '@/lib/types';

interface ImportWizardProps {
  clientId: string;
  taxYear: number;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'preview' | 'commit' | 'complete';

export function ImportWizard({ clientId, taxYear, onClose, onSuccess }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (file: File) => previewImport(file, clientId, taxYear),
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to preview import');
    },
  });
  
  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: () => commitImport(preview!.import_file_id),
    onSuccess: async () => {
      // Run recompute after import
      try {
        await recomputeDerivedData({
          clientCompanyId: clientId,
          taxYear,
        });
      } catch (e) {
        console.error('Recompute failed:', e);
      }
      
      // Invalidate all workspace queries
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['ap-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      queryClient.invalidateQueries({ queryKey: ['qre-summary'] });
      
      setStep('complete');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to commit import');
    },
  });
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  }, []);
  
  const handleUpload = useCallback(() => {
    if (file) {
      previewMutation.mutate(file);
    }
  }, [file, previewMutation]);
  
  const handleCommit = useCallback(() => {
    commitMutation.mutate();
  }, [commitMutation]);
  
  const handleComplete = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onClose, onSuccess]);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Import Data</h2>
            <p className="text-sm text-muted-foreground">
              Upload Excel file with blueprint sheets
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {(['upload', 'preview', 'commit', 'complete'] as const).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-2 ${
                  step === s ? 'text-accent' : 
                  ['upload', 'preview', 'commit', 'complete'].indexOf(step) > i ? 'text-green-400' : 'text-muted-foreground'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step === s ? 'bg-accent text-accent-foreground' :
                    ['upload', 'preview', 'commit', 'complete'].indexOf(step) > i ? 'bg-green-500/20 text-green-400' : 'bg-muted'
                  }`}>
                    {['upload', 'preview', 'commit', 'complete'].indexOf(step) > i ? '✓' : i + 1}
                  </div>
                  <span className="text-sm font-medium capitalize">{s}</span>
                </div>
                {i < 3 && (
                  <div className={`w-8 h-0.5 ${
                    ['upload', 'preview', 'commit', 'complete'].indexOf(step) > i ? 'bg-green-400' : 'bg-muted'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
          
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="text-center">
              <div className="border-2 border-dashed border-border rounded-xl p-12 mb-4 hover:border-accent/50 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-foreground mb-1">
                    {file ? file.name : 'Click to select file'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Excel (.xlsx) file with blueprint sheets
                  </p>
                </label>
              </div>
              
              <div className="text-left p-4 bg-muted/30 rounded-lg text-sm">
                <p className="font-medium text-foreground mb-2">Expected sheets:</p>
                <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
                  <li>• Employees</li>
                  <li>• Projects</li>
                  <li>• Timesheets</li>
                  <li>• Vendors</li>
                  <li>• Contracts</li>
                  <li>• AP_Transactions</li>
                  <li>• Supplies</li>
                  <li>• QRE_Summary_2024</li>
                </ul>
              </div>
              
              {file && (
                <button
                  onClick={handleUpload}
                  disabled={previewMutation.isPending}
                  className="mt-6 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {previewMutation.isPending ? 'Analyzing...' : 'Analyze File'}
                </button>
              )}
            </div>
          )}
          
          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Preview Results</h3>
              
              {/* Detected entities */}
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-medium text-muted-foreground">Detected Sheets</h4>
                {preview.preview.detected_entities.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {preview.preview.detected_entities.map((entity) => (
                      <div key={entity.sheet} className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground">{entity.sheet}</span>
                          <span className="text-sm text-green-400">{entity.rows} rows</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          → {entity.entity}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No blueprint sheets detected</p>
                )}
              </div>
              
              {/* Validation issues */}
              {preview.preview.validation_issues.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-yellow-400 mb-2">⚠️ Validation Issues</h4>
                  <ul className="space-y-1 text-sm">
                    {preview.preview.validation_issues.map((issue, i) => (
                      <li key={i} className="text-yellow-400/80">
                        {issue.sheet}: {issue.issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* All sheets */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">All Sheets</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.preview.sheets.map((sheet) => (
                    <span key={sheet} className="px-2 py-1 bg-muted rounded text-sm text-foreground">
                      {sheet} ({preview.preview.row_counts[sheet]} rows)
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-between mt-8">
                <button
                  onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setPreview(null);
                  }}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                <button
                  onClick={handleCommit}
                  disabled={commitMutation.isPending || preview.preview.detected_entities.length === 0}
                  className="px-6 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {commitMutation.isPending ? 'Importing...' : 'Commit Import'}
                </button>
              </div>
            </div>
          )}
          
          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Import Complete!</h3>
              <p className="text-muted-foreground mb-6">
                Your data has been imported and derived calculations have been updated.
              </p>
              <button
                onClick={handleComplete}
                className="px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportWizard;

