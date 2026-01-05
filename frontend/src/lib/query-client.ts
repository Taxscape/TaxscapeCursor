import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Canonical Cache Keys
export const CACHE_KEYS = {
  org: (orgId: string) => ['org', orgId],
  client: (clientId: string) => ['client', clientId],
  projects: (clientId: string, taxYear: number, filters?: any) => ['projects', 'list', clientId, taxYear, filters],
  project: (projectId: string) => ['project', projectId],
  employees: (clientId: string, taxYear: number, filters?: any) => ['employees', 'list', clientId, taxYear, filters],
  contractors: (clientId: string, taxYear: number, filters?: any) => ['contractors', 'list', clientId, taxYear, filters],
  expenses: (clientId: string, filters?: any) => ['expenses', 'list', clientId, filters],
  workflow: (projectId: string) => ['workflow', projectId],
  views: (entityType: string) => ['views', entityType],
};

