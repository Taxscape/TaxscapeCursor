"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getVendors, createVendor } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Vendor } from '@/lib/types';

export default function VendorsPage() {
  const { clientId } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  
  // Fetch vendors
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors', clientId],
    queryFn: () => getVendors(clientId!),
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
  
  // Table columns
  const columns: ColumnDef<Vendor & { id: string }>[] = useMemo(() => [
    {
      id: 'name',
      header: 'Vendor Name',
      accessor: 'name',
      width: 200,
      sortable: true,
      renderCell: (value) => <span className="font-medium text-white">{value}</span>,
    },
    {
      id: 'vendor_id_natural',
      header: 'Vendor ID',
      accessor: 'vendor_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'service_type',
      header: 'Service Type',
      accessor: 'service_type',
      width: 150,
      sortable: true,
      renderCell: (value) => value || '-',
    },
    {
      id: 'country',
      header: 'Country',
      accessor: 'country',
      width: 100,
      sortable: true,
    },
    {
      id: 'is_qualified_contract_research',
      header: 'Qualified R&D',
      accessor: 'is_qualified_contract_research',
      width: 130,
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
      id: 'risk_bearer',
      header: 'Risk Bearer',
      accessor: 'risk_bearer',
      width: 120,
      renderCell: (value) => (value as string)?.toUpperCase() || '-',
    },
    {
      id: 'ip_rights',
      header: 'IP Rights',
      accessor: 'ip_rights',
      width: 120,
      renderCell: (value) => (value as string)?.toUpperCase() || '-',
    },
  ], []);
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <BuildingIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their vendors.
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendors</h1>
          <p className="text-gray-400">Manage 1099 contractors and service providers</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium flex items-center gap-2 transition-colors"
        >
          <PlusIcon />
          Add Vendor
        </button>
      </div>
      
      {/* Table */}
      <div className="flex-1 bg-[#12121a] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
        <VirtualTable
          data={vendors.map(v => ({ ...v, id: v.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No vendors yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
