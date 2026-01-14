"""
Escalation Routes - Senior CPA Escalation & Override Workflow
Implements:
- Escalation creation from findings/mappings
- Senior review queue
- Decision/override handling
- Notification system
- Complete audit logging
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel, Field

from .supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/escalations", tags=["escalations"])

# ============================================================================
# Enums
# ============================================================================

class EscalationSourceType(str, Enum):
    REVIEW_FINDING = "review_finding"
    INTAKE_MAPPING = "intake_mapping"
    MANUAL = "manual"

class EscalationStatus(str, Enum):
    QUEUED = "queued"
    ASSIGNED = "assigned"
    IN_REVIEW = "in_review"
    RETURNED_TO_JUNIOR = "returned_to_junior"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"

class DecisionType(str, Enum):
    APPROVE_JUNIOR_RESOLUTION = "approve_junior_resolution"
    OVERRIDE_FIELDS = "override_fields"
    REQUEST_MORE_EVIDENCE = "request_more_evidence"
    RETURN_GUIDANCE = "return_guidance"
    DISMISS = "dismiss"

class ReasonCode(str, Enum):
    MATERIALITY_THRESHOLD = "materiality_threshold"
    CLIENT_CONFIRMATION = "client_confirmation_received"
    REASONABLE_ESTIMATE = "reasonable_estimate_method"
    DOCUMENTATION_SUFFICIENT = "documentation_sufficient"
    DOCUMENTATION_INSUFFICIENT = "documentation_insufficient"
    CLASSIFICATION_CORRECTED = "classification_corrected"
    LEGAL_INTERPRETATION = "legal_interpretation"
    AUDIT_RISK = "audit_risk_mitigation"
    PROCESS_IMPROVEMENT = "process_improvement"
    OTHER = "other"

class RoleLevel(str, Enum):
    JUNIOR = "junior"
    SENIOR = "senior"
    DIRECTOR = "director"
    PARTNER = "partner"

# ============================================================================
# Auth & RBAC
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
    """Get user profile with role info."""
    supabase = get_supabase()
    try:
        result = supabase.table("profiles")\
            .select("*, organization_id")\
            .eq("id", user_id)\
            .single()\
            .execute()
        return result.data
    except:
        return None


def get_org_settings(org_id: str) -> dict:
    """Get organization escalation settings."""
    supabase = get_supabase()
    try:
        result = supabase.table("organizations")\
            .select("escalation_settings")\
            .eq("id", org_id)\
            .single()\
            .execute()
        return result.data.get("escalation_settings") or {
            "senior_required_credit_at_risk": 25000,
            "senior_required_qre_at_risk": 100000,
            "senior_required_severity": "high",
            "allow_junior_high_impact_finalize": False
        }
    except:
        return {
            "senior_required_credit_at_risk": 25000,
            "senior_required_qre_at_risk": 100000,
            "senior_required_severity": "high",
            "allow_junior_high_impact_finalize": False
        }


def is_senior_or_above(profile: dict) -> bool:
    """Check if user is senior CPA or above."""
    if not profile:
        return False
    role = profile.get("role", "").lower()
    if role == "executive":
        return True
    if role == "cpa":
        role_level = profile.get("role_level", "junior")
        return role_level in ["senior", "director", "partner"]
    return False


def can_resolve_escalation(profile: dict, escalation: dict, org_settings: dict) -> tuple[bool, str]:
    """
    Check if user can resolve an escalation.
    Returns (can_resolve, reason)
    """
    if not profile:
        return False, "User profile not found"
    
    role = profile.get("role", "").lower()
    role_level = profile.get("role_level", "junior")
    
    # Executives can always resolve
    if role == "executive":
        return True, "Executive role"
    
    # Non-CPA cannot resolve
    if role != "cpa":
        return False, "CPA role required"
    
    # Check role level
    severity = escalation.get("severity", "medium")
    impact = escalation.get("estimated_impact", {})
    qre_at_risk = float(impact.get("qre_at_risk", 0))
    credit_at_risk = float(impact.get("credit_at_risk", 0))
    
    # High impact thresholds
    senior_req_severity = org_settings.get("senior_required_severity", "high")
    senior_req_qre = float(org_settings.get("senior_required_qre_at_risk", 100000))
    senior_req_credit = float(org_settings.get("senior_required_credit_at_risk", 25000))
    
    requires_senior = (
        severity == senior_req_severity or
        qre_at_risk >= senior_req_qre or
        credit_at_risk >= senior_req_credit
    )
    
    if requires_senior and role_level == "junior":
        if not org_settings.get("allow_junior_high_impact_finalize", False):
            return False, "Senior or above required for high-impact escalations"
    
    # Senior+ can resolve
    if role_level in ["senior", "director", "partner"]:
        return True, f"Role level: {role_level}"
    
    # Junior can resolve low-impact
    if not requires_senior:
        return True, "Low-impact escalation"
    
    return False, "Insufficient permissions"


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


def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    message: str = None,
    payload: dict = None
):
    """Create a notification for a user."""
    supabase = get_supabase()
    try:
        supabase.table("notifications").insert({
            "user_id": user_id,
            "notification_type": notification_type,
            "title": title,
            "message": message,
            "payload": payload or {},
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")


def create_escalation_history(
    escalation_id: str,
    action: str,
    user_id: str,
    previous_status: str = None,
    new_status: str = None,
    previous_assigned: str = None,
    new_assigned: str = None,
    note: str = None
):
    """Record escalation state change."""
    supabase = get_supabase()
    try:
        supabase.table("escalation_history").insert({
            "escalation_request_id": escalation_id,
            "action": action,
            "previous_status": previous_status,
            "new_status": new_status,
            "previous_assigned_to": previous_assigned,
            "new_assigned_to": new_assigned,
            "note": note,
            "performed_by_user_id": user_id
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create escalation history: {e}")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateEscalationFromFindingRequest(BaseModel):
    finding_id: str
    summary: str = Field(..., min_length=10)
    proposed_action: Dict[str, Any]
    assigned_to_user_id: Optional[str] = None


class CreateEscalationFromMappingRequest(BaseModel):
    mapping_id: str
    summary: str = Field(..., min_length=10)
    proposed_action: Dict[str, Any]
    assigned_to_user_id: Optional[str] = None


class AssignEscalationRequest(BaseModel):
    assigned_to_user_id: str


class ResolveEscalationRequest(BaseModel):
    decision_type: DecisionType
    reason_code: ReasonCode
    decision_note: str = Field(..., min_length=5)
    field_changes: Optional[Dict[str, Any]] = None
    guidance_text: Optional[str] = None
    new_tasks: Optional[List[Dict[str, Any]]] = None


class EscalationResponse(BaseModel):
    id: str
    status: str
    message: str


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/from-finding", response_model=EscalationResponse)
async def create_escalation_from_finding(
    request: CreateEscalationFromFindingRequest,
    user: dict = Depends(get_current_user)
):
    """
    Create an escalation from a review finding.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Get finding
    try:
        finding_result = supabase.table("review_findings")\
            .select("*")\
            .eq("id", request.finding_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        finding = finding_result.data
    except:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Check finding status
    if finding["status"] in ["resolved_verified", "resolved_fixed", "resolved_escalated", "dismissed"]:
        raise HTTPException(status_code=400, detail="Finding is already resolved")
    
    # Check for existing escalation
    existing = supabase.table("escalation_requests")\
        .select("id, status")\
        .eq("source_type", "review_finding")\
        .eq("source_id", request.finding_id)\
        .in_("status", ["queued", "assigned", "in_review"])\
        .execute()
    
    if existing.data:
        raise HTTPException(status_code=400, detail="An active escalation already exists for this finding")
    
    # Create escalation
    escalation_id = str(uuid4())
    escalation_data = {
        "id": escalation_id,
        "organization_id": org_id,
        "client_company_id": finding["client_company_id"],
        "tax_year": finding["tax_year"],
        "source_type": "review_finding",
        "source_id": request.finding_id,
        "title": f"Escalation: {finding['title']}",
        "summary": request.summary,
        "severity": finding["severity"],
        "estimated_impact": finding.get("estimated_impact", {}),
        "proposed_action": request.proposed_action,
        "authority_refs": finding.get("authority_refs", []),
        "status": "assigned" if request.assigned_to_user_id else "queued",
        "assigned_to_user_id": request.assigned_to_user_id,
        "created_by_user_id": user["id"]
    }
    
    supabase.table("escalation_requests").insert(escalation_data).execute()
    
    # Update finding status
    supabase.table("review_findings")\
        .update({"status": "in_review", "updated_at": datetime.utcnow().isoformat()})\
        .eq("id", request.finding_id)\
        .execute()
    
    # Create history
    create_escalation_history(
        escalation_id=escalation_id,
        action="created",
        user_id=user["id"],
        new_status="assigned" if request.assigned_to_user_id else "queued",
        new_assigned=request.assigned_to_user_id,
        note=f"Escalated from finding: {finding['title']}"
    )
    
    # Notify assigned user
    if request.assigned_to_user_id:
        create_notification(
            user_id=request.assigned_to_user_id,
            notification_type="escalation_assigned",
            title="New Escalation Assigned",
            message=f"You have been assigned to review: {finding['title']}",
            payload={"escalation_id": escalation_id, "finding_id": request.finding_id}
        )
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="escalation_created",
        item_type="escalation_request",
        item_id=escalation_id,
        details={
            "source_type": "review_finding",
            "source_id": request.finding_id,
            "severity": finding["severity"],
            "assigned_to": request.assigned_to_user_id,
            "estimated_impact": finding.get("estimated_impact", {})
        }
    )
    
    return EscalationResponse(
        id=escalation_id,
        status="assigned" if request.assigned_to_user_id else "queued",
        message="Escalation created successfully"
    )


@router.post("/from-mapping", response_model=EscalationResponse)
async def create_escalation_from_mapping(
    request: CreateEscalationFromMappingRequest,
    user: dict = Depends(get_current_user)
):
    """
    Create an escalation from an intake mapping.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Get mapping
    try:
        mapping_result = supabase.table("intake_mappings")\
            .select("*, intake_files(client_company_id, client_intake_sessions(tax_years))")\
            .eq("id", request.mapping_id)\
            .single()\
            .execute()
        
        mapping = mapping_result.data
    except:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    # Extract client info
    intake_file = mapping.get("intake_files", {})
    client_id = intake_file.get("client_company_id")
    session = intake_file.get("client_intake_sessions", {})
    tax_years = session.get("tax_years", [])
    tax_year = tax_years[0] if tax_years else None
    
    if not client_id:
        raise HTTPException(status_code=400, detail="Could not determine client for mapping")
    
    # Create escalation
    escalation_id = str(uuid4())
    escalation_data = {
        "id": escalation_id,
        "organization_id": org_id,
        "client_company_id": client_id,
        "tax_year": tax_year,
        "source_type": "intake_mapping",
        "source_id": request.mapping_id,
        "title": f"Mapping: {mapping.get('prompt', 'Unknown')[:50]}",
        "summary": request.summary,
        "severity": "medium",  # Mappings default to medium
        "estimated_impact": {},
        "proposed_action": request.proposed_action,
        "authority_refs": [],
        "status": "assigned" if request.assigned_to_user_id else "queued",
        "assigned_to_user_id": request.assigned_to_user_id,
        "created_by_user_id": user["id"]
    }
    
    supabase.table("escalation_requests").insert(escalation_data).execute()
    
    # Create history
    create_escalation_history(
        escalation_id=escalation_id,
        action="created",
        user_id=user["id"],
        new_status="assigned" if request.assigned_to_user_id else "queued",
        new_assigned=request.assigned_to_user_id,
        note=f"Escalated from intake mapping"
    )
    
    # Notify assigned user
    if request.assigned_to_user_id:
        create_notification(
            user_id=request.assigned_to_user_id,
            notification_type="escalation_assigned",
            title="New Escalation Assigned",
            message=f"You have been assigned to review a mapping issue",
            payload={"escalation_id": escalation_id, "mapping_id": request.mapping_id}
        )
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="escalation_created",
        item_type="escalation_request",
        item_id=escalation_id,
        details={
            "source_type": "intake_mapping",
            "source_id": request.mapping_id
        }
    )
    
    return EscalationResponse(
        id=escalation_id,
        status="assigned" if request.assigned_to_user_id else "queued",
        message="Escalation created successfully"
    )


@router.get("/queue")
async def list_escalation_queue(
    status: Optional[str] = Query(None),
    assigned_to_me: bool = Query(False),
    client_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    min_qre_at_risk: Optional[float] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    user: dict = Depends(get_current_user)
):
    """
    List escalation queue for senior review.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Build query
    query = supabase.table("escalation_requests")\
        .select("*, client_companies(name)")\
        .eq("organization_id", org_id)
    
    if status:
        query = query.eq("status", status)
    else:
        # Default to active escalations
        query = query.in_("status", ["queued", "assigned", "in_review", "returned_to_junior"])
    
    if assigned_to_me:
        query = query.eq("assigned_to_user_id", user["id"])
    
    if client_id:
        query = query.eq("client_company_id", client_id)
    
    if severity:
        query = query.eq("severity", severity)
    
    query = query.order("severity", desc=True)\
        .order("created_at", desc=False)\
        .range(offset, offset + limit - 1)
    
    result = query.execute()
    escalations = result.data or []
    
    # Filter by QRE at risk if specified
    if min_qre_at_risk:
        escalations = [
            e for e in escalations
            if float((e.get("estimated_impact") or {}).get("qre_at_risk", 0)) >= min_qre_at_risk
        ]
    
    # Get creator/assignee details
    user_ids = set()
    for e in escalations:
        if e.get("created_by_user_id"):
            user_ids.add(e["created_by_user_id"])
        if e.get("assigned_to_user_id"):
            user_ids.add(e["assigned_to_user_id"])
    
    user_map = {}
    if user_ids:
        users_result = supabase.table("profiles")\
            .select("id, full_name, email")\
            .in_("id", list(user_ids))\
            .execute()
        for u in (users_result.data or []):
            user_map[u["id"]] = u
    
    # Enhance escalations
    for e in escalations:
        e["created_by"] = user_map.get(e.get("created_by_user_id"))
        e["assigned_to"] = user_map.get(e.get("assigned_to_user_id"))
        e["client_name"] = e.get("client_companies", {}).get("name")
        e["days_open"] = (datetime.utcnow() - datetime.fromisoformat(e["created_at"].replace("Z", ""))).days
    
    # Get counts
    count_result = supabase.table("escalation_requests")\
        .select("id", count="exact")\
        .eq("organization_id", org_id)\
        .in_("status", ["queued", "assigned", "in_review"])\
        .execute()
    
    return {
        "escalations": escalations,
        "total_active": count_result.count or 0
    }


@router.get("/{escalation_id}")
async def get_escalation_detail(
    escalation_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get detailed escalation with source object and history.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Get escalation
    try:
        result = supabase.table("escalation_requests")\
            .select("*")\
            .eq("id", escalation_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        escalation = result.data
    except:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    # Get source object
    source_object = None
    entity_snapshot = None
    
    if escalation["source_type"] == "review_finding":
        try:
            finding_result = supabase.table("review_findings")\
                .select("*")\
                .eq("id", escalation["source_id"])\
                .single()\
                .execute()
            source_object = finding_result.data
            
            # Get entity snapshot if finding has entity
            if source_object and source_object.get("entity_id"):
                entity_table_map = {
                    "employee": "employees",
                    "project": "projects",
                    "contractor": "contractors",
                    "expense": "expenses",
                    "supply": "supplies"
                }
                table = entity_table_map.get(source_object.get("entity_type"))
                if table:
                    try:
                        entity_result = supabase.table(table)\
                            .select("*")\
                            .eq("id", source_object["entity_id"])\
                            .single()\
                            .execute()
                        entity_snapshot = entity_result.data
                    except:
                        pass
        except:
            pass
    
    elif escalation["source_type"] == "intake_mapping":
        try:
            mapping_result = supabase.table("intake_mappings")\
                .select("*")\
                .eq("id", escalation["source_id"])\
                .single()\
                .execute()
            source_object = mapping_result.data
        except:
            pass
    
    # Get authority details
    authority_details = []
    if escalation.get("authority_refs"):
        auth_result = supabase.table("authority_library")\
            .select("id, citation_label, citation_key, summary, url")\
            .in_("id", escalation["authority_refs"])\
            .execute()
        authority_details = auth_result.data or []
    
    # Get history
    history_result = supabase.table("escalation_history")\
        .select("*, profiles(full_name, email)")\
        .eq("escalation_request_id", escalation_id)\
        .order("created_at", desc=True)\
        .execute()
    
    # Get creator/assignee details
    user_ids = []
    if escalation.get("created_by_user_id"):
        user_ids.append(escalation["created_by_user_id"])
    if escalation.get("assigned_to_user_id"):
        user_ids.append(escalation["assigned_to_user_id"])
    if escalation.get("decided_by_user_id"):
        user_ids.append(escalation["decided_by_user_id"])
    
    user_map = {}
    if user_ids:
        users_result = supabase.table("profiles")\
            .select("id, full_name, email, role, role_level")\
            .in_("id", user_ids)\
            .execute()
        for u in (users_result.data or []):
            user_map[u["id"]] = u
    
    escalation["created_by"] = user_map.get(escalation.get("created_by_user_id"))
    escalation["assigned_to"] = user_map.get(escalation.get("assigned_to_user_id"))
    escalation["decided_by"] = user_map.get(escalation.get("decided_by_user_id"))
    
    # Get list of seniors for assignment dropdown
    seniors_result = supabase.table("profiles")\
        .select("id, full_name, email, role_level")\
        .eq("organization_id", org_id)\
        .in_("role_level", ["senior", "director", "partner"])\
        .execute()
    
    available_seniors = seniors_result.data or []
    
    # Also include executives
    execs_result = supabase.table("profiles")\
        .select("id, full_name, email")\
        .eq("organization_id", org_id)\
        .eq("role", "executive")\
        .execute()
    
    for exec in (execs_result.data or []):
        exec["role_level"] = "executive"
        available_seniors.append(exec)
    
    return {
        "escalation": escalation,
        "source_object": source_object,
        "entity_snapshot": entity_snapshot,
        "authority_details": authority_details,
        "history": history_result.data or [],
        "available_seniors": available_seniors
    }


@router.post("/{escalation_id}/assign")
async def assign_escalation(
    escalation_id: str,
    request: AssignEscalationRequest,
    user: dict = Depends(get_current_user)
):
    """
    Assign an escalation to a senior user.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    # Only senior+ can assign
    if not is_senior_or_above(profile):
        raise HTTPException(status_code=403, detail="Senior or executive role required to assign escalations")
    
    org_id = profile.get("organization_id")
    
    # Get escalation
    try:
        result = supabase.table("escalation_requests")\
            .select("*")\
            .eq("id", escalation_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        escalation = result.data
    except:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if escalation["status"] in ["resolved", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot assign resolved or cancelled escalation")
    
    # Verify assignee is senior+
    assignee_profile = get_user_profile(request.assigned_to_user_id)
    if not assignee_profile or not is_senior_or_above(assignee_profile):
        raise HTTPException(status_code=400, detail="Assignee must be a senior CPA or executive")
    
    previous_assigned = escalation.get("assigned_to_user_id")
    
    # Update assignment
    supabase.table("escalation_requests")\
        .update({
            "assigned_to_user_id": request.assigned_to_user_id,
            "status": "assigned",
            "updated_at": datetime.utcnow().isoformat()
        })\
        .eq("id", escalation_id)\
        .execute()
    
    # Create history
    create_escalation_history(
        escalation_id=escalation_id,
        action="assigned",
        user_id=user["id"],
        previous_status=escalation["status"],
        new_status="assigned",
        previous_assigned=previous_assigned,
        new_assigned=request.assigned_to_user_id
    )
    
    # Notify new assignee
    create_notification(
        user_id=request.assigned_to_user_id,
        notification_type="escalation_assigned",
        title="Escalation Assigned to You",
        message=f"You have been assigned: {escalation['title']}",
        payload={"escalation_id": escalation_id}
    )
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="escalation_assigned",
        item_type="escalation_request",
        item_id=escalation_id,
        details={
            "previous_assigned": previous_assigned,
            "new_assigned": request.assigned_to_user_id
        }
    )
    
    return {"status": "assigned", "assigned_to_user_id": request.assigned_to_user_id}


@router.post("/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    request: ResolveEscalationRequest,
    user: dict = Depends(get_current_user)
):
    """
    Senior decision on an escalation.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    org_settings = get_org_settings(org_id)
    
    # Get escalation
    try:
        result = supabase.table("escalation_requests")\
            .select("*")\
            .eq("id", escalation_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        escalation = result.data
    except:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if escalation["status"] in ["resolved", "cancelled"]:
        raise HTTPException(status_code=400, detail="Escalation is already resolved or cancelled")
    
    # Check permissions
    can_resolve, reason = can_resolve_escalation(profile, escalation, org_settings)
    if not can_resolve:
        raise HTTPException(status_code=403, detail=f"Cannot resolve: {reason}")
    
    # Require note if reason is "other"
    if request.reason_code == ReasonCode.OTHER and len(request.decision_note) < 20:
        raise HTTPException(status_code=400, detail="Detailed note required when reason is 'other'")
    
    # Determine new status based on decision
    new_status = "resolved"
    if request.decision_type == DecisionType.RETURN_GUIDANCE:
        new_status = "returned_to_junior"
    elif request.decision_type == DecisionType.REQUEST_MORE_EVIDENCE:
        new_status = "returned_to_junior"
    
    # Update escalation
    update_data = {
        "status": new_status,
        "decision_type": request.decision_type.value,
        "decision_reason_code": request.reason_code.value,
        "decision_note": request.decision_note,
        "decided_by_user_id": user["id"],
        "decision_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    
    if request.field_changes:
        update_data["decision_field_changes"] = request.field_changes
    
    if request.guidance_text:
        update_data["guidance_text"] = request.guidance_text
    
    supabase.table("escalation_requests")\
        .update(update_data)\
        .eq("id", escalation_id)\
        .execute()
    
    # Handle source object updates
    field_diffs = {}
    
    if escalation["source_type"] == "review_finding":
        finding_id = escalation["source_id"]
        
        if request.decision_type == DecisionType.OVERRIDE_FIELDS and request.field_changes:
            # Get finding to find entity
            finding_result = supabase.table("review_findings")\
                .select("*, entity_type, entity_id")\
                .eq("id", finding_id)\
                .single()\
                .execute()
            finding = finding_result.data
            
            if finding and finding.get("entity_id"):
                entity_table_map = {
                    "employee": "employees",
                    "project": "projects",
                    "contractor": "contractors",
                    "expense": "expenses",
                    "supply": "supplies"
                }
                table = entity_table_map.get(finding.get("entity_type"))
                
                if table:
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
                    
                    field_diffs = {"before": before, "after": after}
                    
                    # Apply changes
                    supabase.table(table)\
                        .update(request.field_changes)\
                        .eq("id", finding["entity_id"])\
                        .execute()
                    
                    # Log canonical update
                    write_audit_log(
                        org_id=org_id,
                        user_id=user["id"],
                        action="canonical_record_updated_from_escalation",
                        item_type=finding["entity_type"],
                        item_id=finding["entity_id"],
                        details={
                            "escalation_id": escalation_id,
                            "before": before,
                            "after": after,
                            "reason_code": request.reason_code.value
                        }
                    )
        
        # Update finding status
        if request.decision_type in [DecisionType.APPROVE_JUNIOR_RESOLUTION, DecisionType.OVERRIDE_FIELDS, DecisionType.DISMISS]:
            finding_status = "resolved_verified" if request.decision_type == DecisionType.APPROVE_JUNIOR_RESOLUTION else (
                "resolved_fixed" if request.decision_type == DecisionType.OVERRIDE_FIELDS else "dismissed"
            )
            
            supabase.table("review_findings")\
                .update({
                    "status": finding_status,
                    "updated_at": datetime.utcnow().isoformat()
                })\
                .eq("id", finding_id)\
                .execute()
            
            # Create finding resolution
            resolution_data = {
                "id": str(uuid4()),
                "review_finding_id": finding_id,
                "resolution_type": "escalated_to_senior" if request.decision_type != DecisionType.DISMISS else "dismissed_with_reason",
                "completion_method": "senior_override",
                "resolution_note": f"[{request.reason_code.value}] {request.decision_note}",
                "changes": field_diffs,
                "artifacts": [{"escalation_id": escalation_id}],
                "resolved_by_user_id": user["id"],
                "resolved_at": datetime.utcnow().isoformat()
            }
            
            supabase.table("finding_resolutions").insert(resolution_data).execute()
            
            # Audit log for finding resolution
            write_audit_log(
                org_id=org_id,
                user_id=user["id"],
                action="review_finding_resolved",
                item_type="review_finding",
                item_id=finding_id,
                details={
                    "escalation_id": escalation_id,
                    "decision_type": request.decision_type.value,
                    "reason_code": request.reason_code.value,
                    "completion_method": "senior_override",
                    "changes": field_diffs
                }
            )
    
    # Create tasks if requesting more evidence
    if request.decision_type == DecisionType.REQUEST_MORE_EVIDENCE and request.new_tasks:
        for task_spec in request.new_tasks:
            try:
                task_data = {
                    "id": str(uuid4()),
                    "organization_id": org_id,
                    "client_company_id": escalation["client_company_id"],
                    "task_type": "evidence_request",
                    "title": task_spec.get("title", "Evidence requested"),
                    "description": task_spec.get("description", request.guidance_text),
                    "status": "pending",
                    "priority": "high",
                    "escalation_request_id": escalation_id,
                    "assigned_to_user_id": escalation["created_by_user_id"],
                    "created_by_user_id": user["id"],
                    "created_at": datetime.utcnow().isoformat()
                }
                supabase.table("tasks").insert(task_data).execute()
            except Exception as e:
                logger.warning(f"Failed to create task: {e}")
    
    # Create history
    create_escalation_history(
        escalation_id=escalation_id,
        action=f"resolved:{request.decision_type.value}",
        user_id=user["id"],
        previous_status=escalation["status"],
        new_status=new_status,
        note=f"[{request.reason_code.value}] {request.decision_note}"
    )
    
    # Notify junior
    create_notification(
        user_id=escalation["created_by_user_id"],
        notification_type="escalation_resolved" if new_status == "resolved" else "escalation_returned",
        title="Escalation Updated" if new_status == "resolved" else "Escalation Returned",
        message=f"Senior decision: {request.decision_type.value.replace('_', ' ').title()}",
        payload={
            "escalation_id": escalation_id,
            "decision_type": request.decision_type.value,
            "guidance": request.guidance_text
        }
    )
    
    # Main audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="escalation_resolved",
        item_type="escalation_request",
        item_id=escalation_id,
        details={
            "decision_type": request.decision_type.value,
            "reason_code": request.reason_code.value,
            "note": request.decision_note,
            "field_changes": request.field_changes,
            "new_status": new_status
        }
    )
    
    return {
        "escalation_id": escalation_id,
        "status": new_status,
        "decision_type": request.decision_type.value
    }


@router.post("/{escalation_id}/cancel")
async def cancel_escalation(
    escalation_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Cancel an escalation (by creator if still queued, or by senior).
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Get escalation
    try:
        result = supabase.table("escalation_requests")\
            .select("*")\
            .eq("id", escalation_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        escalation = result.data
    except:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    
    if escalation["status"] in ["resolved", "cancelled"]:
        raise HTTPException(status_code=400, detail="Escalation is already resolved or cancelled")
    
    # Check permissions
    can_cancel = (
        (escalation["created_by_user_id"] == user["id"] and escalation["status"] == "queued") or
        is_senior_or_above(profile)
    )
    
    if not can_cancel:
        raise HTTPException(status_code=403, detail="Cannot cancel this escalation")
    
    # Update
    supabase.table("escalation_requests")\
        .update({
            "status": "cancelled",
            "updated_at": datetime.utcnow().isoformat()
        })\
        .eq("id", escalation_id)\
        .execute()
    
    # Restore finding status if applicable
    if escalation["source_type"] == "review_finding":
        supabase.table("review_findings")\
            .update({
                "status": "open",
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("id", escalation["source_id"])\
            .execute()
    
    # History
    create_escalation_history(
        escalation_id=escalation_id,
        action="cancelled",
        user_id=user["id"],
        previous_status=escalation["status"],
        new_status="cancelled"
    )
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="escalation_cancelled",
        item_type="escalation_request",
        item_id=escalation_id,
        details={}
    )
    
    return {"escalation_id": escalation_id, "status": "cancelled"}


# ============================================================================
# Notifications Endpoints
# ============================================================================

@router.get("/notifications")
async def get_notifications(
    unread_only: bool = Query(True),
    limit: int = Query(20),
    user: dict = Depends(get_current_user)
):
    """
    Get user's notifications.
    """
    supabase = get_supabase()
    
    query = supabase.table("notifications")\
        .select("*")\
        .eq("user_id", user["id"])
    
    if unread_only:
        query = query.is_("read_at", "null")
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    
    return {"notifications": result.data or []}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Mark a notification as read.
    """
    supabase = get_supabase()
    
    supabase.table("notifications")\
        .update({"read_at": datetime.utcnow().isoformat()})\
        .eq("id", notification_id)\
        .eq("user_id", user["id"])\
        .execute()
    
    return {"status": "read"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    user: dict = Depends(get_current_user)
):
    """
    Mark all notifications as read.
    """
    supabase = get_supabase()
    
    supabase.table("notifications")\
        .update({"read_at": datetime.utcnow().isoformat()})\
        .eq("user_id", user["id"])\
        .is_("read_at", "null")\
        .execute()
    
    return {"status": "all_read"}


# ============================================================================
# Seniors List Endpoint
# ============================================================================

@router.get("/seniors")
async def list_senior_users(
    user: dict = Depends(get_current_user)
):
    """
    List senior CPAs and executives for assignment.
    """
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    
    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")
    
    org_id = profile.get("organization_id")
    
    # Get senior CPAs
    seniors = supabase.table("profiles")\
        .select("id, full_name, email, role, role_level")\
        .eq("organization_id", org_id)\
        .in_("role_level", ["senior", "director", "partner"])\
        .execute()
    
    # Get executives
    execs = supabase.table("profiles")\
        .select("id, full_name, email, role")\
        .eq("organization_id", org_id)\
        .eq("role", "executive")\
        .execute()
    
    result = []
    for s in (seniors.data or []):
        result.append(s)
    for e in (execs.data or []):
        e["role_level"] = "executive"
        result.append(e)
    
    return {"seniors": result}
