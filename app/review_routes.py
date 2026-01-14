"""
Review Routes - Post-ingestion Review Lifecycle API
Implements endpoints for:
- Running automated review
- Listing/filtering findings
- Resolving findings
- Escalating to senior
- Copilot review mode
"""

import logging
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel, Field

from .supabase_client import get_supabase
from .review_rules_engine import ReviewRulesEngine, ALL_RULES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["review"])

# ============================================================================
# Auth Dependency
# ============================================================================

def verify_supabase_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return user data."""
    supabase = get_supabase()
    try:
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            user = user_response.user
            return {"id": user.id, "email": user.email}
        return None
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        return None


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Supabase JWT."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    user_data = verify_supabase_token(parts[1])
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user_data


def get_user_profile(user_id: str) -> Optional[dict]:
    """Get user profile with organization info."""
    supabase = get_supabase()
    try:
        result = supabase.table("profiles").select("*, organization_id").eq("id", user_id).single().execute()
        return result.data
    except:
        return None


def check_cpa_or_executive(user: dict) -> bool:
    """Check if user is CPA or Executive role."""
    profile = get_user_profile(user["id"])
    if not profile:
        return False
    role = profile.get("role", "").lower()
    return role in ["cpa", "executive", "admin"]


def write_audit_log(
    org_id: str,
    user_id: str,
    action: str,
    item_type: str,
    item_id: str = None,
    details: dict = None
):
    """Write to audit_logs table."""
    supabase = get_supabase()
    try:
        supabase.table("audit_logs").insert({
            "organization_id": org_id,
            "user_id": user_id,
            "action": action,
            "item_type": item_type,
            "item_id": item_id,
            "details": details or {},
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


# ============================================================================
# Request/Response Models
# ============================================================================

class RunReviewRequest(BaseModel):
    client_company_id: str
    tax_year: int
    intake_session_id: Optional[str] = None


class RunReviewResponse(BaseModel):
    run_id: str
    rules_executed: int
    findings_created: int
    findings_updated: int
    findings_by_severity: Dict[str, int]
    findings_by_domain: Dict[str, int]
    errors: List[str] = []


class ResolveRequest(BaseModel):
    resolution_type: str  # verified_no_change, field_updated, client_evidence_requested, task_created, escalated_to_senior, dismissed_with_reason
    completion_method: str = "manual_user_action"  # manual_user_action, ai_validated, senior_override
    resolution_note: Optional[str] = None
    field_changes: Optional[Dict] = None
    create_task_payload: Optional[Dict] = None


class DismissRequest(BaseModel):
    reason_code: str
    reason_note: str


class EscalateRequest(BaseModel):
    note: Optional[str] = None
    assign_to_user_id: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/run", response_model=RunReviewResponse)
async def run_review(
    request: RunReviewRequest,
    user: dict = Depends(get_current_user)
):
    """
    Run automated review rules for a client/year.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify client access
    try:
        client = supabase.table("client_companies")\
            .select("id, name")\
            .eq("id", request.client_company_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        if not client.data:
            raise HTTPException(status_code=404, detail="Client not found")
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Client not found: {e}")
    
    # Create review run record
    run_id = str(uuid4())
    supabase.table("review_runs").insert({
        "id": run_id,
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "tax_year": request.tax_year,
        "intake_session_id": request.intake_session_id,
        "run_by_user_id": user["id"],
        "status": "running"
    }).execute()
    
    # Run rules engine
    engine = ReviewRulesEngine(
        supabase=supabase,
        org_id=org_id,
        client_id=request.client_company_id,
        tax_year=request.tax_year
    )
    
    results = engine.run_all_rules(request.intake_session_id)
    
    # Update run record
    supabase.table("review_runs").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
        "rules_executed": results["rules_executed"],
        "findings_created": results["findings_created"],
        "findings_updated": results["findings_updated"],
        "findings_by_severity": results["findings_by_severity"],
        "findings_by_domain": results["findings_by_domain"],
        "error_message": "; ".join(results["errors"]) if results["errors"] else None
    }).eq("id", run_id).execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="review_run_completed",
        item_type="review_run",
        item_id=run_id,
        details={
            "client_company_id": request.client_company_id,
            "tax_year": request.tax_year,
            "findings_created": results["findings_created"],
            "findings_by_severity": results["findings_by_severity"]
        }
    )
    
    return RunReviewResponse(
        run_id=run_id,
        rules_executed=results["rules_executed"],
        findings_created=results["findings_created"],
        findings_updated=results["findings_updated"],
        findings_by_severity=results["findings_by_severity"],
        findings_by_domain=results["findings_by_domain"],
        errors=results["errors"]
    )


@router.get("/findings")
async def list_findings(
    client_id: str = Query(...),
    tax_year: int = Query(...),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
    user: dict = Depends(get_current_user)
):
    """
    List findings with filters.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Build query
    query = supabase.table("review_findings")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("organization_id", org_id)
    
    if status:
        query = query.eq("status", status)
    if severity:
        query = query.eq("severity", severity)
    if domain:
        query = query.eq("domain", domain)
    
    query = query.order("severity", desc=True)\
        .order("created_at", desc=True)\
        .range(offset, offset + limit - 1)
    
    result = query.execute()
    findings = result.data or []
    
    # Resolve authority references
    authority_ids = set()
    for f in findings:
        authority_ids.update(f.get("authority_refs") or [])
    
    authority_map = {}
    if authority_ids:
        auth_result = supabase.table("authority_library")\
            .select("id, citation_label, citation_key, summary, url")\
            .in_("id", list(authority_ids))\
            .execute()
        
        for auth in (auth_result.data or []):
            authority_map[auth["id"]] = auth
    
    # Enhance findings with authority details
    for f in findings:
        f["authority_details"] = [
            authority_map.get(aid) for aid in (f.get("authority_refs") or [])
            if aid in authority_map
        ]
    
    # Get counts
    count_result = supabase.table("review_findings")\
        .select("id", count="exact")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("organization_id", org_id)\
        .execute()
    
    total = count_result.count or len(findings)
    
    # Summary stats
    summary_query = supabase.table("review_findings")\
        .select("severity, status")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("organization_id", org_id)\
        .execute()
    
    summary = {
        "total": total,
        "by_severity": {"low": 0, "medium": 0, "high": 0},
        "by_status": {"open": 0, "in_review": 0, "resolved_verified": 0, "resolved_fixed": 0, "resolved_escalated": 0, "dismissed": 0},
        "qre_at_risk": 0
    }
    
    for row in (summary_query.data or []):
        sev = row.get("severity")
        stat = row.get("status")
        if sev in summary["by_severity"]:
            summary["by_severity"][sev] += 1
        if stat in summary["by_status"]:
            summary["by_status"][stat] += 1
    
    # Calculate QRE at risk from open findings
    for f in findings:
        if f.get("status") == "open":
            impact = f.get("estimated_impact") or {}
            summary["qre_at_risk"] += float(impact.get("qre_at_risk") or 0)
    
    return {
        "findings": findings,
        "total": total,
        "summary": summary
    }


@router.get("/findings/{finding_id}")
async def get_finding_detail(
    finding_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get detailed finding with entity snapshot and resolution history.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get finding
    try:
        result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Get authority details
    authority_details = []
    if finding.get("authority_refs"):
        auth_result = supabase.table("authority_library")\
            .select("*")\
            .in_("id", finding["authority_refs"])\
            .execute()
        authority_details = auth_result.data or []
    
    finding["authority_details"] = authority_details
    
    # Get entity snapshot
    entity_snapshot = None
    if finding.get("entity_id") and finding.get("entity_type"):
        entity_table_map = {
            "employee": "employees",
            "project": "projects",
            "contractor": "contractors",
            "vendor": "contractors",
            "expense": "expenses",
            "supply": "supplies",
            "time_log": "time_logs"
        }
        
        table = entity_table_map.get(finding["entity_type"])
        if table:
            try:
                entity_result = supabase.table(table)\
                    .select("*")\
                    .eq("id", finding["entity_id"])\
                    .single()\
                    .execute()
                entity_snapshot = entity_result.data
            except:
                pass
    
    # Get resolution history
    resolutions = supabase.table("finding_resolutions")\
        .select("*, profiles(full_name, email)")\
        .eq("review_finding_id", finding_id)\
        .order("created_at", desc=True)\
        .execute()
    
    return {
        "finding": finding,
        "entity_snapshot": entity_snapshot,
        "resolutions": resolutions.data or []
    }


@router.post("/findings/{finding_id}/resolve")
async def resolve_finding(
    finding_id: str,
    request: ResolveRequest,
    user: dict = Depends(get_current_user)
):
    """
    Resolve a finding.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get finding
    try:
        result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Validate transition
    current_status = finding["status"]
    if current_status not in ["open", "in_review"]:
        raise HTTPException(status_code=400, detail=f"Cannot resolve finding in status: {current_status}")
    
    # Determine new status
    status_map = {
        "verified_no_change": "resolved_verified",
        "field_updated": "resolved_fixed",
        "client_evidence_requested": "in_review",
        "task_created": "in_review",
        "escalated_to_senior": "resolved_escalated",
        "dismissed_with_reason": "dismissed"
    }
    
    new_status = status_map.get(request.resolution_type, "resolved_verified")
    
    # Handle field changes
    changes = {}
    if request.field_changes and request.resolution_type == "field_updated":
        entity_table_map = {
            "employee": "employees",
            "project": "projects",
            "contractor": "contractors",
            "expense": "expenses",
            "supply": "supplies"
        }
        
        table = entity_table_map.get(finding["entity_type"])
        if table and finding.get("entity_id"):
            # Get current values
            current = supabase.table(table)\
                .select("*")\
                .eq("id", finding["entity_id"])\
                .single()\
                .execute()
            
            before = {}
            after = {}
            for field, new_value in request.field_changes.items():
                if current.data:
                    before[field] = current.data.get(field)
                after[field] = new_value
            
            changes = {"before": before, "after": after}
            
            # Apply changes
            supabase.table(table)\
                .update(request.field_changes)\
                .eq("id", finding["entity_id"])\
                .execute()
            
            # Audit log for canonical record update
            write_audit_log(
                org_id=org_id,
                user_id=user["id"],
                action="canonical_record_updated_from_review",
                item_type=finding["entity_type"],
                item_id=finding["entity_id"],
                details={
                    "finding_id": finding_id,
                    "before": before,
                    "after": after
                }
            )
    
    # Handle task creation
    if request.create_task_payload and request.resolution_type == "task_created":
        try:
            task_data = {
                "id": str(uuid4()),
                "organization_id": org_id,
                "client_company_id": finding["client_company_id"],
                "task_type": "review_request",
                "title": request.create_task_payload.get("title", f"Review: {finding['title']}"),
                "description": request.create_task_payload.get("description", finding["description"]),
                "status": "pending",
                "priority": "high" if finding["severity"] == "high" else "medium",
                "context": {
                    "finding_id": finding_id,
                    "rule_id": finding["rule_id"],
                    "entity_type": finding["entity_type"],
                    "entity_id": finding["entity_id"],
                    "authority_refs": finding["authority_refs"]
                },
                "created_by_user_id": user["id"],
                "created_at": datetime.utcnow().isoformat()
            }
            
            if request.create_task_payload.get("assign_to"):
                task_data["assigned_to_user_id"] = request.create_task_payload["assign_to"]
            
            supabase.table("tasks").insert(task_data).execute()
        except Exception as e:
            logger.error(f"Failed to create task: {e}")
    
    # Create resolution record
    resolution_id = str(uuid4())
    supabase.table("finding_resolutions").insert({
        "id": resolution_id,
        "review_finding_id": finding_id,
        "resolution_type": request.resolution_type,
        "completion_method": request.completion_method,
        "resolution_note": request.resolution_note,
        "changes": changes,
        "artifacts": [],
        "resolved_by_user_id": user["id"],
        "resolved_at": datetime.utcnow().isoformat()
    }).execute()
    
    # Update finding status
    supabase.table("review_findings")\
        .update({
            "status": new_status,
            "updated_at": datetime.utcnow().isoformat()
        })\
        .eq("id", finding_id)\
        .execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="review_finding_resolved",
        item_type="review_finding",
        item_id=finding_id,
        details={
            "resolution_type": request.resolution_type,
            "completion_method": request.completion_method,
            "new_status": new_status,
            "changes": changes,
            "authority_refs": finding.get("authority_refs")
        }
    )
    
    return {
        "finding_id": finding_id,
        "resolution_id": resolution_id,
        "new_status": new_status
    }


@router.post("/findings/{finding_id}/dismiss")
async def dismiss_finding(
    finding_id: str,
    request: DismissRequest,
    user: dict = Depends(get_current_user)
):
    """
    Dismiss a finding with reason.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get finding
    try:
        result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Create resolution record
    resolution_id = str(uuid4())
    supabase.table("finding_resolutions").insert({
        "id": resolution_id,
        "review_finding_id": finding_id,
        "resolution_type": "dismissed_with_reason",
        "completion_method": "manual_user_action",
        "resolution_note": f"[{request.reason_code}] {request.reason_note}",
        "changes": {},
        "artifacts": [],
        "resolved_by_user_id": user["id"],
        "resolved_at": datetime.utcnow().isoformat()
    }).execute()
    
    # Update finding status
    supabase.table("review_findings")\
        .update({
            "status": "dismissed",
            "updated_at": datetime.utcnow().isoformat()
        })\
        .eq("id", finding_id)\
        .execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="review_finding_dismissed",
        item_type="review_finding",
        item_id=finding_id,
        details={
            "reason_code": request.reason_code,
            "reason_note": request.reason_note
        }
    )
    
    return {"finding_id": finding_id, "status": "dismissed"}


@router.post("/findings/{finding_id}/escalate")
async def escalate_finding(
    finding_id: str,
    request: EscalateRequest,
    user: dict = Depends(get_current_user)
):
    """
    Escalate finding to senior for review.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get finding with full details
    try:
        result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Get entity snapshot
    entity_snapshot = None
    if finding.get("entity_id") and finding.get("entity_type"):
        entity_table_map = {
            "employee": "employees",
            "project": "projects",
            "contractor": "contractors",
            "expense": "expenses",
            "supply": "supplies"
        }
        table = entity_table_map.get(finding["entity_type"])
        if table:
            try:
                entity_result = supabase.table(table)\
                    .select("*")\
                    .eq("id", finding["entity_id"])\
                    .single()\
                    .execute()
                entity_snapshot = entity_result.data
            except:
                pass
    
    # Create escalation task
    task_id = str(uuid4())
    task_data = {
        "id": task_id,
        "organization_id": org_id,
        "client_company_id": finding["client_company_id"],
        "task_type": "review_escalation",
        "title": f"[Escalated] {finding['title']}",
        "description": f"**Escalated by:** {profile.get('full_name', user['email'])}\n\n**Reason:** {request.note or 'No note provided'}\n\n**Finding Description:**\n{finding['description']}",
        "status": "pending",
        "priority": "high",
        "context": {
            "finding_id": finding_id,
            "rule_id": finding["rule_id"],
            "entity_type": finding["entity_type"],
            "entity_id": finding["entity_id"],
            "entity_snapshot": entity_snapshot,
            "trigger_evidence": finding["trigger_evidence"],
            "authority_refs": finding["authority_refs"],
            "estimated_impact": finding["estimated_impact"]
        },
        "created_by_user_id": user["id"],
        "created_at": datetime.utcnow().isoformat()
    }
    
    if request.assign_to_user_id:
        task_data["assigned_to_user_id"] = request.assign_to_user_id
    
    supabase.table("tasks").insert(task_data).execute()
    
    # Create resolution record
    resolution_id = str(uuid4())
    supabase.table("finding_resolutions").insert({
        "id": resolution_id,
        "review_finding_id": finding_id,
        "resolution_type": "escalated_to_senior",
        "completion_method": "manual_user_action",
        "resolution_note": request.note,
        "changes": {},
        "artifacts": [{"task_id": task_id}],
        "resolved_by_user_id": user["id"],
        "resolved_at": datetime.utcnow().isoformat()
    }).execute()
    
    # Update finding status
    supabase.table("review_findings")\
        .update({
            "status": "resolved_escalated",
            "updated_at": datetime.utcnow().isoformat()
        })\
        .eq("id", finding_id)\
        .execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="review_finding_escalated",
        item_type="review_finding",
        item_id=finding_id,
        details={
            "task_id": task_id,
            "note": request.note,
            "assign_to": request.assign_to_user_id
        }
    )
    
    return {
        "finding_id": finding_id,
        "status": "resolved_escalated",
        "task_id": task_id
    }


# ============================================================================
# Authority Library Endpoints
# ============================================================================

@router.get("/authority")
async def list_authority_references(
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by"),
    user: dict = Depends(get_current_user)
):
    """
    List authority library entries.
    """
    supabase = get_supabase()
    
    query = supabase.table("authority_library")\
        .select("*")\
        .eq("is_active", True)\
        .order("citation_label")
    
    result = query.execute()
    authorities = result.data or []
    
    # Filter by tags if provided
    if tags:
        tag_list = [t.strip().lower() for t in tags.split(",")]
        authorities = [
            a for a in authorities
            if any(t in [tag.lower() for tag in (a.get("tags") or [])] for t in tag_list)
        ]
    
    return {"authorities": authorities}


@router.get("/authority/{citation_key}")
async def get_authority_by_key(
    citation_key: str,
    user: dict = Depends(get_current_user)
):
    """
    Get authority reference by citation key.
    """
    supabase = get_supabase()
    
    try:
        result = supabase.table("authority_library")\
            .select("*")\
            .eq("citation_key", citation_key)\
            .single()\
            .execute()
        
        return result.data
    except:
        raise HTTPException(status_code=404, detail="Authority reference not found")


# ============================================================================
# Copilot Review Mode
# ============================================================================

@router.post("/copilot/summarize")
async def copilot_review_summarize(
    client_id: str = Query(...),
    tax_year: int = Query(...),
    user: dict = Depends(get_current_user)
):
    """
    Get copilot summary of review findings.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get open findings sorted by severity and impact
    result = supabase.table("review_findings")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("organization_id", org_id)\
        .eq("status", "open")\
        .order("severity", desc=True)\
        .limit(10)\
        .execute()
    
    findings = result.data or []
    
    # Sort by estimated impact
    findings.sort(key=lambda f: float((f.get("estimated_impact") or {}).get("qre_at_risk") or 0), reverse=True)
    
    top_5 = findings[:5]
    
    # Build summary
    total_qre_at_risk = sum(float((f.get("estimated_impact") or {}).get("qre_at_risk") or 0) for f in findings)
    high_count = sum(1 for f in findings if f.get("severity") == "high")
    
    if not findings:
        summary_text = "🎉 Great news! No open review findings for this client and tax year. All items have been reviewed and resolved."
    else:
        summary_text = f"📋 **Review Summary for Tax Year {tax_year}**\n\n"
        summary_text += f"I found **{len(findings)} open items** that need your attention:\n"
        summary_text += f"- **{high_count} high severity** issues\n"
        summary_text += f"- **${total_qre_at_risk:,.0f}** estimated QRE at risk\n\n"
        summary_text += "**Top issues to review:**\n\n"
        
        for i, f in enumerate(top_5, 1):
            impact = f.get("estimated_impact") or {}
            qre = float(impact.get("qre_at_risk") or 0)
            summary_text += f"{i}. **{f['title']}** ({f['severity']})\n"
            summary_text += f"   {f['description'][:100]}...\n"
            if qre > 0:
                summary_text += f"   _QRE at risk: ${qre:,.0f}_\n"
            summary_text += "\n"
    
    # Build next actions
    next_actions = []
    if top_5:
        next_actions.append({
            "action_type": "review_decision",
            "label": f"Review top issue: {top_5[0]['title'][:40]}",
            "finding_id": top_5[0]["id"],
            "description": "Open the detail view to verify, fix, or escalate"
        })
    
    if high_count > 0:
        next_actions.append({
            "action_type": "filter_view",
            "label": f"View all {high_count} high severity items",
            "filter": {"severity": "high", "status": "open"}
        })
    
    if total_qre_at_risk > 100000:
        next_actions.append({
            "action_type": "escalate",
            "label": "Escalate high-impact items to senior",
            "description": "Consider escalating findings with significant QRE at risk"
        })
    
    return {
        "summary_text": summary_text,
        "highlighted_findings": [f["id"] for f in top_5],
        "next_best_actions": next_actions,
        "stats": {
            "total_open": len(findings),
            "high_severity": high_count,
            "qre_at_risk": total_qre_at_risk
        }
    }


@router.post("/copilot/explain")
async def copilot_explain_finding(
    finding_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get copilot explanation of a specific finding.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get finding
    try:
        result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Get authority details
    authority_text = ""
    if finding.get("authority_refs"):
        auth_result = supabase.table("authority_library")\
            .select("citation_label, summary, url")\
            .in_("id", finding["authority_refs"])\
            .execute()
        
        if auth_result.data:
            authority_text = "\n\n**Relevant IRS Authority:**\n"
            for auth in auth_result.data:
                authority_text += f"- **{auth['citation_label']}**: {auth['summary']}"
                if auth.get('url'):
                    authority_text += f" [Read more]({auth['url']})"
                authority_text += "\n"
    
    # Build explanation
    explanation = f"## {finding['title']}\n\n"
    explanation += f"**Why this was flagged:**\n{finding['description']}\n\n"
    
    evidence = finding.get("trigger_evidence") or {}
    if evidence:
        explanation += "**Specific values that triggered this:**\n"
        for key, value in evidence.items():
            if key not in ["threshold", "threshold_min", "threshold_max"]:
                explanation += f"- {key.replace('_', ' ').title()}: {value}\n"
        explanation += "\n"
    
    impact = finding.get("estimated_impact") or {}
    if impact.get("qre_at_risk"):
        explanation += f"**Estimated Impact:**\n"
        explanation += f"- QRE at risk: ${float(impact.get('qre_at_risk')):,.0f}\n"
        explanation += f"- Credit at risk: ${float(impact.get('credit_at_risk', 0)):,.0f}\n\n"
    
    explanation += authority_text
    
    # Recommended actions
    actions = finding.get("recommended_actions") or []
    if actions:
        explanation += "\n**What you can do:**\n"
        for action in actions:
            explanation += f"- **{action.get('label')}**: {action.get('description')}\n"
    
    # Check for confusion signals and suggest escalation
    next_actions = [
        {
            "action_type": "review_decision",
            "label": "Verify this is correct",
            "description": "Confirm no changes needed"
        }
    ]
    
    for action in actions[:2]:
        next_actions.append({
            "action_type": action.get("action_type"),
            "label": action.get("label"),
            "description": action.get("description"),
            "target_field": action.get("target_field")
        })
    
    next_actions.append({
        "action_type": "escalate",
        "label": "I'm not sure - escalate to senior",
        "description": "If you're uncertain, it's best to ask for senior review"
    })
    
    return {
        "finding_id": finding_id,
        "explanation": explanation,
        "next_best_actions": next_actions,
        "authority_refs": finding.get("authority_refs", [])
    }


# ============================================================================
# Statistics & Dashboard
# ============================================================================

@router.get("/stats")
async def get_review_stats(
    client_id: str = Query(...),
    tax_year: int = Query(...),
    user: dict = Depends(get_current_user)
):
    """
    Get review statistics for dashboard.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get all findings
    result = supabase.table("review_findings")\
        .select("severity, status, estimated_impact, domain")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("organization_id", org_id)\
        .execute()
    
    findings = result.data or []
    
    stats = {
        "total": len(findings),
        "open": sum(1 for f in findings if f.get("status") == "open"),
        "in_review": sum(1 for f in findings if f.get("status") == "in_review"),
        "resolved": sum(1 for f in findings if f.get("status", "").startswith("resolved")),
        "dismissed": sum(1 for f in findings if f.get("status") == "dismissed"),
        "by_severity": {
            "high": sum(1 for f in findings if f.get("severity") == "high" and f.get("status") == "open"),
            "medium": sum(1 for f in findings if f.get("severity") == "medium" and f.get("status") == "open"),
            "low": sum(1 for f in findings if f.get("severity") == "low" and f.get("status") == "open")
        },
        "by_domain": {},
        "qre_at_risk": sum(
            float((f.get("estimated_impact") or {}).get("qre_at_risk") or 0)
            for f in findings if f.get("status") == "open"
        ),
        "credit_at_risk": sum(
            float((f.get("estimated_impact") or {}).get("credit_at_risk") or 0)
            for f in findings if f.get("status") == "open"
        )
    }
    
    for f in findings:
        domain = f.get("domain", "unknown")
        if domain not in stats["by_domain"]:
            stats["by_domain"][domain] = {"total": 0, "open": 0}
        stats["by_domain"][domain]["total"] += 1
        if f.get("status") == "open":
            stats["by_domain"][domain]["open"] += 1
    
    # Calculate readiness score
    if stats["total"] > 0:
        resolved_count = stats["resolved"] + stats["dismissed"]
        stats["readiness_score"] = round((resolved_count / stats["total"]) * 100)
    else:
        stats["readiness_score"] = 100
    
    return stats
