"use client";

import React from 'react';
import { useActiveContext, useWorkspace } from '@/context/workspace-context';
import { useContractors } from '@/lib/queries';

export default function ContractorsPage() {
  const { clientId, taxYear } = useActiveContext();
  const { state, selectContractor } = useWorkspace();
  const { data: contractors = [], isLoading, error } = useContractors(clientId, taxYear);
  
  if (!clientId) {
    return (
      <EmptyState
        title="Select a Client"
        description="Choose a client company from the header to view their contractors."
        icon={<SelectClientIcon />}
      />
    );
  }
  
  const totalCost = contractors.reduce((sum, c) => sum + c.cost, 0);
  const qualifiedCost = contractors.filter(c => c.is_qualified).reduce((sum, c) => sum + c.cost * 0.65, 0);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contractors / Vendors</h1>
          <p className="text-muted-foreground">
            {contractors.length} contractors • ${totalCost.toLocaleString()} total
          </p>
        </div>
        <button className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity font-medium">
          + Add Contractor
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Contract Cost" value={`$${totalCost.toLocaleString()}`} />
        <StatCard title="Qualified (65% rule)" value={`$${Math.round(qualifiedCost).toLocaleString()}`} />
        <StatCard title="Qualified Contractors" value={`${contractors.filter(c => c.is_qualified).length}/${contractors.length}`} />
      </div>
      
      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Failed to load contractors" />
      ) : contractors.length === 0 ? (
        <EmptyState
          title="No Contractors Yet"
          description="Add contractors and vendors to track qualified contract research expenses."
          icon={<ContractorsIcon />}
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Location</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Cost</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Qualified</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map(contractor => (
                <tr 
                  key={contractor.id}
                  onClick={() => selectContractor(contractor.id)}
                  className={`border-t border-border cursor-pointer hover:bg-muted/30 transition-colors ${
                    state.selectedContractorId === contractor.id ? 'bg-accent/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{contractor.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{contractor.location || '-'}</td>
                  <td className="px-4 py-3 text-right text-foreground">${contractor.cost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    {contractor.is_qualified ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      contractor.verification_status === 'verified' 
                        ? 'bg-green-100 text-green-700' 
                        : contractor.verification_status === 'denied'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {contractor.verification_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function EmptyState({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
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

function ContractorsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

