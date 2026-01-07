"use client";

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { queryClient, CACHE_KEYS } from '@/lib/query-client';

// ============================================================================
// TYPES
// ============================================================================

export type WorkspaceModule = 
  | 'dashboard'
  | 'projects'
  | 'employees'
  | 'contractors'
  | 'expenses'
  | 'supplies'
  | 'timesheets'
  | 'rd-analysis'
  | 'workflow'
  | 'tasks'
  | 'copilot'
  | 'reports'
  | 'settings';

export interface ClientCompany {
  id: string;
  name: string;
  industry?: string;
  tax_year: string;
  ein?: string;
  contact_name?: string;
  contact_email?: string;
  created_at: string;
}

export interface WorkspaceState {
  // Context
  organizationId: string | null;
  clientId: string | null;
  taxYear: string;
  activeModule: WorkspaceModule;
  
  // Selections
  selectedProjectId: string | null;
  selectedEmployeeId: string | null;
  selectedContractorId: string | null;
  selectedSessionId: string | null;
  
  // UI State
  isAIPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  isSidebarCollapsed: boolean;
  
  // Readiness
  isInitialized: boolean;
  isLoading: boolean;
  globalError: string | null;
  
  // Cached client list for quick access
  clients: ClientCompany[];
}

type WorkspaceAction =
  | { type: 'SET_ORG'; payload: string | null }
  | { type: 'SET_CLIENT'; payload: { clientId: string | null; taxYear?: string } }
  | { type: 'SET_CLIENTS'; payload: ClientCompany[] }
  | { type: 'SET_TAX_YEAR'; payload: string }
  | { type: 'SET_MODULE'; payload: WorkspaceModule }
  | { type: 'SELECT_PROJECT'; payload: string | null }
  | { type: 'SELECT_EMPLOYEE'; payload: string | null }
  | { type: 'SELECT_CONTRACTOR'; payload: string | null }
  | { type: 'SELECT_SESSION'; payload: string | null }
  | { type: 'TOGGLE_AI_PANEL' }
  | { type: 'SET_AI_PANEL'; payload: boolean }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'SET_COMMAND_PALETTE'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_GLOBAL_ERROR'; payload: string | null }
  | { type: 'RESET_SELECTIONS' };

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: WorkspaceState = {
  organizationId: null,
  clientId: null,
  taxYear: new Date().getFullYear().toString(),
  activeModule: 'dashboard',
  selectedProjectId: null,
  selectedEmployeeId: null,
  selectedContractorId: null,
  selectedSessionId: null,
  isAIPanelOpen: false,
  isCommandPaletteOpen: false,
  isSidebarCollapsed: false,
  isInitialized: false,
  isLoading: true,
  globalError: null,
  clients: [],
};

// ============================================================================
// REDUCER
// ============================================================================

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_ORG':
      return {
        ...state,
        organizationId: action.payload,
        // Reset client when org changes
        clientId: null,
        clients: [],
        selectedProjectId: null,
        selectedEmployeeId: null,
        selectedContractorId: null,
        selectedSessionId: null,
      };
      
    case 'SET_CLIENT':
      return {
        ...state,
        clientId: action.payload.clientId,
        taxYear: action.payload.taxYear || state.taxYear,
        // Reset dependent selections when client changes
        selectedProjectId: null,
        selectedEmployeeId: null,
        selectedContractorId: null,
        selectedSessionId: null,
      };
      
    case 'SET_CLIENTS':
      return { ...state, clients: action.payload };
      
    case 'SET_TAX_YEAR':
      return { ...state, taxYear: action.payload };
      
    case 'SET_MODULE':
      return { ...state, activeModule: action.payload };
      
    case 'SELECT_PROJECT':
      return { ...state, selectedProjectId: action.payload };
      
    case 'SELECT_EMPLOYEE':
      return { ...state, selectedEmployeeId: action.payload };
      
    case 'SELECT_CONTRACTOR':
      return { ...state, selectedContractorId: action.payload };
      
    case 'SELECT_SESSION':
      return { ...state, selectedSessionId: action.payload };
      
    case 'TOGGLE_AI_PANEL':
      return { ...state, isAIPanelOpen: !state.isAIPanelOpen };
      
    case 'SET_AI_PANEL':
      return { ...state, isAIPanelOpen: action.payload };
      
    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, isCommandPaletteOpen: !state.isCommandPaletteOpen };
      
    case 'SET_COMMAND_PALETTE':
      return { ...state, isCommandPaletteOpen: action.payload };
      
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarCollapsed: !state.isSidebarCollapsed };
      
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
      
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
      
    case 'SET_GLOBAL_ERROR':
      return { ...state, globalError: action.payload };
      
    case 'RESET_SELECTIONS':
      return {
        ...state,
        selectedProjectId: null,
        selectedEmployeeId: null,
        selectedContractorId: null,
        selectedSessionId: null,
      };
      
    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface WorkspaceContextType {
  state: WorkspaceState;
  
  // Actions
  setOrganization: (orgId: string | null) => void;
  setClient: (clientId: string | null, taxYear?: string) => void;
  setTaxYear: (year: string) => void;
  setModule: (module: WorkspaceModule) => void;
  selectProject: (projectId: string | null) => void;
  selectEmployee: (employeeId: string | null) => void;
  selectContractor: (contractorId: string | null) => void;
  selectSession: (sessionId: string | null) => void;
  toggleAIPanel: () => void;
  setAIPanel: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPalette: (open: boolean) => void;
  toggleSidebar: () => void;
  setGlobalError: (error: string | null) => void;
  resetSelections: () => void;
  
  // Derived helpers
  activeClient: ClientCompany | null;
  hasOrg: boolean;
  hasClient: boolean;
  isReady: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const { organization, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // -------------------------------------------------------------------------
  // Initialize from auth context
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading) {
      if (organization?.id) {
        dispatch({ type: 'SET_ORG', payload: organization.id });
      }
      dispatch({ type: 'SET_INITIALIZED', payload: true });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [authLoading, organization?.id]);
  
  // -------------------------------------------------------------------------
  // URL Synchronization - Read from URL on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const clientParam = searchParams.get('client');
    const yearParam = searchParams.get('year');
    const moduleParam = searchParams.get('module') as WorkspaceModule | null;
    
    if (clientParam && clientParam !== state.clientId) {
      dispatch({ type: 'SET_CLIENT', payload: { clientId: clientParam, taxYear: yearParam || undefined } });
    }
    if (moduleParam && moduleParam !== state.activeModule) {
      dispatch({ type: 'SET_MODULE', payload: moduleParam });
    }
  }, [searchParams]); // Only run when searchParams change
  
  // -------------------------------------------------------------------------
  // URL Synchronization - Write to URL on state change
  // -------------------------------------------------------------------------
  const syncToUrl = useCallback((clientId: string | null, taxYear: string, module: WorkspaceModule) => {
    const params = new URLSearchParams();
    if (clientId) params.set('client', clientId);
    if (taxYear) params.set('year', taxYear);
    if (module && module !== 'dashboard') params.set('module', module);
    
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    window.history.replaceState({}, '', newUrl);
  }, [pathname]);
  
  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const setOrganization = useCallback((orgId: string | null) => {
    dispatch({ type: 'SET_ORG', payload: orgId });
    // Invalidate all org-specific caches
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, []);
  
  const setClient = useCallback((clientId: string | null, taxYear?: string) => {
    dispatch({ type: 'SET_CLIENT', payload: { clientId, taxYear } });
    
    // Invalidate client-specific caches
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['contractors'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['workflow'] });
    
    // Sync to URL
    syncToUrl(clientId, taxYear || state.taxYear, state.activeModule);
  }, [state.taxYear, state.activeModule, syncToUrl]);
  
  const setTaxYear = useCallback((year: string) => {
    dispatch({ type: 'SET_TAX_YEAR', payload: year });
    syncToUrl(state.clientId, year, state.activeModule);
  }, [state.clientId, state.activeModule, syncToUrl]);
  
  const setModule = useCallback((module: WorkspaceModule) => {
    dispatch({ type: 'SET_MODULE', payload: module });
    syncToUrl(state.clientId, state.taxYear, module);
  }, [state.clientId, state.taxYear, syncToUrl]);
  
  const selectProject = useCallback((projectId: string | null) => {
    dispatch({ type: 'SELECT_PROJECT', payload: projectId });
  }, []);
  
  const selectEmployee = useCallback((employeeId: string | null) => {
    dispatch({ type: 'SELECT_EMPLOYEE', payload: employeeId });
  }, []);
  
  const selectContractor = useCallback((contractorId: string | null) => {
    dispatch({ type: 'SELECT_CONTRACTOR', payload: contractorId });
  }, []);
  
  const selectSession = useCallback((sessionId: string | null) => {
    dispatch({ type: 'SELECT_SESSION', payload: sessionId });
  }, []);
  
  const toggleAIPanel = useCallback(() => {
    dispatch({ type: 'TOGGLE_AI_PANEL' });
  }, []);
  
  const setAIPanel = useCallback((open: boolean) => {
    dispatch({ type: 'SET_AI_PANEL', payload: open });
  }, []);
  
  const toggleCommandPalette = useCallback(() => {
    dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
  }, []);
  
  const setCommandPalette = useCallback((open: boolean) => {
    dispatch({ type: 'SET_COMMAND_PALETTE', payload: open });
  }, []);
  
  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);
  
  const setGlobalError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_GLOBAL_ERROR', payload: error });
  }, []);
  
  const resetSelections = useCallback(() => {
    dispatch({ type: 'RESET_SELECTIONS' });
  }, []);
  
  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const activeClient = useMemo(() => {
    return state.clients.find(c => c.id === state.clientId) || null;
  }, [state.clients, state.clientId]);
  
  const hasOrg = !!state.organizationId;
  const hasClient = !!state.clientId;
  const isReady = state.isInitialized && !state.isLoading && hasOrg;
  
  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K = Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      // Escape = Close panels
      if (e.key === 'Escape') {
        if (state.isCommandPaletteOpen) {
          setCommandPalette(false);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isCommandPaletteOpen, toggleCommandPalette, setCommandPalette]);
  
  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------
  const value: WorkspaceContextType = {
    state,
    setOrganization,
    setClient,
    setTaxYear,
    setModule,
    selectProject,
    selectEmployee,
    selectContractor,
    selectSession,
    toggleAIPanel,
    setAIPanel,
    toggleCommandPalette,
    setCommandPalette,
    toggleSidebar,
    setGlobalError,
    resetSelections,
    activeClient,
    hasOrg,
    hasClient,
    isReady,
  };
  
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

// Convenience hook for active context
export function useActiveContext() {
  const { state } = useWorkspace();
  return {
    orgId: state.organizationId,
    clientId: state.clientId,
    taxYear: state.taxYear,
  };
}




