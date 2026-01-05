"use client";

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// =============================================================================
// TYPES
// =============================================================================

interface Evidence {
  id: string;
  organization_id: string;
  client_id: string;
  project_id: string;
  evidence_type: string;
  source: string;
  file_id?: string;
  url?: string;
  text_excerpt?: string;
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
}

interface EvidenceViewerProps {
  projectId?: string;
  clientId?: string;
  selectedEvidenceId?: string;
  onEvidenceSelect?: (evidence: Evidence) => void;
  highlightedExcerpts?: { evidenceId: string; excerpt: string }[];
  mode?: 'list' | 'detail';
}

// =============================================================================
// ICONS
// =============================================================================

const Icons = {
  file: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  link: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
  upload: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  chevronLeft: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  chevronRight: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  tag: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>,
  calendar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  x: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
};

const evidenceTypeLabels: Record<string, { label: string; color: string }> = {
  project_narrative: { label: 'Narrative', color: 'bg-blue-100 text-blue-700' },
  technical_docs: { label: 'Technical', color: 'bg-purple-100 text-purple-700' },
  test_results: { label: 'Test Results', color: 'bg-green-100 text-green-700' },
  source_control: { label: 'Source Control', color: 'bg-orange-100 text-orange-700' },
  tickets: { label: 'Tickets', color: 'bg-amber-100 text-amber-700' },
  time_logs: { label: 'Time Logs', color: 'bg-cyan-100 text-cyan-700' },
  financial_support: { label: 'Financial', color: 'bg-emerald-100 text-emerald-700' },
};

// =============================================================================
// MOCK DATA FETCHER (Replace with real API)
// =============================================================================

async function fetchEvidence(projectId?: string): Promise<Evidence[]> {
  // This would be replaced with actual API call
  return [];
}

// =============================================================================
// EVIDENCE LIST VIEW
// =============================================================================

interface EvidenceListProps {
  evidence: Evidence[];
  selectedId?: string;
  onSelect: (evidence: Evidence) => void;
  highlightedExcerpts?: { evidenceId: string; excerpt: string }[];
}

const EvidenceList: React.FC<EvidenceListProps> = ({
  evidence,
  selectedId,
  onSelect,
  highlightedExcerpts,
}) => {
  const [filter, setFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const filteredEvidence = evidence.filter(e => {
    if (typeFilter && e.evidence_type !== typeFilter) return false;
    if (filter) {
      const searchLower = filter.toLowerCase();
      return (
        e.metadata?.filename?.toLowerCase().includes(searchLower) ||
        e.text_excerpt?.toLowerCase().includes(searchLower) ||
        e.evidence_type.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const types = [...new Set(evidence.map(e => e.evidence_type))];

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 border-b border-border space-y-2">
        <input
          type="text"
          placeholder="Search evidence..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input w-full text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              !typeFilter ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            All
          </button>
          {types.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                typeFilter === type ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {evidenceTypeLabels[type]?.label || type}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredEvidence.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
              {Icons.file}
            </div>
            <p className="text-sm">No evidence found</p>
            <p className="text-xs mt-1">Upload documents to link to this project</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredEvidence.map((item) => {
              const isSelected = item.id === selectedId;
              const isHighlighted = highlightedExcerpts?.some(h => h.evidenceId === item.id);
              const typeInfo = evidenceTypeLabels[item.evidence_type] || { label: item.evidence_type, color: 'bg-slate-100 text-slate-700' };

              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                    isSelected ? 'bg-accent/10 border-l-2 border-accent' : ''
                  } ${isHighlighted ? 'ring-1 ring-inset ring-amber-400' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                      {item.url ? Icons.link : Icons.file}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground text-sm truncate">
                          {item.metadata?.filename || item.url || 'Untitled'}
                        </span>
                        {isHighlighted && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full">
                            Cited
                          </span>
                        )}
                      </div>
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {item.text_excerpt && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.text_excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          {filteredEvidence.length} of {evidence.length} items
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// EVIDENCE DETAIL VIEW
// =============================================================================

interface EvidenceDetailProps {
  evidence: Evidence;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  highlightedExcerpt?: string;
}

const EvidenceDetail: React.FC<EvidenceDetailProps> = ({
  evidence,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  highlightedExcerpt,
}) => {
  const typeInfo = evidenceTypeLabels[evidence.evidence_type] || { label: evidence.evidence_type, color: 'bg-slate-100 text-slate-700' };

  const highlightText = (text: string, excerpt?: string) => {
    if (!excerpt || !text.toLowerCase().includes(excerpt.toLowerCase())) {
      return text;
    }
    
    const lowerText = text.toLowerCase();
    const lowerExcerpt = excerpt.toLowerCase();
    const startIndex = lowerText.indexOf(lowerExcerpt);
    
    if (startIndex === -1) return text;
    
    const before = text.slice(0, startIndex);
    const match = text.slice(startIndex, startIndex + excerpt.length);
    const after = text.slice(startIndex + excerpt.length);
    
    return (
      <>
        {before}
        <mark className="bg-amber-200 px-0.5 rounded">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {(hasPrev || hasNext) && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  title="Previous"
                >
                  {Icons.chevronLeft}
                </button>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  title="Next"
                >
                  {Icons.chevronRight}
                </button>
              </div>
            )}
            <h3 className="font-semibold text-foreground truncate">
              {evidence.metadata?.filename || 'Evidence Detail'}
            </h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-muted">
              {Icons.x}
            </button>
          )}
        </div>
        <span className={`inline-block px-2 py-0.5 text-xs rounded ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Source</p>
            <p className="text-foreground capitalize">{evidence.source}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Created</p>
            <p className="text-foreground">{new Date(evidence.created_at).toLocaleDateString()}</p>
          </div>
          {evidence.metadata?.file_type && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">File Type</p>
              <p className="text-foreground uppercase">{evidence.metadata.file_type}</p>
            </div>
          )}
          {evidence.metadata?.file_size && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Size</p>
              <p className="text-foreground">{formatFileSize(evidence.metadata.file_size)}</p>
            </div>
          )}
        </div>

        {/* URL */}
        {evidence.url && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Link</p>
            <a
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-sm break-all"
            >
              {evidence.url}
            </a>
          </div>
        )}

        {/* Text Excerpt */}
        {evidence.text_excerpt && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Extracted Content</p>
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-foreground whitespace-pre-wrap">
              {highlightText(evidence.text_excerpt, highlightedExcerpt)}
            </div>
          </div>
        )}

        {/* Linked Criteria */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Linked Criteria</p>
          <div className="flex flex-wrap gap-2">
            {['qualified_purpose', 'technological_in_nature'].map(criterion => (
              <span
                key={criterion}
                className="px-2 py-1 text-xs bg-accent/10 text-accent rounded-full flex items-center gap-1"
              >
                {Icons.tag}
                {criterion.replace(/_/g, ' ')}
              </span>
            ))}
            <button className="px-2 py-1 text-xs border border-dashed border-border rounded-full text-muted-foreground hover:border-accent hover:text-accent">
              + Link criterion
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border bg-muted/30 shrink-0">
        <div className="flex gap-2">
          {evidence.url || evidence.file_id ? (
            <a
              href={evidence.url || `#download-${evidence.file_id}`}
              className="btn btn-primary btn-sm flex-1"
              target="_blank"
              rel="noopener noreferrer"
            >
              {evidence.url ? 'Open Link' : 'Download'}
            </a>
          ) : null}
          <button className="btn btn-outline btn-sm flex-1">
            Unlink
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({
  projectId,
  clientId,
  selectedEvidenceId,
  onEvidenceSelect,
  highlightedExcerpts,
  mode = 'list',
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | undefined>(selectedEvidenceId);

  const { data: evidence = [], isLoading } = useQuery({
    queryKey: ['evidence', projectId],
    queryFn: () => fetchEvidence(projectId),
    enabled: !!projectId,
  });

  const selectedEvidence = evidence.find(e => e.id === (selectedEvidenceId || internalSelectedId));
  const currentIndex = selectedEvidence ? evidence.findIndex(e => e.id === selectedEvidence.id) : -1;

  const handleSelect = useCallback((item: Evidence) => {
    setInternalSelectedId(item.id);
    onEvidenceSelect?.(item);
  }, [onEvidenceSelect]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      handleSelect(evidence[currentIndex - 1]);
    }
  }, [currentIndex, evidence, handleSelect]);

  const handleNext = useCallback(() => {
    if (currentIndex < evidence.length - 1) {
      handleSelect(evidence[currentIndex + 1]);
    }
  }, [currentIndex, evidence, handleSelect]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (mode === 'detail' && selectedEvidence) {
    return (
      <EvidenceDetail
        evidence={selectedEvidence}
        onClose={() => setInternalSelectedId(undefined)}
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={currentIndex > 0}
        hasNext={currentIndex < evidence.length - 1}
        highlightedExcerpt={highlightedExcerpts?.find(h => h.evidenceId === selectedEvidence.id)?.excerpt}
      />
    );
  }

  return (
    <div className="flex h-full">
      <div className={`${selectedEvidence ? 'w-1/2 border-r border-border' : 'w-full'}`}>
        <EvidenceList
          evidence={evidence}
          selectedId={internalSelectedId}
          onSelect={handleSelect}
          highlightedExcerpts={highlightedExcerpts}
        />
      </div>
      {selectedEvidence && (
        <div className="w-1/2">
          <EvidenceDetail
            evidence={selectedEvidence}
            onClose={() => setInternalSelectedId(undefined)}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={currentIndex > 0}
            hasNext={currentIndex < evidence.length - 1}
            highlightedExcerpt={highlightedExcerpts?.find(h => h.evidenceId === selectedEvidence.id)?.excerpt}
          />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// UTILS
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default EvidenceViewer;

