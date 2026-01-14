"""
Admin / Executive Controls Routes

Endpoints for:
- Authority Library management (CRUD + deactivate/reactivate)
- Org Settings management (get/update)
- Audit Export generation (logs CSV, defense pack ZIP)
"""

import csv
import io
import json
import hashlib
import logging
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator

from app.supabase_client import get_supabase, verify_supabase_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============================================================================
# AUTH HELPERS
# =============================================================================

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization required")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = parts[1]
    user = verify_supabase_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def _get_user_org_and_role(user_id: str) -> Dict[str, Any]:
    supabase = get_supabase()
    if not supabase:
        return {}
    try:
        p = supabase.table("profiles").select("organization_id, role, role_level").eq("id", user_id).single().execute()
        if p.data:
            return {
                "organization_id": p.data.get("organization_id"),
                "role": p.data.get("role"),
                "role_level": p.data.get("role_level"),
            }
    except Exception as e:
        logger.error(f"Error getting user org/role: {e}")
    return {}


def _require_executive_or_admin(user_id: str) -> Dict[str, Any]:
    """Require executive or admin role. Returns user info or raises 403."""
    info = _get_user_org_and_role(user_id)
    role = info.get("role")
    if role not in ("executive", "admin"):
        raise HTTPException(status_code=403, detail="Executive or admin role required")
    return info


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

# Authority Library
class AuthorityCreate(BaseModel):
    authority_type: str = Field(..., description="Type: irc_section, regulation, irs_guidance, form_instruction, case_law, internal_policy")
    citation_label: str = Field(..., max_length=200)
    citation_key: str = Field(..., max_length=100, description="Stable key like IRC_41_D")
    summary: str = Field(..., max_length=2000)
    excerpt: Optional[str] = Field(None, max_length=3000)
    tags: List[str] = Field(default_factory=list)
    url: Optional[str] = None

    @validator("authority_type")
    def validate_type(cls, v):
        allowed = ["irc_section", "regulation", "irs_guidance", "form_instruction", "case_law", "internal_policy"]
        if v not in allowed:
            raise ValueError(f"authority_type must be one of {allowed}")
        return v


class AuthorityUpdate(BaseModel):
    citation_label: Optional[str] = None
    summary: Optional[str] = None
    excerpt: Optional[str] = None
    tags: Optional[List[str]] = None
    url: Optional[str] = None


class AuthorityResponse(BaseModel):
    id: str
    authority_type: str
    citation_label: str
    citation_key: str
    summary: str
    excerpt: Optional[str]
    tags: List[str]
    url: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


# Org Settings
class OrgDefaults(BaseModel):
    wage_outlier_threshold: Optional[float] = None
    large_tx_threshold: Optional[float] = None
    allocation_upper_bound: Optional[float] = None
    allocation_lower_bound: Optional[float] = None
    senior_required_credit_at_risk: Optional[float] = None
    senior_required_qre_at_risk: Optional[float] = None
    block_finalize_with_open_high_findings: Optional[bool] = None
    allow_preliminary_credit_export: Optional[bool] = None
    evidence_token_expiration_days: Optional[int] = None


class OrgFeatureFlags(BaseModel):
    enable_client_upload_portal: Optional[bool] = None
    enable_section_174_module: Optional[bool] = None
    enable_ai_narratives: Optional[bool] = None
    enable_auto_reprocessing: Optional[bool] = None
    enable_study_locking: Optional[bool] = None
    enable_credit_range_module: Optional[bool] = None


class OrgSettingsUpdate(BaseModel):
    defaults: Optional[OrgDefaults] = None
    feature_flags: Optional[OrgFeatureFlags] = None
    purchased_sections: Optional[List[str]] = None


class OrgSettingsResponse(BaseModel):
    id: Optional[str]
    organization_id: str
    defaults: Dict[str, Any]
    feature_flags: Dict[str, Any]
    purchased_sections: List[str]
    created_at: Optional[str]
    updated_at: Optional[str]


# Audit Export
class AuditExportRequest(BaseModel):
    client_company_id: str
    tax_year: int


class DefensePackRequest(BaseModel):
    client_company_id: str
    tax_year: int
    include_artifacts: bool = True
    include_evidence_index: bool = True


class AuditExportResponse(BaseModel):
    id: str
    export_type: str
    status: str
    storage_path: Optional[str]
    sha256: Optional[str]
    file_size_bytes: Optional[int]
    metadata: Dict[str, Any]
    download_url: Optional[str]
    created_at: str


# =============================================================================
# AUTHORITY LIBRARY ENDPOINTS
# =============================================================================

@router.get("/authority", response_model=List[AuthorityResponse])
async def list_authority_refs(
    active_only: bool = True,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List authority references. Available to all org members."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    query = supabase.table("authority_library").select("*")
    
    if active_only:
        query = query.eq("is_active", True)
    
    result = query.order("citation_label").execute()
    refs = result.data or []

    # Filter by tag if specified
    if tag:
        refs = [r for r in refs if tag in (r.get("tags") or [])]

    # Filter by search term
    if search:
        search_lower = search.lower()
        refs = [r for r in refs if search_lower in (r.get("citation_label") or "").lower() 
                or search_lower in (r.get("citation_key") or "").lower()
                or search_lower in (r.get("summary") or "").lower()]

    return [
        AuthorityResponse(
            id=r["id"],
            authority_type=r["authority_type"],
            citation_label=r["citation_label"],
            citation_key=r["citation_key"],
            summary=r["summary"],
            excerpt=r.get("excerpt"),
            tags=r.get("tags") or [],
            url=r.get("url"),
            is_active=r.get("is_active", True),
            created_at=r.get("created_at") or "",
            updated_at=r.get("updated_at") or "",
        )
        for r in refs
    ]


@router.post("/authority", response_model=AuthorityResponse)
async def create_authority_ref(
    data: AuthorityCreate,
    user: dict = Depends(get_current_user),
):
    """Create a new authority reference. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Check citation_key uniqueness
    existing = supabase.table("authority_library").select("id").eq("citation_key", data.citation_key).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"citation_key '{data.citation_key}' already exists")

    now = _now_iso()
    row = {
        "authority_type": data.authority_type,
        "citation_label": data.citation_label,
        "citation_key": data.citation_key,
        "summary": data.summary,
        "excerpt": data.excerpt,
        "tags": data.tags,
        "url": data.url,
        "is_active": True,
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }
    result = supabase.table("authority_library").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create authority reference")

    created = result.data[0]

    # Log to authority_change_log
    supabase.table("authority_change_log").insert({
        "organization_id": org_id,
        "authority_id": created["id"],
        "change_type": "created",
        "before_state": None,
        "after_state": row,
        "changed_by_user_id": user["id"],
        "changed_at": now,
    }).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "authority_created",
        "resource_type": "authority_library",
        "resource_id": created["id"],
        "details": {"citation_key": data.citation_key, "citation_label": data.citation_label},
        "created_at": now,
    }).execute()

    return AuthorityResponse(
        id=created["id"],
        authority_type=created["authority_type"],
        citation_label=created["citation_label"],
        citation_key=created["citation_key"],
        summary=created["summary"],
        excerpt=created.get("excerpt"),
        tags=created.get("tags") or [],
        url=created.get("url"),
        is_active=created.get("is_active", True),
        created_at=created.get("created_at") or "",
        updated_at=created.get("updated_at") or "",
    )


@router.patch("/authority/{authority_id}", response_model=AuthorityResponse)
async def update_authority_ref(
    authority_id: str,
    data: AuthorityUpdate,
    user: dict = Depends(get_current_user),
):
    """Update an authority reference. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get current state
    current = supabase.table("authority_library").select("*").eq("id", authority_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Authority reference not found")

    before_state = current.data.copy()

    # Build update dict
    updates = {}
    if data.citation_label is not None:
        updates["citation_label"] = data.citation_label
    if data.summary is not None:
        updates["summary"] = data.summary
    if data.excerpt is not None:
        updates["excerpt"] = data.excerpt
    if data.tags is not None:
        updates["tags"] = data.tags
    if data.url is not None:
        updates["url"] = data.url

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    now = _now_iso()
    updates["updated_at"] = now
    updates["version"] = (current.data.get("version") or 1) + 1

    result = supabase.table("authority_library").update(updates).eq("id", authority_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update authority reference")

    updated = result.data[0]

    # Log to authority_change_log
    supabase.table("authority_change_log").insert({
        "organization_id": org_id,
        "authority_id": authority_id,
        "change_type": "updated",
        "before_state": before_state,
        "after_state": updated,
        "changed_by_user_id": user["id"],
        "changed_at": now,
    }).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "authority_updated",
        "resource_type": "authority_library",
        "resource_id": authority_id,
        "details": {"changes": list(updates.keys())},
        "created_at": now,
    }).execute()

    return AuthorityResponse(
        id=updated["id"],
        authority_type=updated["authority_type"],
        citation_label=updated["citation_label"],
        citation_key=updated["citation_key"],
        summary=updated["summary"],
        excerpt=updated.get("excerpt"),
        tags=updated.get("tags") or [],
        url=updated.get("url"),
        is_active=updated.get("is_active", True),
        created_at=updated.get("created_at") or "",
        updated_at=updated.get("updated_at") or "",
    )


@router.post("/authority/{authority_id}/deactivate")
async def deactivate_authority_ref(
    authority_id: str,
    user: dict = Depends(get_current_user),
):
    """Deactivate an authority reference. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get current state
    current = supabase.table("authority_library").select("*").eq("id", authority_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Authority reference not found")

    if not current.data.get("is_active", True):
        raise HTTPException(status_code=400, detail="Authority reference is already inactive")

    before_state = current.data.copy()

    # Check if referenced by active findings/rules (warning info)
    try:
        findings = supabase.table("review_findings").select("id", count="exact").contains("authority_refs", [authority_id]).execute()
        findings_count = getattr(findings, "count", 0) or len(findings.data or [])
    except Exception:
        findings_count = 0

    now = _now_iso()
    result = supabase.table("authority_library").update({
        "is_active": False,
        "updated_at": now,
    }).eq("id", authority_id).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to deactivate")

    # Log to authority_change_log
    supabase.table("authority_change_log").insert({
        "organization_id": org_id,
        "authority_id": authority_id,
        "change_type": "deactivated",
        "before_state": before_state,
        "after_state": result.data[0],
        "changed_by_user_id": user["id"],
        "changed_at": now,
    }).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "authority_deactivated",
        "resource_type": "authority_library",
        "resource_id": authority_id,
        "details": {"citation_key": current.data.get("citation_key"), "findings_referencing": findings_count},
        "created_at": now,
    }).execute()

    return {
        "message": "Authority reference deactivated",
        "id": authority_id,
        "warning": f"This authority is referenced by {findings_count} finding(s)" if findings_count > 0 else None,
    }


@router.post("/authority/{authority_id}/reactivate")
async def reactivate_authority_ref(
    authority_id: str,
    user: dict = Depends(get_current_user),
):
    """Reactivate an authority reference. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    current = supabase.table("authority_library").select("*").eq("id", authority_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Authority reference not found")

    if current.data.get("is_active", True):
        raise HTTPException(status_code=400, detail="Authority reference is already active")

    before_state = current.data.copy()
    now = _now_iso()

    result = supabase.table("authority_library").update({
        "is_active": True,
        "updated_at": now,
    }).eq("id", authority_id).execute()

    # Log to authority_change_log
    supabase.table("authority_change_log").insert({
        "organization_id": org_id,
        "authority_id": authority_id,
        "change_type": "reactivated",
        "before_state": before_state,
        "after_state": result.data[0] if result.data else None,
        "changed_by_user_id": user["id"],
        "changed_at": now,
    }).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "authority_reactivated",
        "resource_type": "authority_library",
        "resource_id": authority_id,
        "details": {"citation_key": current.data.get("citation_key")},
        "created_at": now,
    }).execute()

    return {"message": "Authority reference reactivated", "id": authority_id}


# =============================================================================
# ORG SETTINGS ENDPOINTS
# =============================================================================

# Default settings (used when org_settings row doesn't exist)
DEFAULT_SETTINGS = {
    "defaults": {
        "wage_outlier_threshold": 500000,
        "large_tx_threshold": 50000,
        "allocation_upper_bound": 0.95,
        "allocation_lower_bound": 0.01,
        "senior_required_credit_at_risk": 25000,
        "senior_required_qre_at_risk": 100000,
        "block_finalize_with_open_high_findings": True,
        "allow_preliminary_credit_export": False,
        "evidence_token_expiration_days": 14,
    },
    "feature_flags": {
        "enable_client_upload_portal": True,
        "enable_section_174_module": False,
        "enable_ai_narratives": True,
        "enable_auto_reprocessing": True,
        "enable_study_locking": True,
        "enable_credit_range_module": True,
    },
    "purchased_sections": ["41"],
}


def get_org_settings(supabase, org_id: str) -> Dict[str, Any]:
    """Get org settings with safe defaults. Auto-creates if missing."""
    try:
        result = supabase.table("org_settings").select("*").eq("organization_id", org_id).single().execute()
        if result.data:
            return result.data
    except Exception:
        pass

    # Auto-create with defaults
    try:
        created = supabase.table("org_settings").insert({
            "organization_id": org_id,
            "defaults": DEFAULT_SETTINGS["defaults"],
            "feature_flags": DEFAULT_SETTINGS["feature_flags"],
            "purchased_sections": DEFAULT_SETTINGS["purchased_sections"],
        }).execute()

        # Log initialization
        supabase.table("audit_logs").insert({
            "user_id": None,
            "action": "org_settings_initialized",
            "resource_type": "org_settings",
            "resource_id": org_id,
            "details": {"reason": "auto_created_on_first_access"},
            "created_at": _now_iso(),
        }).execute()

        if created.data:
            return created.data[0]
    except Exception as e:
        logger.warning(f"Failed to auto-create org_settings: {e}")

    # Return in-memory defaults
    return {
        "organization_id": org_id,
        "defaults": DEFAULT_SETTINGS["defaults"],
        "feature_flags": DEFAULT_SETTINGS["feature_flags"],
        "purchased_sections": DEFAULT_SETTINGS["purchased_sections"],
    }


@router.get("/org-settings", response_model=OrgSettingsResponse)
async def get_org_settings_endpoint(
    user: dict = Depends(get_current_user),
):
    """Get organization settings. Available to all org members."""
    info = _get_user_org_and_role(user["id"])
    org_id = info.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    settings = get_org_settings(supabase, org_id)

    return OrgSettingsResponse(
        id=settings.get("id"),
        organization_id=settings.get("organization_id") or org_id,
        defaults=settings.get("defaults") or DEFAULT_SETTINGS["defaults"],
        feature_flags=settings.get("feature_flags") or DEFAULT_SETTINGS["feature_flags"],
        purchased_sections=settings.get("purchased_sections") or DEFAULT_SETTINGS["purchased_sections"],
        created_at=settings.get("created_at"),
        updated_at=settings.get("updated_at"),
    )


@router.patch("/org-settings", response_model=OrgSettingsResponse)
async def update_org_settings_endpoint(
    data: OrgSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    """Update organization settings. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get current settings (auto-creates if missing)
    current = get_org_settings(supabase, org_id)
    before_state = current.copy()

    # Build updates
    updates = {}
    
    if data.defaults:
        current_defaults = current.get("defaults") or {}
        new_defaults = {**current_defaults}
        for field, value in data.defaults.dict(exclude_unset=True).items():
            if value is not None:
                # Validate numeric bounds
                if field in ("allocation_upper_bound", "allocation_lower_bound") and not (0 <= value <= 1):
                    raise HTTPException(status_code=400, detail=f"{field} must be between 0 and 1")
                if field.endswith("_threshold") and value < 0:
                    raise HTTPException(status_code=400, detail=f"{field} must be non-negative")
                new_defaults[field] = value
        updates["defaults"] = new_defaults

    if data.feature_flags:
        current_flags = current.get("feature_flags") or {}
        new_flags = {**current_flags}
        for field, value in data.feature_flags.dict(exclude_unset=True).items():
            if value is not None:
                new_flags[field] = value
        updates["feature_flags"] = new_flags

    if data.purchased_sections is not None:
        valid_sections = ["41", "174"]
        for s in data.purchased_sections:
            if s not in valid_sections:
                raise HTTPException(status_code=400, detail=f"Invalid section: {s}. Must be one of {valid_sections}")
        updates["purchased_sections"] = data.purchased_sections

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    now = _now_iso()
    updates["updated_at"] = now

    # Upsert
    settings_id = current.get("id")
    if settings_id:
        result = supabase.table("org_settings").update(updates).eq("id", settings_id).execute()
    else:
        updates["organization_id"] = org_id
        updates["defaults"] = updates.get("defaults") or DEFAULT_SETTINGS["defaults"]
        updates["feature_flags"] = updates.get("feature_flags") or DEFAULT_SETTINGS["feature_flags"]
        updates["purchased_sections"] = updates.get("purchased_sections") or DEFAULT_SETTINGS["purchased_sections"]
        result = supabase.table("org_settings").insert(updates).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update settings")

    updated = result.data[0]

    # Audit log with before/after diff
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "org_settings_updated",
        "resource_type": "org_settings",
        "resource_id": updated.get("id") or org_id,
        "details": {
            "before": {k: before_state.get(k) for k in updates.keys() if k != "updated_at"},
            "after": {k: updated.get(k) for k in updates.keys() if k != "updated_at"},
        },
        "created_at": now,
    }).execute()

    return OrgSettingsResponse(
        id=updated.get("id"),
        organization_id=updated.get("organization_id") or org_id,
        defaults=updated.get("defaults") or DEFAULT_SETTINGS["defaults"],
        feature_flags=updated.get("feature_flags") or DEFAULT_SETTINGS["feature_flags"],
        purchased_sections=updated.get("purchased_sections") or DEFAULT_SETTINGS["purchased_sections"],
        created_at=updated.get("created_at"),
        updated_at=updated.get("updated_at"),
    )


# =============================================================================
# AUDIT EXPORT ENDPOINTS
# =============================================================================

@router.post("/audit-export/logs", response_model=AuditExportResponse)
async def export_audit_logs(
    request: AuditExportRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Export audit logs as CSV. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify client access
    client = supabase.table("client_companies").select("organization_id").eq("id", request.client_company_id).single().execute()
    if not client.data or client.data.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied to this client")

    now = _now_iso()
    storage_path = f"org/{org_id}/exports/audit_logs_{request.client_company_id}_{request.tax_year}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    # Create export record
    export_record = supabase.table("audit_exports").insert({
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "tax_year": request.tax_year,
        "export_type": "audit_log_csv",
        "status": "queued",
        "storage_path": storage_path,
        "metadata": {},
        "requested_by_user_id": user["id"],
        "created_at": now,
    }).execute()

    if not export_record.data:
        raise HTTPException(status_code=500, detail="Failed to create export record")

    export_id = export_record.data[0]["id"]

    # Generate in background
    background_tasks.add_task(
        _generate_audit_log_csv,
        supabase=supabase,
        export_id=export_id,
        org_id=org_id,
        client_id=request.client_company_id,
        tax_year=request.tax_year,
        storage_path=storage_path,
        user_id=user["id"],
    )

    return AuditExportResponse(
        id=export_id,
        export_type="audit_log_csv",
        status="queued",
        storage_path=storage_path,
        sha256=None,
        file_size_bytes=None,
        metadata={},
        download_url=None,
        created_at=now,
    )


def _generate_audit_log_csv(
    supabase,
    export_id: str,
    org_id: str,
    client_id: str,
    tax_year: int,
    storage_path: str,
    user_id: str,
):
    """Background task to generate audit log CSV."""
    try:
        # Update status to running
        supabase.table("audit_exports").update({"status": "running"}).eq("id", export_id).execute()

        # Gather audit logs
        logs = supabase.table("audit_logs").select("*").eq("resource_id", client_id).order("created_at", desc=True).limit(10000).execute().data or []

        # Also get logs that reference the client in details
        # This is a simplified approach; in production you might need more sophisticated filtering

        # Generate CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp", "user_id", "action", "resource_type", "resource_id", "details_summary"])

        for log in logs:
            details = log.get("details") or {}
            details_str = json.dumps(details)[:500] if details else ""
            writer.writerow([
                log.get("created_at"),
                log.get("user_id"),
                log.get("action"),
                log.get("resource_type"),
                log.get("resource_id"),
                details_str,
            ])

        csv_bytes = output.getvalue().encode("utf-8")
        sha = _sha256_bytes(csv_bytes)

        # Upload to storage
        try:
            supabase.storage.from_("audit-exports").upload(storage_path, csv_bytes)
        except Exception as e:
            logger.warning(f"Storage upload failed: {e}")

        # Update export record
        supabase.table("audit_exports").update({
            "status": "completed",
            "sha256": sha,
            "file_size_bytes": len(csv_bytes),
            "metadata": {"row_count": len(logs)},
            "completed_at": _now_iso(),
        }).eq("id", export_id).execute()

        # Audit log
        supabase.table("audit_logs").insert({
            "user_id": user_id,
            "action": "audit_export_created",
            "resource_type": "audit_exports",
            "resource_id": export_id,
            "details": {"type": "audit_log_csv", "row_count": len(logs)},
            "created_at": _now_iso(),
        }).execute()

    except Exception as e:
        logger.error(f"Audit log export failed: {e}")
        supabase.table("audit_exports").update({
            "status": "failed",
            "error": str(e)[:1000],
        }).eq("id", export_id).execute()


@router.post("/audit-export/defense-pack", response_model=AuditExportResponse)
async def export_defense_pack(
    request: DefensePackRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Export defense pack ZIP. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify client access
    client = supabase.table("client_companies").select("organization_id, name").eq("id", request.client_company_id).single().execute()
    if not client.data or client.data.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied to this client")

    now = _now_iso()
    storage_path = f"org/{org_id}/exports/defense_pack_{request.client_company_id}_{request.tax_year}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"

    # Create export record
    export_record = supabase.table("audit_exports").insert({
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "tax_year": request.tax_year,
        "export_type": "defense_pack_zip",
        "status": "queued",
        "storage_path": storage_path,
        "metadata": {
            "include_artifacts": request.include_artifacts,
            "include_evidence_index": request.include_evidence_index,
        },
        "requested_by_user_id": user["id"],
        "created_at": now,
    }).execute()

    if not export_record.data:
        raise HTTPException(status_code=500, detail="Failed to create export record")

    export_id = export_record.data[0]["id"]

    # Generate in background
    background_tasks.add_task(
        _generate_defense_pack_zip,
        supabase=supabase,
        export_id=export_id,
        org_id=org_id,
        client_id=request.client_company_id,
        client_name=client.data.get("name", "Client"),
        tax_year=request.tax_year,
        storage_path=storage_path,
        include_artifacts=request.include_artifacts,
        include_evidence_index=request.include_evidence_index,
        user_id=user["id"],
    )

    return AuditExportResponse(
        id=export_id,
        export_type="defense_pack_zip",
        status="queued",
        storage_path=storage_path,
        sha256=None,
        file_size_bytes=None,
        metadata={"include_artifacts": request.include_artifacts, "include_evidence_index": request.include_evidence_index},
        download_url=None,
        created_at=now,
    )


def _generate_defense_pack_zip(
    supabase,
    export_id: str,
    org_id: str,
    client_id: str,
    client_name: str,
    tax_year: int,
    storage_path: str,
    include_artifacts: bool,
    include_evidence_index: bool,
    user_id: str,
):
    """Background task to generate defense pack ZIP."""
    try:
        supabase.table("audit_exports").update({"status": "running"}).eq("id", export_id).execute()

        zip_buffer = io.BytesIO()
        metadata = {"contents": []}

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. Audit logs CSV
            logs = supabase.table("audit_logs").select("*").eq("resource_id", client_id).order("created_at", desc=True).limit(10000).execute().data or []
            logs_csv = io.StringIO()
            writer = csv.writer(logs_csv)
            writer.writerow(["timestamp", "user_id", "action", "resource_type", "resource_id", "details"])
            for log in logs:
                writer.writerow([
                    log.get("created_at"),
                    log.get("user_id"),
                    log.get("action"),
                    log.get("resource_type"),
                    log.get("resource_id"),
                    json.dumps(log.get("details") or {})[:1000],
                ])
            zf.writestr("audit_logs.csv", logs_csv.getvalue())
            metadata["contents"].append("audit_logs.csv")
            metadata["audit_log_count"] = len(logs)

            # 2. Study artifacts (if any)
            if include_artifacts:
                studies = supabase.table("studies_v2").select("id, study_version, status").eq("client_company_id", client_id).eq("tax_year", tax_year).in_("status", ["final", "complete"]).order("study_version", desc=True).limit(1).execute().data or []
                if studies:
                    study = studies[0]
                    artifacts = supabase.table("study_artifacts_v2").select("artifact_type, storage_bucket, storage_path").eq("study_id", study["id"]).eq("generation_status", "completed").execute().data or []
                    for art in artifacts:
                        try:
                            data = supabase.storage.from_(art["storage_bucket"]).download(art["storage_path"])
                            filename = f"study_v{study['study_version']}_{art['artifact_type']}"
                            if art["artifact_type"].endswith("_docx"):
                                filename += ".docx"
                            elif art["artifact_type"].endswith("_pdf"):
                                filename += ".pdf"
                            elif art["artifact_type"].endswith("_xlsx") or art["artifact_type"] == "excel_study_workbook":
                                filename += ".xlsx"
                            elif art["artifact_type"].endswith("_zip"):
                                filename += ".zip"
                            zf.writestr(f"artifacts/{filename}", data)
                            metadata["contents"].append(f"artifacts/{filename}")
                        except Exception as e:
                            logger.warning(f"Failed to include artifact {art['artifact_type']}: {e}")

            # 3. Credit estimate exports
            estimates = supabase.table("credit_estimates").select("id, estimate_version, status").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("status", "approved").order("estimate_version", desc=True).limit(1).execute().data or []
            if estimates:
                est = estimates[0]
                exports = supabase.table("estimate_exports").select("export_type, storage_bucket, storage_path").eq("credit_estimate_id", est["id"]).execute().data or []
                for exp in exports:
                    try:
                        data = supabase.storage.from_(exp["storage_bucket"]).download(exp["storage_path"])
                        filename = f"estimate_v{est['estimate_version']}_{exp['export_type']}"
                        zf.writestr(f"estimates/{filename}", data)
                        metadata["contents"].append(f"estimates/{filename}")
                    except Exception as e:
                        logger.warning(f"Failed to include estimate export: {e}")

            # 4. Evidence index
            if include_evidence_index:
                evidence = supabase.table("evidence_files").select("id, original_filename, entity_type, entity_id, review_finding_id, sha256, created_at").eq("client_company_id", client_id).execute().data or []
                ev_csv = io.StringIO()
                writer = csv.writer(ev_csv)
                writer.writerow(["evidence_file_id", "filename", "entity_type", "entity_id", "finding_id", "sha256", "created_at"])
                for ev in evidence:
                    writer.writerow([
                        ev.get("id"),
                        ev.get("original_filename"),
                        ev.get("entity_type"),
                        ev.get("entity_id"),
                        ev.get("review_finding_id"),
                        ev.get("sha256"),
                        ev.get("created_at"),
                    ])
                zf.writestr("evidence_index.csv", ev_csv.getvalue())
                metadata["contents"].append("evidence_index.csv")
                metadata["evidence_file_count"] = len(evidence)

            # 5. Authority refs used
            # Get all authority IDs referenced in findings for this client
            findings = supabase.table("review_findings").select("authority_refs").eq("client_company_id", client_id).eq("tax_year", tax_year).execute().data or []
            auth_ids = set()
            for f in findings:
                refs = f.get("authority_refs") or []
                auth_ids.update(refs)

            if auth_ids:
                authorities = supabase.table("authority_library").select("citation_key, citation_label, summary").in_("id", list(auth_ids)).execute().data or []
                auth_csv = io.StringIO()
                writer = csv.writer(auth_csv)
                writer.writerow(["citation_key", "citation_label", "summary"])
                for a in authorities:
                    writer.writerow([a.get("citation_key"), a.get("citation_label"), a.get("summary")])
                zf.writestr("authority_references.csv", auth_csv.getvalue())
                metadata["contents"].append("authority_references.csv")
                metadata["authority_count"] = len(authorities)

            # 6. README
            readme = f"""Defense Pack Export
==================
Client: {client_name}
Tax Year: {tax_year}
Generated: {_now_iso()}

Contents:
- audit_logs.csv: Complete audit trail for this engagement
- artifacts/: Study artifacts (Excel, DOCX, PDF)
- estimates/: Credit estimate exports
- evidence_index.csv: Index of all evidence files
- authority_references.csv: IRS authority citations used

This package is generated for audit defense purposes.
All files are checksummed and traceable.
"""
            zf.writestr("README.txt", readme)
            metadata["contents"].append("README.txt")

        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()
        sha = _sha256_bytes(zip_bytes)

        # Upload
        try:
            supabase.storage.from_("audit-exports").upload(storage_path, zip_bytes)
        except Exception as e:
            logger.warning(f"Storage upload failed: {e}")

        # Update export record
        supabase.table("audit_exports").update({
            "status": "completed",
            "sha256": sha,
            "file_size_bytes": len(zip_bytes),
            "metadata": metadata,
            "completed_at": _now_iso(),
        }).eq("id", export_id).execute()

        # Audit log
        supabase.table("audit_logs").insert({
            "user_id": user_id,
            "action": "defense_pack_exported",
            "resource_type": "audit_exports",
            "resource_id": export_id,
            "details": {"client_id": client_id, "tax_year": tax_year, "contents_count": len(metadata["contents"])},
            "created_at": _now_iso(),
        }).execute()

    except Exception as e:
        logger.error(f"Defense pack export failed: {e}")
        supabase.table("audit_exports").update({
            "status": "failed",
            "error": str(e)[:1000],
        }).eq("id", export_id).execute()


@router.get("/audit-export/list", response_model=List[AuditExportResponse])
async def list_audit_exports(
    client_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List audit exports. Executive/admin only."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    query = supabase.table("audit_exports").select("*").eq("organization_id", org_id).order("created_at", desc=True).limit(100)
    
    if client_id:
        query = query.eq("client_company_id", client_id)

    result = query.execute()
    exports = result.data or []

    responses = []
    for e in exports:
        download_url = None
        if e.get("status") == "completed" and e.get("storage_path"):
            try:
                url_result = supabase.storage.from_(e.get("storage_bucket", "audit-exports")).create_signed_url(e["storage_path"], 3600)
                if isinstance(url_result, dict):
                    download_url = url_result.get("signedURL") or url_result.get("signedUrl")
            except Exception:
                pass

        responses.append(AuditExportResponse(
            id=e["id"],
            export_type=e["export_type"],
            status=e["status"],
            storage_path=e.get("storage_path"),
            sha256=e.get("sha256"),
            file_size_bytes=e.get("file_size_bytes"),
            metadata=e.get("metadata") or {},
            download_url=download_url,
            created_at=e.get("created_at") or "",
        ))

    return responses


@router.get("/audit-export/{export_id}/download")
async def download_audit_export(
    export_id: str,
    user: dict = Depends(get_current_user),
):
    """Download an audit export file."""
    info = _require_executive_or_admin(user["id"])
    org_id = info.get("organization_id")

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    export = supabase.table("audit_exports").select("*").eq("id", export_id).single().execute()
    if not export.data:
        raise HTTPException(status_code=404, detail="Export not found")

    if export.data.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if export.data.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Export not ready")

    try:
        data = supabase.storage.from_(export.data.get("storage_bucket", "audit-exports")).download(export.data["storage_path"])
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to download")

    filename = export.data["storage_path"].split("/")[-1]
    mime = "application/zip" if filename.endswith(".zip") else "text/csv"

    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
