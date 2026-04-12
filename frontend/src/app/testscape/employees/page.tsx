"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEmployees, createEmployee, type Employee } from '@/lib/api';

export default function EmployeesPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ 
    name: '', 
    title: '', 
    department: '', 
    total_wages: 0, 
    qualified_percent: 0 
  });
  
  // Fetch employees
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', clientId, taxYear],
    queryFn: () => getEmployees(clientId!, Number(taxYear)),
    enabled: !!clientId,
  });
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof newEmployee) => createEmployee(data, clientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', clientId, taxYear] });
      setShowCreateModal(false);
      setNewEmployee({ name: '', title: '', department: '', total_wages: 0, qualified_percent: 0 });
    },
  });
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-4">
          <UsersIcon className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to view their employees.</p>
      </div>
    );
  }
  
  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newEmployee);
  };
  
  const totalWages = employees.reduce((sum: number, e: Employee) => sum + (e.total_wages || 0), 0);
  const totalQRE = employees.reduce((sum: number, e: Employee) => sum + ((e.total_wages || 0) * (e.qualified_percent || 0) / 100), 0);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Employees</h1>
          <p className="text-gray-400">Track employee wages and R&D time allocation</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
        >
          <PlusIcon />
          Add Employee
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-white">{employees.length}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Wages</p>
          <p className="text-2xl font-bold text-purple-400">${totalWages.toLocaleString()}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Estimated QRE</p>
          <p className="text-2xl font-bold text-green-400">${totalQRE.toLocaleString()}</p>
        </div>
      </div>
      
      {/* Employees List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {employees.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <UsersIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No employees yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Add First Employee
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Title</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Department</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Total Wages</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">R&D %</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">QRE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {employees.map((emp: Employee) => (
                <tr key={emp.id} className="hover:bg-white/5">
                  <td className="py-3 px-4">
                    <p className="font-medium text-white">{emp.name}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400">{emp.title || '-'}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400">{emp.department || '-'}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-white">${(emp.total_wages || 0).toLocaleString()}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-purple-400">{emp.qualified_percent || 0}%</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-green-400 font-medium">
                      ${((emp.total_wages || 0) * (emp.qualified_percent || 0) / 100).toLocaleString()}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Employee</h3>
            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Name *</label>
                  <input
                    type="text"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Title</label>
                  <input
                    type="text"
                    value={newEmployee.title}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Department</label>
                <input
                  type="text"
                  value={newEmployee.department}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Total Wages</label>
                  <input
                    type="number"
                    value={newEmployee.total_wages}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, total_wages: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">R&D % (0-100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newEmployee.qualified_percent}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, qualified_percent: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newEmployee.name}
                  className="flex-1 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
