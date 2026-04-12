"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getContracts, createContract } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Contract } from '@/lib/types';

export default function ContractsPage() {
  const { clientId } = useActiveContext();
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
      id: 'title',
      header: 'Contract Title',
      accessor: 'title',
      width: 200,
      sortable: true,
      renderCell: (value) => <span className="font-medium text-white">{value}</span>,
    },
    {
      id: 'vendor_name',
      header: 'Vendor',
      accessor: 'vendor_name',
      width: 150,
      sortable: true,
    },
    {
      id: 'contract_id_natural',
      header: 'Contract ID',
      accessor: 'contract_id_natural',
      width: 120,
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
      id: 'qre_eligible_percent',
      header: 'Eligible %',
      accessor: 'qre_eligible_percent',
      width: 100,
      renderCell: (value) => value ? `${value}%` : '-',
    },
    {
      id: 'total_value',
      header: 'Total Value',
      accessor: 'total_value',
      width: 120,
      renderCell: (value) => value ? `$${Number(value).toLocaleString()}` : '-',
    },
  ], []);
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <ContractIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their contracts.
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contracts</h1>
          <p className="text-gray-400">Manage SOWs and research agreements</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium flex items-center gap-2 transition-colors"
        >
          <PlusIcon />
          Add Contract
        </button>
      </div>
      
      {/* Table */}
      <div className="flex-1 bg-[#12121a] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
        <VirtualTable
          data={contracts.map(c => ({ ...c, id: c.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No contracts yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
    </div>
  );
}

function ContractIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
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
