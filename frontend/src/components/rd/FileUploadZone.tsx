"use client";

import { useState, useRef, useCallback } from "react";

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  acceptedTypes?: string[];
  maxFiles?: number;
  maxSize?: number; // in bytes
}

export function FileUploadZone({
  onFilesSelected,
  isUploading = false,
  acceptedTypes = [".xlsx", ".xls", ".csv", ".pdf", ".docx"],
  maxFiles = 10,
  maxSize = 50 * 1024 * 1024, // 50MB
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): File[] => {
    setError(null);
    const validFiles: File[] = [];
    
    for (const file of files) {
      // Check file type
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!acceptedTypes.some(t => t.toLowerCase() === ext)) {
        setError(`File type ${ext} not accepted. Accepted: ${acceptedTypes.join(", ")}`);
        continue;
      }
      
      // Check file size
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds ${maxSize / 1024 / 1024}MB limit`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    // Check total count
    if (validFiles.length + selectedFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return validFiles.slice(0, maxFiles - selectedFiles.length);
    }
    
    return validFiles;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const validFiles = validateFiles(files);
      if (validFiles.length > 0) {
        const newFiles = [...selectedFiles, ...validFiles];
        setSelectedFiles(newFiles);
      }
    }
  }, [selectedFiles, validateFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const validFiles = validateFiles(files);
      if (validFiles.length > 0) {
        const newFiles = [...selectedFiles, ...validFiles];
        setSelectedFiles(newFiles);
      }
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "xlsx":
      case "xls":
        return "📊";
      case "csv":
        return "📋";
      case "pdf":
        return "📄";
      case "docx":
      case "doc":
        return "📝";
      default:
        return "📁";
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
          ${isDragging 
            ? "border-accent bg-accent/10" 
            : "border-border hover:border-accent/50 hover:bg-muted/30"
          }
          ${isUploading ? "opacity-50 pointer-events-none" : ""}
        `}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={handleFileInput}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isDragging ? "bg-accent/20 text-accent" : "bg-muted/50 text-muted-foreground"
          }`}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          </div>
          
          <div>
            <p className="text-lg font-medium text-foreground">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {acceptedTypes.map(type => (
              <span key={type} className="px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground">
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Selected Files ({selectedFiles.length})
          </p>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getFileIcon(file.name)}</span>
                  <div>
                    <p className="font-medium text-foreground text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full btn btn-primary btn-lg mt-4"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading & Analyzing...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
                Analyze Files with AI
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}







