"""
Missing Information Detection & Capture Routes

Auto-detects missing fields and prompts users for exactly what's needed.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.supabase_client import get_supabase
from app.auth_permissions import (
    AuthContext, get_auth_context, verify_client_access,
    Capability
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/missing-info", tags=["missing-info"])


# =============================================================================
# MODELS
# =============================================================================

class MissingFieldRequest(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    entity_name: Optional[str]
    field_key: str
    prompt_text: str
    prompt_detail: Optional[str]
    severity: str
    category: Optional[str]
    status: str
    assigned_to: Optional[str]
    created_at: str


class MissingFieldsResponse(BaseModel):
    requests: List[MissingFieldRequest]
    total_count: int
    critical_count: int
    by_entity_type: Dict[str, int]
    by_severity: Dict[str, int]


class DetectionResult(BaseModel):
    detected_count: int
    created_count: int
    resolved_count: int


# =============================================================================
# FIELD DETECTION RULES
# =============================================================================

# Project missing field rules
PROJECT_FIELD_RULES = [
    {
        "field_key": "uncertainty_type",
        "check_fields": ["uncertainty_type"],
        "prompt_text": "Describe the technological uncertainty this project aimed to resolve.",
        "prompt_detail": "What technical challenge or unknown existed at the start of this project? This is critical for the four-part test.",
        "severity": "high",
        "category": "four_part_test"
    },
    {
        "field_key": "experimentation_description",
        "check_fields": ["experimentation_description"],
        "prompt_text": "Describe the systematic experimentation or evaluation process.",
        "prompt_detail": "What methodical approaches did you use to resolve the uncertainty? Include trials, prototypes, simulations, etc.",
        "severity": "high",
        "category": "four_part_test"
    },
    {
        "field_key": "technological_basis",
        "check_fields": ["technological_basis"],
        "prompt_text": "What is the technological foundation of this R&D activity?",
        "prompt_detail": "Identify the engineering, computer science, or physical science principles underlying this work.",
        "severity": "medium",
        "category": "four_part_test"
    },
    {
        "field_key": "permitted_purpose",
        "check_fields": ["permitted_purpose"],
        "prompt_text": "Describe the permitted purpose (new/improved product, process, etc.).",
        "prompt_detail": "What new or improved functionality, performance, reliability, or quality was the goal?",
        "severity": "medium",
        "category": "four_part_test"
    },
    {
        "field_key": "description",
        "check_fields": ["description"],
        "prompt_text": "Add a detailed project description.",
        "prompt_detail": "Provide an overview of the project scope, objectives, and technical approach.",
        "severity": "low",
        "category": "documentation"
    },
]

# Employee missing field rules
EMPLOYEE_FIELD_RULES = [
    {
        "field_key": "hourly_rate",
        "check_fields": ["hourly_rate"],
        "check_condition": lambda v: v is None or v <= 0,
        "prompt_text": "Enter the employee's hourly rate or annual salary.",
        "prompt_detail": "Required for wage QRE calculations.",
        "severity": "high",
        "category": "wage_data"
    },
    {
        "field_key": "department",
        "check_fields": ["department"],
        "prompt_text": "Specify the employee's department.",
        "prompt_detail": "Helps categorize R&D activities by functional area.",
        "severity": "low",
        "category": "classification"
    },
    {
        "field_key": "job_title",
        "check_fields": ["job_title"],
        "prompt_text": "Enter the employee's job title.",
        "prompt_detail": "Job title helps establish qualification for R&D activities.",
        "severity": "medium",
        "category": "classification"
    },
]

# Vendor/Contract missing field rules
VENDOR_FIELD_RULES = [
    {
        "field_key": "country_code",
        "check_fields": ["country_code"],
        "prompt_text": "Specify the vendor's country location.",
        "prompt_detail": "Foreign research may be excluded from the credit. US vendors qualify for the 65% contract research rule.",
        "severity": "high",
        "category": "contract_data"
    },
]

CONTRACT_FIELD_RULES = [
    {
        "field_key": "ip_owner",
        "check_fields": ["ip_owner"],
        "prompt_text": "Who owns the intellectual property from this contract?",
        "prompt_detail": "IP ownership affects whether costs qualify as contract research.",
        "severity": "high",
        "category": "contract_data"
    },
    {
        "field_key": "risk_bearer",
        "check_fields": ["risk_bearer"],
        "prompt_text": "Which party bears the financial risk?",
        "prompt_detail": "The party bearing risk is typically eligible to claim the credit.",
        "severity": "high",
        "category": "contract_data"
    },
]

# Timesheet missing field rules
TIMESHEET_FIELD_RULES = [
    {
        "field_key": "project_id",
        "check_fields": ["project_id"],
        "prompt_text": "Link this timesheet entry to a project.",
        "prompt_detail": "Time must be allocated to specific R&D projects for QRE calculation.",
        "severity": "medium",
        "category": "linkage"
    },
]

# AP Transaction missing field rules
AP_FIELD_RULES = [
    {
        "field_key": "category",
        "check_fields": ["category"],
        "prompt_text": "Categorize this expense.",
        "prompt_detail": "Select: supplies, contract_research, cloud_computing, or other.",
        "severity": "medium",
        "category": "classification"
    },
    {
        "field_key": "project_id",
        "check_fields": ["project_id"],
        "prompt_text": "Link this expense to a project (if applicable).",
        "prompt_detail": "Direct project linkage strengthens audit defensibility.",
        "severity": "low",
        "category": "linkage"
    },
]


# =============================================================================
# DETECTION LOGIC
# =============================================================================

def _is_field_missing(entity: Dict, rule: Dict) -> bool:
    """Check if a field is missing based on rule."""
    for field in rule["check_fields"]:
        value = entity.get(field)
        
        # Custom condition check
        if "check_condition" in rule:
            if rule["check_condition"](value):
                return True
        else:
            # Default: empty, null, or whitespace-only
            if value is None or (isinstance(value, str) and not value.strip()):
                return True
    
    return False


def _detect_missing_for_entity(
    entity_type: str,
    entity: Dict,
    rules: List[Dict]
) -> List[Dict]:
    """Detect missing fields for a single entity."""
    missing = []
    
    for rule in rules:
        if _is_field_missing(entity, rule):
            missing.append({
                "entity_type": entity_type,
                "entity_id": entity["id"],
                "entity_name": entity.get("name") or entity.get("title") or entity.get("description", "")[:50],
                "field_key": rule["field_key"],
                "prompt_text": rule["prompt_text"],
                "prompt_detail": rule.get("prompt_detail"),
                "severity": rule["severity"],
                "category": rule.get("category"),
            })
    
    return missing


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.post("/detect", response_model=DetectionResult)
async def detect_missing_fields(
    client_id: str = Query(..., alias="client_company_id"),
    tax_year: int = Query(default=2024),
    entity_types: Optional[str] = Query(None, description="Comma-separated: project,employee,vendor,contract,timesheet,ap_transaction"),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Detect and create missing field requests for a client.
    Run this after data imports or on demand.
    """
    verify_client_access(auth, client_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    types_to_check = (
        entity_types.split(",") if entity_types 
        else ["project", "employee", "vendor", "contract", "timesheet", "ap_transaction"]
    )
    
    all_missing = []
    
    try:
        # Check projects
        if "project" in types_to_check:
            projects = supabase.table("projects")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .execute()
            
            for proj in (projects.data or []):
                all_missing.extend(_detect_missing_for_entity("project", proj, PROJECT_FIELD_RULES))
        
        # Check employees
        if "employee" in types_to_check:
            employees = supabase.table("employees")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .execute()
            
            for emp in (employees.data or []):
                all_missing.extend(_detect_missing_for_entity("employee", emp, EMPLOYEE_FIELD_RULES))
        
        # Check vendors
        if "vendor" in types_to_check:
            vendors = supabase.table("vendors")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .execute()
            
            for vendor in (vendors.data or []):
                all_missing.extend(_detect_missing_for_entity("vendor", vendor, VENDOR_FIELD_RULES))
        
        # Check contracts
        if "contract" in types_to_check:
            contracts = supabase.table("contracts")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .execute()
            
            for contract in (contracts.data or []):
                all_missing.extend(_detect_missing_for_entity("contract", contract, CONTRACT_FIELD_RULES))
        
        # Check timesheets (sample - don't check all for performance)
        if "timesheet" in types_to_check:
            timesheets = supabase.table("timesheets")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .is_("project_id", "null")\
                .limit(100)\
                .execute()
            
            for ts in (timesheets.data or []):
                all_missing.extend(_detect_missing_for_entity("timesheet", ts, TIMESHEET_FIELD_RULES))
        
        # Check AP transactions (sample)
        if "ap_transaction" in types_to_check:
            ap = supabase.table("ap_transactions")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .is_("category", "null")\
                .limit(100)\
                .execute()
            
            for txn in (ap.data or []):
                all_missing.extend(_detect_missing_for_entity("ap_transaction", txn, AP_FIELD_RULES))
        
        # Upsert missing field requests
        created_count = 0
        for missing in all_missing:
            try:
                supabase.table("missing_field_requests").upsert({
                    "organization_id": auth.org_id,
                    "client_company_id": client_id,
                    "tax_year": tax_year,
                    **missing,
                    "status": "open",
                }, on_conflict="client_company_id,tax_year,entity_type,entity_id,field_key").execute()
                created_count += 1
            except Exception as e:
                logger.warning(f"Failed to upsert missing request: {e}")
        
        # Auto-resolve requests where field is now filled
        # Get existing open requests
        existing = supabase.table("missing_field_requests")\
            .select("id, entity_type, entity_id, field_key")\
            .eq("client_company_id", client_id)\
            .eq("tax_year", tax_year)\
            .eq("status", "open")\
            .execute()
        
        resolved_count = 0
        missing_keys = {f"{m['entity_type']}:{m['entity_id']}:{m['field_key']}" for m in all_missing}
        
        for req in (existing.data or []):
            key = f"{req['entity_type']}:{req['entity_id']}:{req['field_key']}"
            if key not in missing_keys:
                # Field was filled, resolve the request
                supabase.table("missing_field_requests")\
                    .update({
                        "status": "resolved",
                        "resolved_at": datetime.utcnow().isoformat(),
                        "resolved_by": auth.user_id
                    })\
                    .eq("id", req["id"])\
                    .execute()
                resolved_count += 1
        
        return DetectionResult(
            detected_count=len(all_missing),
            created_count=created_count,
            resolved_count=resolved_count
        )
        
    except Exception as e:
        logger.error(f"Error detecting missing fields: {e}")
        raise HTTPException(status_code=500, detail="Detection failed")


@router.get("/list", response_model=MissingFieldsResponse)
async def list_missing_fields(
    client_id: str = Query(..., alias="client_company_id"),
    tax_year: int = Query(default=2024),
    entity_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: str = Query(default="open"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    List missing field requests for a client.
    """
    verify_client_access(auth, client_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    query = supabase.table("missing_field_requests")\
        .select("*", count="exact")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)
    
    if status:
        query = query.eq("status", status)
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if severity:
        query = query.eq("severity", severity)
    
    query = query.order("severity", desc=False).order("created_at", desc=True)
    query = query.range(offset, offset + limit - 1)
    
    result = query.execute()
    
    # Get entity names
    requests = []
    for req in (result.data or []):
        # Fetch entity name based on type
        entity_name = None
        try:
            if req["entity_type"] == "project":
                entity = supabase.table("projects").select("name").eq("id", req["entity_id"]).single().execute()
                entity_name = entity.data.get("name") if entity.data else None
            elif req["entity_type"] == "employee":
                entity = supabase.table("employees").select("name").eq("id", req["entity_id"]).single().execute()
                entity_name = entity.data.get("name") if entity.data else None
            elif req["entity_type"] == "vendor":
                entity = supabase.table("vendors").select("name").eq("id", req["entity_id"]).single().execute()
                entity_name = entity.data.get("name") if entity.data else None
        except:
            pass
        
        requests.append(MissingFieldRequest(
            id=req["id"],
            entity_type=req["entity_type"],
            entity_id=req["entity_id"],
            entity_name=entity_name,
            field_key=req["field_key"],
            prompt_text=req["prompt_text"],
            prompt_detail=req.get("prompt_detail"),
            severity=req["severity"],
            category=req.get("category"),
            status=req["status"],
            assigned_to=req.get("assigned_to"),
            created_at=req["created_at"]
        ))
    
    # Build counts
    by_entity_type: Dict[str, int] = {}
    by_severity: Dict[str, int] = {}
    critical_count = 0
    
    for req in requests:
        by_entity_type[req.entity_type] = by_entity_type.get(req.entity_type, 0) + 1
        by_severity[req.severity] = by_severity.get(req.severity, 0) + 1
        if req.severity in ("critical", "high"):
            critical_count += 1
    
    return MissingFieldsResponse(
        requests=requests,
        total_count=result.count or len(requests),
        critical_count=critical_count,
        by_entity_type=by_entity_type,
        by_severity=by_severity
    )


@router.post("/{request_id}/resolve")
async def resolve_missing_field(
    request_id: str,
    auth: AuthContext = Depends(get_auth_context)
):
    """Mark a missing field request as resolved."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    result = supabase.table("missing_field_requests")\
        .update({
            "status": "resolved",
            "resolved_at": datetime.utcnow().isoformat(),
            "resolved_by": auth.user_id
        })\
        .eq("id", request_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    return {"success": True, "status": "resolved"}


@router.post("/{request_id}/waive")
async def waive_missing_field(
    request_id: str,
    reason: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Waive a missing field request (mark as not needed)."""
    auth.require_capability(Capability.WAIVE_GAPS)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    result = supabase.table("missing_field_requests")\
        .update({
            "status": "waived",
            "waive_reason": reason,
            "resolved_at": datetime.utcnow().isoformat(),
            "resolved_by": auth.user_id
        })\
        .eq("id", request_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    return {"success": True, "status": "waived"}


@router.post("/{request_id}/assign")
async def assign_missing_field(
    request_id: str,
    assignee_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Assign a missing field request to a user."""
    auth.require_capability(Capability.MANAGE_TASKS)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    result = supabase.table("missing_field_requests")\
        .update({
            "assigned_to": assignee_id,
            "status": "in_progress"
        })\
        .eq("id", request_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    return {"success": True, "assigned_to": assignee_id}


@router.post("/bulk-assign")
async def bulk_assign_missing_fields(
    request_ids: List[str] = Query(...),
    assignee_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Bulk assign missing field requests."""
    auth.require_capability(Capability.MANAGE_TASKS)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    updated = 0
    for req_id in request_ids:
        try:
            supabase.table("missing_field_requests")\
                .update({
                    "assigned_to": assignee_id,
                    "status": "in_progress"
                })\
                .eq("id", req_id)\
                .execute()
            updated += 1
        except:
            pass
    
    return {"success": True, "updated_count": updated}

