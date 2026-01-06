"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveContext, useWorkspace } from '@/context/workspace-context';
import { getTimesheets, createTimesheet, updateTimesheet, deleteTimesheet } from '@/lib/api';
import { VirtualTable, ColumnDef } from '@/components/workspace/VirtualTable';
import type { Timesheet } from '@/lib/types';

export default function TimesheetsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newTimesheet, setNewTimesheet] = useState<Partial<Timesheet>>({});
  
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
      queryClient.invalidateQueries({ queryKey: ['timesheets', clientId, numericTaxYear] });
      setIsCreating(false);
      setNewTimesheet({});
    },
  });
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Timesheet> }) => updateTimesheet(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', clientId, numericTaxYear] });
      // Mark QRE summary as stale
      queryClient.invalidateQueries({ queryKey: ['qre-summary', clientId, numericTaxYear] });
    },
  });
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTimesheet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', clientId, numericTaxYear] });
    },
  });
  
  // Handle cell edit
  const handleCellEdit = useCallback((rowId: string, columnId: string, value: any) => {
    updateMutation.mutate({ id: rowId, data: { [columnId]: value } });
  }, [updateMutation]);
  
  // Table columns
  const columns: ColumnDef<Timesheet & { id: string }>[] = useMemo(() => [
    {
      id: 'timesheet_id_natural',
      header: 'ID',
      accessor: 'timesheet_id_natural',
      width: 120,
      sortable: true,
    },
    {
      id: 'employee_id',
      header: 'Employee',
      accessor: 'employee_id',
      width: 180,
      sortable: true,
      // In a full implementation, we'd fetch employee names
      renderCell: (value) => <span className="font-mono text-xs">{value?.slice(0, 8)}...</span>,
    },
    {
      id: 'project_id',
      header: 'Project',
      accessor: 'project_id',
      width: 180,
      sortable: true,
      renderCell: (value) => value ? <span className="font-mono text-xs">{value?.slice(0, 8)}...</span> : <span className="text-muted-foreground italic">Unassigned</span>,
    },
    {
      id: 'period_start',
      header: 'Period Start',
      accessor: 'period_start',
      width: 120,
      sortable: true,
      renderCell: (value) => new Date(value).toLocaleDateString(),
    },
    {
      id: 'period_end',
      header: 'Period End',
      accessor: 'period_end',
      width: 120,
      sortable: true,
      renderCell: (value) => new Date(value).toLocaleDateString(),
    },
    {
      id: 'hours',
      header: 'Hours',
      accessor: 'hours',
      width: 80,
      sortable: true,
      editable: true,
      renderCell: (value) => <span className="font-semibold">{value?.toFixed(1)}</span>,
    },
    {
      id: 'activity_code',
      header: 'Activity',
      accessor: 'activity_code',
      width: 100,
      editable: true,
      renderCell: (value) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'approval_status',
      header: 'Status',
      accessor: 'approval_status',
      width: 120,
      sortable: true,
      renderCell: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          value === 'approved' ? 'bg-green-500/20 text-green-400' :
          value === 'rejected' ? 'bg-red-500/20 text-red-400' :
          value === 'needs_review' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {value}
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
          value === 'import_excel' ? 'bg-blue-500/20 text-blue-400' :
          value === 'manual' ? 'bg-muted text-muted-foreground' :
          'bg-muted text-muted-foreground'
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
          selectedIds.forEach(id => {
            updateMutation.mutate({ id, data: { approval_status: 'approved' } });
          });
          clearSelection();
        }}
        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
      >
        Approve Selected
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete ${selectedIds.size} timesheets?`)) {
            selectedIds.forEach(id => deleteMutation.mutate(id));
            clearSelection();
          }
        }}
        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
      >
        Delete Selected
      </button>
    </>
  ), [updateMutation, deleteMutation]);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their timesheets." />;
  }
  
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">Failed to load timesheets. Please try again.</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
          <p className="text-muted-foreground">Employee time allocation by project and period</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {timesheets.length} records
          </span>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Timesheet
          </button>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <VirtualTable
          data={timesheets.map(t => ({ ...t, id: t.id }))}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No timesheets yet. Import from Excel or add manually."
          onCellEdit={handleCellEdit}
          renderBulkActions={renderBulkActions}
          stickyFirstColumn
        />
      </div>
      
      {/* Create Modal */}
      {isCreating && (
        <CreateTimesheetModal
          onClose={() => setIsCreating(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateTimesheetModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<Timesheet>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    employee_id: '',
    project_id: '',
    period_start: '',
    period_end: '',
    hours: 0,
    activity_code: '',
    tax_year: new Date().getFullYear(),
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Add Timesheet Entry</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Employee ID</label>
            <input
              type="text"
              value={form.employee_id}
              onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
              placeholder="Employee UUID"
              required
            />
          </div>
          
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
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Period Start</label>
              <input
                type="date"
                value={form.period_start}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Period End</label>
              <input
                type="date"
                value={form.period_end}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Hours</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Activity Code</label>
              <input
                type="text"
                value={form.activity_code}
                onChange={e => setForm(f => ({ ...f, activity_code: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                placeholder="e.g. RD-DEV"
              />
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
              {isSubmitting ? 'Creating...' : 'Create Timesheet'}
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
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}
