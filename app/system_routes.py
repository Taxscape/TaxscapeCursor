"""
System Routes - Observability & Metrics

Provides system health checks, metrics, and diagnostic endpoints.
Protected endpoints for org admins.
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.supabase_client import get_supabase
from app.auth_permissions import (
    AuthContext, get_auth_context, get_optional_auth_context,
    Capability
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["system"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    environment: str
    services: Dict[str, str]


class JobStatusSummary(BaseModel):
    job_type: str
    pending: int
    running: int
    completed_24h: int
    failed_24h: int
    avg_duration_ms: Optional[float]


class ErrorSummary(BaseModel):
    category: str
    count: int
    last_occurrence: Optional[str]


class AIStatusSummary(BaseModel):
    total_calls_24h: int
    success_rate: float
    avg_duration_ms: float
    total_tokens_24h: int
    estimated_cost_24h: float
    last_successful_call: Optional[str]


class MetricsResponse(BaseModel):
    timestamp: str
    organization_id: str
    job_status: List[JobStatusSummary]
    errors_24h: List[ErrorSummary]
    ai_status: AIStatusSummary
    database_health: str
    storage_health: str


class DebugInfo(BaseModel):
    user_id: str
    org_id: Optional[str]
    role: Optional[str]
    capabilities: Dict[str, bool]
    active_client_id: Optional[str]
    last_recompute: Optional[str]
    last_ai_eval: Optional[str]
    snapshot_hash: Optional[str]
    realtime_connected: bool


# =============================================================================
# HEALTH CHECK (PUBLIC)
# =============================================================================

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Basic health check endpoint.
    Public - no auth required.
    """
    services = {}
    
    # Check Supabase connection
    try:
        supabase = get_supabase()
        if supabase:
            result = supabase.table("organizations").select("id").limit(1).execute()
            services["database"] = "healthy"
        else:
            services["database"] = "unavailable"
    except Exception as e:
        services["database"] = f"error: {str(e)[:50]}"
    
    # Check environment
    environment = os.getenv("ENVIRONMENT", "development")
    
    # Overall status
    status = "healthy" if all(v == "healthy" for v in services.values()) else "degraded"
    
    return HealthResponse(
        status=status,
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        environment=environment,
        services=services
    )


# =============================================================================
# METRICS (ADMIN ONLY)
# =============================================================================

@router.get("/metrics", response_model=MetricsResponse)
async def get_system_metrics(
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get system metrics and job status.
    Requires can_manage_org capability.
    """
    auth.require_capability(Capability.MANAGE_ORG, "Admin access required for metrics")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    org_id = auth.org_id
    now = datetime.utcnow()
    yesterday = (now - timedelta(hours=24)).isoformat()
    
    # Get job status summary
    job_status = []
    try:
        for job_type in ["import", "recompute", "ai_eval", "study_gen"]:
            # Pending
            pending = supabase.table("system_job_status")\
                .select("id", count="exact")\
                .eq("organization_id", org_id)\
                .eq("job_type", job_type)\
                .eq("status", "pending")\
                .execute()
            
            # Running
            running = supabase.table("system_job_status")\
                .select("id", count="exact")\
                .eq("organization_id", org_id)\
                .eq("job_type", job_type)\
                .eq("status", "running")\
                .execute()
            
            # Completed in 24h
            completed = supabase.table("system_job_status")\
                .select("id", count="exact")\
                .eq("organization_id", org_id)\
                .eq("job_type", job_type)\
                .eq("status", "completed")\
                .gte("completed_at", yesterday)\
                .execute()
            
            # Failed in 24h
            failed = supabase.table("system_job_status")\
                .select("id", count="exact")\
                .eq("organization_id", org_id)\
                .eq("job_type", job_type)\
                .eq("status", "failed")\
                .gte("completed_at", yesterday)\
                .execute()
            
            job_status.append(JobStatusSummary(
                job_type=job_type,
                pending=pending.count or 0,
                running=running.count or 0,
                completed_24h=completed.count or 0,
                failed_24h=failed.count or 0,
                avg_duration_ms=None  # TODO: Calculate from completed jobs
            ))
    except Exception as e:
        logger.warning(f"Error fetching job status: {e}")
    
    # Get error summary
    errors_24h = []
    try:
        error_logs = supabase.table("audit_logs")\
            .select("action, created_at")\
            .eq("organization_id", org_id)\
            .ilike("action", "%error%")\
            .gte("created_at", yesterday)\
            .execute()
        
        # Group by action
        error_counts: Dict[str, Dict] = {}
        for log in (error_logs.data or []):
            action = log.get("action", "unknown")
            if action not in error_counts:
                error_counts[action] = {"count": 0, "last": None}
            error_counts[action]["count"] += 1
            if not error_counts[action]["last"] or log["created_at"] > error_counts[action]["last"]:
                error_counts[action]["last"] = log["created_at"]
        
        for category, data in error_counts.items():
            errors_24h.append(ErrorSummary(
                category=category,
                count=data["count"],
                last_occurrence=data["last"]
            ))
    except Exception as e:
        logger.warning(f"Error fetching error logs: {e}")
    
    # Get AI status
    ai_status = AIStatusSummary(
        total_calls_24h=0,
        success_rate=0.0,
        avg_duration_ms=0.0,
        total_tokens_24h=0,
        estimated_cost_24h=0.0,
        last_successful_call=None
    )
    
    try:
        ai_logs = supabase.table("ai_telemetry")\
            .select("*")\
            .eq("organization_id", org_id)\
            .gte("created_at", yesterday)\
            .execute()
        
        if ai_logs.data:
            total = len(ai_logs.data)
            successes = len([a for a in ai_logs.data if a.get("success")])
            durations = [a.get("duration_ms", 0) for a in ai_logs.data if a.get("duration_ms")]
            tokens = sum(a.get("total_tokens", 0) or 0 for a in ai_logs.data)
            costs = sum(a.get("estimated_cost", 0) or 0 for a in ai_logs.data)
            
            last_success = None
            for a in sorted(ai_logs.data, key=lambda x: x.get("created_at", ""), reverse=True):
                if a.get("success"):
                    last_success = a.get("created_at")
                    break
            
            ai_status = AIStatusSummary(
                total_calls_24h=total,
                success_rate=(successes / total * 100) if total > 0 else 0,
                avg_duration_ms=(sum(durations) / len(durations)) if durations else 0,
                total_tokens_24h=tokens,
                estimated_cost_24h=costs,
                last_successful_call=last_success
            )
    except Exception as e:
        logger.warning(f"Error fetching AI telemetry: {e}")
    
    return MetricsResponse(
        timestamp=now.isoformat(),
        organization_id=org_id or "",
        job_status=job_status,
        errors_24h=errors_24h,
        ai_status=ai_status,
        database_health="healthy",
        storage_health="healthy"
    )


# =============================================================================
# DEBUG INFO (FOR DEBUG PANEL)
# =============================================================================

@router.get("/debug", response_model=DebugInfo)
async def get_debug_info(
    client_company_id: Optional[str] = Query(None),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get debug information for the frontend debug panel.
    Available to all authenticated users.
    """
    supabase = get_supabase()
    
    last_recompute = None
    last_ai_eval = None
    snapshot_hash = None
    
    if supabase and client_company_id:
        try:
            # Get last recompute
            qre = supabase.table("qre_summaries")\
                .select("created_at")\
                .eq("client_company_id", client_company_id)\
                .eq("tax_year", tax_year)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            if qre.data:
                last_recompute = qre.data[0].get("created_at")
            
            # Get last AI eval
            eval_result = supabase.table("project_ai_evaluations")\
                .select("created_at, inputs_snapshot_hash")\
                .eq("client_company_id", client_company_id)\
                .eq("tax_year", tax_year)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            if eval_result.data:
                last_ai_eval = eval_result.data[0].get("created_at")
                snapshot_hash = eval_result.data[0].get("inputs_snapshot_hash")
                
        except Exception as e:
            logger.warning(f"Error fetching debug info: {e}")
    
    # Get capabilities
    capabilities = {}
    for cap in Capability:
        capabilities[cap.value] = auth.has_capability(cap)
    
    return DebugInfo(
        user_id=auth.user_id,
        org_id=auth.org_id,
        role=auth.role,
        capabilities=capabilities,
        active_client_id=client_company_id,
        last_recompute=last_recompute,
        last_ai_eval=last_ai_eval,
        snapshot_hash=snapshot_hash,
        realtime_connected=True  # Frontend will verify this
    )


# =============================================================================
# AUDIT LOGS (ADMIN ONLY)
# =============================================================================

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get audit logs for the organization.
    Requires can_manage_org capability.
    """
    auth.require_capability(Capability.MANAGE_ORG, "Admin access required for audit logs")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    query = supabase.table("audit_logs")\
        .select("*")\
        .eq("organization_id", auth.org_id)\
        .order("created_at", desc=True)\
        .range(offset, offset + limit - 1)
    
    if resource_type:
        query = query.eq("resource_type", resource_type)
    if action:
        query = query.ilike("action", f"%{action}%")
    if user_id:
        query = query.eq("user_id", user_id)
    
    result = query.execute()
    
    return {
        "logs": result.data or [],
        "limit": limit,
        "offset": offset,
        "has_more": len(result.data or []) == limit
    }


# =============================================================================
# USER CAPABILITIES (FOR FRONTEND)
# =============================================================================

@router.get("/capabilities")
async def get_user_capabilities(
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get current user's capabilities.
    Used by frontend for permission-based UI rendering.
    """
    capabilities = {}
    for cap in Capability:
        capabilities[cap.value] = auth.has_capability(cap)
    
    return {
        "user_id": auth.user_id,
        "org_id": auth.org_id,
        "role": auth.role,
        "display_role": _get_display_role(auth.role),
        "capabilities": capabilities
    }


def _get_display_role(role: str) -> str:
    """Get user-friendly role name"""
    display_names = {
        "executive": "Executive",
        "admin": "Administrator",
        "cpa": "CPA",
        "engineer": "Client Contributor",
    }
    return display_names.get(role, role or "Unknown")

