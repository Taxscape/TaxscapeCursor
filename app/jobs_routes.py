"""
Background Jobs API Routes

Provides endpoints for:
- Starting new background jobs
- Checking job status
- Listing jobs
- Cancelling and retrying jobs
- Server-Sent Events (SSE) streaming for real-time progress
"""

import asyncio
import logging
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.jobs.job_types import (
    JobType, JobStatus, JobEventType, JobProgress,
    JobStartResponse, JobStatusResponse, JobListResponse, JobEventsResponse
)
from app.jobs.job_manager import JobManager
from app.jobs.runner import get_runner, run_job_background
from app.supabase_client import get_supabase, verify_supabase_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


# =============================================================================
# AUTH DEPENDENCY
# =============================================================================

async def get_current_user(authorization: str = Header(None)):
    """Extract and verify user from Supabase JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = parts[1]
    user_data = verify_supabase_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user_data


def get_user_context(user_id: str) -> Dict[str, Any]:
    """Get user's organization and role."""
    supabase = get_supabase()
    try:
        result = supabase.table("profiles").select("organization_id, role").eq("id", user_id).single().execute()
        return result.data or {}
    except Exception as e:
        logger.error(f"Error getting user context: {e}")
        return {}


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class StartJobRequest(BaseModel):
    """Request to start a new background job."""
    job_type: JobType
    client_company_id: Optional[str] = None
    tax_year: Optional[int] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)


class CancelJobResponse(BaseModel):
    """Response for cancel job request."""
    success: bool
    message: str
    job_id: str


class RetryJobResponse(BaseModel):
    """Response for retry job request."""
    success: bool
    message: str
    new_job_id: Optional[str] = None
    new_job: Optional[JobStartResponse] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/start", response_model=JobStartResponse)
async def start_job(
    request: StartJobRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start a new background job.
    
    Returns immediately with job ID. Job runs in background.
    If an identical job is already running/queued, returns existing job.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    manager = JobManager()
    
    try:
        job, is_existing = manager.create_job(
            organization_id=org_id,
            user_id=user["id"],
            job_type=request.job_type,
            client_company_id=request.client_company_id,
            tax_year=request.tax_year,
            params=request.params,
            priority=request.priority
        )
        
        job_id = job["id"]
        
        # If new job, start execution in background
        if not is_existing:
            background_tasks.add_task(execute_job_task, job_id)
            logger.info(f"Started background job {job_id} of type {request.job_type.value}")
        else:
            logger.info(f"Returning existing job {job_id} due to idempotency")
        
        return JobStartResponse(
            job_id=job_id,
            status=JobStatus(job["status"]),
            progress=JobProgress(**job.get("progress", {})),
            existing_job=is_existing
        )
        
    except Exception as e:
        logger.error(f"Error starting job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start job: {str(e)}")


async def execute_job_task(job_id: str):
    """Background task to execute a job."""
    try:
        runner = get_runner()
        await runner.execute_job(job_id)
    except Exception as e:
        logger.error(f"Error executing job {job_id}: {e}")


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    user: Dict = Depends(get_current_user)
):
    """
    Get the current status of a job.
    
    Returns progress, result, error, and action availability.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    manager = JobManager()
    job = manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Verify organization access
    if job.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
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


@router.get("/{job_id}/events", response_model=JobEventsResponse)
async def get_job_events(
    job_id: str,
    limit: int = Query(default=50, le=200),
    user: Dict = Depends(get_current_user)
):
    """
    Get events for a job (progress updates, logs, errors).
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    manager = JobManager()
    job = manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    events = manager.get_job_events(job_id, limit=limit)
    
    return JobEventsResponse(
        job_id=job_id,
        events=[
            {
                "id": e["id"],
                "event_type": JobEventType(e["event_type"]),
                "message": e["message"],
                "data": e.get("data"),
                "created_at": e["created_at"]
            }
            for e in events
        ],
        total_count=len(events)
    )


@router.get("/{job_id}/stream")
async def stream_job_events(
    job_id: str,
    user: Dict = Depends(get_current_user)
):
    """
    Stream job events using Server-Sent Events (SSE).
    
    Events are streamed in real-time as the job progresses.
    Connection closes when job completes or fails.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    manager = JobManager()
    job = manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    async def event_generator():
        """Generate SSE events."""
        last_event_id = None
        check_interval = 2  # seconds
        max_no_change_count = 150  # ~5 minutes
        no_change_count = 0
        
        try:
            while True:
                # Get current job state
                current_job = manager.get_job(job_id)
                if not current_job:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                    break
                
                status = current_job.get("status")
                progress = current_job.get("progress", {})
                
                # Send status update
                event_data = {
                    "type": "status",
                    "job_id": job_id,
                    "status": status,
                    "progress": progress,
                    "result": current_job.get("result"),
                    "error": current_job.get("error"),
                    "timestamp": datetime.utcnow().isoformat()
                }
                yield f"data: {json.dumps(event_data)}\n\n"
                
                # Check if job is finished
                if status in ("completed", "failed", "cancelled"):
                    yield f"data: {json.dumps({'type': 'complete', 'status': status})}\n\n"
                    break
                
                # Get new events since last check
                events = manager.get_job_events(job_id, limit=10)
                new_events = []
                for event in events:
                    if last_event_id is None or event["id"] != last_event_id:
                        new_events.append(event)
                    else:
                        break
                
                # Send new events
                for event in reversed(new_events):
                    event_data = {
                        "type": "event",
                        "event_id": event["id"],
                        "event_type": event["event_type"],
                        "message": event["message"],
                        "data": event.get("data"),
                        "timestamp": event["created_at"]
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                
                if new_events:
                    last_event_id = new_events[0]["id"]
                    no_change_count = 0
                else:
                    no_change_count += 1
                
                # Timeout if no changes for too long
                if no_change_count >= max_no_change_count:
                    yield f"data: {json.dumps({'type': 'timeout', 'message': 'No updates for 5 minutes'})}\n\n"
                    break
                
                await asyncio.sleep(check_interval)
                
        except asyncio.CancelledError:
            logger.info(f"SSE connection cancelled for job {job_id}")
            raise
        except Exception as e:
            logger.error(f"SSE error for job {job_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.get("/list", response_model=JobListResponse)
async def list_jobs(
    client_company_id: Optional[str] = None,
    tax_year: Optional[int] = None,
    status: Optional[str] = None,  # Comma-separated statuses
    job_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: Dict = Depends(get_current_user)
):
    """
    List jobs with optional filtering.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    manager = JobManager()
    
    # Parse status filter
    status_filter = None
    if status:
        try:
            status_filter = [JobStatus(s.strip()) for s in status.split(",")]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status value")
    
    # Parse job type filter
    type_filter = None
    if job_type:
        try:
            type_filter = JobType(job_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid job_type value")
    
    jobs, total = manager.list_jobs(
        organization_id=org_id,
        client_company_id=client_company_id,
        tax_year=tax_year,
        status=status_filter,
        job_type=type_filter,
        limit=limit,
        offset=offset
    )
    
    return JobListResponse(
        jobs=[
            {
                "job_id": j["id"],
                "job_type": JobType(j["job_type"]),
                "status": JobStatus(j["status"]),
                "progress": JobProgress(**j.get("progress", {})),
                "client_company_id": j.get("client_company_id"),
                "tax_year": j.get("tax_year"),
                "created_at": j["created_at"],
                "started_at": j.get("started_at"),
                "completed_at": j.get("completed_at")
            }
            for j in jobs
        ],
        total_count=total,
        has_more=offset + len(jobs) < total
    )


@router.post("/{job_id}/cancel", response_model=CancelJobResponse)
async def cancel_job(
    job_id: str,
    user: Dict = Depends(get_current_user)
):
    """
    Cancel a running or queued job.
    
    - Only the job creator or senior users can cancel
    - Running jobs will stop at next checkpoint
    - Queued jobs are cancelled immediately
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    user_role = user_context.get("role", "")
    
    manager = JobManager()
    job = manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check permissions - creator or senior roles can cancel
    is_creator = job.get("created_by_user_id") == user["id"]
    is_senior = user_role in ("admin", "executive", "cpa")
    
    if not is_creator and not is_senior:
        raise HTTPException(status_code=403, detail="Only job creator or senior users can cancel")
    
    success, message = manager.cancel_job(job_id, user["id"])
    
    return CancelJobResponse(
        success=success,
        message=message,
        job_id=job_id
    )


@router.post("/{job_id}/retry", response_model=RetryJobResponse)
async def retry_job(
    job_id: str,
    force: bool = Query(default=False),
    background_tasks: BackgroundTasks = None,
    user: Dict = Depends(get_current_user)
):
    """
    Retry a failed or cancelled job.
    
    Creates a new job with the same parameters.
    Use force=true to retry even if max retries exceeded.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    manager = JobManager()
    job = manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    new_job, message = manager.retry_job(job_id, user["id"], force=force)
    
    if not new_job:
        return RetryJobResponse(
            success=False,
            message=message,
            new_job_id=None
        )
    
    # Start the new job in background
    if background_tasks:
        background_tasks.add_task(execute_job_task, new_job["id"])
    
    return RetryJobResponse(
        success=True,
        message=message,
        new_job_id=new_job["id"],
        new_job=JobStartResponse(
            job_id=new_job["id"],
            status=JobStatus(new_job["status"]),
            progress=JobProgress(**new_job.get("progress", {})),
            existing_job=False
        )
    )


# =============================================================================
# CONVENIENCE ENDPOINTS FOR SPECIFIC JOB TYPES
# =============================================================================

class StartRDParseRequest(BaseModel):
    """Request to start R&D parse job."""
    session_id: str
    include_ai_eval: bool = True
    file_ids: Optional[List[str]] = None


@router.post("/rd-parse", response_model=JobStartResponse)
async def start_rd_parse_job(
    request: StartRDParseRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start an R&D analysis parsing job.
    
    Convenience endpoint that wraps /start with appropriate parameters.
    """
    return await start_job(
        StartJobRequest(
            job_type=JobType.RD_PARSE_SESSION,
            params={
                "session_id": request.session_id,
                "include_ai_eval": request.include_ai_eval,
                "file_ids": request.file_ids
            }
        ),
        background_tasks,
        user
    )


class StartAIEvalRequest(BaseModel):
    """Request to start AI evaluation job."""
    project_ids: Optional[List[str]] = None
    client_company_id: Optional[str] = None
    tax_year: int = 2024
    use_evidence: bool = True
    force: bool = False
    concurrency: int = Field(default=3, le=10)


@router.post("/ai-evaluate", response_model=JobStartResponse)
async def start_ai_eval_job(
    request: StartAIEvalRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start an AI evaluation job for one or more projects.
    
    If project_ids is empty but client_company_id is provided,
    evaluates all projects for that client.
    """
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    project_ids = request.project_ids or []
    
    # If no project_ids but client_company_id, get all projects
    if not project_ids and request.client_company_id:
        supabase = get_supabase()
        projects = supabase.table("projects")\
            .select("id")\
            .eq("client_company_id", request.client_company_id)\
            .execute().data or []
        project_ids = [p["id"] for p in projects]
    
    if not project_ids:
        raise HTTPException(
            status_code=400,
            detail="No projects to evaluate. Provide project_ids or client_company_id."
        )
    
    return await start_job(
        StartJobRequest(
            job_type=JobType.AI_EVALUATE_PROJECTS,
            client_company_id=request.client_company_id,
            tax_year=request.tax_year,
            params={
                "project_ids": project_ids,
                "tax_year": request.tax_year,
                "use_evidence": request.use_evidence,
                "force": request.force,
                "concurrency": request.concurrency
            }
        ),
        background_tasks,
        user
    )


class StartExcelReportRequest(BaseModel):
    """Request to start Excel report generation job."""
    client_company_id: str
    tax_year: int = 2024
    study_id: Optional[str] = None


@router.post("/generate-excel", response_model=JobStartResponse)
async def start_excel_report_job(
    request: StartExcelReportRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start Excel report generation job.
    """
    return await start_job(
        StartJobRequest(
            job_type=JobType.GENERATE_EXCEL_REPORT,
            client_company_id=request.client_company_id,
            tax_year=request.tax_year,
            params={
                "study_id": request.study_id
            }
        ),
        background_tasks,
        user
    )


class StartStudyArtifactsRequest(BaseModel):
    """Request to start study artifacts generation job."""
    study_id: str
    study_version: int
    artifact_types: Optional[List[str]] = None
    force_regenerate: bool = False


@router.post("/generate-study-artifacts", response_model=JobStartResponse)
async def start_study_artifacts_job(
    request: StartStudyArtifactsRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start study artifacts generation job (Excel, PDF, DOCX, ZIP).
    """
    return await start_job(
        StartJobRequest(
            job_type=JobType.GENERATE_STUDY_ARTIFACTS,
            params={
                "study_id": request.study_id,
                "study_version": request.study_version,
                "artifact_types": request.artifact_types,
                "force_regenerate": request.force_regenerate
            }
        ),
        background_tasks,
        user
    )


class StartDefensePackRequest(BaseModel):
    """Request to start defense pack generation job."""
    study_id: str
    include_evidence: bool = True
    include_audit_trail: bool = True


@router.post("/generate-defense-pack", response_model=JobStartResponse)
async def start_defense_pack_job(
    request: StartDefensePackRequest,
    background_tasks: BackgroundTasks,
    user: Dict = Depends(get_current_user)
):
    """
    Start defense pack ZIP generation job.
    """
    return await start_job(
        StartJobRequest(
            job_type=JobType.GENERATE_DEFENSE_PACK,
            params={
                "study_id": request.study_id,
                "include_evidence": request.include_evidence,
                "include_audit_trail": request.include_audit_trail
            }
        ),
        background_tasks,
        user
    )


# Export router
jobs_router = router
