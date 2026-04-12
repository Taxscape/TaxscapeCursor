"use client";

import React, { useEffect, useState } from "react";
import { useJobs } from "@/context/jobs-context";
import {
  getJobStatus,
  getJobEvents,
  JobStatusResponse,
  JobEvent,
  getJobTypeLabel,
  isJobComplete,
} from "@/lib/jobs";

// =============================================================================
// Job Detail Modal
// =============================================================================

export function JobDetailModal() {
  const { selectedJobId, closeJobDetail, cancelTrackedJob, retryTrackedJob, stopTracking } =
    useJobs();

  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch job details
  useEffect(() => {
    if (!selectedJobId) {
      setJobStatus(null);
      setEvents([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [status, eventsResponse] = await Promise.all([
          getJobStatus(selectedJobId),
          getJobEvents(selectedJobId, 100),
        ]);
        setJobStatus(status);
        setEvents(eventsResponse.events);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load job details");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Poll for updates if job is active
    const interval = setInterval(async () => {
      if (selectedJobId) {
        try {
          const [status, eventsResponse] = await Promise.all([
            getJobStatus(selectedJobId),
            getJobEvents(selectedJobId, 100),
          ]);
          setJobStatus(status);
          setEvents(eventsResponse.events);
        } catch {
          // Ignore polling errors
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedJobId]);

  if (!selectedJobId) {
    return null;
  }

  const handleCancel = async () => {
    if (selectedJobId) {
      try {
        await cancelTrackedJob(selectedJobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel job");
      }
    }
  };

  const handleRetry = async () => {
    if (selectedJobId) {
      try {
        const newJob = await retryTrackedJob(selectedJobId);
        if (newJob) {
          closeJobDetail();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to retry job");
      }
    }
  };

  const handleDismiss = () => {
    stopTracking(selectedJobId);
    closeJobDetail();
  };

  const isComplete = jobStatus ? isJobComplete(jobStatus.status) : false;
  const canCancel = jobStatus?.can_cancel ?? false;
  const canRetry = jobStatus?.can_retry ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={closeJobDetail}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-xl border border-gray-700 w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Job Details</h2>
            <p className="text-sm text-gray-400">
              {jobStatus?.job_id ? `ID: ${jobStatus.job_id.slice(0, 8)}...` : ""}
            </p>
          </div>
          <button
            onClick={closeJobDetail}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {jobStatus && !loading && (
            <>
              {/* Status Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={jobStatus.status} />
                    <span className="text-gray-100 capitalize">
                      {jobStatus.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Progress</p>
                  <p className="text-gray-100 text-lg font-semibold">
                    {Math.round(jobStatus.progress.percent)}%
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Stage</p>
                  <p className="text-gray-100">{jobStatus.progress.stage}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Created</p>
                  <p className="text-gray-100">
                    {new Date(jobStatus.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {!isComplete && (
                <div className="space-y-2">
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${jobStatus.progress.percent}%` }}
                    />
                  </div>
                  {jobStatus.progress.detail && (
                    <p className="text-sm text-gray-400">{jobStatus.progress.detail}</p>
                  )}
                  {jobStatus.progress.counters && (
                    <div className="flex gap-4 text-sm text-gray-400">
                      {Object.entries(jobStatus.progress.counters).map(([key, value]) => (
                        <span key={key}>
                          {key}: <span className="text-gray-200">{value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error Details */}
              {jobStatus.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-400">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">{jobStatus.error.error_type}</span>
                  </div>
                  <p className="text-gray-300">{jobStatus.error.message}</p>
                  {jobStatus.error.hint && (
                    <p className="text-sm text-gray-400 italic">{jobStatus.error.hint}</p>
                  )}
                  {jobStatus.error.failing_stage && (
                    <p className="text-sm text-gray-500">
                      Failed at stage: {jobStatus.error.failing_stage}
                    </p>
                  )}
                </div>
              )}

              {/* Result Details */}
              {jobStatus.result && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-400">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Completed Successfully</span>
                  </div>
                  {jobStatus.result.warnings && jobStatus.result.warnings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-yellow-400">Warnings:</p>
                      <ul className="list-disc list-inside text-sm text-gray-400">
                        {jobStatus.result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {jobStatus.result.outputs && Object.keys(jobStatus.result.outputs).length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                        View output details
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-x-auto">
                        {JSON.stringify(jobStatus.result.outputs, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Events Log */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">Event Log</h3>
                <div className="bg-gray-800 rounded-lg max-h-64 overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No events yet</p>
                  ) : (
                    <div className="divide-y divide-gray-700">
                      {events.map((event) => (
                        <div key={event.id} className="px-4 py-2">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-medium ${getEventTypeColor(
                                event.event_type
                              )}`}
                            >
                              {event.event_type.replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(event.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 mt-1">{event.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Dismiss
          </button>
          <div className="flex items-center gap-2">
            {canCancel && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg transition-colors"
              >
                Cancel Job
              </button>
            )}
            {canRetry && (
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                Retry Job
              </button>
            )}
            <button
              onClick={closeJobDetail}
              className="px-4 py-2 text-sm bg-gray-700 text-gray-200 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-gray-500",
    running: "bg-blue-500",
    completed: "bg-green-500",
    failed: "bg-red-500",
    cancelled: "bg-orange-500",
    cancellation_requested: "bg-yellow-500",
  };

  return (
    <span className={`w-2 h-2 rounded-full ${colors[status] || "bg-gray-500"}`} />
  );
}

function getEventTypeColor(eventType: string): string {
  const colors: Record<string, string> = {
    progress_update: "text-blue-400",
    stage_change: "text-cyan-400",
    log: "text-gray-400",
    warning: "text-yellow-400",
    error: "text-red-400",
    heartbeat: "text-gray-500",
    child_job_created: "text-purple-400",
    retry_scheduled: "text-orange-400",
  };
  return colors[eventType] || "text-gray-400";
}

export default JobDetailModal;
