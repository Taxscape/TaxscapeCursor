"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getContractors, createContractor, type Contractor } from '@/lib/api';

export default function ContractorsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newContractor, setNewContractor] = useState({ 
    name: '', 
    company: '', 
    services_description: '',
    total_payments: 0, 
    qualified_percent: 65, // Default 65% rule
  });
  
  // Fetch contractors (scoped to client + tax_year)
  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors', clientId, taxYear],
    queryFn: () => getContractors(clientId!, Number(taxYear)),
    enabled: !!clientId,
  });
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof newContractor) => createContractor(data, clientId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractors', clientId, taxYear] });
      setShowCreateModal(false);
      setNewContractor({ name: '', company: '', services_description: '', total_payments: 0, qualified_percent: 65 });
    },
  });
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-4">
          <ContractIcon className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to view their contractors.</p>
      </div>
    );
  }
  
  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const handleCreateContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newContractor);
  };
  
  const totalPayments = contractors.reduce((sum: number, c: Contractor) => sum + (c.total_payments || 0), 0);
  const totalQRE = contractors.reduce((sum: number, c: Contractor) => sum + ((c.total_payments || 0) * (c.qualified_percent || 65) / 100), 0);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Contractors</h1>
          <p className="text-gray-400">Manage contract research expenses (65% rule)</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2"
        >
          <PlusIcon />
          Add Contractor
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Contractors</p>
          <p className="text-2xl font-bold text-white">{contractors.length}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Payments</p>
          <p className="text-2xl font-bold text-orange-400">${totalPayments.toLocaleString()}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">QRE (65% Rule)</p>
          <p className="text-2xl font-bold text-green-400">${totalQRE.toLocaleString()}</p>
        </div>
      </div>
      
      {/* Info Banner */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
        <p className="text-sm text-orange-400">
          <strong>65% Rule:</strong> For contract research expenses, only 65% of amounts paid to contractors for qualified research is included as QRE under IRC §41(b)(3).
        </p>
      </div>
      
      {/* Contractors List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {contractors.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <ContractIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No contractors yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              Add First Contractor
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Contractor</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Company</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Services</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Payments</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">QRE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contractors.map((contractor: Contractor) => (
                <tr key={contractor.id} className="hover:bg-white/5">
                  <td className="py-3 px-4">
                    <p className="font-medium text-white">{contractor.name}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400">{contractor.company || '-'}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400 truncate max-w-xs">
                      {contractor.services_description || '-'}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-white">${(contractor.total_payments || 0).toLocaleString()}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-green-400 font-medium">
                      ${((contractor.total_payments || 0) * 0.65).toLocaleString()}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Contractor</h3>
            <form onSubmit={handleCreateContractor} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Contact Name *</label>
                  <input
                    type="text"
                    value={newContractor.name}
                    onChange={(e) => setNewContractor(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Company</label>
                  <input
                    type="text"
                    value={newContractor.company}
                    onChange={(e) => setNewContractor(prev => ({ ...prev, company: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Services Description</label>
                <textarea
                  value={newContractor.services_description}
                  onChange={(e) => setNewContractor(prev => ({ ...prev, services_description: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-20"
                  placeholder="Describe the R&D services provided..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Total Payments</label>
                <input
                  type="number"
                  value={newContractor.total_payments}
                  onChange={(e) => setNewContractor(prev => ({ ...prev, total_payments: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newContractor.name}
                  className="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Add Contractor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function ContractIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
