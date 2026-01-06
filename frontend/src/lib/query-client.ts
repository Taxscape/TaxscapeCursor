import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ============================================================================
// CANONICAL CACHE KEYS
// ============================================================================

export const CACHE_KEYS = {
  // Organization & Client
  organization: (orgId: string) => ['organization', orgId] as const,
  clients: (orgId: string) => ['clients', orgId] as const,
  client: (clientId: string) => ['client', clientId] as const,
  
  // Projects
  projects: (clientId?: string, taxYear?: string) => 
    ['projects', clientId, taxYear].filter(Boolean) as string[],
  project: (projectId: string) => ['project', projectId] as const,
  
  // Employees
  employees: (clientId?: string, taxYear?: string) => 
    ['employees', clientId, taxYear].filter(Boolean) as string[],
  employee: (employeeId: string) => ['employee', employeeId] as const,
  
  // Contractors
  contractors: (clientId?: string, taxYear?: string) => 
    ['contractors', clientId, taxYear].filter(Boolean) as string[],
  contractor: (contractorId: string) => ['contractor', contractorId] as const,
  
  // Expenses
  expenses: (clientId?: string, taxYear?: string) => 
    ['expenses', clientId, taxYear].filter(Boolean) as string[],
  expense: (expenseId: string) => ['expense', expenseId] as const,
  
  // Supplies
  supplies: (clientId?: string, taxYear?: string) => 
    ['supplies', clientId, taxYear].filter(Boolean) as string[],
  
  // Time Logs
  timeLogs: (clientId?: string, taxYear?: string) => 
    ['timeLogs', clientId, taxYear].filter(Boolean) as string[],
  
  // Tasks
  tasks: (clientId?: string, projectId?: string) => 
    ['tasks', clientId, projectId].filter(Boolean) as string[],
  task: (taskId: string) => ['task', taskId] as const,
  
  // Dashboard & Summaries
  dashboard: (clientId?: string) => ['dashboard', clientId].filter(Boolean) as string[],
  
  // Workflow
  workflow: (projectId: string) => ['workflow', projectId] as const,
  workflowSummary: (clientId: string) => ['workflowSummary', clientId] as const,
  
  // R&D Analysis
  rdSession: (sessionId: string) => ['rdSession', sessionId] as const,
  rdSessions: (clientId?: string) => ['rdSessions', clientId].filter(Boolean) as string[],
  
  // Studies/Reports
  studies: (clientId?: string) => ['studies', clientId].filter(Boolean) as string[],
  study: (studyId: string) => ['study', studyId] as const,
  
  // Copilot
  copilotSuggestions: (clientId: string, projectId?: string) => 
    ['copilot', 'suggestions', clientId, projectId].filter(Boolean) as string[],
  
  // Chat
  chatSessions: (clientId?: string) => ['chatSessions', clientId].filter(Boolean) as string[],
  
  // Team
  teamMembers: (orgId: string) => ['teamMembers', orgId] as const,
  
  // Audit
  auditLog: (orgId: string) => ['auditLog', orgId] as const,
  
  // Budgets
  budgets: (orgId: string) => ['budgets', orgId] as const,
};
