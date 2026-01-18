"""
Job Runner

Executes background jobs with proper lifecycle management including:
- Heartbeat updates
- Progress tracking
- Cancellation checking
- Error handling
- Lock management
"""

import asyncio
import logging
import traceback
from datetime import datetime
from typing import Any, Callable, Dict, Optional, List
from dataclasses import dataclass, field
from contextlib import asynccontextmanager

from app.jobs.job_types import JobType, JobStatus, JobEventType
from app.jobs.job_manager import JobManager

logger = logging.getLogger(__name__)


@dataclass
class JobContext:
    """
    Context object passed to job handlers.
    Provides methods for progress reporting, cancellation checking, and child job creation.
    """
    job_id: str
    job_type: JobType
    organization_id: str
    client_company_id: Optional[str]
    tax_year: Optional[int]
    params: Dict[str, Any]
    user_id: str
    parent_job_id: Optional[str]
    
    _manager: JobManager = field(repr=False)
    _cancelled: bool = field(default=False, repr=False)
    _current_stage: str = field(default="starting", repr=False)
    _current_percent: float = field(default=0, repr=False)
    _warnings: List[str] = field(default_factory=list, repr=False)
    
    def update_progress(
        self,
        percent: float,
        stage: str,
        detail: Optional[str] = None,
        counters: Optional[Dict[str, Any]] = None
    ):
        """Update job progress. Call frequently to prevent timeout."""
        self._current_percent = percent
        self._current_stage = stage
        self._manager.update_progress(
            self.job_id,
            percent=percent,
            stage=stage,
            detail=detail,
            counters=counters
        )
        self._manager._log_event(
            self.job_id,
            JobEventType.PROGRESS_UPDATE,
            f"Progress: {percent:.0f}% - {stage}",
            {"percent": percent, "stage": stage, "detail": detail, "counters": counters}
        )
    
    def set_stage(self, stage: str, detail: Optional[str] = None):
        """Update stage without changing percent."""
        self._current_stage = stage
        self._manager.update_progress(
            self.job_id,
            percent=self._current_percent,
            stage=stage,
            detail=detail
        )
        self._manager._log_event(
            self.job_id,
            JobEventType.STAGE_CHANGE,
            f"Stage: {stage}",
            {"stage": stage, "detail": detail}
        )
    
    def log(self, message: str, data: Optional[Dict[str, Any]] = None):
        """Log an informational message."""
        self._manager._log_event(
            self.job_id,
            JobEventType.LOG,
            message,
            data
        )
        logger.info(f"[Job {self.job_id}] {message}")
    
    def warn(self, message: str, data: Optional[Dict[str, Any]] = None):
        """Log a warning message."""
        self._warnings.append(message)
        self._manager._log_event(
            self.job_id,
            JobEventType.WARNING,
            message,
            data
        )
        logger.warning(f"[Job {self.job_id}] Warning: {message}")
    
    def heartbeat(self):
        """Update heartbeat timestamp. Call during long operations."""
        self._manager.heartbeat(self.job_id)
    
    def check_cancelled(self) -> bool:
        """Check if cancellation has been requested. Returns True if should stop."""
        if self._cancelled:
            return True
        
        if self._manager.check_cancellation_requested(self.job_id):
            self._cancelled = True
            return True
        
        return False
    
    def create_child_job(
        self,
        job_type: JobType,
        params: Dict[str, Any],
        priority: int = 5
    ) -> Dict[str, Any]:
        """Create a child job that will run after this job."""
        job, is_existing = self._manager.create_job(
            organization_id=self.organization_id,
            user_id=self.user_id,
            job_type=job_type,
            client_company_id=self.client_company_id,
            tax_year=self.tax_year,
            params=params,
            priority=priority,
            parent_job_id=self.job_id
        )
        
        if not is_existing:
            self._manager._log_event(
                self.job_id,
                JobEventType.CHILD_JOB_CREATED,
                f"Created child job {job['id']} of type {job_type.value}",
                {"child_job_id": job["id"], "child_job_type": job_type.value}
            )
        
        return job
    
    def acquire_lock(
        self,
        lock_key: str,
        expires_in_seconds: int = 3600,
        reason: Optional[str] = None
    ) -> bool:
        """Acquire a lock. Returns True if acquired."""
        return self._manager.acquire_lock(
            lock_key, self.job_id, expires_in_seconds, reason
        )
    
    def release_lock(self, lock_key: str) -> bool:
        """Release a previously acquired lock."""
        return self._manager.release_lock(lock_key, self.job_id)
    
    def get_warnings(self) -> List[str]:
        """Get all warnings accumulated during job execution."""
        return list(self._warnings)


class JobRunner:
    """
    Executes job handlers with proper lifecycle management.
    """
    
    def __init__(
        self,
        heartbeat_interval: int = 30,
        cancellation_check_interval: int = 5
    ):
        self.manager = JobManager()
        self.heartbeat_interval = heartbeat_interval
        self.cancellation_check_interval = cancellation_check_interval
        self._handlers: Dict[JobType, Callable] = {}
        self._running_jobs: Dict[str, asyncio.Task] = {}
    
    def register_handler(self, job_type: JobType, handler: Callable):
        """Register a handler function for a job type."""
        self._handlers[job_type] = handler
        logger.info(f"Registered handler for job type: {job_type.value}")
    
    def get_handler(self, job_type: JobType) -> Optional[Callable]:
        """Get the handler for a job type."""
        return self._handlers.get(job_type)
    
    @asynccontextmanager
    async def _heartbeat_loop(self, job_id: str):
        """Context manager that runs heartbeat updates in background."""
        stop_event = asyncio.Event()
        
        async def heartbeat_task():
            while not stop_event.is_set():
                try:
                    await asyncio.sleep(self.heartbeat_interval)
                    if not stop_event.is_set():
                        self.manager.heartbeat(job_id)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"Heartbeat error for job {job_id}: {e}")
        
        task = asyncio.create_task(heartbeat_task())
        try:
            yield
        finally:
            stop_event.set()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    
    async def execute_job(self, job_id: str) -> bool:
        """
        Execute a job by ID.
        Returns True if completed successfully, False otherwise.
        """
        job = self.manager.get_job(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            return False
        
        job_type = JobType(job["job_type"])
        handler = self.get_handler(job_type)
        
        if not handler:
            logger.error(f"No handler registered for job type {job_type.value}")
            self.manager.mark_failed(
                job_id,
                error_type="no_handler",
                message=f"No handler registered for job type {job_type.value}",
                hint="This is a system configuration error. Please contact support."
            )
            return False
        
        # Update status to running
        self.manager.update_job_status(job_id, JobStatus.RUNNING)
        
        # Create job context
        ctx = JobContext(
            job_id=job_id,
            job_type=job_type,
            organization_id=job["organization_id"],
            client_company_id=job.get("client_company_id"),
            tax_year=job.get("tax_year"),
            params=job.get("params", {}),
            user_id=job["created_by_user_id"],
            parent_job_id=job.get("parent_job_id"),
            _manager=self.manager
        )
        
        logger.info(f"Starting job {job_id} of type {job_type.value}")
        
        try:
            async with self._heartbeat_loop(job_id):
                # Execute handler
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(ctx)
                else:
                    # Run sync handler in executor
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(None, handler, ctx)
                
                # Check if cancelled during execution
                if ctx.check_cancelled():
                    self.manager.update_job_status(job_id, JobStatus.CANCELLED)
                    self.manager._log_event(
                        job_id,
                        JobEventType.STAGE_CHANGE,
                        "Job cancelled during execution"
                    )
                    logger.info(f"Job {job_id} was cancelled")
                    return False
                
                # Mark completed
                self.manager.mark_completed(
                    job_id,
                    result=result or {},
                    warnings=ctx.get_warnings()
                )
                logger.info(f"Job {job_id} completed successfully")
                return True
                
        except asyncio.CancelledError:
            self.manager.update_job_status(job_id, JobStatus.CANCELLED)
            logger.info(f"Job {job_id} was cancelled (CancelledError)")
            return False
            
        except Exception as e:
            error_trace = traceback.format_exc()
            error_type = type(e).__name__
            
            # Determine user-friendly hint based on error type
            hint = self._get_error_hint(error_type, str(e))
            
            self.manager.mark_failed(
                job_id,
                error_type=error_type,
                message=str(e),
                hint=hint,
                failing_stage=ctx._current_stage,
                stack_trace=error_trace
            )
            
            logger.error(f"Job {job_id} failed: {e}\n{error_trace}")
            return False
    
    def _get_error_hint(self, error_type: str, message: str) -> str:
        """Get a user-friendly hint based on error type."""
        message_lower = message.lower()
        
        if "quota" in message_lower or "rate limit" in message_lower:
            return "AI service quota exceeded. Please wait a few minutes and try again."
        
        if "timeout" in message_lower:
            return "The operation timed out. This may be due to a large dataset. Try processing fewer items at once."
        
        if "permission" in message_lower or "unauthorized" in message_lower:
            return "Permission denied. Please ensure you have access to the required resources."
        
        if "not found" in message_lower:
            return "A required resource was not found. It may have been deleted or moved."
        
        if error_type == "ValidationError":
            return "The input data is invalid. Please check the data format and try again."
        
        if error_type == "ConnectionError":
            return "Could not connect to required services. Please check your internet connection."
        
        return "An error occurred while processing. Please try again or contact support if the issue persists."
    
    async def run_job_sync(self, job_id: str) -> bool:
        """Run a job synchronously (blocks until complete)."""
        return await self.execute_job(job_id)
    
    def run_job_background(self, job_id: str) -> asyncio.Task:
        """Run a job in background, returns immediately."""
        task = asyncio.create_task(self.execute_job(job_id))
        self._running_jobs[job_id] = task
        
        # Clean up when done
        def on_complete(t):
            self._running_jobs.pop(job_id, None)
        
        task.add_done_callback(on_complete)
        return task
    
    async def cancel_running_job(self, job_id: str) -> bool:
        """Cancel a running job task."""
        task = self._running_jobs.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False


# ============================================================================
# Global runner instance
# ============================================================================

_runner: Optional[JobRunner] = None


def get_runner() -> JobRunner:
    """Get the global job runner instance."""
    global _runner
    if _runner is None:
        _runner = JobRunner()
    return _runner


def register_handler(job_type: JobType, handler: Callable):
    """Register a handler with the global runner."""
    get_runner().register_handler(job_type, handler)


async def execute_job(job_id: str) -> bool:
    """Execute a job using the global runner."""
    return await get_runner().execute_job(job_id)


def run_job_background(job_id: str) -> asyncio.Task:
    """Run a job in background using the global runner."""
    return get_runner().run_job_background(job_id)
