'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  checkUploadTokenStatus,
  clientUploadEvidence,
  RequestedItem,
} from '@/lib/evidence';

// ============================================================================
// Page Component - Public Client Upload (No Auth Required)
// ============================================================================

function ClientUploadContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    client_name?: string;
    organization_name?: string;
    title?: string;
    requested_items?: RequestedItem[];
    due_date?: string;
    uploads_remaining?: number;
  } | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; filename: string }[]>([]);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setError('No upload token provided');
      setIsLoading(false);
      return;
    }

    checkUploadTokenStatus(token)
      .then((status) => {
        setTokenStatus(status);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired upload link');
        setIsLoading(false);
      });
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-400 border-t-transparent mx-auto mb-4" />
          <p className="text-zinc-400">Verifying upload link...</p>
        </div>
      </div>
    );
  }

  if (error || !tokenStatus?.valid) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 rounded-2xl border border-zinc-800 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Upload Link Invalid</h1>
          <p className="text-zinc-400 mb-6">
            {error || 'This upload link is invalid or has expired. Please contact your CPA for a new link.'}
          </p>
          <div className="text-sm text-zinc-500">
            If you believe this is an error, please contact your tax preparer.
          </div>
        </div>
      </div>
    );
  }

  if (uploadComplete) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 rounded-2xl border border-zinc-800 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Upload Complete!</h1>
          <p className="text-zinc-400 mb-6">
            Your files have been successfully uploaded. Your tax preparer will review them shortly.
          </p>
          
          {uploadedFiles.length > 0 && (
            <div className="bg-zinc-800 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Files Uploaded:</h3>
              <ul className="space-y-1">
                {uploadedFiles.map((file) => (
                  <li key={file.id} className="text-sm text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {file.filename}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <button
            onClick={() => {
              setUploadComplete(false);
              setUploadedFiles([]);
            }}
            className="text-emerald-400 hover:text-emerald-300 font-medium"
          >
            Upload more files →
          </button>
        </div>
      </div>
    );
  }

  return (
    <ClientUploadForm
      token={token!}
      tokenStatus={tokenStatus}
      onComplete={(files) => {
        setUploadedFiles(files);
        setUploadComplete(true);
      }}
    />
  );
}

// ============================================================================
// Upload Form Component
// ============================================================================

function ClientUploadForm({
  token,
  tokenStatus,
  onComplete,
}: {
  token: string;
  tokenStatus: {
    client_name?: string;
    organization_name?: string;
    title?: string;
    requested_items?: RequestedItem[];
    due_date?: string;
    uploads_remaining?: number;
  };
  onComplete: (files: { id: string; filename: string }[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [rejectedFiles, setRejectedFiles] = useState<{ filename: string; reason: string }[]>([]);

  const requestedItems = tokenStatus.requested_items || [];
  const dueDate = tokenStatus.due_date ? new Date(tokenStatus.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    setIsUploading(true);
    setError('');
    setRejectedFiles([]);

    try {
      const result = await clientUploadEvidence(
        token,
        files,
        selectedItemKey || undefined
      );

      if (result.rejected && result.rejected.length > 0) {
        setRejectedFiles(result.rejected);
      }

      if (result.uploaded && result.uploaded.length > 0) {
        onComplete(result.uploaded);
      } else if (result.rejected && result.rejected.length > 0) {
        setError('Some files were rejected. Please check the accepted formats and try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Secure Document Upload</h1>
          {tokenStatus.organization_name && (
            <p className="text-zinc-400">
              Uploading for <span className="text-white font-medium">{tokenStatus.client_name}</span>
            </p>
          )}
        </div>

        {/* Request Details Card */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 mb-6 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white mb-1">
              {tokenStatus.title || 'Document Request'}
            </h2>
            {dueDate && (
              <p className={`text-sm ${isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
                {isOverdue ? 'Was due' : 'Due'}: {dueDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}
          </div>

          {/* Requested Items */}
          {requestedItems.length > 0 && (
            <div className="p-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">Documents Requested</h3>
              <div className="space-y-4">
                {requestedItems.map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                      item.required ? 'bg-red-900/30 text-red-400' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{item.label}</span>
                        {item.required && (
                          <span className="text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded">Required</span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">{item.description}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Accepted formats: {item.accepted_formats.map((f) => `.${f}`).join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload Area */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Upload Your Files</h3>

          {/* Item Selector */}
          {requestedItems.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-2">
                Which document are you uploading? (Optional)
              </label>
              <select
                value={selectedItemKey}
                onChange={(e) => setSelectedItemKey(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white appearance-none cursor-pointer"
              >
                <option value="">Select a document type...</option>
                {requestedItems.map((item) => (
                  <option key={item.item_key} value={item.item_key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500/50 hover:bg-zinc-800/50 transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.pptx"
            />
            <svg className="w-12 h-12 mx-auto text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-white font-medium mb-1">
              Drag and drop files here
            </p>
            <p className="text-zinc-500 text-sm">
              or <span className="text-emerald-400">browse your computer</span>
            </p>
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-zinc-400">Selected Files ({files.length})</h4>
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(idx);
                    }}
                    className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Rejected Files */}
          {rejectedFiles.length > 0 && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
              <h4 className="text-sm font-medium text-red-400 mb-2">Some files were rejected:</h4>
              <ul className="space-y-1">
                {rejectedFiles.map((file, idx) => (
                  <li key={idx} className="text-sm text-red-300">
                    {file.filename}: {file.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
            className="mt-6 w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload {files.length} File{files.length !== 1 ? 's' : ''}
              </>
            )}
          </button>

          {tokenStatus.uploads_remaining !== undefined && (
            <p className="text-center text-sm text-zinc-500 mt-3">
              {tokenStatus.uploads_remaining} uploads remaining
            </p>
          )}
        </div>

        {/* Security Note */}
        <div className="flex items-start gap-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-white">Secure Upload</p>
            <p className="text-xs text-zinc-500 mt-1">
              Your files are encrypted in transit and stored securely. Only authorized team members can access your documents.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientUploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <ClientUploadContent />
    </Suspense>
  );
}
