"""
Job Manager

Handles job creation, status management, idempotency enforcement, and lock management.
This is the primary interface for creating and managing background jobs.
"""

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from app.jobs.job_types import (
    JobType, JobStatus, JobEventType, JobProgress, JobError, 
    JobResult, JobParams, JobStartResponse, JobStatusResponse,
    JobListItem, JobListResponse, JobEventItem, JobEventsResponse
)
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class JobManager:
    """
    Manages background job lifecycle including creation, status updates,
    idempotency enforcement, and lock management.
    """
    
    def __init__(self, supabase=None):
        self.supabase = supabase or get_supabase()
    
    def compute_idempotency_key(
        self,
        job_type: JobType,
        client_company_id: Optional[str],
        tax_year: Optional[int],
        params: Dict[str, Any]
    ) -> str:
        """
        Compute a deterministic idempotency key for a job.
        Same inputs = same key = prevents duplicate jobs.
        """
        key_parts = [job_type.value]
        
        if client_company_id:
            key_parts.append(f"client:{client_company_id}")
        
        if tax_year:
            key_parts.append(f"year:{tax_year}")
        
        # Hash relevant params (exclude transient data)
        params_for_hash = {k: v for k, v in params.items() 
                          if k not in ("force", "timestamp", "request_id", "_nonce")}
        params_hash = hashlib.md5(
            json.dumps(params_for_hash, sort_keys=True, default=str).encode()
        ).hexdigest()[:12]
        key_parts.append(f"params:{params_hash}")
        
        return ":".join(key_parts)
    
    def find_existing_job(
        self,
        organization_id: str,
        idempotency_key: str
    ) -> Optional[Dict[str, Any]]:
        """
        Find an existing job with the same idempotency key that is
        still running or queued.
        """
        try:
            result = self.supabase.table("background_jobs")\
                .select("*")\
                .eq("organization_id", organization_id)\
                .eq("idempotency_key", idempotency_key)\
                .in_("status", ["queued", "running"])\
                .limit(1)\
                .execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error finding existing job: {e}")
            return None
    
    def create_job(
        self,
        organization_id: str,
        user_id: str,
        job_type: JobType,
        client_company_id: Optional[str] = None,
        tax_year: Optional[int] = None,
        params: Dict[str, Any] = None,
        priority: int = 5,
        parent_job_id: Optional[str] = None,
        custom_idempotency_key: Optional[str] = None
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Create a new job or return existing job if idempotency key matches.
        
        Returns:
            Tuple of (job_record, is_existing)
        """
        params = params or {}
        
        # Compute idempotency key
        idempotency_key = custom_idempotency_key or self.compute_idempotency_key(
            job_type, client_company_id, tax_year, params
        )
        
        # Check for existing job
        existing = self.find_existing_job(organization_id, idempotency_key)
        if existing:
            logger.info(f"Returning existing job {existing['id']} for idempotency key {idempotency_key}")
            return existing, True
        
        # Create new job
        job_id = str(uuid4())
        job_record = {
            "id": job_id,
            "organization_id": organization_id,
            "client_company_id": client_company_id,
            "tax_year": tax_year,
            "job_type": job_type.value,
            "priority": priority,
            "idempotency_key": idempotency_key,
            "status": "queued",
            "params": params,
            "progress": {
                "percent": 0,
                "stage": "queued",
                "detail": None,
                "counters": None,
                "last_heartbeat_at": None
            },
            "parent_job_id": parent_job_id,
            "created_by_user_id": user_id,
        }
        
        try:
            result = self.supabase.table("background_jobs")\
                .insert(job_record)\
                .execute()
            
            created_job = result.data[0] if result.data else job_record
            
            # Log creation event
            self._log_event(
                job_id, 
                JobEventType.STAGE_CHANGE, 
                "Job created and queued",
                {"job_type": job_type.value, "priority": priority}
            )
            
            logger.info(f"Created job {job_id} of type {job_type.value}")
            return created_job, False
            
        except Exception as e:
            # Handle unique constraint violation (race condition)
            if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
                existing = self.find_existing_job(organization_id, idempotency_key)
                if existing:
                    return existing, True
            
            logger.error(f"Error creating job: {e}")
            raise
    
    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get full job record by ID."""
        try:
            result = self.supabase.table("background_jobs")\
                .select("*")\
                .eq("id", job_id)\
                .single()\
                .execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting job {job_id}: {e}")
            return None
    
    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: Optional[Dict[str, Any]] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update job status and optionally progress/result/error."""
        update_data = {
            "status": status.value,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if progress:
            update_data["progress"] = progress
        
        if status == JobStatus.RUNNING:
            update_data["started_at"] = datetime.utcnow().isoformat()
            update_data["last_heartbeat_at"] = datetime.utcnow().isoformat()
        
        if status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            update_data["completed_at"] = datetime.utcnow().isoformat()
        
        if result:
            update_data["result"] = result
        
        if error:
            update_data["error"] = error
        
        try:
            self.supabase.table("background_jobs")\
                .update(update_data)\
                .eq("id", job_id)\
                .execute()
            return True
        except Exception as e:
            logger.error(f"Error updating job {job_id} status: {e}")
            return False
    
    def update_progress(
        self,
        job_id: str,
        percent: float,
        stage: str,
        detail: Optional[str] = None,
        counters: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update job progress and heartbeat."""
        progress = {
            "percent": min(100, max(0, percent)),
            "stage": stage,
            "detail": detail,
            "counters": counters,
            "last_heartbeat_at": datetime.utcnow().isoformat()
        }
        
        try:
            self.supabase.table("background_jobs")\
                .update({
                    "progress": progress,
                    "last_heartbeat_at": datetime.utcnow().isoformat()
                })\
                .eq("id", job_id)\
                .execute()
            return True
        except Exception as e:
            logger.error(f"Error updating progress for job {job_id}: {e}")
            return False
    
    def heartbeat(self, job_id: str) -> bool:
        """Update job heartbeat timestamp."""
        try:
            now = datetime.utcnow().isoformat()
            self.supabase.table("background_jobs")\
                .update({
                    "last_heartbeat_at": now,
                    "progress": self.supabase.rpc(
                        "jsonb_set_lax",
                        {
                            "target": "progress",
                            "path": ["last_heartbeat_at"],
                            "new_value": f'"{now}"'
                        }
                    )
                })\
                .eq("id", job_id)\
                .execute()
            return True
        except Exception:
            # Fallback: just update heartbeat timestamp
            try:
                self.supabase.table("background_jobs")\
                    .update({"last_heartbeat_at": datetime.utcnow().isoformat()})\
                    .eq("id", job_id)\
                    .execute()
                return True
            except Exception as e:
                logger.error(f"Error updating heartbeat for job {job_id}: {e}")
                return False
    
    def mark_completed(
        self,
        job_id: str,
        result: Dict[str, Any],
        warnings: List[str] = None
    ) -> bool:
        """Mark job as completed with result."""
        result_data = {
            "success": True,
            "outputs": result,
            "warnings": warnings or [],
            "completed_at": datetime.utcnow().isoformat()
        }
        
        progress = {
            "percent": 100,
            "stage": "completed",
            "detail": None,
            "counters": None,
            "last_heartbeat_at": datetime.utcnow().isoformat()
        }
        
        success = self.update_job_status(
            job_id, JobStatus.COMPLETED, 
            progress=progress, 
            result=result_data
        )
        
        if success:
            self._log_event(
                job_id,
                JobEventType.STAGE_CHANGE,
                "Job completed successfully",
                {"warnings_count": len(warnings or [])}
            )
        
        return success
    
    def mark_failed(
        self,
        job_id: str,
        error_type: str,
        message: str,
        hint: Optional[str] = None,
        failing_stage: Optional[str] = None,
        stack_trace: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Mark job as failed with error details."""
        error_data = {
            "error_type": error_type,
            "message": message,
            "hint": hint,
            "failing_stage": failing_stage,
            "details": details
        }
        
        # Don't store stack traces in the DB, only in logs
        if stack_trace:
            logger.error(f"Job {job_id} failed with stack trace:\n{stack_trace}")
        
        progress = {
            "percent": None,  # Keep last progress percent
            "stage": "failed",
            "detail": message[:200],
            "counters": None,
            "last_heartbeat_at": datetime.utcnow().isoformat()
        }
        
        success = self.update_job_status(
            job_id, JobStatus.FAILED,
            progress=progress,
            error=error_data
        )
        
        if success:
            self._log_event(
                job_id,
                JobEventType.ERROR,
                f"Job failed: {message}",
                {"error_type": error_type, "failing_stage": failing_stage}
            )
        
        return success
    
    def cancel_job(self, job_id: str, user_id: str) -> Tuple[bool, str]:
        """
        Cancel a job. Returns (success, message).
        """
        job = self.get_job(job_id)
        if not job:
            return False, "Job not found"
        
        status = job.get("status")
        
        if status in ("completed", "failed", "cancelled"):
            return False, f"Cannot cancel job with status '{status}'"
        
        if status == "running":
            # Request cancellation - runner will check this
            self.update_job_status(job_id, JobStatus.CANCELLATION_REQUESTED)
            self._log_event(
                job_id,
                JobEventType.LOG,
                f"Cancellation requested by user",
                {"user_id": user_id}
            )
            return True, "Cancellation requested - job will stop at next checkpoint"
        
        # Queued jobs can be cancelled immediately
        self.update_job_status(job_id, JobStatus.CANCELLED)
        self._log_event(
            job_id,
            JobEventType.STAGE_CHANGE,
            f"Job cancelled by user",
            {"user_id": user_id}
        )
        return True, "Job cancelled"
    
    def retry_job(
        self,
        job_id: str,
        user_id: str,
        force: bool = False
    ) -> Tuple[Optional[Dict[str, Any]], str]:
        """
        Retry a failed or cancelled job.
        Returns (new_job, message).
        """
        job = self.get_job(job_id)
        if not job:
            return None, "Job not found"
        
        status = job.get("status")
        
        if status not in ("failed", "cancelled"):
            return None, f"Cannot retry job with status '{status}'"
        
        # Check retry count
        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", 3)
        
        if retry_count >= max_retries and not force:
            return None, f"Job has exceeded max retries ({max_retries})"
        
        # Create new job with retry reference
        new_job, is_existing = self.create_job(
            organization_id=job["organization_id"],
            user_id=user_id,
            job_type=JobType(job["job_type"]),
            client_company_id=job.get("client_company_id"),
            tax_year=job.get("tax_year"),
            params=job.get("params", {}),
            priority=job.get("priority", 5),
            parent_job_id=job.get("parent_job_id"),
            custom_idempotency_key=f"{job['idempotency_key']}:retry:{retry_count + 1}"
        )
        
        if not is_existing:
            # Update retry count and reference
            self.supabase.table("background_jobs")\
                .update({
                    "retry_of_job_id": job_id,
                    "retry_count": retry_count + 1
                })\
                .eq("id", new_job["id"])\
                .execute()
            
            self._log_event(
                new_job["id"],
                JobEventType.RETRY_SCHEDULED,
                f"Retry of job {job_id}",
                {"original_job_id": job_id, "retry_number": retry_count + 1}
            )
        
        return new_job, "Retry job created" if not is_existing else "Existing retry job found"
    
    def list_jobs(
        self,
        organization_id: str,
        client_company_id: Optional[str] = None,
        tax_year: Optional[int] = None,
        status: Optional[List[JobStatus]] = None,
        job_type: Optional[JobType] = None,
        created_by_user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List jobs with filtering.
        Returns (jobs, total_count).
        """
        try:
            query = self.supabase.table("background_jobs")\
                .select("*", count="exact")\
                .eq("organization_id", organization_id)
            
            if client_company_id:
                query = query.eq("client_company_id", client_company_id)
            
            if tax_year:
                query = query.eq("tax_year", tax_year)
            
            if status:
                query = query.in_("status", [s.value for s in status])
            
            if job_type:
                query = query.eq("job_type", job_type.value)
            
            if created_by_user_id:
                query = query.eq("created_by_user_id", created_by_user_id)
            
            result = query\
                .order("created_at", desc=True)\
                .range(offset, offset + limit - 1)\
                .execute()
            
            total = result.count if hasattr(result, 'count') else len(result.data)
            return result.data or [], total
            
        except Exception as e:
            logger.error(f"Error listing jobs: {e}")
            return [], 0
    
    def get_job_events(
        self,
        job_id: str,
        limit: int = 50,
        event_types: Optional[List[JobEventType]] = None
    ) -> List[Dict[str, Any]]:
        """Get events for a job."""
        try:
            query = self.supabase.table("job_events")\
                .select("*")\
                .eq("job_id", job_id)
            
            if event_types:
                query = query.in_("event_type", [e.value for e in event_types])
            
            result = query\
                .order("created_at", desc=True)\
                .limit(limit)\
                .execute()
            
            return result.data or []
            
        except Exception as e:
            logger.error(f"Error getting events for job {job_id}: {e}")
            return []
    
    def check_cancellation_requested(self, job_id: str) -> bool:
        """Check if cancellation has been requested for a job."""
        try:
            result = self.supabase.table("background_jobs")\
                .select("status")\
                .eq("id", job_id)\
                .single()\
                .execute()
            
            return result.data and result.data.get("status") == "cancellation_requested"
        except Exception:
            return False
    
    def acquire_lock(
        self,
        lock_key: str,
        job_id: str,
        expires_in_seconds: int = 3600,
        reason: Optional[str] = None
    ) -> bool:
        """Acquire a lock for a job."""
        try:
            result = self.supabase.rpc(
                "acquire_job_lock",
                {
                    "p_lock_key": lock_key,
                    "p_job_id": job_id,
                    "p_expires_in_seconds": expires_in_seconds,
                    "p_lock_reason": reason
                }
            ).execute()
            return result.data if result.data else False
        except Exception as e:
            logger.error(f"Error acquiring lock {lock_key}: {e}")
            return False
    
    def release_lock(self, lock_key: str, job_id: str) -> bool:
        """Release a lock held by a job."""
        try:
            result = self.supabase.rpc(
                "release_job_lock",
                {
                    "p_lock_key": lock_key,
                    "p_job_id": job_id
                }
            ).execute()
            return result.data if result.data else False
        except Exception as e:
            logger.error(f"Error releasing lock {lock_key}: {e}")
            return False
    
    def _log_event(
        self,
        job_id: str,
        event_type: JobEventType,
        message: str,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Log an event for a job."""
        try:
            self.supabase.table("job_events").insert({
                "job_id": job_id,
                "event_type": event_type.value,
                "message": message,
                "data": data
            }).execute()
            return True
        except Exception as e:
            logger.error(f"Error logging event for job {job_id}: {e}")
            return False


# ============================================================================
# Module-level convenience functions
# ============================================================================

_manager: Optional[JobManager] = None


def _get_manager() -> JobManager:
    global _manager
    if _manager is None:
        _manager = JobManager()
    return _manager


def create_job(
    organization_id: str,
    user_id: str,
    job_type: JobType,
    **kwargs
) -> Tuple[Dict[str, Any], bool]:
    """Create a new job. See JobManager.create_job for full signature."""
    return _get_manager().create_job(organization_id, user_id, job_type, **kwargs)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Get job by ID."""
    return _get_manager().get_job(job_id)


def get_job_status(job_id: str) -> Optional[JobStatusResponse]:
    """Get job status in response format."""
    job = _get_manager().get_job(job_id)
    if not job:
        return None
    
    status = JobStatus(job["status"])
    can_cancel = status in (JobStatus.QUEUED, JobStatus.RUNNING)
    can_retry = status in (JobStatus.FAILED, JobStatus.CANCELLED)
    
    return JobStatusResponse(
        job_id=job["id"],
        status=status,
        progress=JobProgress(**job.get("progress", {})),
        result=job.get("result"),
        error=job.get("error"),
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
        created_at=job["created_at"],
        can_cancel=can_cancel,
        can_retry=can_retry
    )


def list_jobs(organization_id: str, **kwargs) -> JobListResponse:
    """List jobs with filtering."""
    jobs, total = _get_manager().list_jobs(organization_id, **kwargs)
    limit = kwargs.get("limit", 50)
    offset = kwargs.get("offset", 0)
    
    return JobListResponse(
        jobs=[
            JobListItem(
                job_id=j["id"],
                job_type=JobType(j["job_type"]),
                status=JobStatus(j["status"]),
                progress=JobProgress(**j.get("progress", {})),
                client_company_id=j.get("client_company_id"),
                tax_year=j.get("tax_year"),
                created_at=j["created_at"],
                started_at=j.get("started_at"),
                completed_at=j.get("completed_at")
            )
            for j in jobs
        ],
        total_count=total,
        has_more=offset + len(jobs) < total
    )


def cancel_job(job_id: str, user_id: str) -> Tuple[bool, str]:
    """Cancel a job."""
    return _get_manager().cancel_job(job_id, user_id)


def retry_job(job_id: str, user_id: str, force: bool = False) -> Tuple[Optional[Dict[str, Any]], str]:
    """Retry a failed job."""
    return _get_manager().retry_job(job_id, user_id, force)
