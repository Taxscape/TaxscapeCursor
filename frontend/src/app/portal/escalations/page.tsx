'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEscalationQueue,
  getEscalationDetail,
  assignEscalation,
  resolveEscalation,
  cancelEscalation,
  getNotifications,
  markNotificationRead,
  EscalationRequest,
  EscalationDetailResponse,
  EscalationStatus,
  DecisionType,
  ReasonCode,
  getStatusColor,
  getStatusLabel,
  getDecisionTypeLabel,
  getReasonCodeLabel,
  formatCurrency,
  REASON_CODES,
  DECISION_TYPES,
} from '@/lib/escalation';
import { useAuth } from '@/context/auth-context';

// ============================================================================
// Components
// ============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[severity] || colors.medium}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: EscalationStatus }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function StatCard({ label, value, color = 'slate' }: { label: string; value: string | number; color?: string }) {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
  };
  
  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

// ============================================================================
// Escalation Detail Panel
// ============================================================================

function EscalationDetailPanel({
  escalationId,
  onClose,
  onResolved
}: {
  escalationId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  const [decisionType, setDecisionType] = useState<DecisionType | ''>('');
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('');
  const [decisionNote, setDecisionNote] = useState('');
  const [guidanceText, setGuidanceText] = useState('');
  const [editingFields, setEditingFields] = useState<Record<string, any>>({});
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['escalation-detail', escalationId],
    queryFn: () => getEscalationDetail(escalationId),
  });
  
  const assignMutation = useMutation({
    mutationFn: (userId: string) => assignEscalation(escalationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['escalation-detail', escalationId] });
    },
  });
  
  const resolveMutation = useMutation({
    mutationFn: () => resolveEscalation(
      escalationId,
      decisionType as DecisionType,
      reasonCode as ReasonCode,
      decisionNote,
      {
        fieldChanges: showFieldEditor ? editingFields : undefined,
        guidanceText: guidanceText || undefined,
      }
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      onResolved();
    },
  });
  
  const cancelMutation = useMutation({
    mutationFn: () => cancelEscalation(escalationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      onResolved();
    },
  });
  
  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-[700px] bg-white shadow-2xl border-l border-slate-200 overflow-y-auto z-50">
        <div className="p-6 flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="fixed inset-y-0 right-0 w-[700px] bg-white shadow-2xl border-l border-slate-200 z-50">
        <div className="p-6">
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">← Back</button>
          <div className="mt-8 text-center text-red-600">Failed to load escalation</div>
        </div>
      </div>
    );
  }
  
  const { escalation, source_object, entity_snapshot, authority_details, history, available_seniors } = data;
  const isActive = !['resolved', 'cancelled'].includes(escalation.status);
  const isSenior = profile?.role_level && ['senior', 'director', 'partner'].includes(profile.role_level);
  const isExecutive = profile?.role === 'executive';
  const canResolve = isSenior || isExecutive;
  
  return (
    <div className="fixed inset-y-0 right-0 w-[700px] bg-white shadow-2xl border-l border-slate-200 overflow-y-auto z-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <button onClick={onClose} className="text-slate-500 hover:text-slate-700 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={escalation.severity} />
          <StatusBadge status={escalation.status} />
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Title & Summary */}
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{escalation.title}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Escalated by {escalation.created_by?.full_name || escalation.created_by?.email || 'Unknown'} • 
            {escalation.days_open} days ago
          </p>
        </div>
        
        {/* Junior&apos;s Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Junior&apos;s Summary</h3>
          <p className="text-sm text-blue-900">{escalation.summary}</p>
          
          {escalation.proposed_action && Object.keys(escalation.proposed_action).length > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <h4 className="text-xs font-semibold text-blue-700 mb-1">Proposed Action</h4>
              <div className="text-sm text-blue-900">
                {escalation.proposed_action.action_type && (
                  <span className="font-medium">{escalation.proposed_action.action_type.replace(/_/g, ' ')}</span>
                )}
                {escalation.proposed_action.description && (
                  <p className="mt-1">{escalation.proposed_action.description}</p>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Impact Estimate */}
        {(escalation.estimated_impact?.qre_at_risk || escalation.estimated_impact?.credit_at_risk) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">Estimated Impact</h3>
            <div className="grid grid-cols-2 gap-4">
              {escalation.estimated_impact.qre_at_risk && (
                <div>
                  <div className="text-xs text-red-600">QRE at Risk</div>
                  <div className="text-lg font-bold text-red-900">
                    {formatCurrency(escalation.estimated_impact.qre_at_risk)}
                  </div>
                </div>
              )}
              {escalation.estimated_impact.credit_at_risk && (
                <div>
                  <div className="text-xs text-red-600">Credit at Risk</div>
                  <div className="text-lg font-bold text-red-900">
                    {formatCurrency(escalation.estimated_impact.credit_at_risk)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Source Object (Finding or Mapping) */}
        {source_object && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">
              Source: {escalation.source_type === 'review_finding' ? 'Review Finding' : 'Intake Mapping'}
            </h3>
            
            {escalation.source_type === 'review_finding' && (
              <div className="space-y-2 text-sm">
                <p className="text-slate-900 font-medium">{source_object.title}</p>
                <p className="text-slate-600">{source_object.description}</p>
                
                {source_object.trigger_evidence && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-600 mb-1">Trigger Evidence</h4>
                    <div className="space-y-1">
                      {Object.entries(source_object.trigger_evidence).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {escalation.source_type === 'intake_mapping' && (
              <div className="text-sm">
                <p className="text-slate-900">{source_object.prompt}</p>
                {source_object.options && (
                  <div className="mt-2">
                    <span className="text-slate-600">Options: </span>
                    <span className="text-slate-900">{source_object.options.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Entity Snapshot with Edit Option */}
        {entity_snapshot && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-800">Entity Data</h3>
              {isActive && canResolve && (
                <button
                  onClick={() => {
                    setEditingFields(entity_snapshot);
                    setShowFieldEditor(true);
                    setDecisionType('override_fields');
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Edit Fields
                </button>
              )}
            </div>
            
            {showFieldEditor ? (
              <div className="space-y-3">
                {Object.entries(editingFields).map(([key, value]) => {
                  if (['id', 'organization_id', 'client_company_id', 'created_at', 'updated_at'].includes(key)) return null;
                  return (
                    <div key={key}>
                      <label className="block text-xs text-slate-600 capitalize mb-1">
                        {key.replace(/_/g, ' ')}
                      </label>
                      <input
                        type="text"
                        value={editingFields[key] || ''}
                        onChange={(e) => setEditingFields({ ...editingFields, [key]: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    setShowFieldEditor(false);
                    setEditingFields({});
                    if (decisionType === 'override_fields') setDecisionType('');
                  }}
                  className="text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel Editing
                </button>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {Object.entries(entity_snapshot).slice(0, 10).map(([key, value]) => {
                  if (['id', 'organization_id', 'client_company_id'].includes(key)) return null;
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-600 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-slate-900">{String(value || '—')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {/* Authority References */}
        {authority_details && authority_details.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-indigo-800 mb-3">Authority References</h3>
            <div className="space-y-3">
              {authority_details.map((auth) => (
                <div key={auth.id} className="text-sm">
                  <div className="font-medium text-indigo-900">{auth.citation_label}</div>
                  <div className="text-indigo-700 mt-1">{auth.summary}</div>
                  {auth.url && (
                    <a
                      href={auth.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 underline text-xs mt-1 inline-block"
                    >
                      Read more →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {authority_details?.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            ⚠️ No authority references linked to this escalation
          </div>
        )}
        
        {/* Assignment Section */}
        {isActive && canResolve && escalation.status === 'queued' && (
          <div className="bg-slate-100 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Assign to Senior</h3>
            <div className="flex gap-2">
              <select
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select a senior...</option>
                {available_seniors.map((senior) => (
                  <option key={senior.id} value={senior.id}>
                    {senior.full_name || senior.email} ({senior.role_level || 'Executive'})
                  </option>
                ))}
              </select>
              <button
                onClick={() => selectedAssignee && assignMutation.mutate(selectedAssignee)}
                disabled={!selectedAssignee || assignMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        )}
        
        {/* Decision Section */}
        {isActive && canResolve && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-800 mb-4">Senior Decision</h3>
            
            <div className="space-y-4">
              {/* Decision Type */}
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-2">Decision Type *</label>
                <div className="grid grid-cols-1 gap-2">
                  {DECISION_TYPES.map((dt) => (
                    <label
                      key={dt.value}
                      className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                        decisionType === dt.value
                          ? 'bg-purple-100 border-purple-400'
                          : 'bg-white border-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="decisionType"
                        value={dt.value}
                        checked={decisionType === dt.value}
                        onChange={(e) => setDecisionType(e.target.value as DecisionType)}
                        className="mt-0.5 mr-3"
                      />
                      <div>
                        <div className="font-medium text-sm text-slate-900">{dt.label}</div>
                        <div className="text-xs text-slate-600">{dt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Reason Code */}
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">Reason Code *</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">Select reason...</option>
                  {REASON_CODES.map((rc) => (
                    <option key={rc.value} value={rc.value}>{rc.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Decision Note */}
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">
                  Decision Note * {reasonCode === 'other' && '(detailed explanation required)'}
                </label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="Explain your decision..."
                />
              </div>
              
              {/* Guidance Text (for return_guidance or request_more_evidence) */}
              {(decisionType === 'return_guidance' || decisionType === 'request_more_evidence') && (
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Guidance for Junior
                  </label>
                  <textarea
                    value={guidanceText}
                    onChange={(e) => setGuidanceText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Provide clear instructions..."
                  />
                </div>
              )}
              
              {/* Submit Button */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => resolveMutation.mutate()}
                  disabled={!decisionType || !reasonCode || !decisionNote || resolveMutation.isPending}
                  className="flex-1 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {resolveMutation.isPending ? 'Submitting...' : 'Submit Decision'}
                </button>
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel Escalation
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Guidance Display (if returned) */}
        {escalation.guidance_text && escalation.status === 'returned_to_junior' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-orange-800 mb-2">Senior Guidance</h3>
            <p className="text-sm text-orange-900">{escalation.guidance_text}</p>
          </div>
        )}
        
        {/* Decision Display (if resolved) */}
        {escalation.decision_type && escalation.status === 'resolved' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-800 mb-2">Resolution</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-green-700">Decision:</span> <span className="font-medium">{getDecisionTypeLabel(escalation.decision_type)}</span></div>
              <div><span className="text-green-700">Reason:</span> <span className="font-medium">{getReasonCodeLabel(escalation.decision_reason_code!)}</span></div>
              <div><span className="text-green-700">Note:</span> {escalation.decision_note}</div>
              <div><span className="text-green-700">By:</span> {escalation.decided_by?.full_name || escalation.decided_by?.email}</div>
            </div>
          </div>
        )}
        
        {/* History */}
        {history && history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">History</h3>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="text-sm bg-slate-50 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-900 capitalize">
                      {h.action.replace(/_/g, ' ').replace(':', ' - ')}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {h.note && <p className="text-slate-600 mt-1">{h.note}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    By: {h.profiles?.full_name || h.profiles?.email || 'Unknown'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SeniorReviewQueuePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedEscalationId, setSelectedEscalationId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    status?: EscalationStatus;
    assigned_to_me?: boolean;
    severity?: string;
  }>({ assigned_to_me: false });
  
  // Check if user is senior+
  const isSenior = profile?.role_level && ['senior', 'director', 'partner'].includes(profile.role_level);
  const isExecutive = profile?.role === 'executive';
  const canView = isSenior || isExecutive;
  
  // Queries
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['escalation-queue', filters],
    queryFn: () => listEscalationQueue(filters),
    enabled: canView,
  });
  
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(true, 10),
    enabled: !!profile,
  });
  
  // If not authorized, show message
  if (!canView) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <svg className="w-16 h-16 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">Senior Review Queue</h1>
          <p className="text-slate-600 mt-2">
            This page is only accessible to Senior CPAs, Directors, Partners, and Executives.
          </p>
          <button
            onClick={() => router.push('/portal')}
            className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Go to Portal
          </button>
        </div>
      </div>
    );
  }
  
  const escalations = queueData?.escalations || [];
  const totalActive = queueData?.total_active || 0;
  const unreadNotifications = notificationsData?.notifications?.length || 0;
  
  // Calculate stats
  const highSeverityCount = escalations.filter(e => e.severity === 'high' && e.status !== 'resolved').length;
  const assignedToMe = escalations.filter(e => e.assigned_to_user_id === profile?.id).length;
  const totalQreAtRisk = escalations
    .filter(e => !['resolved', 'cancelled'].includes(e.status))
    .reduce((sum, e) => sum + (e.estimated_impact?.qre_at_risk || 0), 0);
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Senior Review Queue</h1>
              <p className="text-sm text-slate-600">
                Escalations requiring senior decision
              </p>
            </div>
            {unreadNotifications > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                </svg>
                {unreadNotifications} new notifications
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Active Escalations" value={totalActive} color="slate" />
          <StatCard label="High Severity" value={highSeverityCount} color={highSeverityCount > 0 ? 'red' : 'slate'} />
          <StatCard label="Assigned to Me" value={assignedToMe} color={assignedToMe > 0 ? 'blue' : 'slate'} />
          <StatCard label="QRE at Risk" value={formatCurrency(totalQreAtRisk)} color={totalQreAtRisk > 100000 ? 'amber' : 'slate'} />
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="text-sm font-medium text-slate-700">Filter:</div>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.assigned_to_me}
              onChange={(e) => setFilters({ ...filters, assigned_to_me: e.target.checked })}
              className="rounded border-slate-300"
            />
            Assigned to me
          </label>
          
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as EscalationStatus || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">All Active</option>
            <option value="queued">Queued</option>
            <option value="assigned">Assigned</option>
            <option value="in_review">In Review</option>
            <option value="returned_to_junior">Returned</option>
            <option value="resolved">Resolved</option>
          </select>
          
          <select
            value={filters.severity || ''}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          {(filters.status || filters.severity || filters.assigned_to_me) && (
            <button
              onClick={() => setFilters({ assigned_to_me: false })}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Clear filters
            </button>
          )}
        </div>
        
        {/* Escalations List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {queueLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-slate-600 mt-2">Loading escalations...</p>
            </div>
          ) : escalations.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-12 h-12 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-medium text-slate-900 mt-4">No escalations</h3>
              <p className="text-slate-600 mt-1">
                {filters.assigned_to_me ? "No escalations assigned to you." : "No active escalations in the queue."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {escalations.map((escalation) => (
                <button
                  key={escalation.id}
                  onClick={() => setSelectedEscalationId(escalation.id)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                    selectedEscalationId === escalation.id ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={escalation.severity} />
                        <StatusBadge status={escalation.status} />
                        <span className="text-xs text-slate-500">
                          {escalation.source_type === 'review_finding' ? 'Finding' : 'Mapping'}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-900 truncate">{escalation.title}</h4>
                      <p className="text-sm text-slate-600 truncate mt-1">{escalation.summary}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span>From: {escalation.created_by?.full_name || escalation.created_by?.email}</span>
                        {escalation.assigned_to && (
                          <span>Assigned: {escalation.assigned_to.full_name || escalation.assigned_to.email}</span>
                        )}
                        <span>{escalation.days_open} days open</span>
                      </div>
                    </div>
                    <div className="ml-4 text-right flex-shrink-0">
                      {escalation.estimated_impact?.qre_at_risk && (
                        <div className="text-sm font-medium text-red-600">
                          {formatCurrency(escalation.estimated_impact.qre_at_risk)}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        {escalation.client_name}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Panel */}
      {selectedEscalationId && (
        <EscalationDetailPanel
          escalationId={selectedEscalationId}
          onClose={() => setSelectedEscalationId(null)}
          onResolved={() => {
            setSelectedEscalationId(null);
            queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
          }}
        />
      )}
    </div>
  );
}
