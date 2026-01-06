"use client";

import React, { useState } from 'react';
import { useWorkspace, useActiveContext } from '@/context/workspace-context';
import { useEmployees, useCreateEmployee } from '@/lib/queries';

export default function EmployeesPage() {
  const { state, selectEmployee } = useWorkspace();
  const { clientId, taxYear } = useActiveContext();
  const { data: employees = [], isLoading, error } = useEmployees(clientId, taxYear);
  const createEmployeeMutation = useCreateEmployee();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ 
    name: '', 
    title: '', 
    department: '', 
    total_wages: 0, 
    qualified_percent: 0 
  });
  
  if (!clientId) {
    return (
      <EmptyState
        title="Select a Client"
        description="Choose a client company from the header to view their employees."
        icon={<SelectClientIcon />}
      />
    );
  }
  
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEmployeeMutation.mutateAsync(newEmployee);
      setShowCreateModal(false);
      setNewEmployee({ name: '', title: '', department: '', total_wages: 0, qualified_percent: 0 });
    } catch (err) {
      console.error('Failed to create employee:', err);
    }
  };
  
  const totalWages = employees.reduce((sum, e) => sum + e.total_wages, 0);
  const totalQualified = employees.reduce((sum, e) => sum + (e.total_wages * e.qualified_percent / 100), 0);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground">
            {employees.length} employees • ${totalWages.toLocaleString()} total wages
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
        >
          + Add Employee
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Wages" value={`$${totalWages.toLocaleString()}`} />
        <StatCard title="Qualified Wages" value={`$${Math.round(totalQualified).toLocaleString()}`} />
        <StatCard title="Avg Qualification" value={`${employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.qualified_percent, 0) / employees.length) : 0}%`} />
      </div>
      
      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Failed to load employees" />
      ) : employees.length === 0 ? (
        <EmptyState
          title="No Employees Yet"
          description="Add employees to track their R&D time allocation and calculate qualified wages."
          icon={<EmployeesIcon />}
          action={
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Add Employee
            </button>
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Department</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Total Wages</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">R&D %</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(employee => (
                <tr 
                  key={employee.id} 
                  onClick={() => selectEmployee(employee.id)}
                  className={`border-t border-border cursor-pointer hover:bg-muted/30 transition-colors ${
                    state.selectedEmployeeId === employee.id ? 'bg-accent/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{employee.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.title || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.department || '-'}</td>
                  <td className="px-4 py-3 text-right text-foreground">${employee.total_wages.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-foreground">{employee.qualified_percent}%</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      employee.verification_status === 'verified' 
                        ? 'bg-green-100 text-green-700' 
                        : employee.verification_status === 'denied'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {employee.verification_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Add Employee</h2>
            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={newEmployee.name}
                  onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Title</label>
                  <input
                    type="text"
                    value={newEmployee.title}
                    onChange={e => setNewEmployee({ ...newEmployee, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Department</label>
                  <input
                    type="text"
                    value={newEmployee.department}
                    onChange={e => setNewEmployee({ ...newEmployee, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Total Wages ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={newEmployee.total_wages}
                    onChange={e => setNewEmployee({ ...newEmployee, total_wages: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">R&D Percentage (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newEmployee.qualified_percent}
                    onChange={e => setNewEmployee({ ...newEmployee, qualified_percent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEmployeeMutation.isPending}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createEmployeeMutation.isPending ? 'Adding...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-destructive">{message}</p>
    </div>
  );
}

function EmptyState({ title, description, icon, action }: { title: string; description: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}

function SelectClientIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
    </svg>
  );
}

function EmployeesIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

