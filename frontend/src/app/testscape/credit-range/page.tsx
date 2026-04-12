'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useActiveContext } from '@/context/workspace-context';
import {
  listEstimates,
  getEstimate,
  draftEstimate,
  recomputeEstimate,
  submitForSignoff,
  signoffEstimate,
  exportEstimate,
  generateEmailDraft,
  markEstimateSent,
  CreditEstimate,
  SignoffDecision,
  SignoffReasonCode,
  getStatusColor,
  getStatusLabel,
  formatCurrency,
  formatPercentage,
  getImpactColor,
  getSeverityColor,
  getReasonCodeLabel,
} from '@/lib/credit-estimate';

// ============================================================================
// Page Component
// ============================================================================

export default function TestscapeCreditRangePage() {
  const { isExecutive } = useAuth();
  const { clientId, taxYear: contextTaxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [taxYear, setTaxYear] = useState(Number(contextTaxYear) || new Date().getFullYear() - 1);

  // Sync with context if it changes
  React.useEffect(() => {
    if (contextTaxYear) {
      setTaxYear(Number(contextTaxYear));
    }
  }, [contextTaxYear]);

  // Senior users can approve estimates - using isExecutive from auth context
  const isSenior = isExecutive;

  // Fetch estimates for client
  const { data: estimatesData, isLoading } = useQuery({
    queryKey: ['credit-estimates', clientId, taxYear],
    queryFn: () => listEstimates({ client_id: clientId ?? undefined, tax_year: taxYear }),
    enabled: !!clientId,
  });

  const estimates = estimatesData?.estimates || [];
  const currentEstimate = estimates.find(e => e.status !== 'superseded');

  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className="text-2xl font-bold text-white mb-2">No Client Selected</h2>
        <p className="text-gray-400">Please select a client from the header to view credit estimates.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Credit Range</h1>
          <p className="text-zinc-400 mt-1">
            Draft and manage R&D credit estimates
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Tax Year Selector */}
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
          >
            {[0, 1, 2, 3, 4].map((offset) => {
              const year = new Date().getFullYear() - offset;
              return (
                <option key={year} value={year}>
                  Tax Year {year}
                </option>
              );
            })}
          </select>
          
          <button
            onClick={() => setShowDraftModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Draft New Estimate
          </button>
        </div>
      </div>

      {/* Current Estimate Summary */}
      {currentEstimate && (
        <CurrentEstimateSummary
          estimate={currentEstimate}
          onSelect={() => setSelectedEstimateId(currentEstimate.id)}
          isSenior={isSenior}
        />
      )}

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6 mt-8">
        {/* Estimates List */}
        <div className="col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-300">Estimate History</h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-zinc-500">Loading...</div>
          ) : estimates.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900 rounded-xl border border-zinc-800">
              <svg className="w-12 h-12 mx-auto text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-zinc-400">No estimates for {taxYear}</p>
              <button
                onClick={() => setShowDraftModal(true)}
                className="mt-4 text-emerald-400 hover:text-emerald-300"
              >
                Draft your first estimate →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {estimates.map((estimate) => (
                <EstimateCard
                  key={estimate.id}
                  estimate={estimate}
                  isSelected={selectedEstimateId === estimate.id}
                  onClick={() => setSelectedEstimateId(estimate.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Estimate Detail */}
        <div className="col-span-2">
          {selectedEstimateId ? (
            <EstimateDetailPanel
              estimateId={selectedEstimateId}
              isSenior={isSenior}
              onClose={() => setSelectedEstimateId(null)}
            />
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-zinc-500">Select an estimate to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Draft Modal */}
      {showDraftModal && (
        <DraftEstimateModal
          clientId={clientId!}
          taxYear={taxYear}
          onClose={() => setShowDraftModal(false)}
          onCreated={(id) => {
            setShowDraftModal(false);
            setSelectedEstimateId(id);
            queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-Components (Simplified versions of those in /portal/credit-range)
// ============================================================================

function CurrentEstimateSummary({
  estimate,
  onSelect,
  isSenior,
}: {
  estimate: CreditEstimate;
  onSelect: () => void;
  isSenior: boolean;
}) {
  const base = estimate.range_base;
  const low = estimate.range_low;
  const high = estimate.range_high;

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl border border-zinc-700 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Current Estimate</h2>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(estimate.status)}`}>
              {getStatusLabel(estimate.status)}
            </span>
          </div>
          <p className="text-zinc-400 mt-1">
            Version {estimate.estimate_version} • Created {new Date(estimate.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={onSelect}
          className="text-emerald-400 hover:text-emerald-300 text-sm"
        >
          View Details →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <RangeCard
          label="Conservative"
          qre={low.total_qre}
          credit={low.credit_amount_selected || 0}
          color="blue"
        />
        <RangeCard
          label="Base Case"
          qre={base.total_qre}
          credit={base.credit_amount_selected || 0}
          color="emerald"
          highlighted
        />
        <RangeCard
          label="Optimistic"
          qre={high.total_qre}
          credit={high.credit_amount_selected || 0}
          color="purple"
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-zinc-400">Data Completeness</span>
          <span className="font-medium">{formatPercentage(estimate.data_completeness_score)}</span>
        </div>
        <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              estimate.data_completeness_score >= 0.7 ? 'bg-emerald-500' :
              estimate.data_completeness_score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${estimate.data_completeness_score * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function RangeCard({
  label,
  qre,
  credit,
  color,
  highlighted,
}: {
  label: string;
  qre: number;
  credit: number;
  color: string;
  highlighted?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: highlighted ? 'border-blue-500 bg-blue-900/20' : 'border-zinc-700',
    emerald: highlighted ? 'border-emerald-500 bg-emerald-900/20' : 'border-zinc-700',
    purple: highlighted ? 'border-purple-500 bg-purple-900/20' : 'border-zinc-700',
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <div className="text-sm text-zinc-400 mb-2">{label}</div>
      <div className="text-2xl font-bold text-white">{formatCurrency(credit)}</div>
      <div className="text-sm text-zinc-500 mt-1">
        QRE: {formatCurrency(qre)}
      </div>
    </div>
  );
}

function EstimateCard({
  estimate,
  isSelected,
  onClick,
}: {
  estimate: CreditEstimate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-zinc-800 border-emerald-500'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">Version {estimate.estimate_version}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(estimate.status)}`}>
          {getStatusLabel(estimate.status)}
        </span>
      </div>
      <div className="text-lg font-bold text-white mb-1">
        {formatCurrency(estimate.range_base.credit_amount_selected || 0)}
      </div>
      <div className="text-xs text-zinc-500">
        {new Date(estimate.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function EstimateDetailPanel({
  estimateId,
  isSenior,
  onClose,
}: {
  estimateId: string;
  isSenior: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'assumptions' | 'risks' | 'signoff' | 'export'>('breakdown');
  const [showEmailModal, setShowEmailModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['credit-estimate', estimateId],
    queryFn: () => getEstimate(estimateId),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitForSignoff(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimate', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeEstimate(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
      queryClient.invalidateQueries({ queryKey: ['credit-estimate', estimateId] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: (type: 'pdf' | 'docx') => exportEstimate(estimateId, type),
    onSuccess: (blob, type) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credit_estimate.${type}`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
  });

  const markSentMutation = useMutation({
    mutationFn: () => markEstimateSent(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimate', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center text-red-400">
        Failed to load estimate details
      </div>
    );
  }

  const { estimate, signoffs, exports, is_stale, stale_reason } = data;
  const canSubmit = estimate.status === 'draft';
  const canSignoff = estimate.status === 'pending_senior_signoff' && isSenior;
  const canExport = estimate.status === 'approved' || estimate.status === 'pending_senior_signoff';
  const canMarkSent = estimate.status === 'approved';

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg text-white">Version {estimate.estimate_version}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(estimate.status)}`}>
                {getStatusLabel(estimate.status)}
              </span>
              {is_stale && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-900/50 text-orange-300">
                  Stale
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {is_stale && (
          <div className="mt-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-orange-300">{stale_reason}</span>
              <button
                onClick={() => recomputeMutation.mutate()}
                disabled={recomputeMutation.isPending}
                className="text-sm text-orange-400 hover:text-orange-300"
              >
                {recomputeMutation.isPending ? 'Recomputing...' : 'Recompute'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex border-b border-zinc-800">
        {(['breakdown', 'assumptions', 'risks', 'signoff', 'export'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-4 max-h-[500px] overflow-y-auto">
        {activeTab === 'breakdown' && <BreakdownContent estimate={estimate} />}
        {activeTab === 'assumptions' && <AssumptionsContent assumptions={estimate.assumptions} />}
        {activeTab === 'risks' && <RisksContent risks={estimate.risk_notes} missing={estimate.missing_inputs} />}
        {activeTab === 'signoff' && (
          <SignoffContent
            estimate={estimate}
            signoffs={signoffs}
            canSignoff={canSignoff}
            estimateId={estimateId}
          />
        )}
        {activeTab === 'export' && (
          <ExportContent
            estimate={estimate}
            exports={exports}
            canExport={canExport}
            canMarkSent={canMarkSent}
            onExport={(type) => exportMutation.mutate(type)}
            onShowEmail={() => setShowEmailModal(true)}
            onMarkSent={() => markSentMutation.mutate()}
            isExporting={exportMutation.isPending}
          />
        )}
      </div>

      <div className="p-4 border-t border-zinc-800 flex gap-3">
        {canSubmit && (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit for Signoff'}
          </button>
        )}
      </div>

      {showEmailModal && (
        <EmailDraftModal
          estimateId={estimateId}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}

// Sub-Tab Contents (Simplified)

function BreakdownContent({ estimate }: { estimate: CreditEstimate }) {
  const { range_low, range_base, range_high } = estimate;
  return (
    <div className="space-y-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2">Category</th>
            <th className="text-right py-2">Base Case</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-800 text-white">
            <td className="py-2">Wage QRE</td>
            <td className="text-right">{formatCurrency(range_base.wage_qre)}</td>
          </tr>
          <tr className="border-b border-zinc-800 text-white">
            <td className="py-2">Supply QRE</td>
            <td className="text-right">{formatCurrency(range_base.supply_qre)}</td>
          </tr>
          <tr className="border-b border-zinc-800 text-white">
            <td className="py-2">Contract QRE</td>
            <td className="text-right">{formatCurrency(range_base.contract_qre)}</td>
          </tr>
          <tr className="font-bold text-white">
            <td className="py-2">Total QRE</td>
            <td className="text-right text-emerald-400">{formatCurrency(range_base.total_qre)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AssumptionsContent({ assumptions }: { assumptions: any[] }) {
  return (
    <div className="space-y-3">
      {assumptions.map((a, idx) => (
        <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
          <div className="font-medium text-white">{a.title}</div>
          <p className="text-sm text-zinc-400 mt-1">{a.description}</p>
        </div>
      ))}
      {assumptions.length === 0 && <p className="text-zinc-500 text-center py-4">No assumptions</p>}
    </div>
  );
}

function RisksContent({ risks, missing }: { risks: any[], missing: any[] }) {
  return (
    <div className="space-y-4">
      {risks.length > 0 && (
        <div className="space-y-2">
          {risks.map((r, idx) => (
            <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="font-medium text-white">{r.title}</div>
                <span className={`px-2 py-0.5 rounded text-xs ${getSeverityColor(r.severity)}`}>{r.severity}</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase">Missing Inputs</h4>
          {missing.map((m, idx) => (
            <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
              <div className="font-medium text-white">{m.label}</div>
              <p className="text-sm text-zinc-400 mt-1">{m.impact}</p>
            </div>
          ))}
        </div>
      )}
      {risks.length === 0 && missing.length === 0 && <p className="text-zinc-500 text-center py-4">No risks identified</p>}
    </div>
  );
}

function SignoffContent({ estimate, signoffs, canSignoff, estimateId }: { estimate: any, signoffs: any[], canSignoff: boolean, estimateId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [decision, setDecision] = useState<SignoffDecision>('approved');
  const [note, setNote] = useState('');

  const signoffMutation = useMutation({
    mutationFn: () => signoffEstimate(estimateId, { decision, reason_code: 'sufficient_support', note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimate', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
      setShowForm(false);
    },
  });

  return (
    <div className="space-y-4">
      {signoffs.map((s, idx) => (
        <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white capitalize">{s.decision}</span>
            <span className="text-xs text-zinc-500">{new Date(s.decided_at).toLocaleDateString()}</span>
          </div>
          <p className="text-sm text-zinc-400">{s.note}</p>
        </div>
      ))}
      {canSignoff && !showForm && (
        <button onClick={() => setShowForm(true)} className="w-full py-2 bg-emerald-600 rounded-lg text-white font-medium">Sign Off</button>
      )}
      {showForm && (
        <div className="space-y-3 p-3 bg-zinc-800 rounded-lg">
          <select value={decision} onChange={e => setDecision(e.target.value as any)} className="w-full bg-zinc-700 text-white rounded p-2">
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
          </select>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note..." className="w-full bg-zinc-700 text-white rounded p-2" rows={3} />
          <div className="flex gap-2">
            <button onClick={() => signoffMutation.mutate()} disabled={!note} className="flex-1 py-2 bg-emerald-600 rounded text-white font-medium disabled:opacity-50">Submit</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-700 rounded text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportContent({ canExport, canMarkSent, onExport, onShowEmail, onMarkSent, isExporting, exports }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onExport('pdf')} disabled={!canExport || isExporting} className="py-2 bg-zinc-800 rounded text-white disabled:opacity-50">Export PDF</button>
        <button onClick={() => onExport('docx')} disabled={!canExport || isExporting} className="py-2 bg-zinc-800 rounded text-white disabled:opacity-50">Export DOCX</button>
      </div>
      {canMarkSent && (
        <div className="flex gap-2">
          <button onClick={onShowEmail} className="flex-1 py-2 bg-zinc-800 rounded text-white">Email Draft</button>
          <button onClick={onMarkSent} className="flex-1 py-2 bg-emerald-600 rounded text-white">Mark Sent</button>
        </div>
      )}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase">History</h4>
        {exports.map((e: any, idx: number) => (
          <div key={idx} className="text-xs text-zinc-400">{e.export_type} - {new Date(e.created_at).toLocaleString()}</div>
        ))}
      </div>
    </div>
  );
}

// Modals

function DraftEstimateModal({ clientId, taxYear, onClose, onCreated }: any) {
  const [methodology, setMethodology] = useState('both');
  const [loading, setLoading] = useState(false);

  const handleDraft = async () => {
    setLoading(true);
    try {
      const result = await draftEstimate({ client_company_id: clientId, tax_year: taxYear, methodology: methodology as any });
      onCreated(result.id);
    } catch (e) {
      alert('Failed to draft estimate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-4">Draft New Estimate</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Methodology</label>
            <select value={methodology} onChange={e => setMethodology(e.target.value)} className="w-full bg-zinc-800 text-white border border-zinc-700 rounded p-2">
              <option value="both">Both (Regular & ASC)</option>
              <option value="regular">Regular Only</option>
              <option value="asc">ASC Only</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 bg-zinc-800 text-white rounded">Cancel</button>
            <button onClick={handleDraft} disabled={loading} className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded disabled:opacity-50">{loading ? 'Computing...' : 'Draft'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailDraftModal({ estimateId, onClose }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    generateEmailDraft(estimateId).then(setData).finally(() => setLoading(false));
  }, [estimateId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Email Draft</h3>
        {loading ? <div className="text-center py-8">Loading...</div> : (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-800 rounded text-sm text-zinc-300 whitespace-pre-wrap">{data?.email_draft}</div>
            <button onClick={onClose} className="w-full py-2 bg-emerald-600 text-white rounded font-medium">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
