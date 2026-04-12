/**
 * React Query hooks for background jobs
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listJobs,
  getJobStatus,
  getJobEvents,
  startJob,
  cancelJob,
  retryJob,
  startRDParseJob,
  startAIEvalJob,
  startExcelReportJob,
  startStudyArtifactsJob,
  startDefensePackJob,
  JobType,
  JobStatus,
  JobStartResponse,
} from "@/lib/jobs";
import { useJobs } from "@/context/jobs-context";
import { useCallback } from "react";

// =============================================================================
// Query Keys
// =============================================================================

export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (filters: Record<string, any>) => [...jobKeys.lists(), filters] as const,
  details: () => [...jobKeys.all, "detail"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  events: (id: string) => [...jobKeys.detail(id), "events"] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Query hook for listing jobs.
 */
export function useJobsList(options?: {
  clientCompanyId?: string;
  taxYear?: number;
  status?: JobStatus | JobStatus[];
  jobType?: JobType;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: jobKeys.list({
      clientCompanyId: options?.clientCompanyId,
      taxYear: options?.taxYear,
      status: options?.status,
      jobType: options?.jobType,
    }),
    queryFn: () =>
      listJobs({
        clientCompanyId: options?.clientCompanyId,
        taxYear: options?.taxYear,
        status: options?.status,
        jobType: options?.jobType,
        limit: options?.limit,
      }),
    enabled: options?.enabled !== false,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

/**
 * Query hook for job status.
 */
export function useJobStatus(jobId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: () => getJobStatus(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      // Stop polling when job is complete
      const data = query.state.data;
      if (
        data?.status === "completed" ||
        data?.status === "failed" ||
        data?.status === "cancelled"
      ) {
        return false;
      }
      return 3000; // Poll every 3 seconds while active
    },
  });
}

/**
 * Query hook for job events.
 */
export function useJobEvents(jobId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: jobKeys.events(jobId),
    queryFn: () => getJobEvents(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: 5000,
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Hook for starting a generic job with tracking.
 */
export function useStartJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  const mutation = useMutation({
    mutationFn: async ({
      jobType,
      params,
      options,
    }: {
      jobType: JobType;
      params?: Record<string, any>;
      options?: {
        clientCompanyId?: string;
        taxYear?: number;
        priority?: number;
      };
    }) => {
      return startJob(jobType, params, options);
    },
    onSuccess: (data, variables) => {
      // Track the job in global state
      trackJob(data, getJobTitle(variables.jobType));
      
      // Invalidate jobs list
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });

  return mutation;
}

/**
 * Hook for starting R&D parse job.
 */
export function useStartRDParseJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  return useMutation({
    mutationFn: async ({
      sessionId,
      includeAIEval,
      fileIds,
    }: {
      sessionId: string;
      includeAIEval?: boolean;
      fileIds?: string[];
    }) => {
      return startRDParseJob(sessionId, { includeAIEval, fileIds });
    },
    onSuccess: (data) => {
      trackJob(data, "R&D Analysis Parse");
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/**
 * Hook for starting AI evaluation job.
 */
export function useStartAIEvalJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  return useMutation({
    mutationFn: async (options: {
      projectIds?: string[];
      clientCompanyId?: string;
      taxYear?: number;
      useEvidence?: boolean;
      force?: boolean;
      concurrency?: number;
    }) => {
      return startAIEvalJob(options);
    },
    onSuccess: (data) => {
      trackJob(data, "AI Project Evaluation");
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      // Also invalidate projects to refresh after evaluation
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/**
 * Hook for starting Excel report job.
 */
export function useStartExcelReportJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  return useMutation({
    mutationFn: async ({
      clientCompanyId,
      taxYear,
      studyId,
    }: {
      clientCompanyId: string;
      taxYear?: number;
      studyId?: string;
    }) => {
      return startExcelReportJob(clientCompanyId, taxYear, studyId);
    },
    onSuccess: (data) => {
      trackJob(data, "Excel Report Generation");
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/**
 * Hook for starting study artifacts job.
 */
export function useStartStudyArtifactsJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  return useMutation({
    mutationFn: async ({
      studyId,
      studyVersion,
      artifactTypes,
      forceRegenerate,
    }: {
      studyId: string;
      studyVersion: number;
      artifactTypes?: string[];
      forceRegenerate?: boolean;
    }) => {
      return startStudyArtifactsJob(studyId, studyVersion, {
        artifactTypes,
        forceRegenerate,
      });
    },
    onSuccess: (data) => {
      trackJob(data, "Study Artifacts Generation");
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
  });
}

/**
 * Hook for starting defense pack job.
 */
export function useStartDefensePackJob() {
  const queryClient = useQueryClient();
  const { trackJob } = useJobs();

  return useMutation({
    mutationFn: async ({
      studyId,
      includeEvidence,
      includeAuditTrail,
    }: {
      studyId: string;
      includeEvidence?: boolean;
      includeAuditTrail?: boolean;
    }) => {
      return startDefensePackJob(studyId, { includeEvidence, includeAuditTrail });
    },
    onSuccess: (data) => {
      trackJob(data, "Defense Pack Generation");
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/**
 * Hook for cancelling a job.
 */
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/**
 * Hook for retrying a job.
 */
export function useRetryJob() {
  const queryClient = useQueryClient();
  const { trackJob, stopTracking } = useJobs();

  return useMutation({
    mutationFn: async ({ jobId, force }: { jobId: string; force?: boolean }) => {
      return retryJob(jobId, force);
    },
    onSuccess: (data, { jobId }) => {
      if (data.success && data.new_job) {
        // Stop tracking old job, start tracking new one
        stopTracking(jobId);
        trackJob(data.new_job, "Retried Job");
      }
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

function getJobTitle(jobType: JobType): string {
  const titles: Record<JobType, string> = {
    rd_parse_session: "R&D Analysis Parse",
    ai_evaluate_projects: "AI Project Evaluation",
    ai_evaluate_single_project: "AI Project Evaluation",
    generate_excel_report: "Excel Report Generation",
    generate_credit_estimate_export: "Credit Estimate Export",
    generate_study_artifacts: "Study Artifacts Generation",
    generate_defense_pack: "Defense Pack Generation",
    evidence_reprocessing: "Evidence Reprocessing",
    sync_expected_inputs: "Sync Expected Inputs",
    intake_file_processing: "Intake File Processing",
    bulk_import: "Bulk Import",
    other: "Background Task",
  };
  return titles[jobType] || "Background Job";
}

// =============================================================================
// Custom Hook: useJobWithPolling
// =============================================================================

/**
 * Hook that combines job starting with automatic status polling.
 * Useful for operations where you want to wait for completion.
 */
export function useJobWithPolling<T = any>(options?: {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}) {
  const { trackJob } = useJobs();
  const queryClient = useQueryClient();

  const startAndTrack = useCallback(
    async (
      jobType: JobType,
      params: Record<string, any>,
      title: string,
      jobOptions?: {
        clientCompanyId?: string;
        taxYear?: number;
      }
    ): Promise<JobStartResponse> => {
      const job = await startJob(jobType, params, jobOptions);
      trackJob(job, title);
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      return job;
    },
    [trackJob, queryClient]
  );

  return { startAndTrack };
}
