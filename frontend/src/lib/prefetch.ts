import { QueryClient } from '@tanstack/react-query';

// =============================================================================
// PREFETCH CONFIGURATION
// =============================================================================

export interface PrefetchConfig {
  maxConcurrent: number;
  staleTime: number;
  cacheTime: number;
}

const DEFAULT_CONFIG: PrefetchConfig = {
  maxConcurrent: 3,
  staleTime: 30 * 1000, // 30 seconds
  cacheTime: 5 * 60 * 1000, // 5 minutes
};

// =============================================================================
// PREFETCH MANAGER
// =============================================================================

class PrefetchManager {
  private queue: Array<() => Promise<void>> = [];
  private activeCount = 0;
  private config: PrefetchConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: Partial<PrefetchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async prefetch(
    queryClient: QueryClient,
    key: string,
    queryKey: unknown[],
    queryFn: () => Promise<unknown>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<void> {
    // Cancel any existing prefetch for this key
    this.cancel(key);

    const controller = new AbortController();
    this.abortControllers.set(key, controller);

    const execute = async () => {
      if (controller.signal.aborted) return;

      try {
        await queryClient.prefetchQuery({
          queryKey,
          queryFn: async () => {
            if (controller.signal.aborted) {
              throw new Error('Prefetch cancelled');
            }
            return queryFn();
          },
          staleTime: this.config.staleTime,
        });
      } catch (error) {
        // Silently ignore prefetch errors
        console.debug(`Prefetch failed for ${key}:`, error);
      } finally {
        this.activeCount--;
        this.abortControllers.delete(key);
        this.processQueue();
      }
    };

    if (priority === 'high' || this.activeCount < this.config.maxConcurrent) {
      this.activeCount++;
      execute();
    } else {
      // Queue based on priority
      if (priority === 'normal') {
        this.queue.push(execute);
      } else {
        this.queue.unshift(execute);
      }
    }
  }

  cancel(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }
  }

  cancelAll(): void {
    for (const [key, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.queue = [];
  }

  private processQueue(): void {
    while (this.activeCount < this.config.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.activeCount++;
        next();
      }
    }
  }
}

export const prefetchManager = new PrefetchManager();

// =============================================================================
// PREFETCH HOOKS & UTILITIES
// =============================================================================

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useEffect } from 'react';

/**
 * Prefetch on hover with debounce
 */
export function usePrefetchOnHover<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: { delay?: number; enabled?: boolean } = {}
) {
  const { delay = 150, enabled = true } = options;
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchKey = queryKey.join(':');

  const handleMouseEnter = useCallback(() => {
    if (!enabled) return;
    
    timeoutRef.current = setTimeout(() => {
      prefetchManager.prefetch(
        queryClient,
        prefetchKey,
        queryKey,
        queryFn,
        'normal'
      );
    }, delay);
  }, [queryClient, prefetchKey, queryKey, queryFn, delay, enabled]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    prefetchManager.cancel(prefetchKey);
  }, [prefetchKey]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave };
}

/**
 * Prefetch adjacent items in a list (next/prev)
 */
export function usePrefetchAdjacent<T extends { id: string }>(
  items: T[],
  currentIndex: number,
  getQueryKeyAndFn: (item: T) => { queryKey: unknown[]; queryFn: () => Promise<unknown> }
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch next item
    if (currentIndex < items.length - 1) {
      const nextItem = items[currentIndex + 1];
      const { queryKey, queryFn } = getQueryKeyAndFn(nextItem);
      prefetchManager.prefetch(
        queryClient,
        `adjacent:next:${nextItem.id}`,
        queryKey,
        queryFn,
        'low'
      );
    }

    // Prefetch previous item
    if (currentIndex > 0) {
      const prevItem = items[currentIndex - 1];
      const { queryKey, queryFn } = getQueryKeyAndFn(prevItem);
      prefetchManager.prefetch(
        queryClient,
        `adjacent:prev:${prevItem.id}`,
        queryKey,
        queryFn,
        'low'
      );
    }

    return () => {
      prefetchManager.cancelAll();
    };
  }, [currentIndex, items, getQueryKeyAndFn, queryClient]);
}

/**
 * Prefetch client context data when switching clients
 */
export async function prefetchClientContext(
  queryClient: QueryClient,
  clientId: string,
  fetchers: {
    getProjects: (clientId: string) => Promise<unknown>;
    getWorkflow: (clientId: string) => Promise<unknown>;
    getTasks: (clientId: string) => Promise<unknown>;
    getDashboard: (clientId: string) => Promise<unknown>;
  }
) {
  const prefetches = [
    prefetchManager.prefetch(
      queryClient,
      `client:${clientId}:projects`,
      ['projects', 'list', clientId],
      () => fetchers.getProjects(clientId),
      'high'
    ),
    prefetchManager.prefetch(
      queryClient,
      `client:${clientId}:workflow`,
      ['workflow', 'client', clientId],
      () => fetchers.getWorkflow(clientId),
      'high'
    ),
    prefetchManager.prefetch(
      queryClient,
      `client:${clientId}:tasks`,
      ['tasks', 'client', clientId],
      () => fetchers.getTasks(clientId),
      'normal'
    ),
    prefetchManager.prefetch(
      queryClient,
      `client:${clientId}:dashboard`,
      ['dashboard', clientId],
      () => fetchers.getDashboard(clientId),
      'normal'
    ),
  ];

  await Promise.allSettled(prefetches);
}

// =============================================================================
// SCROLL POSITION RESTORATION
// =============================================================================

const scrollPositions = new Map<string, number>();

export function saveScrollPosition(key: string, position: number): void {
  scrollPositions.set(key, position);
}

export function getScrollPosition(key: string): number | undefined {
  return scrollPositions.get(key);
}

export function clearScrollPosition(key: string): void {
  scrollPositions.delete(key);
}

/**
 * Hook to persist and restore scroll position
 */
export function useScrollRestoration(key: string, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Restore scroll position
    const savedPosition = getScrollPosition(key);
    if (savedPosition !== undefined) {
      element.scrollTop = savedPosition;
    }

    // Save scroll position on unmount
    return () => {
      if (element) {
        saveScrollPosition(key, element.scrollTop);
      }
    };
  }, [key, ref]);
}



