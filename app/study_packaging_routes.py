"""
Study Packaging Routes (v2)

Endpoints for:
- GET /api/study/readiness - evaluate finalization readiness
- POST /api/study/finalize - start finalization
- GET /api/study/{study_id} - get study details + artifacts
- POST /api/study/{study_id}/retry-artifact - retry failed artifact
- POST /api/study/{study_id}/complete - mark study complete (senior-only)
- GET /api/study/{study_id}/download/{artifact_type} - download artifact
- POST /api/study/{study_id}/email-draft - generate delivery email draft
- POST /api/study/{study_id}/email-draft/mark-sent - mark email sent
- GET /api/study/list - list studies for a client
"""

import io
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.supabase_client import get_supabase, verify_supabase_token, get_user_profile
from app.study_packaging_service import (
    evaluate_study_readiness,
    generate_excel_study_workbook,
    generate_form_6765_export_xlsx,
    generate_section_41_narratives_docx,
    generate_section_174_docx_if_applicable,
    generate_cover_summary_pdf,
    generate_client_package_zip,
    create_signed_download_url,
    STUDY_ARTIFACT_BUCKET,
    REQUIRED_ARTIFACTS_BASE,
    _snapshot_metadata,
    _storage_base_path,
    _upsert_artifact_row,
    _sha256_bytes,
    _now_iso,
    _safe_filename,
    _get_latest_approved_credit_estimate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/study", tags=["study-packaging"])


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


def _is_senior_or_executive(user_id: str) -> bool:
    info = _get_user_org_and_role(user_id)
    role = info.get("role")
    role_level = info.get("role_level")
    if role == "executive":
        return True
    if role == "cpa" and role_level in ("senior", "director", "partner"):
        return True
    return False


def _verify_client_access(user_id: str, client_id: str) -> bool:
    supabase = get_supabase()
    if not supabase:
        return False
    try:
        u = supabase.table("profiles").select("organization_id").eq("id", user_id).single().execute()
        c = supabase.table("client_companies").select("organization_id").eq("id", client_id).single().execute()
        if u.data and c.data:
            return u.data.get("organization_id") == c.data.get("organization_id")
    except Exception:
        pass
    return False


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class ReadinessResponse(BaseModel):
    checks: List[Dict[str, Any]]
    blocking_count: int
    warning_count: int


class FinalizeRequest(BaseModel):
    client_company_id: str
    tax_year: int
    allow_overrides: bool = False
    override_reasons: List[Dict[str, str]] = Field(default_factory=list)


class ArtifactInfo(BaseModel):
    artifact_type: str
    generation_status: str
    mime_type: Optional[str] = None
    sha256: Optional[str] = None
    error: Optional[str] = None
    download_url: Optional[str] = None


class StudyResponse(BaseModel):
    id: str
    client_company_id: str
    tax_year: int
    study_version: int
    status: str
    finalized_by_user_id: Optional[str] = None
    finalized_at: Optional[str] = None
    locked_at: Optional[str] = None
    snapshot_metadata: Dict[str, Any] = Field(default_factory=dict)
    artifacts: List[ArtifactInfo] = Field(default_factory=list)
    signoffs: List[Dict[str, Any]] = Field(default_factory=list)


class CompleteRequest(BaseModel):
    reason_code: str
    note: str


class EmailDraftResponse(BaseModel):
    id: str
    to_email: Optional[str]
    subject: str
    body: str


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/readiness", response_model=ReadinessResponse)
async def get_readiness(
    client_id: str,
    tax_year: int,
    user: dict = Depends(get_current_user),
):
    """Evaluate finalization readiness for a client/year."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if not _verify_client_access(user["id"], client_id):
        raise HTTPException(status_code=403, detail="Access denied")

    info = _get_user_org_and_role(user["id"])
    org_id = info.get("organization_id")

    result = evaluate_study_readiness(supabase, org_id, client_id, tax_year, user["id"])
    return result


@router.post("/finalize")
async def finalize_study(
    request: FinalizeRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Start finalization. Creates study_v2 row and queues artifact generation."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if not _verify_client_access(user["id"], request.client_company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if not _is_senior_or_executive(user["id"]):
        raise HTTPException(status_code=403, detail="Senior+ role required to finalize")

    info = _get_user_org_and_role(user["id"])
    org_id = info.get("organization_id")

    # Evaluate readiness
    readiness = evaluate_study_readiness(supabase, org_id, request.client_company_id, request.tax_year, user["id"])
    if readiness["blocking_count"] > 0 and not request.allow_overrides:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Cannot finalize with blockers unless overrides are allowed",
                "blocking_count": readiness["blocking_count"],
                "blockers": [c for c in readiness["checks"] if c["blocking"] and c["status"] == "fail"],
            },
        )

    # If overriding, log each override
    if request.allow_overrides and readiness["blocking_count"] > 0:
        if not request.override_reasons:
            raise HTTPException(status_code=400, detail="override_reasons required when allow_overrides=true with blockers")
        for ovr in request.override_reasons:
            supabase.table("audit_logs").insert({
                "user_id": user["id"],
                "action": "study_finalization_override",
                "resource_type": "client_company",
                "resource_id": request.client_company_id,
                "details": {"tax_year": request.tax_year, "check_id": ovr.get("check_id"), "reason": ovr.get("reason")},
                "created_at": _now_iso(),
            }).execute()

    # Get next version
    ver_res = supabase.rpc("get_next_study_v2_version", {"p_client_company_id": request.client_company_id, "p_tax_year": request.tax_year}).execute()
    version = ver_res.data if ver_res.data else 1

    # Capture snapshot metadata
    snapshot = _snapshot_metadata(supabase, org_id, request.client_company_id, request.tax_year)

    # Get approved credit estimate
    approved_est = _get_latest_approved_credit_estimate(supabase, request.client_company_id, request.tax_year)

    # Create studies_v2 row
    study_data = {
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "tax_year": request.tax_year,
        "study_version": version,
        "status": "finalizing",
        "approved_credit_estimate_id": approved_est.get("id") if approved_est else None,
        "finalized_by_user_id": user["id"],
        "finalized_at": _now_iso(),
        "snapshot_metadata": snapshot,
    }
    study_result = supabase.table("studies_v2").insert(study_data).execute()
    if not study_result.data:
        raise HTTPException(status_code=500, detail="Failed to create study record")
    study_row = study_result.data[0]
    study_id = study_row["id"]

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "study_finalization_started",
        "resource_type": "studies_v2",
        "resource_id": study_id,
        "details": {"version": version, "blocking_count": readiness["blocking_count"], "warning_count": readiness["warning_count"]},
        "created_at": _now_iso(),
    }).execute()

    # Queue artifact generation in background
    background_tasks.add_task(
        _generate_all_artifacts,
        study_id=study_id,
        org_id=org_id,
        client_id=request.client_company_id,
        tax_year=request.tax_year,
        version=version,
        user_id=user["id"],
        readiness=readiness,
    )

    return {
        "study_id": study_id,
        "version": version,
        "status": "finalizing",
        "message": "Artifact generation started in background",
    }


def _generate_all_artifacts(
    study_id: str,
    org_id: str,
    client_id: str,
    tax_year: int,
    version: int,
    user_id: str,
    readiness: Dict[str, Any],
):
    """Background task to generate all artifacts."""
    supabase = get_supabase()
    if not supabase:
        logger.error("Cannot generate artifacts: no supabase")
        return

    base_path = _storage_base_path(org_id, client_id, tax_year, version)
    client_name = "Client"
    try:
        c = supabase.table("client_companies").select("name").eq("id", client_id).single().execute()
        client_name = c.data.get("name", "Client") if c.data else "Client"
    except Exception:
        pass
    safe_client = _safe_filename(client_name)

    approved_est = _get_latest_approved_credit_estimate(supabase, client_id, tax_year) or {}

    artifacts: Dict[str, Dict[str, Any]] = {}

    def do_artifact(artifact_type: str, generator_fn):
        storage_path = f"{base_path}/{artifact_type}"
        try:
            _upsert_artifact_row(
                supabase, study_id, artifact_type,
                status="running", storage_bucket=STUDY_ARTIFACT_BUCKET,
                storage_path=storage_path, mime_type="application/octet-stream",
                sha256="", page_count=None, metadata={}, created_by_user_id=user_id,
                started_at=_now_iso(),
            )
            data_bytes, meta = generator_fn()
            sha = _sha256_bytes(data_bytes)

            # Upload to storage
            try:
                supabase.storage.from_(STUDY_ARTIFACT_BUCKET).upload(storage_path, data_bytes)
            except Exception as upload_err:
                logger.warning(f"Storage upload for {artifact_type} failed: {upload_err}")

            mime_map = {
                "excel_study_workbook": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "form_6765_export": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "section_41_narratives_docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "section_174_narratives_docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "client_cover_summary_pdf": "application/pdf",
                "client_package_zip": "application/zip",
            }
            _upsert_artifact_row(
                supabase, study_id, artifact_type,
                status="completed", storage_bucket=STUDY_ARTIFACT_BUCKET,
                storage_path=storage_path, mime_type=mime_map.get(artifact_type, "application/octet-stream"),
                sha256=sha, page_count=meta.get("page_count"), metadata=meta,
                created_by_user_id=user_id, completed_at=_now_iso(),
            )
            artifacts[artifact_type] = {"storage_bucket": STUDY_ARTIFACT_BUCKET, "storage_path": storage_path}
            logger.info(f"Artifact {artifact_type} generated for study {study_id}")
        except Exception as e:
            logger.error(f"Artifact {artifact_type} failed: {e}")
            _upsert_artifact_row(
                supabase, study_id, artifact_type,
                status="failed", storage_bucket=STUDY_ARTIFACT_BUCKET,
                storage_path=storage_path, mime_type="", sha256="",
                page_count=None, metadata={}, created_by_user_id=user_id,
                error=str(e)[:1000], completed_at=_now_iso(),
            )

    # 1. Excel study workbook
    excel_bytes = b""
    def gen_excel():
        nonlocal excel_bytes
        wb_bytes, meta = generate_excel_study_workbook(supabase, org_id, client_id, tax_year)
        excel_bytes = wb_bytes
        return wb_bytes, meta
    do_artifact("excel_study_workbook", gen_excel)

    # 2. Form 6765 export
    def gen_6765():
        return generate_form_6765_export_xlsx(
            excel_workbook_bytes=excel_bytes,
            approved_credit_estimate=approved_est,
            client_name=client_name,
            tax_year=tax_year,
        )
    do_artifact("form_6765_export", gen_6765)

    # 3. Section 41 narratives
    def gen_41():
        return generate_section_41_narratives_docx(supabase, org_id=org_id, client_id=client_id, tax_year=tax_year, client_name=client_name)
    do_artifact("section_41_narratives_docx", gen_41)

    # 4. Section 174 narratives (if applicable)
    include_174 = False
    try:
        result_174 = generate_section_174_docx_if_applicable(supabase, client_id=client_id, client_name=client_name, tax_year=tax_year)
        if result_174:
            include_174 = True
            def gen_174():
                return result_174
            do_artifact("section_174_narratives_docx", gen_174)
    except Exception as e:
        logger.warning(f"Section 174 skipped or failed: {e}")

    # 5. Cover summary PDF
    def gen_cover():
        return generate_cover_summary_pdf(supabase, client_id=client_id, client_name=client_name, tax_year=tax_year, approved_credit_estimate=approved_est, readiness=readiness)
    do_artifact("client_cover_summary_pdf", gen_cover)

    # 6. Client package ZIP (must be last)
    study_row = supabase.table("studies_v2").select("*").eq("id", study_id).single().execute().data or {}
    def gen_zip():
        return generate_client_package_zip(supabase, study_row=study_row, artifacts=artifacts, include_section_174=include_174)
    do_artifact("client_package_zip", gen_zip)

    # Update study status to "final" (ready for completion)
    supabase.table("studies_v2").update({"status": "final", "updated_at": _now_iso()}).eq("id", study_id).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user_id,
        "action": "study_artifacts_generated",
        "resource_type": "studies_v2",
        "resource_id": study_id,
        "details": {"artifacts": list(artifacts.keys())},
        "created_at": _now_iso(),
    }).execute()


@router.get("/{study_id}", response_model=StudyResponse)
async def get_study(
    study_id: str,
    user: dict = Depends(get_current_user),
):
    """Get study details including artifacts and signoffs."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    s = study.data

    if not _verify_client_access(user["id"], s["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # Get artifacts
    arts = supabase.table("study_artifacts_v2").select("*").eq("study_id", study_id).execute().data or []

    # Generate signed URLs for completed artifacts
    artifact_list = []
    for a in arts:
        url = None
        if a.get("generation_status") == "completed":
            url = create_signed_download_url(supabase, a["storage_bucket"], a["storage_path"], expires_seconds=3600)
        artifact_list.append(ArtifactInfo(
            artifact_type=a["artifact_type"],
            generation_status=a["generation_status"],
            mime_type=a.get("mime_type"),
            sha256=a.get("sha256"),
            error=a.get("error"),
            download_url=url,
        ))

    # Get signoffs
    signoffs = supabase.table("study_signoffs").select("*").eq("study_id", study_id).order("decided_at", desc=True).execute().data or []

    return StudyResponse(
        id=s["id"],
        client_company_id=s["client_company_id"],
        tax_year=s["tax_year"],
        study_version=s["study_version"],
        status=s["status"],
        finalized_by_user_id=s.get("finalized_by_user_id"),
        finalized_at=s.get("finalized_at"),
        locked_at=s.get("locked_at"),
        snapshot_metadata=s.get("snapshot_metadata") or {},
        artifacts=artifact_list,
        signoffs=signoffs,
    )


@router.post("/{study_id}/retry-artifact")
async def retry_artifact(
    study_id: str,
    artifact_type: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Retry a failed artifact generation."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    s = study.data

    if not _verify_client_access(user["id"], s["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    if s["status"] == "complete":
        raise HTTPException(status_code=400, detail="Cannot retry artifacts on completed study")

    # Check artifact status
    art = supabase.table("study_artifacts_v2").select("*").eq("study_id", study_id).eq("artifact_type", artifact_type).single().execute()
    if not art.data:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if art.data.get("generation_status") != "failed":
        raise HTTPException(status_code=400, detail="Only failed artifacts can be retried")

    info = _get_user_org_and_role(user["id"])
    org_id = info.get("organization_id")

    # Re-run single artifact in background (simplified)
    background_tasks.add_task(
        _retry_single_artifact,
        study_id=study_id,
        artifact_type=artifact_type,
        org_id=org_id,
        client_id=s["client_company_id"],
        tax_year=s["tax_year"],
        version=s["study_version"],
        user_id=user["id"],
    )

    return {"message": f"Retry queued for {artifact_type}"}


def _retry_single_artifact(study_id: str, artifact_type: str, org_id: str, client_id: str, tax_year: int, version: int, user_id: str):
    """Retry a single artifact (simplified - would need full implementation)."""
    supabase = get_supabase()
    if not supabase:
        return
    # For now, just mark as queued and let background job pick it up
    _upsert_artifact_row(
        supabase, study_id, artifact_type,
        status="queued", storage_bucket=STUDY_ARTIFACT_BUCKET,
        storage_path=f"{_storage_base_path(org_id, client_id, tax_year, version)}/{artifact_type}",
        mime_type="", sha256="", page_count=None, metadata={},
        created_by_user_id=user_id, error=None,
    )
    logger.info(f"Artifact {artifact_type} marked for retry on study {study_id}")


@router.post("/{study_id}/complete")
async def complete_study(
    study_id: str,
    request: CompleteRequest,
    user: dict = Depends(get_current_user),
):
    """Mark study as complete (senior-only). Locks the study."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    s = study.data

    if not _verify_client_access(user["id"], s["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    if not _is_senior_or_executive(user["id"]):
        raise HTTPException(status_code=403, detail="Senior+ role required to complete study")

    if s["status"] == "complete":
        raise HTTPException(status_code=400, detail="Study is already complete")

    if s["status"] != "final":
        raise HTTPException(status_code=400, detail="Study must be in 'final' status (all artifacts generated) before completion")

    # Check all required artifacts are completed
    arts = supabase.table("study_artifacts_v2").select("artifact_type, generation_status").eq("study_id", study_id).execute().data or []
    completed_types = {a["artifact_type"] for a in arts if a["generation_status"] == "completed"}
    missing = [t for t in REQUIRED_ARTIFACTS_BASE if t not in completed_types]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required artifacts: {missing}")

    now = _now_iso()

    # Create signoff record
    supabase.table("study_signoffs").insert({
        "study_id": study_id,
        "decision": "approved",
        "reason_code": request.reason_code,
        "note": request.note,
        "completion_method": "senior_override",
        "decided_by_user_id": user["id"],
        "decided_at": now,
    }).execute()

    # Update study to complete and lock
    supabase.table("studies_v2").update({
        "status": "complete",
        "locked_at": now,
        "lock_reason": f"Study completed by senior signoff: {request.reason_code}",
        "updated_at": now,
    }).eq("id", study_id).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "study_completed",
        "resource_type": "studies_v2",
        "resource_id": study_id,
        "details": {"reason_code": request.reason_code, "note": request.note},
        "created_at": now,
    }).execute()

    return {"status": "complete", "locked_at": now}


@router.get("/{study_id}/download/{artifact_type}")
async def download_artifact(
    study_id: str,
    artifact_type: str,
    user: dict = Depends(get_current_user),
):
    """Download a specific artifact."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("client_company_id, tax_year, study_version").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    s = study.data

    if not _verify_client_access(user["id"], s["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    art = supabase.table("study_artifacts_v2").select("*").eq("study_id", study_id).eq("artifact_type", artifact_type).single().execute()
    if not art.data:
        raise HTTPException(status_code=404, detail="Artifact not found")

    if art.data.get("generation_status") != "completed":
        raise HTTPException(status_code=400, detail="Artifact not ready for download")

    try:
        data = supabase.storage.from_(art.data["storage_bucket"]).download(art.data["storage_path"])
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to download artifact")

    # Get client name for filename
    client_name = "Client"
    try:
        c = supabase.table("client_companies").select("name").eq("id", s["client_company_id"]).single().execute()
        client_name = c.data.get("name", "Client") if c.data else "Client"
    except Exception:
        pass

    ext_map = {
        "excel_study_workbook": ".xlsx",
        "form_6765_export": ".xlsx",
        "section_41_narratives_docx": ".docx",
        "section_174_narratives_docx": ".docx",
        "client_cover_summary_pdf": ".pdf",
        "client_package_zip": ".zip",
    }
    filename = f"{_safe_filename(client_name)}_{s['tax_year']}_v{s['study_version']}_{artifact_type}{ext_map.get(artifact_type, '')}"

    return StreamingResponse(
        io.BytesIO(data),
        media_type=art.data.get("mime_type", "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/{study_id}/email-draft", response_model=EmailDraftResponse)
async def generate_email_draft(
    study_id: str,
    user: dict = Depends(get_current_user),
):
    """Generate delivery email draft for client."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    s = study.data

    if not _verify_client_access(user["id"], s["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # Get client info
    client = supabase.table("client_companies").select("name, primary_contact_name, primary_contact_email").eq("id", s["client_company_id"]).single().execute()
    client_data = client.data or {}
    client_name = client_data.get("name", "Client")
    to_email = client_data.get("primary_contact_email")

    subject = f"R&D Tax Credit Study Package — {client_name} — Tax Year {s['tax_year']}"
    body = f"""Dear {client_data.get('primary_contact_name') or 'Team'},

Please find attached the R&D Tax Credit Study Package for {client_name} for Tax Year {s['tax_year']}.

The package includes:
- Final R&D Study Workbook (Excel)
- Form 6765 Computation Export
- Section 41 Project Narratives (Four-Part Test Documentation)
- Client Cover Summary (PDF)

Please review the materials and let us know if you have any questions.

Best regards,
[Your Name]
TaxScape Pro
"""

    draft = supabase.table("study_delivery_email_drafts").insert({
        "study_id": study_id,
        "to_email": to_email,
        "subject": subject,
        "body": body,
        "created_by_user_id": user["id"],
    }).execute()

    return EmailDraftResponse(
        id=draft.data[0]["id"],
        to_email=to_email,
        subject=subject,
        body=body,
    )


@router.post("/{study_id}/email-draft/mark-sent")
async def mark_email_sent(
    study_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark delivery email as sent."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    study = supabase.table("studies_v2").select("client_company_id").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")

    if not _verify_client_access(user["id"], study.data["client_company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # Update the most recent draft
    drafts = supabase.table("study_delivery_email_drafts").select("id").eq("study_id", study_id).order("created_at", desc=True).limit(1).execute()
    if not drafts.data:
        raise HTTPException(status_code=404, detail="No email draft found")

    now = _now_iso()
    supabase.table("study_delivery_email_drafts").update({"marked_sent_at": now}).eq("id", drafts.data[0]["id"]).execute()

    # Audit log
    supabase.table("audit_logs").insert({
        "user_id": user["id"],
        "action": "study_email_marked_sent",
        "resource_type": "studies_v2",
        "resource_id": study_id,
        "details": {},
        "created_at": now,
    }).execute()

    return {"message": "Email marked as sent", "marked_sent_at": now}


@router.get("/list")
async def list_studies(
    client_id: str,
    tax_year: Optional[int] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List studies for a client."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if not _verify_client_access(user["id"], client_id):
        raise HTTPException(status_code=403, detail="Access denied")

    query = supabase.table("studies_v2").select("*").eq("client_company_id", client_id).order("study_version", desc=True)
    if tax_year:
        query = query.eq("tax_year", tax_year)
    if status:
        query = query.eq("status", status)

    result = query.execute()
    return {"studies": result.data or []}
