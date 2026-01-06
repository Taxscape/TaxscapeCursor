/**
 * Centralized Query Hooks for TaxScape Workspace
 * 
 * These hooks standardize data fetching across the workspace,
 * ensuring consistent cache keys, error handling, and loading states.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE_KEYS } from '@/lib/query-client';
import {
  getProjects,
  createProject,
  getEmployees,
  createEmployee,
  getContractors,
  getClientCompanies,
  createClientCompany,
  getDashboard,
  getVerificationTasks,
  getClientWorkflowSummary,
  getBudgets,
  getExpenses,
  getTimeLogs,
  getEngineeringTasks,
  getChatSessions,
  getOrganizationMembers,
  type Project,
  type Employee,
  type Contractor,
  type ClientCompany,
  type DashboardData,
  type VerificationTask,
  type WorkflowSummary,
  type Budget,
  type Expense,
  type TimeLog,
  type EngineeringTask,
  type ChatSession,
  type OrganizationMember,
} from '@/lib/api';

// ============================================================================
// CLIENT COMPANIES
// ============================================================================

export function useClients(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? CACHE_KEYS.clients(orgId) : ['clients-disabled'],
    queryFn: () => getClientCompanies(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCreateClient(orgId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; industry?: string; tax_year?: string; contact_name?: string; contact_email?: string }) =>
      createClientCompany(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CACHE_KEYS.clients(orgId) });
    },
  });
}

// ============================================================================
// PROJECTS
// ============================================================================

export function useProjects(clientId: string | null, taxYear?: string) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.projects(clientId, taxYear) : ['projects-disabled'],
    queryFn: () => getProjects(),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
    select: (data: Project[]) => {
      // Filter by client if needed (backend should handle this, but safety filter)
      if (clientId) {
        return data.filter(p => !p.client_company_id || p.client_company_id === clientId);
      }
      return data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; description?: string; technical_uncertainty?: string; process_of_experimentation?: string }) =>
      createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ============================================================================
// EMPLOYEES
// ============================================================================

export function useEmployees(clientId: string | null, taxYear?: string) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.employees(clientId, taxYear) : ['employees-disabled'],
    queryFn: () => getEmployees(),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
    select: (data: Employee[]) => {
      if (clientId) {
        return data.filter(e => !e.client_company_id || e.client_company_id === clientId);
      }
      return data;
    },
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; title?: string; department?: string; total_wages: number; qualified_percent: number }) =>
      createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ============================================================================
// CONTRACTORS
// ============================================================================

export function useContractors(clientId: string | null, taxYear?: string) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.contractors(clientId, taxYear) : ['contractors-disabled'],
    queryFn: () => getContractors(),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
    select: (data: Contractor[]) => {
      if (clientId) {
        return data.filter(c => !c.client_company_id || c.client_company_id === clientId);
      }
      return data;
    },
  });
}

// ============================================================================
// DASHBOARD
// ============================================================================

export function useDashboard(clientId: string | null) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.dashboard(clientId) : ['dashboard'],
    queryFn: () => getDashboard(),
    enabled: true, // Always try to fetch dashboard
    staleTime: 1000 * 60 * 2, // 2 minutes for dashboard
  });
}

// ============================================================================
// TASKS
// ============================================================================

export function useTasks(orgId: string | null, clientId?: string | null) {
  return useQuery({
    queryKey: orgId ? CACHE_KEYS.tasks(clientId || undefined) : ['tasks-disabled'],
    queryFn: () => getVerificationTasks(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// WORKFLOW
// ============================================================================

export function useWorkflowSummary(clientId: string | null) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.workflowSummary(clientId) : ['workflow-disabled'],
    queryFn: () => getClientWorkflowSummary(clientId!),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// BUDGETS & EXPENSES
// ============================================================================

export function useBudgets(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? CACHE_KEYS.budgets(orgId) : ['budgets-disabled'],
    queryFn: () => getBudgets(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useExpenses(orgId: string | null, clientId?: string | null) {
  return useQuery({
    queryKey: clientId ? CACHE_KEYS.expenses(clientId) : ['expenses-disabled'],
    queryFn: () => getExpenses(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// TIME LOGS
// ============================================================================

export function useTimeLogs(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? CACHE_KEYS.timeLogs() : ['timeLogs-disabled'],
    queryFn: () => getTimeLogs(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// ENGINEERING TASKS
// ============================================================================

export function useEngineeringTasks(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? ['engineeringTasks', orgId] : ['engineeringTasks-disabled'],
    queryFn: () => getEngineeringTasks(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// CHAT SESSIONS
// ============================================================================

export function useChatSessions() {
  return useQuery({
    queryKey: CACHE_KEYS.chatSessions(),
    queryFn: () => getChatSessions(),
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// TEAM MEMBERS
// ============================================================================

export function useTeamMembers(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? CACHE_KEYS.teamMembers(orgId) : ['teamMembers-disabled'],
    queryFn: () => getOrganizationMembers(orgId!),
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  Project,
  Employee,
  Contractor,
  ClientCompany,
  DashboardData,
  VerificationTask,
  WorkflowSummary,
  Budget,
  Expense,
  TimeLog,
  EngineeringTask,
  ChatSession,
  OrganizationMember,
};

