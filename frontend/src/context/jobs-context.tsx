"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  JobStartResponse,
  JobStatusResponse,
  JobType,
  JobStatus,
  JobProgress,
  getJobStatus,
  subscribeToJob,
  cancelJob,
  retryJob,
  isJobComplete,
  SSEJobEvent,
} from "@/lib/jobs";

// =============================================================================
// Types
// =============================================================================

export interface TrackedJob {
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  progress: JobProgress;
  title: string;
  error?: {
    message: string;
    hint?: string;
  } | null;
  result?: Record<string, any> | null;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  minimized: boolean;
}

interface JobsContextType {
  // State
  activeJobs: TrackedJob[];
  recentCompletedJobs: TrackedJob[];
  hasActiveJobs: boolean;
  
  // Actions
  trackJob: (job: JobStartResponse, title?: string) => void;
  stopTracking: (jobId: string) => void;
  minimizeJob: (jobId: string) => void;
  expandJob: (jobId: string) => void;
  cancelTrackedJob: (jobId: string) => Promise<void>;
  retryTrackedJob: (jobId: string) => Promise<JobStartResponse | null>;
  clearCompletedJobs: () => void;
  
  // Modal state
  selectedJobId: string | null;
  openJobDetail: (jobId: string) => void;
  closeJobDetail: () => void;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, TrackedJob>>(new Map());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const unsubscribeRefs = useRef<Map<string, () => void>>(new Map());

  // Derived state
  const activeJobs = Array.from(jobs.values()).filter(
    (j) => !isJobComplete(j.status)
  );
  const recentCompletedJobs = Array.from(jobs.values())
    .filter((j) => isJobComplete(j.status))
    .slice(0, 10); // Keep last 10 completed jobs
  const hasActiveJobs = activeJobs.length > 0;

  // Update job in state
  const updateJob = useCallback((jobId: string, updates: Partial<TrackedJob>) => {
    setJobs((prev) => {
      const job = prev.get(jobId);
      if (!job) return prev;
      const next = new Map(prev);
      next.set(jobId, { ...job, ...updates });
      return next;
    });
  }, []);

  // Subscribe to job updates
  const subscribeToJobUpdates = useCallback(
    (jobId: string) => {
      // Don't subscribe if already subscribed
      if (unsubscribeRefs.current.has(jobId)) return;

      const handleEvent = (event: SSEJobEvent) => {
        switch (event.type) {
          case "status":
            updateJob(jobId, {
              status: event.status,
              progress: event.progress,
              result: event.result ?? undefined,
              error: event.error
                ? {
                    message: event.error.message,
                    hint: event.error.hint ?? undefined,
                  }
                : undefined,
            });
            break;
          case "complete":
            updateJob(jobId, { status: event.status });
            // Unsubscribe after completion
            unsubscribeRefs.current.get(jobId)?.();
            unsubscribeRefs.current.delete(jobId);
            break;
          case "error":
            updateJob(jobId, {
              status: "failed",
              error: { message: event.message },
            });
            break;
        }
      };

      const handleError = (error: Error) => {
        console.error(`SSE error for job ${jobId}:`, error);
        // Fall back to polling
        pollJob(jobId);
      };

      try {
        const unsubscribe = subscribeToJob(jobId, handleEvent, handleError);
        unsubscribeRefs.current.set(jobId, unsubscribe);
      } catch (e) {
        // SSE not supported, fall back to polling
        pollJob(jobId);
      }
    },
    [updateJob]
  );

  // Polling fallback
  const pollJob = useCallback(
    async (jobId: string) => {
      const poll = async () => {
        try {
          const status = await getJobStatus(jobId);
          updateJob(jobId, {
            status: status.status,
            progress: status.progress,
            result: status.result?.outputs,
            error: status.error
              ? {
                  message: status.error.message,
                  hint: status.error.hint ?? undefined,
                }
              : undefined,
            startedAt: status.started_at ?? undefined,
            completedAt: status.completed_at ?? undefined,
          });

          if (!isJobComplete(status.status)) {
            setTimeout(poll, 3000);
          }
        } catch (e) {
          console.error(`Error polling job ${jobId}:`, e);
        }
      };
      poll();
    },
    [updateJob]
  );

  // Track a new job
  const trackJob = useCallback(
    (job: JobStartResponse, title?: string) => {
      const trackedJob: TrackedJob = {
        jobId: job.job_id,
        jobType: job.status === "queued" ? "other" : "other", // Will be updated
        status: job.status,
        progress: job.progress,
        title: title || `Job ${job.job_id.slice(0, 8)}`,
        createdAt: new Date().toISOString(),
        minimized: false,
      };

      setJobs((prev) => {
        const next = new Map(prev);
        next.set(job.job_id, trackedJob);
        return next;
      });

      // Subscribe to updates
      if (!isJobComplete(job.status)) {
        subscribeToJobUpdates(job.job_id);
      }
    },
    [subscribeToJobUpdates]
  );

  // Stop tracking a job
  const stopTracking = useCallback((jobId: string) => {
    unsubscribeRefs.current.get(jobId)?.();
    unsubscribeRefs.current.delete(jobId);
    setJobs((prev) => {
      const next = new Map(prev);
      next.delete(jobId);
      return next;
    });
  }, []);

  // Minimize/expand job
  const minimizeJob = useCallback(
    (jobId: string) => updateJob(jobId, { minimized: true }),
    [updateJob]
  );

  const expandJob = useCallback(
    (jobId: string) => updateJob(jobId, { minimized: false }),
    [updateJob]
  );

  // Cancel job
  const cancelTrackedJob = useCallback(
    async (jobId: string) => {
      try {
        await cancelJob(jobId);
        updateJob(jobId, { status: "cancellation_requested" });
      } catch (e) {
        console.error(`Error cancelling job ${jobId}:`, e);
        throw e;
      }
    },
    [updateJob]
  );

  // Retry job
  const retryTrackedJob = useCallback(
    async (jobId: string): Promise<JobStartResponse | null> => {
      try {
        const result = await retryJob(jobId);
        if (result.success && result.new_job) {
          trackJob(result.new_job, jobs.get(jobId)?.title);
          stopTracking(jobId);
          return result.new_job;
        }
        return null;
      } catch (e) {
        console.error(`Error retrying job ${jobId}:`, e);
        throw e;
      }
    },
    [trackJob, stopTracking, jobs]
  );

  // Clear completed jobs
  const clearCompletedJobs = useCallback(() => {
    setJobs((prev) => {
      const next = new Map(prev);
      for (const [id, job] of next) {
        if (isJobComplete(job.status)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  // Modal controls
  const openJobDetail = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
  }, []);

  const closeJobDetail = useCallback(() => {
    setSelectedJobId(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const unsubscribe of unsubscribeRefs.current.values()) {
        unsubscribe();
      }
      unsubscribeRefs.current.clear();
    };
  }, []);

  const value: JobsContextType = {
    activeJobs,
    recentCompletedJobs,
    hasActiveJobs,
    trackJob,
    stopTracking,
    minimizeJob,
    expandJob,
    cancelTrackedJob,
    retryTrackedJob,
    clearCompletedJobs,
    selectedJobId,
    openJobDetail,
    closeJobDetail,
  };

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useJobs() {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error("useJobs must be used within a JobsProvider");
  }
  return context;
}

// =============================================================================
// Helper Hook for Starting Jobs
// =============================================================================

export function useStartJob() {
  const { trackJob } = useJobs();

  return useCallback(
    (job: JobStartResponse, title?: string) => {
      trackJob(job, title);
      return job;
    },
    [trackJob]
  );
}
