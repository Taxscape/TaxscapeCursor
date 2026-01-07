"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { useAuth } from '@/context/auth-context';
import { useClients, useCreateClient } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { CACHE_KEYS } from '@/lib/query-client';

export function Header() {
  const { state, setClient, setOrganization, toggleAIPanel, toggleCommandPalette, activeClient } = useWorkspace();
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
  
  const { data: clients = [], isLoading: clientsLoading } = useClients(orgId);
  const createClientMutation = useCreateClient(orgId || '');
  
  // Handle adding a new client
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddClientError(null);
    
    if (!orgId) {
      setAddClientError('No organization found. Please refresh the page.');
      return;
    }
    
    if (!newClientForm.name.trim()) {
      setAddClientError('Client name is required.');
      return;
    }
    
    setIsAddingClient(true);
    try {
      const newClient = await createClientMutation.mutateAsync({
        name: newClientForm.name.trim(),
        industry: newClientForm.industry || undefined,
        tax_year: newClientForm.tax_year || undefined,
        contact_name: newClientForm.contact_name || undefined,
        contact_email: newClientForm.contact_email || undefined,
      });
      
      // Invalidate clients query to refresh list
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.clients(orgId) });
      
      // Select the newly created client
      if (newClient?.id) {
        setClient(newClient.id, newClient.tax_year || new Date().getFullYear().toString());
      }
      
      // Reset form and close modal
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
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      {/* Left: Search / Command */}
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-3 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm text-muted-foreground w-72"
        >
          <SearchIcon />
          <span className="flex-1 text-left">Search or jump to...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-muted rounded">
            ⌘K
          </kbd>
        </button>
      </div>
      
      {/* Center: Status Strip */}
      <div className="flex items-center gap-4">
        {activeClient && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm">
            <BuildingIcon />
            <span className="font-medium">{activeClient.name}</span>
            <span className="text-muted-foreground">•</span>
            <span>FY{activeClient.tax_year}</span>
          </div>
        )}
      </div>
      
      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Client Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowClientDropdown(!showClientDropdown)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <BuildingIcon />
            <span className="max-w-[140px] truncate">
              {activeClient?.name || 'Select Client'}
            </span>
            <ChevronDownIcon />
          </button>
          
          {showClientDropdown && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-card rounded-xl border border-border shadow-lg z-50 overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Client Companies
                </p>
                <button
                  onClick={() => {
                    setShowClientDropdown(false);
                    setShowAddClientModal(true);
                    setAddClientError(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-md transition-colors"
                >
                  <PlusIcon /> Add
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {clientsLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
                      <BuildingIcon />
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">No client companies yet</p>
                    <button
                      onClick={() => {
                        setShowClientDropdown(false);
                        setShowAddClientModal(true);
                      }}
                      className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Add Your First Client
                    </button>
                  </div>
                ) : (
                  clients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleClientSelect(client.id, client.tax_year)}
                      className={`w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between ${
                        state.clientId === client.id ? 'bg-accent/20' : ''
                      }`}
                    >
                      <div>
                        <p className="font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.industry || 'No industry'} • FY{client.tax_year}
                        </p>
                      </div>
                      {state.clientId === client.id && (
                        <span className="text-accent"><CheckIcon /></span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* AI Panel Toggle */}
        <button
          onClick={toggleAIPanel}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${
            state.isAIPanelOpen 
              ? 'border-accent bg-accent/10 text-accent' 
              : 'border-border hover:bg-muted text-muted-foreground'
          }`}
          title="Toggle AI Assistant"
        >
          <SparklesIcon />
          <span className="hidden md:inline">Copilot</span>
        </button>
        
        {/* User Menu */}
        <div className="flex items-center gap-2 pl-3 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-medium">
            {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
        </div>
      </div>
      
      {/* Add Client Modal */}
      {showAddClientModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => setShowAddClientModal(false)}
        >
          <div 
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Add New Client</h3>
              <button
                onClick={() => setShowAddClientModal(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              {/* Error message */}
              {addClientError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  {addClientError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Client Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newClientForm.name}
                  onChange={(e) => {
                    setNewClientForm(prev => ({ ...prev, name: e.target.value }));
                    setAddClientError(null); // Clear error on input change
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="e.g., Acme Corporation"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Industry
                  </label>
                  <select
                    value={newClientForm.industry}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, industry: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
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
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Tax Year
                  </label>
                  <select
                    value={newClientForm.tax_year}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, tax_year: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {[2024, 2023, 2022, 2021].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newClientForm.contact_name}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="Primary contact person"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={newClientForm.contact_email}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="contact@example.com"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddClientModal(false)} 
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingClient || !newClientForm.name.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

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

function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
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



