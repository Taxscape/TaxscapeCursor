// =============================================================================
// PERFORMANCE BUDGETS
// =============================================================================

export const PERFORMANCE_BUDGETS = {
  // Route transitions
  routeTransition: {
    target: 200, // ms
    warning: 500,
    critical: 1000,
  },
  // Table render
  tableRender: {
    target: 100, // ms for 1k rows
    warning: 200,
    critical: 500,
  },
  // API latency
  apiLatency: {
    target: 300, // ms
    warning: 1000,
    critical: 3000,
  },
  // Frame rate
  scrollFPS: {
    target: 60,
    warning: 30,
    critical: 15,
  },
  // Memory
  memoryUsage: {
    target: 100, // MB
    warning: 200,
    critical: 500,
  },
};

// =============================================================================
// PERFORMANCE METRICS COLLECTOR
// =============================================================================

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  category: 'navigation' | 'render' | 'api' | 'interaction' | 'memory';
  metadata?: Record<string, unknown>;
}

class PerformanceCollector {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000;
  private observers: Set<(metric: PerformanceMetric) => void> = new Set();

  record(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(fullMetric);

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Notify observers
    this.observers.forEach(cb => cb(fullMetric));

    // Check budgets and warn
    this.checkBudget(fullMetric);

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Perf] ${metric.category}/${metric.name}: ${metric.value}ms`, metric.metadata);
    }
  }

  private checkBudget(metric: PerformanceMetric): void {
    const budgets = PERFORMANCE_BUDGETS as Record<string, { target: number; warning: number; critical: number }>;
    const budget = budgets[metric.name];
    
    if (!budget) return;

    if (metric.value > budget.critical) {
      console.error(`[Perf CRITICAL] ${metric.name}: ${metric.value}ms exceeds critical threshold ${budget.critical}ms`);
    } else if (metric.value > budget.warning) {
      console.warn(`[Perf WARNING] ${metric.name}: ${metric.value}ms exceeds warning threshold ${budget.warning}ms`);
    }
  }

  subscribe(callback: (metric: PerformanceMetric) => void): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  getMetrics(filter?: { category?: string; name?: string; since?: number }): PerformanceMetric[] {
    let result = this.metrics;

    if (filter?.category) {
      result = result.filter(m => m.category === filter.category);
    }
    if (filter?.name) {
      result = result.filter(m => m.name === filter.name);
    }
    if (filter?.since) {
      result = result.filter(m => m.timestamp >= filter.since);
    }

    return result;
  }

  getAverages(timeWindow: number = 60000): Record<string, number> {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(m => m.timestamp >= now - timeWindow);

    const grouped: Record<string, number[]> = {};
    recentMetrics.forEach(m => {
      if (!grouped[m.name]) grouped[m.name] = [];
      grouped[m.name].push(m.value);
    });

    const averages: Record<string, number> = {};
    Object.entries(grouped).forEach(([name, values]) => {
      averages[name] = values.reduce((a, b) => a + b, 0) / values.length;
    });

    return averages;
  }

  clear(): void {
    this.metrics = [];
  }
}

export const performanceCollector = new PerformanceCollector();

// =============================================================================
// TIMING UTILITIES
// =============================================================================

/**
 * Measure the execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  category: PerformanceMetric['category'],
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    performanceCollector.record({ name, value: duration, category, metadata });
  }
}

/**
 * Measure the execution time of a sync function
 */
export function measureSync<T>(
  name: string,
  category: PerformanceMetric['category'],
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    const duration = performance.now() - start;
    performanceCollector.record({ name, value: duration, category, metadata });
  }
}

/**
 * Create a timing context for manual start/stop
 */
export function createTimer(name: string, category: PerformanceMetric['category']) {
  let startTime: number | null = null;

  return {
    start(): void {
      startTime = performance.now();
    },
    stop(metadata?: Record<string, unknown>): number {
      if (startTime === null) {
        console.warn(`Timer ${name} was stopped without being started`);
        return 0;
      }
      const duration = performance.now() - startTime;
      performanceCollector.record({ name, value: duration, category, metadata });
      startTime = null;
      return duration;
    },
  };
}

// =============================================================================
// REACT HOOKS
// =============================================================================

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to measure component render time
 */
export function useRenderTime(componentName: string) {
  const renderStart = useRef(performance.now());

  useEffect(() => {
    const duration = performance.now() - renderStart.current;
    performanceCollector.record({
      name: `render:${componentName}`,
      value: duration,
      category: 'render',
    });
  });

  // Reset on each render
  renderStart.current = performance.now();
}

/**
 * Hook to detect and report long tasks
 */
export function useLongTaskDetection(threshold: number = 50) {
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > threshold) {
          performanceCollector.record({
            name: 'longTask',
            value: entry.duration,
            category: 'interaction',
            metadata: {
              startTime: entry.startTime,
              entryType: entry.entryType,
            },
          });
        }
      }
    });

    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // longtask observer not supported
    }

    return () => observer.disconnect();
  }, [threshold]);
}

/**
 * Hook to measure frame rate during scroll
 */
export function useScrollFPSMonitor(ref: React.RefObject<HTMLElement>) {
  const frameTimestamps = useRef<number[]>([]);
  const rafId = useRef<number | null>(null);
  const isScrolling = useRef(false);

  const measureFPS = useCallback(() => {
    const now = performance.now();
    frameTimestamps.current.push(now);

    // Keep only last 60 frames
    if (frameTimestamps.current.length > 60) {
      frameTimestamps.current.shift();
    }

    if (isScrolling.current) {
      rafId.current = requestAnimationFrame(measureFPS);
    } else if (frameTimestamps.current.length >= 2) {
      // Calculate FPS
      const times = frameTimestamps.current;
      const duration = times[times.length - 1] - times[0];
      const fps = ((times.length - 1) / duration) * 1000;

      performanceCollector.record({
        name: 'scrollFPS',
        value: fps,
        category: 'render',
      });

      frameTimestamps.current = [];
    }
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling.current) {
        isScrolling.current = true;
        frameTimestamps.current = [];
        rafId.current = requestAnimationFrame(measureFPS);
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling.current = false;
      }, 150);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      clearTimeout(scrollTimeout);
    };
  }, [ref, measureFPS]);
}

/**
 * Hook to monitor memory usage
 */
export function useMemoryMonitor(intervalMs: number = 10000) {
  useEffect(() => {
    if (typeof performance === 'undefined' || !(performance as any).memory) return;

    const checkMemory = () => {
      const memory = (performance as any).memory;
      const usedMB = memory.usedJSHeapSize / (1024 * 1024);

      performanceCollector.record({
        name: 'memoryUsage',
        value: usedMB,
        category: 'memory',
        metadata: {
          totalMB: memory.totalJSHeapSize / (1024 * 1024),
          limitMB: memory.jsHeapSizeLimit / (1024 * 1024),
        },
      });
    };

    const interval = setInterval(checkMemory, intervalMs);
    checkMemory(); // Initial check

    return () => clearInterval(interval);
  }, [intervalMs]);
}

// =============================================================================
// API INSTRUMENTATION WRAPPER
// =============================================================================

export function instrumentFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    const timer = createTimer('apiLatency', 'api');

    timer.start();
    try {
      const response = await originalFetch(input, init);
      timer.stop({ url, method, status: response.status });
      return response;
    } catch (error) {
      timer.stop({ url, method, error: true });
      throw error;
    }
  };
}

// =============================================================================
// PERFORMANCE DASHBOARD DATA
// =============================================================================

export function getPerformanceSummary() {
  const averages = performanceCollector.getAverages();
  const metrics = performanceCollector.getMetrics();

  const summary = {
    averages,
    totalMetrics: metrics.length,
    budgetViolations: {
      warnings: 0,
      critical: 0,
    },
    byCategory: {} as Record<string, { count: number; avgMs: number }>,
  };

  // Count budget violations
  Object.entries(PERFORMANCE_BUDGETS).forEach(([name, budget]) => {
    const avg = averages[name];
    if (avg > budget.critical) summary.budgetViolations.critical++;
    else if (avg > budget.warning) summary.budgetViolations.warnings++;
  });

  // Group by category
  metrics.forEach(m => {
    if (!summary.byCategory[m.category]) {
      summary.byCategory[m.category] = { count: 0, avgMs: 0 };
    }
    summary.byCategory[m.category].count++;
  });

  return summary;
}

