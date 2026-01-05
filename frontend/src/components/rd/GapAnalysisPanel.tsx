"use client";

import { useState, useRef } from "react";
import type { GapItem } from "@/lib/api";

interface GapAnalysisPanelProps {
  gaps: GapItem[];
  onUploadForGap: (gapId: string, files: File[]) => void;
  isUploading?: boolean;
  uploadingGapId?: string;
}

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  project: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  ),
  vendor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  ),
  employee: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  documentation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-destructive/50 bg-destructive/5",
  medium: "border-warning/50 bg-warning/5",
  low: "border-muted",
};

const PRIORITY_BADGES: Record<string, string> = {
  high: "bg-destructive/20 text-destructive",
  medium: "bg-warning/20 text-warning",
  low: "bg-muted text-muted-foreground",
};

export function GapAnalysisPanel({ 
  gaps, 
  onUploadForGap, 
  isUploading,
  uploadingGapId 
}: GapAnalysisPanelProps) {
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleGap = (gapId: string) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  };

  const handleFileSelect = (gapId: string, files: FileList | null) => {
    if (files && files.length > 0) {
      setSelectedFiles(prev => ({
        ...prev,
        [gapId]: [...(prev[gapId] || []), ...Array.from(files)]
      }));
    }
  };

  const removeFile = (gapId: string, fileIndex: number) => {
    setSelectedFiles(prev => ({
      ...prev,
      [gapId]: (prev[gapId] || []).filter((_, i) => i !== fileIndex)
    }));
  };

  const handleUpload = (gapId: string) => {
    const files = selectedFiles[gapId];
    if (files && files.length > 0) {
      onUploadForGap(gapId, files);
      // Clear files after upload
      setSelectedFiles(prev => ({
        ...prev,
        [gapId]: []
      }));
    }
  };

  // Group gaps by category
  const groupedGaps = gaps.reduce((acc, gap) => {
    if (!acc[gap.category]) {
      acc[gap.category] = [];
    }
    acc[gap.category].push(gap);
    return acc;
  }, {} as Record<string, GapItem[]>);

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedCategories = Object.keys(groupedGaps).sort((a, b) => {
    const aMinPriority = Math.min(...groupedGaps[a].map(g => priorityOrder[g.priority as keyof typeof priorityOrder] || 2));
    const bMinPriority = Math.min(...groupedGaps[b].map(g => priorityOrder[g.priority as keyof typeof priorityOrder] || 2));
    return aMinPriority - bMinPriority;
  });

  if (gaps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center text-success">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <p className="text-lg font-medium mb-1">No Gaps Identified</p>
        <p className="text-sm">All required information has been provided.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Information Gaps</h3>
          <p className="text-sm text-muted-foreground">
            {gaps.length} item{gaps.length !== 1 ? "s" : ""} need attention
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-2 py-1 rounded text-xs ${PRIORITY_BADGES.high}`}>
            {gaps.filter(g => g.priority === "high").length} High
          </span>
          <span className={`px-2 py-1 rounded text-xs ${PRIORITY_BADGES.medium}`}>
            {gaps.filter(g => g.priority === "medium").length} Medium
          </span>
          <span className={`px-2 py-1 rounded text-xs ${PRIORITY_BADGES.low}`}>
            {gaps.filter(g => g.priority === "low").length} Low
          </span>
        </div>
      </div>

      {/* Gaps by Category */}
      {sortedCategories.map(category => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {CATEGORY_ICONS[category] || CATEGORY_ICONS.documentation}
            </span>
            <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              {category} ({groupedGaps[category].length})
            </h4>
          </div>

          {groupedGaps[category].map(gap => {
            const isExpanded = expandedGaps.has(gap.gap_id);
            const gapFiles = selectedFiles[gap.gap_id] || [];
            const isCurrentlyUploading = isUploading && uploadingGapId === gap.gap_id;

            return (
              <div
                key={gap.gap_id}
                className={`rounded-xl border transition-all ${PRIORITY_COLORS[gap.priority]}`}
              >
                {/* Gap Header */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleGap(gap.gap_id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_BADGES[gap.priority]}`}>
                          {gap.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">{gap.gap_type.replace(/_/g, " ")}</span>
                      </div>
                      <h5 className="font-medium text-foreground mt-1">{gap.item_name}</h5>
                      <p className="text-sm text-muted-foreground mt-1">{gap.description}</p>
                    </div>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4">
                    {/* Required Information */}
                    {gap.required_info.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-foreground mb-2">Required Information:</p>
                        <ul className="space-y-1">
                          {gap.required_info.map((info, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="text-warning mt-0.5">•</span>
                              {info}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* File Upload Area */}
                    <div className="mt-4">
                      <input
                        ref={el => { fileInputRefs.current[gap.gap_id] = el; }}
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
                        className="hidden"
                        onChange={(e) => handleFileSelect(gap.gap_id, e.target.files)}
                      />

                      <div
                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent/50 hover:bg-muted/20 transition-all"
                        onClick={() => fileInputRefs.current[gap.gap_id]?.click()}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="mx-auto text-muted-foreground mb-2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                        <p className="text-sm text-muted-foreground">
                          Drop files or click to upload supporting documentation
                        </p>
                      </div>

                      {/* Selected Files */}
                      {gapFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {gapFiles.map((file, idx) => (
                            <div
                              key={`${file.name}-${idx}`}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">📄</span>
                                <span className="text-sm text-foreground truncate max-w-[200px]">
                                  {file.name}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(gap.gap_id, idx);
                                }}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}

                          <button
                            onClick={() => handleUpload(gap.gap_id)}
                            disabled={isCurrentlyUploading}
                            className="btn btn-primary btn-sm w-full mt-2"
                          >
                            {isCurrentlyUploading ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Uploading...
                              </>
                            ) : (
                              `Upload ${gapFiles.length} file${gapFiles.length !== 1 ? "s" : ""}`
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}




