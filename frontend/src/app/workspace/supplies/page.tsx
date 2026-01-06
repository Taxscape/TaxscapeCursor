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
      renderCell: (value) => value || <span className="text-muted-foreground italic">Uncategorized</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      width: 120,
      sortable: true,
      renderCell: (value) => <span className="font-semibold">${Number(value).toLocaleString()}</span>,
    },
    {
      id: 'project_id',
      header: 'Project',
      accessor: 'project_id',
      width: 180,
      renderCell: (value) => value ? <span className="font-mono text-xs">{String(value).slice(0, 8)}...</span> : <span className="text-muted-foreground italic">No project</span>,
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
          value ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
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
    return <EmptyState title="Select a Client" description="Choose a client company to view their supplies." />;
  }
  
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">Failed to load supplies. Please try again.</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Supplies</h1>
          <p className="text-muted-foreground">R&D supplies and QRE eligibility tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={qreOnly}
              onChange={e => setQreOnly(e.target.checked)}
              className="rounded border-border"
            />
            QRE eligible only
          </label>
          <span className="text-sm text-muted-foreground">
            {supplies.length} supplies
          </span>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Supply
          </button>
        </div>
      </div>
      
      {/* Summary stats */}
      <div className="px-6 py-3 bg-muted/30 border-b border-border flex items-center gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Total Amount:</span>
          <span className="ml-2 font-semibold text-foreground">${totalAmount.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total QRE:</span>
          <span className="ml-2 font-semibold text-green-400">${totalQRE.toLocaleString()}</span>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden">
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Add Supply</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Supply ID</label>
              <input
                type="text"
                value={form.supply_id_natural}
                onChange={e => setForm(f => ({ ...f, supply_id_natural: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. SUP-001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
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
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={form.item_description}
              onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              placeholder="Item description"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount ($)</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project ID (optional)</label>
              <input
                type="text"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="Project UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">GL Account</label>
              <input
                type="text"
                value={form.gl_account}
                onChange={e => setForm(f => ({ ...f, gl_account: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. 6200"
              />
            </div>
          </div>
          
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="qre_eligible"
                checked={form.is_qre_eligible}
                onChange={e => setForm(f => ({ ...f, is_qre_eligible: e.target.checked }))}
                className="rounded border-border"
              />
              <label htmlFor="qre_eligible" className="text-sm text-foreground">
                QRE Eligible
              </label>
            </div>
            
            {form.is_qre_eligible && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">QRE Amount ($)</label>
                <input
                  type="number"
                  value={form.qre_amount || form.amount}
                  onChange={e => setForm(f => ({ ...f, qre_amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
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
              {isSubmitting ? 'Creating...' : 'Create Supply'}
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
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}
