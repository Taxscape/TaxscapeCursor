"use client";

import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  updateGap, 
  createTaskFromGap, 
  uploadEvidence,
} from '@/lib/api';
import type { ProjectGap, GapSeverity, GapStatus } from '@/lib/types';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Upload,
  ListTodo,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  User,
  Calendar,
  MessageSquare,
  ShieldOff,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface GapResolutionPanelProps {
  gaps: ProjectGap[];
  projectId: string;
  onGapUpdated?: () => void;
  userRole?: string;
}

// =============================================================================
// STATUS HELPERS
// =============================================================================

const SEVERITY_STYLES: Record<GapSeverity, { border: string; bg: string; text: string; badge: string }> = {
  critical: { border: 'border-red-500/50', bg: 'bg-red-500/5', text: 'text-red-600', badge: 'bg-red-500/20 text-red-600' },
  high: { border: 'border-orange-500/50', bg: 'bg-orange-500/5', text: 'text-orange-600', badge: 'bg-orange-500/20 text-orange-600' },
  medium: { border: 'border-yellow-500/50', bg: 'bg-yellow-500/5', text: 'text-yellow-600', badge: 'bg-yellow-500/20 text-yellow-600' },
  low: { border: 'border-muted', bg: 'bg-muted/30', text: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

const STATUS_ICONS: Record<GapStatus, React.ReactNode> = {
  open: <Clock className="w-4 h-4 text-yellow-500" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  pending_review: <AlertTriangle className="w-4 h-4 text-orange-500" />,
  resolved: <CheckCircle className="w-4 h-4 text-green-500" />,
  waived: <ShieldOff className="w-4 h-4 text-muted-foreground" />,
  rejected: <XCircle className="w-4 h-4 text-red-500" />,
};

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_uncertainty: 'Missing Uncertainty Documentation',
  missing_experimentation: 'Missing Experimentation Evidence',
  missing_tech_basis: 'Missing Technical Basis',
  missing_permitted_purpose: 'Missing Permitted Purpose',
  missing_project_narrative: 'Missing Project Narrative',
  missing_test_evidence: 'Missing Test Evidence',
  missing_design_docs: 'Missing Design Documents',
  missing_wage_support: 'Missing Wage Support',
  missing_time_allocation: 'Missing Time Allocation',
  foreign_vendor_flag: 'Foreign Vendor Risk',
  contractor_qualification: 'Contractor Qualification Issue',
  supply_eligibility: 'Supply Eligibility Question',
  financial_anomaly: 'Financial Anomaly',
  needs_clarification: 'Needs Clarification',
  other: 'Other Issue',
};

// =============================================================================
// GAP CARD COMPONENT
// =============================================================================

interface GapCardProps {
  gap: ProjectGap;
  projectId: string;
  onUpdate: () => void;
  canWaive: boolean;
}

function GapCard({ gap, projectId, onUpdate, canWaive }: GapCardProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [showWaiveForm, setShowWaiveForm] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [waivedReason, setWaivedReason] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const styles = SEVERITY_STYLES[gap.severity];

  // Update gap mutation
  const updateMutation = useMutation({
    mutationFn: (updates: { status?: string; resolutionNotes?: string; waivedReason?: string }) => 
      updateGap(gap.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gaps', projectId] });
      onUpdate();
      setShowResolveForm(false);
      setShowWaiveForm(false);
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: () => createTaskFromGap({ gapId: gap.id, assignedTo: taskAssignee || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gaps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onUpdate();
      setShowTaskForm(false);
    },
  });

  // Upload evidence mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadEvidence({ file, projectId, evidenceType: 'technical_docs' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', projectId] });
      setSelectedFiles([]);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleUploadFiles = async () => {
    for (const file of selectedFiles) {
      await uploadMutation.mutateAsync(file);
    }
  };

  const handleResolve = () => {
    updateMutation.mutate({ status: 'resolved', resolutionNotes });
  };

  const handleWaive = () => {
    if (!canWaive) return;
    updateMutation.mutate({ status: 'waived', waivedReason });
  };

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-start justify-between text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${styles.badge}`}>
              {gap.severity}
            </span>
            <span className="text-xs text-muted-foreground">
              {GAP_TYPE_LABELS[gap.gap_type] || gap.gap_type}
            </span>
            {gap.ai_generated && (
              <span className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
                AI Generated
              </span>
            )}
          </div>
          <h4 className="font-medium text-foreground">{gap.title}</h4>
          {gap.description && !isExpanded && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{gap.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="flex items-center gap-1">
            {STATUS_ICONS[gap.status]}
            <span className="text-xs text-muted-foreground">{gap.status.replace('_', ' ')}</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          {/* Description */}
          {gap.description && (
            <p className="text-sm text-muted-foreground mt-4">{gap.description}</p>
          )}

          {/* Required Info */}
          {gap.required_info && gap.required_info.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground mb-2">Required Information:</p>
              <ul className="space-y-1">
                {gap.required_info.map((info, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className={styles.text}>•</span>
                    {info}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked Criterion */}
          {gap.linked_criterion_key && (
            <div className="mt-4">
              <span className="px-2 py-1 text-xs bg-muted rounded-full">
                Four-Part Test: {gap.linked_criterion_key.replace('_', ' ')}
              </span>
            </div>
          )}

          {/* File Upload */}
          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent/50 hover:bg-muted/20 transition-all"
            >
              <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload supporting documentation
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground truncate max-w-[200px]">
                        {file.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleUploadFiles}
                  disabled={uploadMutation.isPending}
                  className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {uploadMutation.isPending ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {gap.status !== 'resolved' && gap.status !== 'waived' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setShowTaskForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/80"
              >
                <ListTodo className="w-4 h-4" />
                Assign Task
              </button>
              <button
                onClick={() => setShowResolveForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-green-500/10 text-green-600 rounded-lg text-sm hover:bg-green-500/20"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Resolved
              </button>
              {canWaive && (
                <button
                  onClick={() => setShowWaiveForm(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80"
                >
                  <ShieldOff className="w-4 h-4" />
                  Waive
                </button>
              )}
            </div>
          )}

          {/* Task Form */}
          {showTaskForm && (
            <div className="mt-4 p-4 rounded-lg bg-background border border-border">
              <h5 className="font-medium text-foreground mb-3">Create Task</h5>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Assign to (optional)</label>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={taskAssignee}
                      onChange={e => setTaskAssignee(e.target.value)}
                      placeholder="Enter user ID or email"
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => createTaskMutation.mutate()}
                    disabled={createTaskMutation.isPending}
                    className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                  </button>
                  <button
                    onClick={() => setShowTaskForm(false)}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Resolve Form */}
          {showResolveForm && (
            <div className="mt-4 p-4 rounded-lg bg-background border border-border">
              <h5 className="font-medium text-foreground mb-3">Mark as Resolved</h5>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Resolution Notes</label>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground mt-2" />
                    <textarea
                      value={resolutionNotes}
                      onChange={e => setResolutionNotes(e.target.value)}
                      placeholder="Describe how this gap was resolved..."
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[80px]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleResolve}
                    disabled={updateMutation.isPending}
                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Resolving...' : 'Confirm Resolution'}
                  </button>
                  <button
                    onClick={() => setShowResolveForm(false)}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Waive Form */}
          {showWaiveForm && canWaive && (
            <div className="mt-4 p-4 rounded-lg bg-background border border-border">
              <h5 className="font-medium text-foreground mb-3">Waive Gap</h5>
              <p className="text-xs text-muted-foreground mb-3">
                Only waive gaps when they are not applicable or acceptable risk. This action is logged.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Reason for Waiver *</label>
                  <textarea
                    value={waivedReason}
                    onChange={e => setWaivedReason(e.target.value)}
                    placeholder="Explain why this gap is being waived..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[80px]"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleWaive}
                    disabled={updateMutation.isPending || !waivedReason.trim()}
                    className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Waiving...' : 'Confirm Waiver'}
                  </button>
                  <button
                    onClick={() => setShowWaiveForm(false)}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Resolution Info */}
          {gap.status === 'resolved' && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-sm font-medium text-green-600 mb-1">Resolved</p>
              {gap.resolution_notes && (
                <p className="text-sm text-muted-foreground">{gap.resolution_notes}</p>
              )}
              {gap.resolved_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(gap.resolved_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Waiver Info */}
          {gap.status === 'waived' && (
            <div className="mt-4 p-3 rounded-lg bg-muted border border-border">
              <p className="text-sm font-medium text-muted-foreground mb-1">Waived</p>
              {gap.waived_reason && (
                <p className="text-sm text-muted-foreground">{gap.waived_reason}</p>
              )}
              {gap.waived_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(gap.waived_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Linked Task */}
          {gap.linked_task_id && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-sm font-medium text-blue-600 flex items-center gap-2">
                <ListTodo className="w-4 h-4" />
                Task Assigned
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Task ID: {gap.linked_task_id.slice(0, 8)}...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GapResolutionPanel({ gaps, projectId, onGapUpdated, userRole = 'user' }: GapResolutionPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  // Check if user can waive gaps
  const canWaive = ['admin', 'cpa', 'executive', 'managing_partner', 'reviewer'].includes(userRole);

  // Filter gaps
  const filteredGaps = gaps.filter(gap => {
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'open' && gap.status !== 'open' && gap.status !== 'in_progress') return false;
      if (statusFilter === 'resolved' && gap.status !== 'resolved' && gap.status !== 'waived') return false;
    }
    if (severityFilter && gap.severity !== severityFilter) return false;
    return true;
  });

  // Group by severity
  const groupedGaps = filteredGaps.reduce((acc, gap) => {
    if (!acc[gap.severity]) acc[gap.severity] = [];
    acc[gap.severity].push(gap);
    return acc;
  }, {} as Record<string, ProjectGap[]>);

  const severityOrder: GapSeverity[] = ['critical', 'high', 'medium', 'low'];

  if (gaps.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Gaps Identified</h3>
        <p className="text-muted-foreground">All required information has been provided.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Information Gaps</h3>
          <p className="text-sm text-muted-foreground">
            {gaps.length} gap{gaps.length !== 1 ? 's' : ''} identified
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-2">
        <span className={`px-2 py-1 rounded text-xs ${SEVERITY_STYLES.critical.badge}`}>
          {gaps.filter(g => g.severity === 'critical' && g.status === 'open').length} Critical
        </span>
        <span className={`px-2 py-1 rounded text-xs ${SEVERITY_STYLES.high.badge}`}>
          {gaps.filter(g => g.severity === 'high' && g.status === 'open').length} High
        </span>
        <span className={`px-2 py-1 rounded text-xs ${SEVERITY_STYLES.medium.badge}`}>
          {gaps.filter(g => g.severity === 'medium' && g.status === 'open').length} Medium
        </span>
        <span className={`px-2 py-1 rounded text-xs ${SEVERITY_STYLES.low.badge}`}>
          {gaps.filter(g => g.severity === 'low' && g.status === 'open').length} Low
        </span>
      </div>

      {/* Gap Cards by Severity */}
      {filteredGaps.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No gaps match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {severityOrder.map(severity => {
            const severityGaps = groupedGaps[severity];
            if (!severityGaps || severityGaps.length === 0) return null;
            
            return (
              <div key={severity}>
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  {severity} Priority ({severityGaps.length})
                </h4>
                <div className="space-y-3">
                  {severityGaps.map(gap => (
                    <GapCard
                      key={gap.id}
                      gap={gap}
                      projectId={projectId}
                      onUpdate={onGapUpdated || (() => {})}
                      canWaive={canWaive}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GapResolutionPanel;


