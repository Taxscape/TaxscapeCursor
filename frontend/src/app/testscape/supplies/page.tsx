"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getSupplies, createSupply } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Supply } from '@/lib/types';

export default function SuppliesPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [qreOnly, setQreOnly] = useState(false);
  
  const numericTaxYear = parseInt(taxYear) || 2024;
  
  // Fetch supplies
  const { data, isLoading, error } = useQuery({
    queryKey: ['supplies', clientId, numericTaxYear, qreOnly],
    queryFn: () => getSupplies(clientId!, numericTaxYear, { qreEligibleOnly: qreOnly }),
    enabled: !!clientId,
  });
  
  const supplies = data?.data ?? [];
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Supply>) => createSupply(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies', clientId] });
      setIsCreating(false);
    },
  });
  
  // Table columns
  const columns: ColumnDef<Supply & { id: string }>[] = useMemo(() => [
    {
      id: 'supply_id_natural',
      header: 'Supply ID',
      accessor: 'supply_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'item_description',
      header: 'Description',
      accessor: 'item_description',
      width: 280,
      sortable: true,
    },
    {
      id: 'category',
      header: 'Category',
      accessor: 'category',
      width: 130,
      sortable: true,
      renderCell: (value) => value || <span className="text-gray-500 italic">Uncategorized</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      width: 120,
      sortable: true,
      renderCell: (value) => <span className="font-semibold text-white">${Number(value).toLocaleString()}</span>,
    },
    {
      id: 'project_id',
      header: 'Project',
      accessor: 'project_id',
      width: 180,
      renderCell: (value) => value ? <span className="font-mono text-xs text-gray-400">{String(value).slice(0, 8)}...</span> : <span className="text-gray-500 italic">No project</span>,
    },
    {
      id: 'purchase_date',
      header: 'Purchase Date',
      accessor: 'purchase_date',
      width: 130,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'is_qre_eligible',
      header: 'QRE Eligible',
      accessor: 'is_qre_eligible',
      width: 110,
      sortable: true,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          value ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'
        }`}>
          {value ? '✓ Yes' : 'No'}
        </span>
      ),
    },
    {
      id: 'qre_amount',
      header: 'QRE Amount',
      accessor: 'qre_amount',
      width: 120,
      sortable: true,
      renderCell: (value) => <span className="font-semibold text-green-400">${Number(value || 0).toLocaleString()}</span>,
    },
    {
      id: 'gl_account',
      header: 'GL Account',
      accessor: 'gl_account',
      width: 100,
      renderCell: (value) => value || '-',
    },
  ], []);
  
  // Calculate totals
  const totalAmount = supplies.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalQRE = supplies.reduce((sum, s) => sum + (s.qre_amount || 0), 0);
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their supplies data.
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Supplies</h1>
          <p className="text-gray-400">R&D supplies and QRE eligibility tracking</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={qreOnly}
              onChange={e => setQreOnly(e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            QRE eligible only
          </label>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium flex items-center gap-2 transition-colors"
          >
            <PlusIcon />
            Add Supply
          </button>
        </div>
      </div>
      
      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Items</p>
          <p className="text-2xl font-bold text-white">{supplies.length}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Amount</p>
          <p className="text-2xl font-bold text-white">${totalAmount.toLocaleString()}</p>
        </div>
        <div className="bg-[#12121a] border border-green-500/20 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1 text-green-400">Total QRE</p>
          <p className="text-2xl font-bold text-green-400">${totalQRE.toLocaleString()}</p>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 bg-[#12121a] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
        <VirtualTable
          data={supplies.map(s => ({ ...s, id: s.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No supplies yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal */}
      {isCreating && (
        <CreateSupplyModal
          onClose={() => setIsCreating(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
          taxYear={numericTaxYear}
        />
      )}
    </div>
  );
}

function CreateSupplyModal({
  onClose,
  onSubmit,
  isSubmitting,
  taxYear,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<Supply>) => void;
  isSubmitting: boolean;
  taxYear: number;
}) {
  const [form, setForm] = useState({
    supply_id_natural: '',
    item_description: '',
    category: '',
    amount: 0,
    project_id: '',
    purchase_date: '',
    gl_account: '',
    is_qre_eligible: false,
    qre_amount: 0,
    tax_year: taxYear,
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      project_id: form.project_id || undefined,
      purchase_date: form.purchase_date || undefined,
      gl_account: form.gl_account || undefined,
      qre_amount: form.is_qre_eligible ? (form.qre_amount || form.amount) : 0,
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#1a1a22] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6 mx-4">
        <h2 className="text-xl font-semibold text-white mb-6">Add Supply</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Supply ID *</label>
              <input
                type="text"
                value={form.supply_id_natural}
                onChange={e => setForm(f => ({ ...f, supply_id_natural: e.target.value }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="e.g. SUP-001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">Select category</option>
                <option value="lab_supplies">Lab Supplies</option>
                <option value="materials">Materials</option>
                <option value="equipment">Equipment</option>
                <option value="software">Software</option>
                <option value="consumables">Consumables</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description *</label>
            <input
              type="text"
              value={form.item_description}
              onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Item description"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount ($) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Project ID</label>
              <input
                type="text"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Optional Project UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">GL Account</label>
              <input
                type="text"
                value={form.gl_account}
                onChange={e => setForm(f => ({ ...f, gl_account: e.target.value }))}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="e.g. 6200"
              />
            </div>
          </div>
          
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="qre_eligible"
                checked={form.is_qre_eligible}
                onChange={e => setForm(f => ({ ...f, is_qre_eligible: e.target.checked }))}
                className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500"
              />
              <label htmlFor="qre_eligible" className="text-sm font-medium text-white">
                QRE Eligible
              </label>
            </div>
            
            {form.is_qre_eligible && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">QRE Amount ($)</label>
                <input
                  type="number"
                  value={form.qre_amount || form.amount}
                  onChange={e => setForm(f => ({ ...f, qre_amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-xl text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 font-semibold disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Creating...' : 'Create Supply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
