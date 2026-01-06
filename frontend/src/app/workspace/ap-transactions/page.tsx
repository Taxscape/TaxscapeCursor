"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getAPTransactions, createAPTransaction, getVendors } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { APTransaction, Vendor } from '@/lib/types';

export default function APTransactionsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  
  const numericTaxYear = parseInt(taxYear) || 2024;
  
  // Fetch AP transactions
  const { data, isLoading, error } = useQuery({
    queryKey: ['ap-transactions', clientId, numericTaxYear],
    queryFn: () => getAPTransactions(clientId!, numericTaxYear),
    enabled: !!clientId,
  });
  
  // Fetch vendors for reference
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', clientId],
    queryFn: () => getVendors(clientId!, false),
    enabled: !!clientId,
  });
  
  const transactions = data?.data ?? [];
  const vendors = vendorsData?.data ?? [];
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<APTransaction>) => createAPTransaction(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-transactions', clientId, numericTaxYear] });
      queryClient.invalidateQueries({ queryKey: ['qre-summary', clientId, numericTaxYear] });
      setIsCreating(false);
    },
  });
  
  // Calculate totals
  const totals = useMemo(() => ({
    amount: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
    qreAmount: transactions.reduce((sum, t) => sum + (t.qre_amount || 0), 0),
    qualifiedCount: transactions.filter(t => t.is_qualified_contract_research).length,
  }), [transactions]);
  
  // Table columns
  const columns: ColumnDef<APTransaction & { id: string }>[] = useMemo(() => [
    {
      id: 'transaction_id_natural',
      header: 'Transaction ID',
      accessor: 'transaction_id_natural',
      width: 140,
      sortable: true,
    },
    {
      id: 'invoice_number',
      header: 'Invoice #',
      accessor: 'invoice_number',
      width: 120,
      renderCell: (value) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'vendor_id',
      header: 'Vendor',
      accessor: 'vendor_id',
      width: 180,
      sortable: true,
      renderCell: (value) => {
        if (!value) return <span className="text-muted-foreground italic">No vendor</span>;
        const vendor = vendorMap.get(value);
        return vendor?.name || <span className="font-mono text-xs">{value.slice(0, 8)}...</span>;
      },
    },
    {
      id: 'description',
      header: 'Description',
      accessor: 'description',
      width: 200,
      renderCell: (value) => (
        <span className="truncate" title={value}>{value || '—'}</span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      accessor: 'category',
      width: 130,
      renderCell: (value) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'invoice_date',
      header: 'Invoice Date',
      accessor: 'invoice_date',
      width: 120,
      sortable: true,
      renderCell: (value) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      width: 120,
      sortable: true,
      renderCell: (value) => (
        <span className="font-semibold">${value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
    },
    {
      id: 'qre_eligible_percent',
      header: 'QRE %',
      accessor: 'qre_eligible_percent',
      width: 80,
      renderCell: (value) => (
        <span className={value > 0 ? 'text-green-400' : 'text-muted-foreground'}>
          {value}%
        </span>
      ),
    },
    {
      id: 'qre_amount',
      header: 'QRE Amount',
      accessor: 'qre_amount',
      width: 120,
      sortable: true,
      renderCell: (value) => (
        <span className={`font-semibold ${value > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
          ${value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      id: 'is_qualified_contract_research',
      header: 'Qualified',
      accessor: 'is_qualified_contract_research',
      width: 100,
      sortable: true,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          value ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
        }`}>
          {value ? '✓ Yes' : 'No'}
        </span>
      ),
    },
    {
      id: 'source_type',
      header: 'Source',
      accessor: 'source_type',
      width: 90,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs ${
          value === 'import_excel' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
        }`}>
          {value}
        </span>
      ),
    },
  ], [vendorMap]);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their AP transactions." />;
  }
  
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">Failed to load AP transactions. Please try again.</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AP Transactions</h1>
          <p className="text-muted-foreground">Accounts payable for contract research (65% rule)</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {transactions.length} transactions
          </span>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Transaction
          </button>
        </div>
      </div>
      
      {/* Summary bar */}
      <div className="px-6 py-3 bg-muted/30 border-b border-border flex items-center gap-8 text-sm">
        <div>
          <span className="text-muted-foreground">Total Amount: </span>
          <span className="font-semibold text-foreground">${totals.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total QRE: </span>
          <span className="font-semibold text-green-400">${totals.qreAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Qualified: </span>
          <span className="font-semibold text-foreground">{totals.qualifiedCount} / {transactions.length}</span>
        </div>
        <div className="ml-auto text-muted-foreground">
          <strong>Note:</strong> Contract research QRE = Amount × QRE% × 65%
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <VirtualTable
          data={transactions.map(t => ({ ...t, id: t.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No AP transactions yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal */}
      {isCreating && (
        <CreateAPTransactionModal
          vendors={vendors}
          onClose={() => setIsCreating(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateAPTransactionModal({
  vendors,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  vendors: Vendor[];
  onClose: () => void;
  onSubmit: (data: Partial<APTransaction>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    transaction_id_natural: '',
    vendor_id: '',
    invoice_number: '',
    description: '',
    category: '',
    invoice_date: '',
    amount: 0,
    qre_eligible_percent: 0,
    tax_year: new Date().getFullYear(),
  });
  
  const qreAmount = form.amount * (form.qre_eligible_percent / 100) * 0.65;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      vendor_id: form.vendor_id || undefined,
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Add AP Transaction</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Transaction ID</label>
              <input
                type="text"
                value={form.transaction_id_natural}
                onChange={e => setForm(f => ({ ...f, transaction_id_natural: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. INV-2024-001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Invoice #</label>
              <input
                type="text"
                value={form.invoice_number}
                onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="Optional"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Vendor</label>
            <select
              value={form.vendor_id}
              onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
            >
              <option value="">-- No Vendor --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.is_qualified_contract_research && '(Qualified)'}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              placeholder="Description of services"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. Contract Research"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Invoice Date</label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">QRE Eligible %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.qre_eligible_percent}
                onChange={e => setForm(f => ({ ...f, qre_eligible_percent: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              />
            </div>
          </div>
          
          {qreAmount > 0 && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm text-green-400">
                QRE Amount: <strong>${qreAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                <span className="text-muted-foreground ml-2">(= ${form.amount} × {form.qre_eligible_percent}% × 65%)</span>
              </p>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}

