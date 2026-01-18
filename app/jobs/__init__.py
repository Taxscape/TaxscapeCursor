"""
TaxScape Background Jobs Framework

This package provides a robust background job system for running long-running tasks
like parsing, AI evaluation, report generation, and ZIP packaging.

Key components:
- job_types: Job type definitions and schemas
- job_manager: Job creation, status management, and idempotency
- runner: Job execution and heartbeat management
- handlers: Task-specific job handlers
- utils: Shared utilities for progress reporting and error handling
"""

from app.jobs.job_types import (
    JobType,
    JobStatus,
    JobEventType,
    JobProgress,
    JobError,
    JobParams,
    JobResult,
)

from app.jobs.job_manager import (
    JobManager,
    create_job,
    get_job,
    get_job_status,
    list_jobs,
    cancel_job,
    retry_job,
)

from app.jobs.runner import (
    JobRunner,
    JobContext,
)

__all__ = [
    # Types
    "JobType",
    "JobStatus", 
    "JobEventType",
    "JobProgress",
    "JobError",
    "JobParams",
    "JobResult",
    # Manager
    "JobManager",
    "create_job",
    "get_job",
    "get_job_status",
    "list_jobs",
    "cancel_job",
    "retry_job",
    # Runner
    "JobRunner",
    "JobContext",
]
