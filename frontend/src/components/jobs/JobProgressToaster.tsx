"use client";

import React from "react";
import { useJobs, TrackedJob } from "@/context/jobs-context";
import { getJobTypeLabel, getJobStatusColor, isJobComplete } from "@/lib/jobs";

// =============================================================================
// Job Progress Card (Individual Job)
// =============================================================================

interface JobCardProps {
  job: TrackedJob;
  onMinimize: () => void;
  onExpand: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onViewDetails: () => void;
  onDismiss: () => void;
}

function JobCard({
  job,
  onMinimize,
  onExpand,
  onCancel,
  onRetry,
  onViewDetails,
  onDismiss,
}: JobCardProps) {
  const isComplete = isJobComplete(job.status);
  const isFailed = job.status === "failed";
  const isRunning = job.status === "running";
  const isCancelled = job.status === "cancelled";

  // Minimized view
  if (job.minimized) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
        onClick={onExpand}
      >
        {!isComplete && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        {isComplete && !isFailed && (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {isFailed && (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )}
        <span className="text-sm text-gray-300 truncate max-w-[150px]">
          {job.title}
        </span>
        {!isComplete && (
          <span className="text-xs text-gray-400">
            {Math.round(job.progress.percent)}%
          </span>
        )}
      </div>
    );
  }

  // Expanded view
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50">
        <span className="text-sm font-medium text-gray-200 truncate">
          {job.title}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onMinimize}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          {isComplete && (
            <button
              onClick={onDismiss}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Dismiss"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Progress bar */}
        {!isComplete && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{job.progress.stage}</span>
              <span>{Math.round(job.progress.percent)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${job.progress.percent}%` }}
              />
            </div>
            {job.progress.detail && (
              <p className="text-xs text-gray-500 truncate">
                {job.progress.detail}
              </p>
            )}
            {job.progress.counters && (
              <p className="text-xs text-gray-500">
                {Object.entries(job.progress.counters)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </p>
            )}
          </div>
        )}

        {/* Completed state */}
        {job.status === "completed" && (
          <div className="flex items-center gap-2 text-green-500">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Completed</span>
          </div>
        )}

        {/* Failed state */}
        {isFailed && job.error && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-500">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">Failed</span>
            </div>
            <p className="text-xs text-gray-400">{job.error.message}</p>
            {job.error.hint && (
              <p className="text-xs text-gray-500 italic">{job.error.hint}</p>
            )}
          </div>
        )}

        {/* Cancelled state */}
        {isCancelled && (
          <div className="flex items-center gap-2 text-orange-500">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Cancelled</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onViewDetails}
            className="flex-1 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            View Details
          </button>
          {isRunning && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
            >
              Cancel
            </button>
          )}
          {(isFailed || isCancelled) && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Job Progress Toaster
// =============================================================================

export function JobProgressToaster() {
  const {
    activeJobs,
    recentCompletedJobs,
    hasActiveJobs,
    minimizeJob,
    expandJob,
    cancelTrackedJob,
    retryTrackedJob,
    stopTracking,
    openJobDetail,
  } = useJobs();

  // Combine active and recent completed (only show completed for a short time)
  const visibleJobs = [
    ...activeJobs,
    ...recentCompletedJobs.filter((j) => {
      // Show completed jobs for 30 seconds
      const completedAt = j.completedAt ? new Date(j.completedAt).getTime() : 0;
      return Date.now() - completedAt < 30000;
    }),
  ];

  if (visibleJobs.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {visibleJobs.map((job) => (
        <JobCard
          key={job.jobId}
          job={job}
          onMinimize={() => minimizeJob(job.jobId)}
          onExpand={() => expandJob(job.jobId)}
          onCancel={() => cancelTrackedJob(job.jobId)}
          onRetry={() => retryTrackedJob(job.jobId)}
          onViewDetails={() => openJobDetail(job.jobId)}
          onDismiss={() => stopTracking(job.jobId)}
        />
      ))}
    </div>
  );
}

export default JobProgressToaster;
