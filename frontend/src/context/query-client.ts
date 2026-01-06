import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
  },
});

export const CACHE_KEYS = {
  project: (id: string) => ['project', id] as const,
  projects: (clientId?: string) => clientId ? ['projects', clientId] : ['projects'] as const,
  employees: (clientId?: string) => clientId ? ['employees', clientId] : ['employees'] as const,
  contractors: (clientId?: string) => clientId ? ['contractors', clientId] : ['contractors'] as const,
  clients: () => ['clients'] as const,
  tasks: (clientId?: string, projectId?: string) => ['tasks', clientId, projectId] as const,
  copilotSuggestions: (clientId: string, projectId?: string) => ['copilot', 'suggestions', clientId, projectId] as const,
};



