"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getContracts, createContract } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Contract } from '@/lib/types';

export default function ContractsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  
  // Fetch contracts
  const { data, isLoading, error } = useQuery({
    queryKey: ['contracts', clientId],
    queryFn: () => getContracts(clientId!),
    enabled: !!clientId,
  });
  
  const contracts = data?.data ?? [];
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Contract>) => createContract(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', clientId] });
      setIsCreating(false);
    },
  });
  
  // Table columns
  const columns: ColumnDef<Contract & { id: string }>[] = useMemo(() => [
    {
      id: 'contract_id_natural',
      header: 'Contract ID',
      accessor: 'contract_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'title',
      header: 'Title',
      accessor: 'title',
      width: 250,
      sortable: true,
    },
    {
      id: 'vendor_id',
      header: 'Vendor',
      accessor: 'vendor_id',
      width: 180,
      sortable: true,
      renderCell: (value) => value ? <span className="font-mono text-xs">{String(value).slice(0, 8)}...</span> : <span className="text-muted-foreground italic">No vendor</span>,
    },
    {
      id: 'total_value',
      header: 'Total Value',
      accessor: 'total_value',
      width: 130,
      sortable: true,
      renderCell: (value) => value ? <span className="font-semibold">${Number(value).toLocaleString()}</span> : '-',
    },
    {
      id: 'effective_date',
      header: 'Start Date',
      accessor: 'effective_date',
      width: 120,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'expiration_date',
      header: 'End Date',
      accessor: 'expiration_date',
      width: 120,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'is_qualified_contract_research',
      header: 'Qualified',
      accessor: 'is_qualified_contract_research',
      width: 130,
      sortable: true,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          value ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {value ? '✓ Qualified' : '✗ Not Qualified'}
        </span>
      ),
    },
    {
      id: 'source_type',
      header: 'Source',
      accessor: 'source_type',
      width: 100,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs ${
          value === 'import_excel' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
        }`}>
          {value}
        </span>
      ),
    },
  ], []);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their contracts." />;
  }
  
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">Failed to load contracts. Please try again.</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contracts</h1>
          <p className="text-muted-foreground">Vendor contracts and Sec.41 qualified contract research</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {contracts.length} contracts
          </span>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Contract
          </button>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <VirtualTable
          data={contracts.map(c => ({ ...c, id: c.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No contracts yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal */}
      {isCreating && (
        <CreateContractModal
          onClose={() => setIsCreating(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateContractModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<Contract>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    contract_id_natural: '',
    vendor_id: '',
    title: '',
    sow_summary: '',
    effective_date: '',
    expiration_date: '',
    total_value: 0,
    is_qualified_contract_research: false,
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      effective_date: form.effective_date || undefined,
      expiration_date: form.expiration_date || undefined,
      total_value: form.total_value || undefined,
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Add Contract</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Contract ID</label>
              <input
                type="text"
                value={form.contract_id_natural}
                onChange={e => setForm(f => ({ ...f, contract_id_natural: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. CTR-001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Vendor ID</label>
              <input
                type="text"
                value={form.vendor_id}
                onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="Vendor UUID"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              placeholder="Contract title"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">SOW Summary</label>
            <textarea
              value={form.sow_summary}
              onChange={e => setForm(f => ({ ...f, sow_summary: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground h-20"
              placeholder="Statement of work summary..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Effective Date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Expiration Date</label>
              <input
                type="date"
                value={form.expiration_date}
                onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Total Value ($)</label>
            <input
              type="number"
              value={form.total_value}
              onChange={e => setForm(f => ({ ...f, total_value: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              min="0"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="qualified"
              checked={form.is_qualified_contract_research}
              onChange={e => setForm(f => ({ ...f, is_qualified_contract_research: e.target.checked }))}
              className="rounded border-border"
            />
            <label htmlFor="qualified" className="text-sm text-foreground">
              Qualified Contract Research (Sec.41)
            </label>
          </div>
          
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
              {isSubmitting ? 'Creating...' : 'Create Contract'}
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}
