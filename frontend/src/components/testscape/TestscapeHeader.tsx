"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { useAuth } from '@/context/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_KEYS } from '@/lib/query-client';
import { createClientSimple, getMyClients, getClientCompanies } from '@/lib/api';
import type { ClientCompany } from '@/lib/api';

export function TestscapeHeader() {
  const { state, setClient, setOrganization } = useWorkspace();
  const { user, organization, profile } = useAuth();
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    industry: '',
    tax_year: new Date().getFullYear().toString(),
    contact_name: '',
    contact_email: '',
  });
  const [isAddingClient, setIsAddingClient] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  
  // Use organization ID from auth context (more reliable) or workspace state
  const orgId = organization?.id || state.organizationId;
  
  // Sync organization ID to workspace state if not set
  useEffect(() => {
    if (organization?.id && !state.organizationId) {
      setOrganization(organization.id);
    }
  }, [organization?.id, state.organizationId, setOrganization]);
  
  // Fetch clients - use org-specific endpoint if orgId available, otherwise use fallback
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: orgId ? CACHE_KEYS.clients(orgId) : ['my-clients'],
    queryFn: async (): Promise<ClientCompany[]> => {
      if (orgId) {
        return getClientCompanies(orgId);
      }
      // Fallback: use the auto-detect endpoint
      const result = await getMyClients();
      // If we got an org ID from the response, sync it to workspace state
      if (result.organization_id && !state.organizationId) {
        setOrganization(result.organization_id);
      }
      return result.clients;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const clients = clientsData || [];
  
  // Derive activeClient from fetched clients data and current clientId
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === state.clientId) || null;
  }, [clients, state.clientId]);
  
  // Handle adding a new client
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddClientError(null);
    
    if (!newClientForm.name.trim()) {
      setAddClientError('Client name is required.');
      return;
    }
    
    setIsAddingClient(true);
    try {
      const result = await createClientSimple({
        name: newClientForm.name.trim(),
        industry: newClientForm.industry || undefined,
        tax_year: newClientForm.tax_year || undefined,
        contact_name: newClientForm.contact_name || undefined,
        contact_email: newClientForm.contact_email || undefined,
      });
      
      const newClient = result.client;
      const newOrgId = result.organization_id;
      
      if (newOrgId && newOrgId !== orgId) {
        setOrganization(newOrgId);
      }
      
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.clients(newOrgId) });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      if (newClient?.id) {
        setClient(newClient.id, newClient.tax_year || new Date().getFullYear().toString());
      }
      
      setShowAddClientModal(false);
      setNewClientForm({ name: '', industry: '', tax_year: new Date().getFullYear().toString(), contact_name: '', contact_email: '' });
    } catch (error) {
      console.error('Failed to create client:', error);
      setAddClientError(error instanceof Error ? error.message : 'Failed to create client. Please try again.');
    } finally {
      setIsAddingClient(false);
    }
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleClientSelect = (clientId: string, taxYear: string) => {
    setClient(clientId, taxYear);
    setShowClientDropdown(false);
  };
  
  return (
    <header className="h-16 border-b border-white/10 bg-[#0f0f14] flex items-center justify-between px-6">
      {/* Left: Breadcrumb / Title */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">
          {activeClient ? activeClient.name : 'Select a Client'}
        </h1>
        {activeClient && (
          <span className="px-2.5 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
            FY {activeClient.tax_year}
          </span>
        )}
      </div>
      
      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Client Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowClientDropdown(!showClientDropdown)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm text-white"
          >
            <BuildingIcon />
            <span className="max-w-[160px] truncate">
              {activeClient?.name || 'Select Client'}
            </span>
            <ChevronDownIcon />
          </button>
          
          {showClientDropdown && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1a22] rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Client Companies
                </p>
                <button
                  onClick={() => {
                    setShowClientDropdown(false);
                    setShowAddClientModal(true);
                    setAddClientError(null);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                >
                  <PlusIcon /> Add Client
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {clientsLoading ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Loading clients...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <BuildingIcon />
                    </div>
                    <p className="text-sm text-gray-400 mb-4">No client companies yet</p>
                    <button
                      onClick={() => {
                        setShowClientDropdown(false);
                        setShowAddClientModal(true);
                      }}
                      className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Add Your First Client
                    </button>
                  </div>
                ) : (
                  clients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleClientSelect(client.id, client.tax_year)}
                      className={`w-full p-4 text-left hover:bg-white/5 transition-colors flex items-center justify-between ${
                        state.clientId === client.id ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <div>
                        <p className="font-medium text-white">{client.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {client.industry || 'No industry'} • FY{client.tax_year}
                        </p>
                      </div>
                      {state.clientId === client.id && (
                        <span className="text-blue-400"><CheckIcon /></span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* User Menu */}
        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
            {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
        </div>
      </div>
      
      {/* Add Client Modal */}
      {showAddClientModal && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]"
          onClick={() => setShowAddClientModal(false)}
        >
          <div 
            className="bg-[#1a1a22] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Add New Client</h3>
              <button
                onClick={() => setShowAddClientModal(false)}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400"
              >
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              {addClientError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {addClientError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Client Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newClientForm.name}
                  onChange={(e) => {
                    setNewClientForm(prev => ({ ...prev, name: e.target.value }));
                    setAddClientError(null);
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g., Acme Corporation"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Industry
                  </label>
                  <select
                    value={newClientForm.industry}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, industry: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Select...</option>
                    <option value="Technology">Technology</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Finance">Finance</option>
                    <option value="Aerospace">Aerospace</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Biotechnology">Biotechnology</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Tax Year
                  </label>
                  <select
                    value={newClientForm.tax_year}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, tax_year: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {[2024, 2023, 2022, 2021].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newClientForm.contact_name}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Primary contact person"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={newClientForm.contact_email}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="contact@example.com"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddClientModal(false)} 
                  className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingClient || !newClientForm.name.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAddingClient ? (
                    <>
                      <LoadingSpinner />
                      Adding...
                    </>
                  ) : (
                    'Add Client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

// ============================================================================
// ICONS
// ============================================================================

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
