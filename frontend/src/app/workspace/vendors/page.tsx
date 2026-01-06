"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getVendors, createVendor, updateVendor, deleteVendor } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Vendor } from '@/lib/types';

export default function VendorsPage() {
  const { clientId } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  
  // Fetch vendors
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors', clientId, qualifiedOnly],
    queryFn: () => getVendors(clientId!, qualifiedOnly),
    enabled: !!clientId,
  });
  
  const vendors = data?.data ?? [];
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => createVendor(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors', clientId] });
      setIsCreating(false);
    },
  });
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Vendor> }) => updateVendor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors', clientId] });
    },
  });
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVendor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors', clientId] });
    },
  });
  
  // Handle cell edit
  const handleCellEdit = useCallback((rowId: string, columnId: string, value: any) => {
    updateMutation.mutate({ id: rowId, data: { [columnId]: value } });
  }, [updateMutation]);
  
  // Table columns
  const columns: ColumnDef<Vendor & { id: string }>[] = useMemo(() => [
    {
      id: 'vendor_id_natural',
      header: 'Vendor ID',
      accessor: 'vendor_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'name',
      header: 'Name',
      accessor: 'name',
      width: 200,
      sortable: true,
      editable: true,
    },
    {
      id: 'service_type',
      header: 'Service Type',
      accessor: 'service_type',
      width: 150,
      editable: true,
      renderCell: (value) => value || <span className="text-muted-foreground italic">Not specified</span>,
    },
    {
      id: 'country',
      header: 'Country',
      accessor: 'country',
      width: 100,
      sortable: true,
      renderCell: (value) => (
        <span className={value !== 'US' ? 'text-yellow-400' : ''}>{value || 'US'}</span>
      ),
    },
    {
      id: 'risk_bearer',
      header: 'Risk Bearer',
      accessor: 'risk_bearer',
      width: 120,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          value === 'company' ? 'bg-green-500/20 text-green-400' :
          value === 'vendor' ? 'bg-red-500/20 text-red-400' :
          value === 'shared' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {value || 'Unknown'}
        </span>
      ),
    },
    {
      id: 'ip_rights',
      header: 'IP Rights',
      accessor: 'ip_rights',
      width: 120,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          value === 'company' ? 'bg-green-500/20 text-green-400' :
          value === 'vendor' ? 'bg-red-500/20 text-red-400' :
          value === 'shared' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {value || 'Unknown'}
        </span>
      ),
    },
    {
      id: 'is_qualified_contract_research',
      header: 'Sec.41 Qualified',
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
  
  // Bulk actions
  const renderBulkActions = useCallback((selectedIds: Set<string>, clearSelection: () => void) => (
    <>
      <button
        onClick={() => {
          if (confirm(`Delete ${selectedIds.size} vendors?`)) {
            selectedIds.forEach(id => deleteMutation.mutate(id));
            clearSelection();
          }
        }}
        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
      >
        Delete Selected
      </button>
    </>
  ), [deleteMutation]);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their vendors." />;
  }
  
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">Failed to load vendors. Please try again.</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendors</h1>
          <p className="text-muted-foreground">Contract research vendors and Sec.41 qualification status</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={qualifiedOnly}
              onChange={e => setQualifiedOnly(e.target.checked)}
              className="rounded border-border"
            />
            Qualified only
          </label>
          <span className="text-sm text-muted-foreground">
            {vendors.length} vendors
          </span>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Vendor
          </button>
        </div>
      </div>
      
      {/* Info banner */}
      <div className="px-6 py-3 bg-muted/30 border-b border-border text-sm">
        <span className="text-muted-foreground">
          <strong className="text-foreground">Contract Research Qualification (IRC §41):</strong> Vendor must bear economic risk = <span className="text-green-400">Company</span>, IP rights = <span className="text-green-400">Company or Shared</span>
        </span>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <VirtualTable
          data={vendors.map(v => ({ ...v, id: v.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No vendors yet. Import from Excel or add manually."
          onCellEdit={handleCellEdit}
          renderBulkActions={renderBulkActions}
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal */}
      {isCreating && (
        <CreateVendorModal
          onClose={() => setIsCreating(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateVendorModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<Vendor>) => void;
  isSubmitting: boolean;
}) {
  type RiskBearer = 'company' | 'vendor' | 'shared' | 'unknown';
  type IpRights = 'company' | 'vendor' | 'shared' | 'unknown';
  
  const [form, setForm] = useState<{
    vendor_id_natural: string;
    name: string;
    service_type: string;
    country: string;
    location_state: string;
    risk_bearer: RiskBearer;
    ip_rights: IpRights;
  }>({
    vendor_id_natural: '',
    name: '',
    service_type: '',
    country: 'US',
    location_state: '',
    risk_bearer: 'unknown',
    ip_rights: 'unknown',
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  
  const isQualified = form.risk_bearer === 'company' && ['company', 'shared'].includes(form.ip_rights);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Add Vendor</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Vendor ID</label>
              <input
                type="text"
                value={form.vendor_id_natural}
                onChange={e => setForm(f => ({ ...f, vendor_id_natural: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. VENDOR001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="Vendor name"
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Service Type</label>
              <input
                type="text"
                value={form.service_type}
                onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. Engineering"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Country</label>
              <select
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              >
                <option value="US">US</option>
                <option value="CA">Canada</option>
                <option value="UK">UK</option>
                <option value="IN">India</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Contract Research Qualification</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Risk Bearer</label>
                <select
                  value={form.risk_bearer}
                  onChange={e => setForm(f => ({ ...f, risk_bearer: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                >
                  <option value="unknown">Unknown</option>
                  <option value="company">Company (Taxpayer)</option>
                  <option value="vendor">Vendor</option>
                  <option value="shared">Shared</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">IP Rights</label>
                <select
                  value={form.ip_rights}
                  onChange={e => setForm(f => ({ ...f, ip_rights: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                >
                  <option value="unknown">Unknown</option>
                  <option value="company">Company (Taxpayer)</option>
                  <option value="vendor">Vendor</option>
                  <option value="shared">Shared</option>
                </select>
              </div>
            </div>
            
            <div className={`mt-3 p-3 rounded-lg ${isQualified ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted'}`}>
              <p className={`text-sm font-medium ${isQualified ? 'text-green-400' : 'text-muted-foreground'}`}>
                {isQualified ? '✓ This vendor qualifies for Sec.41 contract research' : 'This vendor does not qualify for Sec.41 contract research'}
              </p>
            </div>
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
              {isSubmitting ? 'Creating...' : 'Create Vendor'}
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
          <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}

