'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import {
  listEstimates,
  getEstimate,
  draftEstimate,
  updateEstimate,
  submitForSignoff,
  signoffEstimate,
  exportEstimate,
  generateEmailDraft,
  markEstimateSent,
  recomputeEstimate,
  CreditEstimate,
  EstimateDetailResponse,
  Assumption,
  RiskNote,
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

export default function CreditRangePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);

  const clientId = profile?.selected_client_id;
  const isSenior = profile?.role_level === 'senior' || 
                   profile?.role_level === 'director' || 
                   profile?.role_level === 'partner' ||
                   profile?.role === 'executive';

  // Fetch estimates for client
  const { data: estimatesData, isLoading } = useQuery({
    queryKey: ['credit-estimates', clientId, taxYear],
    queryFn: () => listEstimates({ client_id: clientId, tax_year: taxYear }),
    enabled: !!clientId,
  });

  const estimates = estimatesData?.estimates || [];
  const currentEstimate = estimates.find(e => e.status !== 'superseded');

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
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
    </div>
  );
}

// ============================================================================
// Sub-Components
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

      {/* Range Display */}
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

      {/* Completeness Bar */}
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

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {estimate.assumptions.length}
          </div>
          <div className="text-xs text-zinc-500">Assumptions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {estimate.risk_notes.length}
          </div>
          <div className="text-xs text-zinc-500">Risk Notes</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {estimate.missing_inputs.length}
          </div>
          <div className="text-xs text-zinc-500">Missing Items</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {formatPercentage(base.effective_rate || 0.065)}
          </div>
          <div className="text-xs text-zinc-500">Effective Rate</div>
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
      <div className="text-2xl font-bold">{formatCurrency(credit)}</div>
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
  const [showSignoffForm, setShowSignoffForm] = useState(false);
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
    onSuccess: (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
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

  const { estimate, signoffs, exports, version_history, is_stale, stale_reason } = data;
  const canEdit = estimate.status === 'draft' || estimate.status === 'rejected';
  const canSubmit = estimate.status === 'draft';
  const canSignoff = estimate.status === 'pending_senior_signoff' && isSenior;
  const canExport = estimate.status === 'approved' || estimate.status === 'pending_senior_signoff';
  const canMarkSent = estimate.status === 'approved';

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">Version {estimate.estimate_version}</h3>
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

        {/* Stale Warning */}
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

      {/* Tabs */}
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

      {/* Tab Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {activeTab === 'breakdown' && (
          <BreakdownTab estimate={estimate} />
        )}

        {activeTab === 'assumptions' && (
          <AssumptionsTab
            assumptions={estimate.assumptions}
            canEdit={canEdit}
            estimateId={estimateId}
          />
        )}

        {activeTab === 'risks' && (
          <RisksTab
            risks={estimate.risk_notes}
            missingInputs={estimate.missing_inputs}
          />
        )}

        {activeTab === 'signoff' && (
          <SignoffTab
            estimate={estimate}
            signoffs={signoffs}
            canSignoff={canSignoff}
            estimateId={estimateId}
          />
        )}

        {activeTab === 'export' && (
          <ExportTab
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

      {/* Actions */}
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

        {canExport && (
          <button
            onClick={() => exportMutation.mutate('pdf')}
            disabled={exportMutation.isPending}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {exportMutation.isPending ? 'Exporting...' : 'Export PDF'}
          </button>
        )}
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <EmailDraftModal
          estimateId={estimateId}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tab Components
// ============================================================================

function BreakdownTab({ estimate }: { estimate: CreditEstimate }) {
  const { range_low, range_base, range_high } = estimate;

  return (
    <div className="space-y-6">
      {/* QRE Breakdown Table */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3">QRE Breakdown</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-2">Category</th>
              <th className="text-right py-2">Conservative</th>
              <th className="text-right py-2">Base</th>
              <th className="text-right py-2">Optimistic</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-800">
              <td className="py-2">Wage QRE</td>
              <td className="text-right">{formatCurrency(range_low.wage_qre)}</td>
              <td className="text-right font-medium">{formatCurrency(range_base.wage_qre)}</td>
              <td className="text-right">{formatCurrency(range_high.wage_qre)}</td>
            </tr>
            <tr className="border-b border-zinc-800">
              <td className="py-2">Supply QRE</td>
              <td className="text-right">{formatCurrency(range_low.supply_qre)}</td>
              <td className="text-right font-medium">{formatCurrency(range_base.supply_qre)}</td>
              <td className="text-right">{formatCurrency(range_high.supply_qre)}</td>
            </tr>
            <tr className="border-b border-zinc-800">
              <td className="py-2">Contract QRE</td>
              <td className="text-right">{formatCurrency(range_low.contract_qre)}</td>
              <td className="text-right font-medium">{formatCurrency(range_base.contract_qre)}</td>
              <td className="text-right">{formatCurrency(range_high.contract_qre)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-2">Total QRE</td>
              <td className="text-right">{formatCurrency(range_low.total_qre)}</td>
              <td className="text-right text-emerald-400">{formatCurrency(range_base.total_qre)}</td>
              <td className="text-right">{formatCurrency(range_high.total_qre)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Credit Estimates */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3">Credit Estimates</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-2">Method</th>
              <th className="text-right py-2">Conservative</th>
              <th className="text-right py-2">Base</th>
              <th className="text-right py-2">Optimistic</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-800">
              <td className="py-2">Regular Credit</td>
              <td className="text-right">{formatCurrency(range_low.credit_amount_regular || 0)}</td>
              <td className="text-right">{formatCurrency(range_base.credit_amount_regular || 0)}</td>
              <td className="text-right">{formatCurrency(range_high.credit_amount_regular || 0)}</td>
            </tr>
            <tr className="border-b border-zinc-800">
              <td className="py-2">ASC Credit</td>
              <td className="text-right">{formatCurrency(range_low.credit_amount_asc || 0)}</td>
              <td className="text-right">{formatCurrency(range_base.credit_amount_asc || 0)}</td>
              <td className="text-right">{formatCurrency(range_high.credit_amount_asc || 0)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-2">Selected Credit</td>
              <td className="text-right">{formatCurrency(range_low.credit_amount_selected || 0)}</td>
              <td className="text-right text-emerald-400">{formatCurrency(range_base.credit_amount_selected || 0)}</td>
              <td className="text-right">{formatCurrency(range_high.credit_amount_selected || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Methodology */}
      <div className="p-4 bg-zinc-800 rounded-lg">
        <div className="text-sm text-zinc-400">Methodology</div>
        <div className="font-medium mt-1 capitalize">{estimate.methodology}</div>
      </div>
    </div>
  );
}

function AssumptionsTab({
  assumptions,
  canEdit,
  estimateId,
}: {
  assumptions: Assumption[];
  canEdit: boolean;
  estimateId: string;
}) {
  const systemAssumptions = assumptions.filter(a => a.source === 'system_default');
  const userAssumptions = assumptions.filter(a => a.source === 'user_entered');
  const seniorAssumptions = assumptions.filter(a => a.source === 'senior_override');

  return (
    <div className="space-y-6">
      {/* System Assumptions */}
      {systemAssumptions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">System Assumptions</h4>
          <div className="space-y-2">
            {systemAssumptions.map((assumption) => (
              <AssumptionCard key={assumption.assumption_id} assumption={assumption} />
            ))}
          </div>
        </div>
      )}

      {/* User Assumptions */}
      {userAssumptions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">User Assumptions</h4>
          <div className="space-y-2">
            {userAssumptions.map((assumption) => (
              <AssumptionCard key={assumption.assumption_id} assumption={assumption} />
            ))}
          </div>
        </div>
      )}

      {/* Senior Overrides */}
      {seniorAssumptions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Senior Overrides</h4>
          <div className="space-y-2">
            {seniorAssumptions.map((assumption) => (
              <AssumptionCard key={assumption.assumption_id} assumption={assumption} />
            ))}
          </div>
        </div>
      )}

      {assumptions.length === 0 && (
        <p className="text-zinc-500 text-center py-8">No assumptions recorded</p>
      )}
    </div>
  );
}

function AssumptionCard({ assumption }: { assumption: Assumption }) {
  return (
    <div className="p-3 bg-zinc-800 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium text-white">{assumption.title}</div>
          <p className="text-sm text-zinc-400 mt-1">{assumption.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${getImpactColor(assumption.impact_direction)}`}>
            {assumption.impact_direction === 'increases' ? '↑' :
             assumption.impact_direction === 'decreases' ? '↓' : '~'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${getSeverityColor(assumption.impact_band)}`}>
            {assumption.impact_band}
          </span>
        </div>
      </div>
      {assumption.numeric_effect && (
        <div className="mt-2 text-xs text-zinc-500">
          Effect: {Object.entries(assumption.numeric_effect).map(([k, v]) => 
            `${k}: ${formatCurrency(v as number)}`
          ).join(', ')}
        </div>
      )}
    </div>
  );
}

function RisksTab({
  risks,
  missingInputs,
}: {
  risks: RiskNote[];
  missingInputs: CreditEstimate['missing_inputs'];
}) {
  return (
    <div className="space-y-6">
      {/* Risk Notes */}
      {risks.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Risk Notes</h4>
          <div className="space-y-2">
            {risks.map((risk) => (
              <div key={risk.risk_id} className="p-3 bg-zinc-800 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="font-medium text-white">{risk.title}</div>
                  <span className={`px-2 py-0.5 rounded text-xs ${getSeverityColor(risk.severity)}`}>
                    {risk.severity}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mt-1">{risk.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing Inputs */}
      {missingInputs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Missing Inputs</h4>
          <div className="space-y-2">
            {missingInputs.map((item, idx) => (
              <div key={idx} className="p-3 bg-zinc-800 rounded-lg">
                <div className="font-medium text-white">{item.label}</div>
                <p className="text-sm text-zinc-400 mt-1">{item.impact}</p>
                <div className="text-xs text-zinc-500 mt-1">Source: {item.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {risks.length === 0 && missingInputs.length === 0 && (
        <p className="text-zinc-500 text-center py-8">No risks or missing inputs identified</p>
      )}
    </div>
  );
}

function SignoffTab({
  estimate,
  signoffs,
  canSignoff,
  estimateId,
}: {
  estimate: CreditEstimate;
  signoffs: any[];
  canSignoff: boolean;
  estimateId: string;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [decision, setDecision] = useState<SignoffDecision>('approved');
  const [reasonCode, setReasonCode] = useState<SignoffReasonCode>('sufficient_support');
  const [note, setNote] = useState('');

  const signoffMutation = useMutation({
    mutationFn: () => signoffEstimate(estimateId, { decision, reason_code: reasonCode, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-estimate', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['credit-estimates'] });
      setShowForm(false);
    },
  });

  return (
    <div className="space-y-6">
      {/* Approval Status */}
      {estimate.approved_by_user_id && (
        <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
          <div className="text-emerald-400 font-medium">Approved</div>
          <div className="text-sm text-zinc-400 mt-1">
            Approved on {new Date(estimate.approved_at!).toLocaleString()}
          </div>
        </div>
      )}

      {/* Signoff History */}
      {signoffs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Signoff History</h4>
          <div className="space-y-2">
            {signoffs.map((signoff) => (
              <div key={signoff.id} className="p-3 bg-zinc-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    signoff.decision === 'approved' ? 'bg-green-900/50 text-green-300' :
                    signoff.decision === 'rejected' ? 'bg-red-900/50 text-red-300' :
                    'bg-yellow-900/50 text-yellow-300'
                  }`}>
                    {signoff.decision}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(signoff.decided_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-zinc-400 mt-2">
                  {getReasonCodeLabel(signoff.reason_code)}: {signoff.note}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  By: {signoff.profiles?.full_name || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signoff Form */}
      {canSignoff && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors"
        >
          Sign Off on This Estimate
        </button>
      )}

      {showForm && (
        <div className="p-4 bg-zinc-800 rounded-lg space-y-4">
          <h4 className="font-medium">Senior Signoff</h4>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Decision</label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as SignoffDecision)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              <option value="changes_requested">Request Changes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Reason Code</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as SignoffReasonCode)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="sufficient_support">Sufficient Support</option>
              <option value="insufficient_support">Insufficient Support</option>
              <option value="material_uncertainty">Material Uncertainty</option>
              <option value="requires_more_evidence">Requires More Evidence</option>
              <option value="methodology_change">Methodology Change</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Note (Required)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white resize-none"
              rows={3}
              placeholder="Explain your decision..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => signoffMutation.mutate()}
              disabled={signoffMutation.isPending || !note.trim()}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {signoffMutation.isPending ? 'Signing...' : 'Submit Decision'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportTab({
  estimate,
  exports,
  canExport,
  canMarkSent,
  onExport,
  onShowEmail,
  onMarkSent,
  isExporting,
}: {
  estimate: CreditEstimate;
  exports: any[];
  canExport: boolean;
  canMarkSent: boolean;
  onExport: (type: 'pdf' | 'docx') => void;
  onShowEmail: () => void;
  onMarkSent: () => void;
  isExporting: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Export Actions */}
      {canExport && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onExport('pdf')}
            disabled={isExporting}
            className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-center transition-colors disabled:opacity-50"
          >
            <svg className="w-8 h-8 mx-auto text-red-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div className="font-medium">Export PDF</div>
          </button>
          <button
            onClick={() => onExport('docx')}
            disabled={isExporting}
            className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-center transition-colors disabled:opacity-50"
          >
            <svg className="w-8 h-8 mx-auto text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="font-medium">Export DOCX</div>
          </button>
        </div>
      )}

      {/* Email Draft */}
      {canMarkSent && (
        <div className="p-4 bg-zinc-800 rounded-lg">
          <h4 className="font-medium mb-3">Client Delivery</h4>
          <div className="flex gap-3">
            <button
              onClick={onShowEmail}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
            >
              Generate Email Draft
            </button>
            <button
              onClick={onMarkSent}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
            >
              Mark as Sent
            </button>
          </div>
        </div>
      )}

      {/* Export History */}
      {exports.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Export History</h4>
          <div className="space-y-2">
            {exports.map((exp) => (
              <div key={exp.id} className="p-3 bg-zinc-800 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-medium uppercase text-sm">{exp.export_type}</span>
                  <span className="text-xs text-zinc-500 ml-2">
                    {new Date(exp.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!canExport && (
        <p className="text-zinc-500 text-center py-8">
          Estimate must be approved before export
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================

function DraftEstimateModal({
  clientId,
  taxYear,
  onClose,
  onCreated,
}: {
  clientId: string;
  taxYear: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [methodology, setMethodology] = useState<'both' | 'regular' | 'asc'>('both');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const result = await draftEstimate({
        client_company_id: clientId,
        tax_year: taxYear,
        methodology,
      });
      onCreated(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create estimate');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-md">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg">Draft New Estimate</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-4 bg-zinc-800 rounded-lg">
            <div className="text-sm text-zinc-400">Tax Year</div>
            <div className="text-2xl font-bold">{taxYear}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Methodology</label>
            <select
              value={methodology}
              onChange={(e) => setMethodology(e.target.value as any)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
            >
              <option value="both">Both (Regular & ASC)</option>
              <option value="regular">Regular Credit Only</option>
              <option value="asc">ASC Credit Only</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Computing...' : 'Draft Estimate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailDraftModal({
  estimateId,
  onClose,
}: {
  estimateId: string;
  onClose: () => void;
}) {
  const [emailData, setEmailData] = useState<{ email_draft: string; to?: string; subject: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    generateEmailDraft(estimateId)
      .then(setEmailData)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [estimateId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg">Email Draft</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-red-400 text-center py-8">{error}</div>
          ) : emailData ? (
            <div className="space-y-4">
              {emailData.to && (
                <div>
                  <label className="text-sm text-zinc-400">To:</label>
                  <div className="text-white">{emailData.to}</div>
                </div>
              )}
              <div>
                <label className="text-sm text-zinc-400">Subject:</label>
                <div className="text-white">{emailData.subject}</div>
              </div>
              <div>
                <label className="text-sm text-zinc-400">Body:</label>
                <pre className="mt-2 p-4 bg-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap font-sans">
                  {emailData.email_draft}
                </pre>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={() => emailData && navigator.clipboard.writeText(emailData.email_draft)}
            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Copy to Clipboard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
