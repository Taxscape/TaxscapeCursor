"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getExpenses, createExpense, getSupplies, createSupply, type Expense, type Supply } from '@/lib/api';

export default function ExpensesPage() {
  const { clientId, taxYear, orgId } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'expenses' | 'supplies'>('expenses');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newItem, setNewItem] = useState({ 
    description: '', 
    amount: 0, 
    category: '',
    vendor: '',
  });
  
  // Fetch expenses
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', clientId],
    queryFn: () => getExpenses(orgId!),
    enabled: !!clientId && !!orgId,
  });
  
  // Fetch supplies
  const { data: suppliesData, isLoading: suppliesLoading } = useQuery({
    queryKey: ['supplies', clientId],
    queryFn: () => getSupplies(clientId!, parseInt(taxYear)),
    enabled: !!clientId,
  });
  
  const supplies = suppliesData?.data || [];
  
  // Create expense mutation
  const createExpenseMutation = useMutation({
    mutationFn: (data: typeof newItem) => createExpense(orgId!, {
      description: data.description,
      amount: data.amount,
      category: data.category,
      vendor_name: data.vendor,
      expense_date: new Date().toISOString().split('T')[0],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', clientId] });
      setShowCreateModal(false);
      resetForm();
    },
  });
  
  // Create supply mutation
  const createSupplyMutation = useMutation({
    mutationFn: (data: typeof newItem) => createSupply(clientId!, {
      item_description: data.description,
      amount: data.amount,
      category: data.category,
      tax_year: parseInt(taxYear),
      is_qre_eligible: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies', clientId] });
      setShowCreateModal(false);
      resetForm();
    },
  });
  
  const resetForm = () => {
    setNewItem({ description: '', amount: 0, category: '', vendor: '' });
  };
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mb-4">
          <DollarIcon className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to view their expenses.</p>
      </div>
    );
  }
  
  const isLoading = expensesLoading || suppliesLoading;
  
  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'expenses') {
      createExpenseMutation.mutate(newItem);
    } else {
      createSupplyMutation.mutate(newItem);
    }
  };
  
  const totalExpenses = expenses.reduce((sum: number, e: Expense) => sum + (e.amount || 0), 0);
  const totalSupplies = supplies.reduce((sum: number, s: Supply) => sum + (s.amount || 0), 0);
  
  const currentItems = activeTab === 'expenses' ? expenses : supplies;
  const isCreating = activeTab === 'expenses' ? createExpenseMutation.isPending : createSupplyMutation.isPending;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Expenses & Supplies</h1>
          <p className="text-gray-400">Track R&D-related expenses and supply costs</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
        >
          <PlusIcon />
          Add {activeTab === 'expenses' ? 'Expense' : 'Supply'}
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-green-400">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Supplies</p>
          <p className="text-2xl font-bold text-blue-400">${totalSupplies.toLocaleString()}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Combined QRE</p>
          <p className="text-2xl font-bold text-white">${(totalExpenses + totalSupplies).toLocaleString()}</p>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'expenses'
              ? 'bg-green-500/20 text-green-400 border-b-2 border-green-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Expenses ({expenses.length})
        </button>
        <button
          onClick={() => setActiveTab('supplies')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'supplies'
              ? 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Supplies ({supplies.length})
        </button>
      </div>
      
      {/* Items List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {currentItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <DollarIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No {activeTab} yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className={`px-4 py-2 text-white rounded-lg ${
                activeTab === 'expenses' ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              Add First {activeTab === 'expenses' ? 'Expense' : 'Supply'}
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Description</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Vendor</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {currentItems.map((item: any) => (
                <tr key={item.id} className="hover:bg-white/5">
                  <td className="py-3 px-4">
                    <p className="font-medium text-white">{item.description}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400">{item.category || '-'}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400">{item.vendor || '-'}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-white font-medium">${(item.amount || 0).toLocaleString()}</p>
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
            <h3 className="text-lg font-semibold text-white mb-4">
              Add New {activeTab === 'expenses' ? 'Expense' : 'Supply'}
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Description *</label>
                <input
                  type="text"
                  value={newItem.description}
                  onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Category</label>
                  <input
                    type="text"
                    value={newItem.category}
                    onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Vendor</label>
                  <input
                    type="text"
                    value={newItem.vendor}
                    onChange={(e) => setNewItem(prev => ({ ...prev, vendor: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Amount</label>
                <input
                  type="number"
                  value={newItem.amount}
                  onChange={(e) => setNewItem(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newItem.description}
                  className={`flex-1 py-2 text-white rounded-lg disabled:opacity-50 ${
                    activeTab === 'expenses' 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {isCreating ? 'Creating...' : 'Add'}
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
function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
