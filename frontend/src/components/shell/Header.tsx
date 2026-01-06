"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { useAuth } from '@/context/auth-context';
import { useClients } from '@/lib/queries';

export function Header() {
  const { state, setClient, toggleAIPanel, toggleCommandPalette, activeClient } = useWorkspace();
  const { user, organization, profile } = useAuth();
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { data: clients = [], isLoading: clientsLoading } = useClients(state.organizationId);
  
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
              <div className="p-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Client Companies
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {clientsLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No client companies yet
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



