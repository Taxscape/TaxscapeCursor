"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext } from '@/context/workspace-context';
import { getTimesheets, createTimesheet } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Timesheet } from '@/lib/types';

export default function TimesheetsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  
  const numericTaxYear = parseInt(taxYear) || 2024;
  
  // Fetch timesheets
  const { data, isLoading, error } = useQuery({
    queryKey: ['timesheets', clientId, numericTaxYear],
    queryFn: () => getTimesheets(clientId!, numericTaxYear),
    enabled: !!clientId,
  });
  
  const timesheets = data?.data ?? [];
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Timesheet>) => createTimesheet(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', clientId] });
      setIsCreating(false);
    },
  });
  
  // Table columns
  const columns: ColumnDef<Timesheet & { id: string }>[] = useMemo(() => [
    {
      id: 'employee_id',
      header: 'Employee ID',
      accessor: 'employee_id',
      width: 180,
      renderCell: (value) => <span className="font-mono text-xs text-gray-400">{String(value).slice(0, 8)}...</span>,
    },
    {
      id: 'project_id',
      header: 'Project ID',
      accessor: 'project_id',
      width: 180,
      renderCell: (value) => value ? <span className="font-mono text-xs text-gray-400">{String(value).slice(0, 8)}...</span> : <span className="text-gray-500 italic">No project</span>,
    },
    {
      id: 'hours',
      header: 'Hours',
      accessor: 'hours',
      width: 100,
      sortable: true,
      renderCell: (value) => <span className="font-semibold text-white">{Number(value).toFixed(1)}</span>,
    },
    {
      id: 'period_start',
      header: 'Period Start',
      accessor: 'period_start',
      width: 130,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'period_end',
      header: 'Period End',
      accessor: 'period_end',
      width: 130,
      sortable: true,
      renderCell: (value) => value ? new Date(String(value)).toLocaleDateString() : '-',
    },
    {
      id: 'activity_code',
      header: 'Activity Code',
      accessor: 'activity_code',
      width: 130,
      renderCell: (value) => value || '-',
    },
    {
      id: 'approval_status',
      header: 'Status',
      accessor: 'approval_status',
      width: 120,
      sortable: true,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          value === 'approved' ? 'bg-green-500/20 text-green-400' :
          value === 'rejected' ? 'bg-red-500/20 text-red-400' :
          'bg-white/5 text-gray-500'
        }`}>
          {(value as string).toUpperCase()}
        </span>
      ),
    },
  ], []);
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <ClockIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view their time logs.
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Time Logs</h1>
          <p className="text-gray-400">Employee project allocations and timesheet data</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium flex items-center gap-2 transition-colors"
        >
          <PlusIcon />
          Add Time Entry
        </button>
      </div>
      
      {/* Table */}
      <div className="flex-1 bg-[#12121a] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
        <VirtualTable
          data={timesheets.map(t => ({ ...t, id: t.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No time logs yet. Import from Excel or add manually."
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal would go here */}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
