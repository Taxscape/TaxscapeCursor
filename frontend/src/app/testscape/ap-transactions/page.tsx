"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getAPTransactions, createAPTransaction } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { APTransaction } from '@/lib/types';

export default function APTransactionsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  
  const numericTaxYear = parseInt(taxYear) || 2024;
  
  // Fetch transactions
  const { data, isLoading, error } = useQuery({
    queryKey: ['ap-transactions', clientId, numericTaxYear],
    queryFn: () => getAPTransactions(clientId!, numericTaxYear),
    enabled: !!clientId,
  });
  
  const transactions = data?.data ?? [];
  
  // Table columns
  const columns: ColumnDef<APTransaction & { id: string }>[] = useMemo(() => [
    {
      id: 'transaction_id_natural',
      header: 'TX ID',
      accessor: 'transaction_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'vendor_name',
      header: 'Vendor',
      accessor: (row) => row.vendor_id || '-', // Use a placeholder if vendor_name not in type
      width: 150,
      sortable: true,
    },
    {
      id: 'description',
      header: 'Description',
      accessor: 'description',
      width: 250,
      sortable: true,
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
      id: 'invoice_date',
      header: 'Date',
      accessor: 'invoice_date',
      width: 130,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'qre_amount',
      header: 'QRE Amount',
      accessor: 'qre_amount',
      width: 120,
      sortable: true,
      renderCell: (value) => <span className="font-semibold text-green-400">${Number(value || 0).toLocaleString()}</span>,
    },
  ], []);
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <TransactionIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their AP transactions.
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AP Transactions</h1>
          <p className="text-gray-400">General ledger and accounts payable data</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium flex items-center gap-2 transition-colors"
        >
          <PlusIcon />
          Add Transaction
        </button>
      </div>
      
      {/* Table */}
      <div className="flex-1 bg-[#12121a] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
        <VirtualTable
          data={transactions.map(t => ({ ...t, id: t.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No transactions yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
    </div>
  );
}

function TransactionIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
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
