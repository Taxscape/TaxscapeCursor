'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listFindings,
  getFindingDetail,
  runReview,
  resolveFinding,
  dismissFinding,
  escalateFinding,
  getReviewStats,
  getCopilotSummary,
  getCopilotExplanation,
  ReviewFinding,
  FindingDetailResponse,
  FindingSeverity,
  FindingStatus,
  FindingDomain,
  ResolutionType,
  getSeverityColor,
  getStatusColor,
  formatCurrency,
  getDomainDisplayName,
} from '@/lib/review';
import {
  createEvidenceRequest,
  inferRequestTypeFromRuleId,
  getRequestTypeLabel,
  EvidenceRequestType,
} from '@/lib/evidence';

// ============================================================================
// Components
// ============================================================================

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const colors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[severity]}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: FindingStatus }) {
  const colors: Record<string, string> = {
    open: 'bg-red-100 text-red-800',
    in_review: 'bg-amber-100 text-amber-800',
    resolved_verified: 'bg-green-100 text-green-800',
    resolved_fixed: 'bg-green-100 text-green-800',
    resolved_escalated: 'bg-purple-100 text-purple-800',
    dismissed: 'bg-gray-100 text-gray-600',
  };
  
  const labels: Record<string, string> = {
    open: 'Open',
    in_review: 'In Review',
    resolved_verified: 'Verified',
    resolved_fixed: 'Fixed',
    resolved_escalated: 'Escalated',
    dismissed: 'Dismissed',
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status]}`}>
      {labels[status] || status}
    </span>
  );
}

function DomainBadge({ domain }: { domain: FindingDomain }) {
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
      {getDomainDisplayName(domain)}
    </span>
  );
}

function EvidenceRequestForm({
  finding,
  onCreated,
  onCancel,
}: {
  finding: ReviewFinding;
  onCreated: (requestId: string) => void;
  onCancel: () => void;
}) {
  const inferredType = inferRequestTypeFromRuleId(finding.rule_id);
  const [requestType, setRequestType] = useState<EvidenceRequestType>(inferredType);
  const [reason, setReason] = useState(
    `Based on review finding: "${finding.title}". ${finding.description || ''}`
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const result = await createEvidenceRequest({
        client_company_id: finding.client_company_id,
        tax_year: finding.tax_year,
        request_type: requestType,
        reason: reason.trim(),
        linked_finding_ids: [finding.id],
      });
      onCreated(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create evidence request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-amber-50 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-amber-700 mb-1">
          Document Type
        </label>
        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as EvidenceRequestType)}
          className="w-full px-3 py-2 border border-amber-300 rounded-md bg-white"
        >
          <option value="vendor_contract">Vendor Contract</option>
          <option value="timesheets_support">Timesheet Support</option>
          <option value="wage_support">Wage Documentation</option>
          <option value="project_narrative_support">Project Documentation</option>
          <option value="foreign_research_support">Foreign Research Support</option>
          <option value="supply_consumption_support">Supply Consumption</option>
          <option value="section_174_support">Section 174 Support</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-amber-700 mb-1">
          Reason for Request
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-amber-300 rounded-md"
          rows={3}
          placeholder="Explain why this documentation is needed..."
        />
      </div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create & Send Request'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-amber-600 hover:text-amber-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, subValue, color = 'slate' }: { 
  label: string; 
  value: string | number; 
  subValue?: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-50 border-red-200',
    amber: 'bg-amber-50 border-amber-200',
    green: 'bg-green-50 border-green-200',
    slate: 'bg-slate-50 border-slate-200',
  };
  
  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.slate}`}>
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  );
}

// ============================================================================
// Finding Detail Panel
// ============================================================================

function FindingDetailPanel({
  findingId,
  onClose,
  onResolved
}: {
  findingId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDismissForm, setShowDismissForm] = useState(false);
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [dismissReason, setDismissReason] = useState({ code: '', note: '' });
  const [escalateNote, setEscalateNote] = useState('');
  const [evidenceReason, setEvidenceReason] = useState('');
  const [editingFields, setEditingFields] = useState<Record<string, any>>({});
  const [isEditing, setIsEditing] = useState(false);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['finding-detail', findingId],
    queryFn: () => getFindingDetail(findingId),
  });
  
  const { data: explanation } = useQuery({
    queryKey: ['finding-explanation', findingId],
    queryFn: () => getCopilotExplanation(findingId),
  });
  
  const resolveMutation = useMutation({
    mutationFn: (params: { type: ResolutionType; note?: string; fieldChanges?: Record<string, any> }) =>
      resolveFinding(findingId, params.type, {
        resolutionNote: params.note,
        fieldChanges: params.fieldChanges,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      onResolved();
    },
  });
  
  const dismissMutation = useMutation({
    mutationFn: () => dismissFinding(findingId, dismissReason.code, dismissReason.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      onResolved();
    },
  });
  
  const escalateMutation = useMutation({
    mutationFn: () => escalateFinding(findingId, escalateNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      onResolved();
    },
  });
  
  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl border-l border-slate-200 overflow-y-auto">
        <div className="p-6 flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl border-l border-slate-200">
        <div className="p-6">
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ← Back
          </button>
          <div className="mt-8 text-center text-red-600">Failed to load finding</div>
        </div>
      </div>
    );
  }
  
  const { finding, entity_snapshot, resolutions } = data;
  const isOpen = finding.status === 'open' || finding.status === 'in_review';
  
  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl border-l border-slate-200 overflow-y-auto z-50">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <button onClick={onClose} className="text-slate-500 hover:text-slate-700 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status} />
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Title & Description */}
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{finding.title}</h2>
          <p className="mt-2 text-slate-600">{finding.description}</p>
        </div>
        
        {/* Trigger Evidence */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">What triggered this</h3>
          <div className="space-y-1">
            {Object.entries(finding.trigger_evidence || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-amber-700 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-amber-900">
                  {typeof value === 'number' && key.includes('wage') 
                    ? formatCurrency(value)
                    : String(value)
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Impact Estimate */}
        {finding.estimated_impact?.qre_at_risk > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">Estimated Impact</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-red-600">QRE at Risk</div>
                <div className="text-lg font-bold text-red-900">
                  {formatCurrency(finding.estimated_impact.qre_at_risk)}
                </div>
              </div>
              <div>
                <div className="text-xs text-red-600">Credit at Risk</div>
                <div className="text-lg font-bold text-red-900">
                  {formatCurrency(finding.estimated_impact.credit_at_risk || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Authority References */}
        {finding.authority_details && finding.authority_details.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-indigo-800 mb-3">IRS Authority References</h3>
            <div className="space-y-3">
              {finding.authority_details.map((auth) => (
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
        
        {/* Entity Snapshot */}
        {entity_snapshot && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">
              Entity: {finding.entity_type}
              {isOpen && !isEditing && (
                <button
                  onClick={() => {
                    setEditingFields(entity_snapshot);
                    setIsEditing(true);
                  }}
                  className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs font-normal"
                >
                  Edit
                </button>
              )}
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                {Object.entries(editingFields).map(([key, value]) => {
                  if (key === 'id' || key === 'organization_id' || key === 'client_company_id') return null;
                  return (
                    <div key={key}>
                      <label className="block text-xs text-slate-600 capitalize mb-1">
                        {key.replace(/_/g, ' ')}
                      </label>
                      <input
                        type="text"
                        value={editingFields[key] || ''}
                        onChange={(e) => setEditingFields({ ...editingFields, [key]: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  );
                })}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      // Calculate changes
                      const changes: Record<string, any> = {};
                      Object.entries(editingFields).forEach(([key, value]) => {
                        if (entity_snapshot[key] !== value) {
                          changes[key] = value;
                        }
                      });
                      if (Object.keys(changes).length > 0) {
                        resolveMutation.mutate({
                          type: 'field_updated',
                          note: 'Fields updated from review',
                          fieldChanges: changes,
                        });
                      }
                    }}
                    disabled={resolveMutation.isPending}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {resolveMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {Object.entries(entity_snapshot).slice(0, 10).map(([key, value]) => {
                  if (key === 'id' || key === 'organization_id' || key === 'client_company_id') return null;
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
        
        {/* Action Buttons */}
        {isOpen && !isEditing && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Actions</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => resolveMutation.mutate({ type: 'verified_no_change', note: 'Verified as correct' })}
                disabled={resolveMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Verify
              </button>
              
              <button
                onClick={() => {
                  setEditingFields(entity_snapshot || {});
                  setIsEditing(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Fields
              </button>
              
              <button
                onClick={() => setShowEvidenceForm(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Request Evidence
              </button>
              
              <button
                onClick={() => setShowEscalateForm(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Escalate
              </button>
            </div>
            
            <button
              onClick={() => setShowDismissForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Dismiss with reason
            </button>
            
            {/* Dismiss Form */}
            {showDismissForm && (
              <div className="bg-slate-100 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason Code</label>
                  <select
                    value={dismissReason.code}
                    onChange={(e) => setDismissReason({ ...dismissReason, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="">Select reason...</option>
                    <option value="false_positive">False Positive</option>
                    <option value="not_applicable">Not Applicable</option>
                    <option value="duplicate">Duplicate</option>
                    <option value="client_confirmed">Client Confirmed OK</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                  <textarea
                    value={dismissReason.note}
                    onChange={(e) => setDismissReason({ ...dismissReason, note: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    rows={3}
                    placeholder="Explain why this is being dismissed..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dismissMutation.mutate()}
                    disabled={!dismissReason.code || !dismissReason.note || dismissMutation.isPending}
                    className="px-4 py-2 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
                  </button>
                  <button
                    onClick={() => setShowDismissForm(false)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Escalate Form */}
            {showEscalateForm && (
              <div className="bg-purple-50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Note for Senior</label>
                  <textarea
                    value={escalateNote}
                    onChange={(e) => setEscalateNote(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-300 rounded-md"
                    rows={3}
                    placeholder="Add context for the senior reviewer..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => escalateMutation.mutate()}
                    disabled={escalateMutation.isPending}
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {escalateMutation.isPending ? 'Escalating...' : 'Escalate to Senior'}
                  </button>
                  <button
                    onClick={() => setShowEscalateForm(false)}
                    className="px-4 py-2 text-purple-600 hover:text-purple-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Evidence Request Form */}
            {showEvidenceForm && (
              <EvidenceRequestForm
                finding={finding}
                onCreated={(requestId) => {
                  setShowEvidenceForm(false);
                  // Update finding status
                  resolveMutation.mutate({
                    type: 'client_evidence_requested',
                    note: `Evidence request created: ${requestId}`
                  });
                  // Navigate to evidence center
                  router.push(`/portal/evidence?request=${requestId}`);
                }}
                onCancel={() => setShowEvidenceForm(false)}
              />
            )}
          </div>
        )}
        
        {/* Resolution History */}
        {resolutions && resolutions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Resolution History</h3>
            <div className="space-y-3">
              {resolutions.map((res) => (
                <div key={res.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 capitalize">
                      {res.resolution_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(res.resolved_at).toLocaleDateString()}
                    </span>
                  </div>
                  {res.resolution_note && (
                    <p className="text-sm text-slate-600 mt-1">{res.resolution_note}</p>
                  )}
                  <div className="text-xs text-slate-500 mt-1">
                    By: {res.profiles?.full_name || res.profiles?.email || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Copilot Explanation */}
        {explanation && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-sm font-semibold text-indigo-800">AI Analysis</h3>
            </div>
            <div className="prose prose-sm prose-indigo max-w-none">
              {explanation.explanation.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-slate-700 my-1">
                  {line}
                </p>
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

function ReviewInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  
  const clientId = searchParams.get('client_id') || '';
  const taxYear = parseInt(searchParams.get('tax_year') || new Date().getFullYear().toString());
  
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    status?: FindingStatus;
    severity?: FindingSeverity;
    domain?: FindingDomain;
  }>({});
  
  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['review-stats', clientId, taxYear],
    queryFn: () => getReviewStats(clientId, taxYear),
    enabled: !!clientId,
  });
  
  const { data: findingsData, isLoading: findingsLoading, refetch: refetchFindings } = useQuery({
    queryKey: ['findings', clientId, taxYear, filters],
    queryFn: () => listFindings(clientId, taxYear, { ...filters, limit: 100 }),
    enabled: !!clientId,
  });
  
  const { data: copilotSummary } = useQuery({
    queryKey: ['copilot-summary', clientId, taxYear],
    queryFn: () => getCopilotSummary(clientId, taxYear),
    enabled: !!clientId,
  });
  
  // Run review mutation
  const runReviewMutation = useMutation({
    mutationFn: () => runReview(clientId, taxYear),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      queryClient.invalidateQueries({ queryKey: ['copilot-summary'] });
    },
  });
  
  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Review Inbox</h1>
          <p className="text-slate-600 mt-2">Please select a client to view review findings.</p>
          <button
            onClick={() => router.push('/portal')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Go to Portal
          </button>
        </div>
      </div>
    );
  }
  
  const findings = findingsData?.findings || [];
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Review Inbox</h1>
              <p className="text-sm text-slate-600">Tax Year {taxYear}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => runReviewMutation.mutate()}
                disabled={runReviewMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {runReviewMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Run Review
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Open Findings"
            value={stats?.open || 0}
            color={stats?.open && stats.open > 0 ? 'red' : 'slate'}
          />
          <StatCard
            label="High Severity"
            value={stats?.by_severity?.high || 0}
            color={(stats?.by_severity?.high || 0) > 0 ? 'red' : 'slate'}
          />
          <StatCard
            label="QRE at Risk"
            value={formatCurrency(stats?.qre_at_risk || 0)}
            color={(stats?.qre_at_risk || 0) > 50000 ? 'amber' : 'slate'}
          />
          <StatCard
            label="Readiness Score"
            value={`${stats?.readiness_score || 0}%`}
            subValue={`${stats?.resolved || 0} resolved`}
            color={(stats?.readiness_score || 0) >= 80 ? 'green' : 'amber'}
          />
        </div>
        
        {/* Copilot Summary */}
        {copilotSummary && (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">AI Review Summary</h3>
                <div className="prose prose-invert prose-sm max-w-none">
                  {copilotSummary.summary_text.split('\n').map((line, i) => (
                    <p key={i} className="text-white/90 my-1">{line}</p>
                  ))}
                </div>
                {copilotSummary.next_best_actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {copilotSummary.next_best_actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (action.finding_id) {
                            setSelectedFindingId(action.finding_id);
                          } else if (action.filter) {
                            setFilters(action.filter as any);
                          }
                        }}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="text-sm font-medium text-slate-700">Filter:</div>
          
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as FindingStatus || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In Review</option>
            <option value="resolved_verified">Verified</option>
            <option value="resolved_fixed">Fixed</option>
            <option value="resolved_escalated">Escalated</option>
            <option value="dismissed">Dismissed</option>
          </select>
          
          <select
            value={filters.severity || ''}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value as FindingSeverity || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          <select
            value={filters.domain || ''}
            onChange={(e) => setFilters({ ...filters, domain: e.target.value as FindingDomain || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Domains</option>
            <option value="employees">Employees</option>
            <option value="projects">Projects</option>
            <option value="vendors">Vendors</option>
            <option value="ap_transactions">AP Transactions</option>
            <option value="supplies">Supplies</option>
            <option value="cross_domain">Cross-Domain</option>
          </select>
          
          {(filters.status || filters.severity || filters.domain) && (
            <button
              onClick={() => setFilters({})}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Clear filters
            </button>
          )}
        </div>
        
        {/* Findings List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {findingsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-slate-600 mt-2">Loading findings...</p>
            </div>
          ) : findings.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-12 h-12 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-medium text-slate-900 mt-4">No findings</h3>
              <p className="text-slate-600 mt-1">
                {Object.keys(filters).length > 0
                  ? 'No findings match your filters.'
                  : 'Run a review to check for issues.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {findings.map((finding) => (
                <button
                  key={finding.id}
                  onClick={() => setSelectedFindingId(finding.id)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                    selectedFindingId === finding.id ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={finding.severity} />
                        <DomainBadge domain={finding.domain} />
                        <StatusBadge status={finding.status} />
                      </div>
                      <h4 className="font-medium text-slate-900 truncate">{finding.title}</h4>
                      <p className="text-sm text-slate-600 truncate mt-1">{finding.description}</p>
                    </div>
                    <div className="ml-4 text-right flex-shrink-0">
                      {finding.estimated_impact?.qre_at_risk > 0 && (
                        <div className="text-sm font-medium text-red-600">
                          {formatCurrency(finding.estimated_impact.qre_at_risk)} at risk
                        </div>
                      )}
                      {finding.recommended_actions?.[0] && (
                        <div className="text-xs text-indigo-600 mt-1">
                          {finding.recommended_actions[0].label} →
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Panel */}
      {selectedFindingId && (
        <FindingDetailPanel
          findingId={selectedFindingId}
          onClose={() => setSelectedFindingId(null)}
          onResolved={() => {
            setSelectedFindingId(null);
            refetchFindings();
          }}
        />
      )}
    </div>
  );
}

export default function ReviewInboxPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <ReviewInboxContent />
    </Suspense>
  );
}
