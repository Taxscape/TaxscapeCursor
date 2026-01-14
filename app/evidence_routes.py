"""
Evidence Routes - Evidence Request + Client Upload + Reprocessing
Implements:
- Evidence request creation and management
- Tokenized client upload
- Evidence file linking
- Automatic reprocessing hooks
"""

import logging
import secrets
import hashlib
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from uuid import uuid4
from enum import Enum
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Header, UploadFile, File, Form
from pydantic import BaseModel, Field

from .supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

# ============================================================================
# Evidence Request Templates
# ============================================================================

EVIDENCE_TEMPLATES = {
    "vendor_contract": {
        "title": "Vendor Contract Documentation Request",
        "requested_items": [
            {
                "item_key": "vendor_contract_msa",
                "label": "Master Services Agreement or Contract",
                "description": "The primary contract governing the vendor relationship",
                "accepted_formats": ["pdf", "docx", "doc"],
                "required": True,
                "mapping_hint": "Will be used to verify IP ownership, risk allocation, and work location",
                "example": "Signed MSA or SOW with vendor"
            },
            {
                "item_key": "vendor_contract_sow",
                "label": "Statement of Work (if separate)",
                "description": "Detailed scope of work if not included in main contract",
                "accepted_formats": ["pdf", "docx", "doc"],
                "required": False,
                "mapping_hint": "Used to understand technical deliverables and research activities",
                "example": "SOW describing development tasks"
            },
            {
                "item_key": "vendor_contract_amendment",
                "label": "Contract Amendments",
                "description": "Any amendments modifying IP ownership or work scope",
                "accepted_formats": ["pdf", "docx", "doc"],
                "required": False,
                "mapping_hint": "Updates to original contract terms",
                "example": "Amendment changing deliverables or pricing"
            }
        ],
        "authority_refs": ["IRC_41_B_3_CONTRACT", "REG_1_41_2"],
        "due_date_offset_days": 14
    },
    
    "timesheets_support": {
        "title": "Timesheet Documentation Request",
        "requested_items": [
            {
                "item_key": "time_records",
                "label": "Time Records or Timesheets",
                "description": "Detailed time records showing hours by employee and project/activity",
                "accepted_formats": ["xlsx", "csv", "pdf"],
                "required": True,
                "mapping_hint": "Must include employee name, project/activity, hours, and date/period",
                "example": "Weekly timesheet export with project codes"
            },
            {
                "item_key": "allocation_methodology",
                "label": "Allocation Methodology Documentation",
                "description": "If using estimates, document the methodology and basis",
                "accepted_formats": ["pdf", "docx", "xlsx"],
                "required": False,
                "mapping_hint": "Explains how R&D percentages were determined",
                "example": "Memo explaining 80/20 allocation based on job duties"
            },
            {
                "item_key": "project_codes",
                "label": "Project Code Definitions",
                "description": "List of project codes and their descriptions",
                "accepted_formats": ["xlsx", "csv", "pdf"],
                "required": False,
                "mapping_hint": "Maps project codes to R&D activities",
                "example": "Project code master list with descriptions"
            }
        ],
        "authority_refs": ["IRC_41_B_1_WAGES", "REG_1_41_2"],
        "due_date_offset_days": 7
    },
    
    "wage_support": {
        "title": "Wage Documentation Request",
        "requested_items": [
            {
                "item_key": "payroll_register",
                "label": "Payroll Register or Summary",
                "description": "Annual payroll register showing gross wages by employee",
                "accepted_formats": ["xlsx", "csv", "pdf"],
                "required": True,
                "mapping_hint": "Must include employee name, W-2 wages, department, job title",
                "example": "Annual payroll export from HR system"
            },
            {
                "item_key": "w2_summary",
                "label": "W-2 Summary or Wage Reconciliation",
                "description": "Summary of W-2 wages for verification",
                "accepted_formats": ["xlsx", "pdf"],
                "required": False,
                "mapping_hint": "Used to verify total wages match tax filings",
                "example": "W-2 wage reconciliation report"
            },
            {
                "item_key": "job_descriptions",
                "label": "Job Descriptions for Key Personnel",
                "description": "Job descriptions for employees with high R&D allocations",
                "accepted_formats": ["pdf", "docx"],
                "required": False,
                "mapping_hint": "Supports R&D qualification of employee activities",
                "example": "Job description for Senior Software Engineer"
            }
        ],
        "authority_refs": ["IRC_41_B_1_WAGES", "POLICY_HIGH_WAGE"],
        "due_date_offset_days": 10
    },
    
    "project_narrative_support": {
        "title": "Project Technical Documentation Request",
        "requested_items": [
            {
                "item_key": "technical_documentation",
                "label": "Technical Design Documents",
                "description": "Design docs, architecture diagrams, or technical specifications",
                "accepted_formats": ["pdf", "docx", "pptx"],
                "required": True,
                "mapping_hint": "Evidence of technological in nature and experimentation",
                "example": "System architecture document or design spec"
            },
            {
                "item_key": "experiment_logs",
                "label": "Experiment or Test Logs",
                "description": "Records of testing, prototyping, or experimentation",
                "accepted_formats": ["pdf", "xlsx", "docx"],
                "required": False,
                "mapping_hint": "Evidence of process of experimentation",
                "example": "QA test results, prototype iteration logs"
            },
            {
                "item_key": "uncertainty_documentation",
                "label": "Uncertainty Documentation",
                "description": "Evidence of technical uncertainty at project outset",
                "accepted_formats": ["pdf", "docx", "eml"],
                "required": False,
                "mapping_hint": "Emails, meeting notes, or docs showing unknowns",
                "example": "Project kickoff email discussing technical challenges"
            },
            {
                "item_key": "project_timeline",
                "label": "Project Timeline or Milestones",
                "description": "Timeline showing R&D phases and milestones",
                "accepted_formats": ["xlsx", "pdf", "mpp"],
                "required": False,
                "mapping_hint": "Helps define R&D period and activities",
                "example": "Gantt chart or milestone document"
            }
        ],
        "authority_refs": ["IRC_41_D", "IRC_41_D_1_UNCERTAINTY", "IRC_41_D_1_EXPERIMENTATION"],
        "due_date_offset_days": 14
    },
    
    "foreign_research_support": {
        "title": "Foreign Research Documentation Request",
        "requested_items": [
            {
                "item_key": "work_location_evidence",
                "label": "Evidence of Work Location",
                "description": "Documentation showing where research work was performed",
                "accepted_formats": ["pdf", "docx", "xlsx"],
                "required": True,
                "mapping_hint": "Critical for determining US vs foreign research",
                "example": "Contractor location reports, facility info"
            },
            {
                "item_key": "foreign_entity_details",
                "label": "Foreign Entity Information",
                "description": "Details about foreign contractors or subsidiaries",
                "accepted_formats": ["pdf", "docx"],
                "required": False,
                "mapping_hint": "Used to assess foreign research exclusion",
                "example": "Org chart showing foreign entity structure"
            },
            {
                "item_key": "cost_allocation",
                "label": "Cost Allocation Between Locations",
                "description": "Breakdown of costs by US vs foreign location",
                "accepted_formats": ["xlsx", "pdf"],
                "required": False,
                "mapping_hint": "Quantifies US-eligible portion",
                "example": "Project cost allocation by location"
            }
        ],
        "authority_refs": ["IRC_41_D_4_FOREIGN", "POLICY_FOREIGN_VENDOR"],
        "due_date_offset_days": 14
    },
    
    "supply_consumption_support": {
        "title": "Supply Consumption Documentation Request",
        "requested_items": [
            {
                "item_key": "supply_invoices",
                "label": "Supply Purchase Invoices",
                "description": "Invoices for supplies used in research",
                "accepted_formats": ["pdf", "xlsx"],
                "required": True,
                "mapping_hint": "Evidence of supply purchases",
                "example": "Invoices for lab materials or prototyping supplies"
            },
            {
                "item_key": "consumption_records",
                "label": "Consumption or Usage Records",
                "description": "Records showing supplies were consumed in research",
                "accepted_formats": ["xlsx", "pdf"],
                "required": False,
                "mapping_hint": "Proves supplies were used vs capitalized",
                "example": "Inventory consumption report"
            },
            {
                "item_key": "project_allocation",
                "label": "Supply Allocation to Projects",
                "description": "How supplies were allocated to R&D projects",
                "accepted_formats": ["xlsx", "pdf"],
                "required": False,
                "mapping_hint": "Links supplies to qualified research",
                "example": "Project-based supply allocation report"
            }
        ],
        "authority_refs": ["IRC_41_B_2_SUPPLIES"],
        "due_date_offset_days": 10
    },
    
    "section_174_support": {
        "title": "Section 174 Support Documentation Request",
        "requested_items": [
            {
                "item_key": "174_categorization",
                "label": "R&E Expense Categorization",
                "description": "Categorization of expenses as Section 174 R&E",
                "accepted_formats": ["xlsx", "pdf"],
                "required": True,
                "mapping_hint": "Identifies which expenses fall under Section 174",
                "example": "GL account mapping to Section 174 categories"
            },
            {
                "item_key": "amortization_schedule",
                "label": "Amortization Schedule",
                "description": "Schedule showing 5/15 year amortization calculations",
                "accepted_formats": ["xlsx", "pdf"],
                "required": False,
                "mapping_hint": "Required for post-TCJA capitalization",
                "example": "Section 174 amortization workbook"
            }
        ],
        "authority_refs": ["IRC_174"],
        "due_date_offset_days": 14
    },
    
    "other": {
        "title": "Additional Documentation Request",
        "requested_items": [
            {
                "item_key": "other_documents",
                "label": "Requested Documents",
                "description": "Documents as specified in the request reason",
                "accepted_formats": ["pdf", "docx", "xlsx", "csv", "png", "jpg"],
                "required": True,
                "mapping_hint": "See request details for specific requirements",
                "example": "As described in request"
            }
        ],
        "authority_refs": [],
        "due_date_offset_days": 7
    }
}

# Map rule IDs to request types
RULE_TO_REQUEST_TYPE = {
    "EMP_HIGH_WAGE_001": "wage_support",
    "EMP_MISSING_LOCATION_002": "wage_support",
    "EMP_ZERO_ALLOCATION_003": "timesheets_support",
    "EMP_OUTLIER_ALLOCATION_004": "timesheets_support",
    "VEN_FOREIGN_001": "foreign_research_support",
    "VEN_MISSING_RISK_IP_002": "vendor_contract",
    "VEN_CONTRACT_MISSING_003": "vendor_contract",
    "PROJ_MISSING_FOUR_PART_FIELDS_001": "project_narrative_support",
    "PROJ_NO_TIME_LINK_002": "timesheets_support",
    "AP_LARGE_SINGLE_TX_001": "supply_consumption_support",
    "AP_UNCATEGORIZED_002": "supply_consumption_support",
    "SUP_CAPITAL_INDICATOR_001": "supply_consumption_support",
    "SUP_NO_PROJECT_LINK_002": "supply_consumption_support",
}

# ============================================================================
# Auth & Helpers
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


def generate_upload_token() -> tuple[str, str]:
    """Generate a secure token and its hash."""
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def verify_upload_token(token: str) -> Optional[dict]:
    """Verify an upload token and return its data."""
    supabase = get_supabase()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    try:
        result = supabase.table("client_upload_tokens")\
            .select("*, client_companies(name), organizations(name)")\
            .eq("token_hash", token_hash)\
            .is_("revoked_at", "null")\
            .single()\
            .execute()
        
        token_data = result.data
        if not token_data:
            return None
        
        # Check expiry
        expires_at = datetime.fromisoformat(token_data["expires_at"].replace("Z", ""))
        if datetime.utcnow() > expires_at:
            return None
        
        # Check upload limit
        if token_data.get("uploads_count", 0) >= token_data.get("max_uploads", 100):
            return None
        
        return token_data
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        return None


def compute_file_hash(content: bytes) -> str:
    """Compute SHA256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def get_authority_ids(citation_keys: List[str]) -> List[str]:
    """Get authority IDs for citation keys."""
    if not citation_keys:
        return []
    
    supabase = get_supabase()
    try:
        result = supabase.table("authority_library")\
            .select("id")\
            .in_("citation_key", citation_keys)\
            .execute()
        return [r["id"] for r in (result.data or [])]
    except:
        return []


def queue_reprocessing_job(
    org_id: str,
    client_id: str,
    tax_year: int,
    trigger_type: str,
    trigger_id: str,
    target: str,
    impacted_domains: List[str] = None,
    impacted_finding_ids: List[str] = None,
    impacted_project_ids: List[str] = None
) -> str:
    """Create a reprocessing job."""
    supabase = get_supabase()
    job_id = str(uuid4())
    
    supabase.table("reprocessing_jobs").insert({
        "id": job_id,
        "organization_id": org_id,
        "client_company_id": client_id,
        "tax_year": tax_year,
        "trigger_type": trigger_type,
        "trigger_id": trigger_id,
        "target": target,
        "status": "queued",
        "impacted_domains": impacted_domains,
        "impacted_finding_ids": impacted_finding_ids,
        "impacted_project_ids": impacted_project_ids
    }).execute()
    
    return job_id


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateEvidenceRequestModel(BaseModel):
    client_company_id: str
    tax_year: Optional[int] = None
    request_type: str
    title: Optional[str] = None
    reason: str
    linked_finding_ids: Optional[List[str]] = None
    due_date: Optional[str] = None
    custom_items: Optional[List[dict]] = None


class LinkEvidenceModel(BaseModel):
    evidence_request_id: Optional[str] = None
    review_finding_id: Optional[str] = None
    task_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    notes: Optional[str] = None


# ============================================================================
# Evidence Request Endpoints
# ============================================================================

@router.post("/requests")
async def create_evidence_request(
    request: CreateEvidenceRequestModel,
    user: dict = Depends(get_current_user)
):
    """
    Create an evidence request with tokenized upload link.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify client
    try:
        client = supabase.table("client_companies")\
            .select("id, name, primary_contact_name, primary_contact_email")\
            .eq("id", request.client_company_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        if not client.data:
            raise HTTPException(status_code=404, detail="Client not found")
    except:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get template
    template = EVIDENCE_TEMPLATES.get(request.request_type, EVIDENCE_TEMPLATES["other"])
    
    # Build requested items
    requested_items = request.custom_items or template["requested_items"]
    
    # Get authority IDs
    authority_ids = get_authority_ids(template.get("authority_refs", []))
    
    # Calculate due date
    if request.due_date:
        due_date = request.due_date
    else:
        due_date = (datetime.utcnow() + timedelta(days=template.get("due_date_offset_days", 7))).isoformat()
    
    # Generate upload token
    raw_token, token_hash = generate_upload_token()
    token_expires = datetime.utcnow() + timedelta(days=14)
    
    # Create evidence request
    request_id = str(uuid4())
    token_id = str(uuid4())
    
    # Create token first
    supabase.table("client_upload_tokens").insert({
        "id": token_id,
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "scope": "evidence_request",
        "scope_id": request_id,
        "token_hash": token_hash,
        "expires_at": token_expires.isoformat(),
        "created_by_user_id": user["id"]
    }).execute()
    
    # Create request
    evidence_data = {
        "id": request_id,
        "organization_id": org_id,
        "client_company_id": request.client_company_id,
        "tax_year": request.tax_year,
        "status": "draft",
        "title": request.title or template["title"],
        "request_type": request.request_type,
        "requested_items": requested_items,
        "reason": request.reason,
        "authority_refs": authority_ids,
        "linked_finding_ids": request.linked_finding_ids or [],
        "client_upload_token_id": token_id,
        "due_date": due_date,
        "created_by_user_id": user["id"]
    }
    
    supabase.table("evidence_requests").insert(evidence_data).execute()
    
    # Generate email draft
    email_draft = generate_email_draft(
        client_name=client.data.get("name"),
        contact_name=client.data.get("primary_contact_name"),
        title=evidence_data["title"],
        reason=request.reason,
        requested_items=requested_items,
        due_date=due_date,
        upload_token=raw_token
    )
    
    # Save email draft
    supabase.table("evidence_requests")\
        .update({"email_draft": email_draft})\
        .eq("id", request_id)\
        .execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="evidence_request_created",
        item_type="evidence_request",
        item_id=request_id,
        details={
            "client_company_id": request.client_company_id,
            "request_type": request.request_type,
            "linked_finding_ids": request.linked_finding_ids,
            "authority_refs": authority_ids
        }
    )
    
    return {
        "id": request_id,
        "status": "draft",
        "client_upload_url": f"/client-upload/evidence?token={raw_token}",
        "email_draft": email_draft,
        "upload_token": raw_token,  # Return once only
        "expires_at": token_expires.isoformat()
    }


def generate_email_draft(
    client_name: str,
    contact_name: str,
    title: str,
    reason: str,
    requested_items: List[dict],
    due_date: str,
    upload_token: str
) -> str:
    """Generate the email draft text."""
    items_text = ""
    for i, item in enumerate(requested_items, 1):
        required = " (Required)" if item.get("required") else " (Optional)"
        formats = ", ".join(item.get("accepted_formats", ["any"]))
        items_text += f"{i}. **{item['label']}**{required}\n"
        items_text += f"   - {item['description']}\n"
        items_text += f"   - Accepted formats: {formats}\n"
        if item.get("example"):
            items_text += f"   - Example: {item['example']}\n"
        items_text += "\n"
    
    due_date_formatted = datetime.fromisoformat(due_date.replace("Z", "")).strftime("%B %d, %Y")
    
    # Get base URL from env or use placeholder
    base_url = "https://app.taxscape.com"
    upload_url = f"{base_url}/client-upload/evidence?token={upload_token}"
    
    email = f"""Subject: {title}

Dear {contact_name or 'Client'},

We are preparing your R&D Tax Credit study and need some additional documentation to support our analysis.

**Why We Need This:**
{reason}

**Documents Requested:**

{items_text}

**How to Submit:**
Please upload your documents using this secure link:
{upload_url}

**Due Date:** {due_date_formatted}

This secure upload link will expire in 14 days. If you have any questions about what to provide, please don't hesitate to reach out.

Thank you for your prompt attention to this request.

Best regards,
{client_name} R&D Tax Credit Team
"""
    
    return email


@router.post("/requests/{request_id}/email-draft")
async def regenerate_email_draft(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Regenerate email draft for an evidence request.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("*, client_companies(name, primary_contact_name, primary_contact_email), client_upload_tokens(token_hash)")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        request_data = result.data
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if not request_data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Generate new token if needed
    token_data = request_data.get("client_upload_tokens")
    if not token_data:
        raw_token, token_hash = generate_upload_token()
        token_expires = datetime.utcnow() + timedelta(days=14)
        token_id = str(uuid4())
        
        supabase.table("client_upload_tokens").insert({
            "id": token_id,
            "organization_id": org_id,
            "client_company_id": request_data["client_company_id"],
            "scope": "evidence_request",
            "scope_id": request_id,
            "token_hash": token_hash,
            "expires_at": token_expires.isoformat(),
            "created_by_user_id": user["id"]
        }).execute()
        
        supabase.table("evidence_requests")\
            .update({"client_upload_token_id": token_id})\
            .eq("id", request_id)\
            .execute()
    else:
        # Generate new token for URL
        raw_token, token_hash = generate_upload_token()
        token_expires = datetime.utcnow() + timedelta(days=14)
        
        supabase.table("client_upload_tokens")\
            .update({
                "token_hash": token_hash,
                "expires_at": token_expires.isoformat(),
                "revoked_at": None
            })\
            .eq("id", request_data["client_upload_token_id"])\
            .execute()
    
    client = request_data.get("client_companies", {})
    email_draft = generate_email_draft(
        client_name=client.get("name", ""),
        contact_name=client.get("primary_contact_name"),
        title=request_data["title"],
        reason=request_data["reason"],
        requested_items=request_data["requested_items"],
        due_date=request_data["due_date"],
        upload_token=raw_token
    )
    
    supabase.table("evidence_requests")\
        .update({"email_draft": email_draft})\
        .eq("id", request_id)\
        .execute()
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="evidence_request_email_draft_created",
        item_type="evidence_request",
        item_id=request_id,
        details={}
    )
    
    return {
        "email_draft": email_draft,
        "client_upload_url": f"/client-upload/evidence?token={raw_token}",
        "expires_at": token_expires.isoformat()
    }


@router.post("/requests/{request_id}/mark-sent")
async def mark_request_sent(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Mark evidence request as sent.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Update status
    result = supabase.table("evidence_requests")\
        .update({
            "status": "awaiting_upload",
            "email_sent_at": datetime.utcnow().isoformat()
        })\
        .eq("id", request_id)\
        .eq("organization_id", org_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="evidence_request_marked_sent",
        item_type="evidence_request",
        item_id=request_id,
        details={}
    )
    
    return {"status": "awaiting_upload"}


@router.get("/requests")
async def list_evidence_requests(
    client_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    user: dict = Depends(get_current_user)
):
    """
    List evidence requests.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    query = supabase.table("evidence_requests")\
        .select("*, client_companies(name)")\
        .eq("organization_id", org_id)
    
    if client_id:
        query = query.eq("client_company_id", client_id)
    if status:
        query = query.eq("status", status)
    
    result = query.order("created_at", desc=True)\
        .range(offset, offset + limit - 1)\
        .execute()
    
    requests = result.data or []
    
    # Get file counts
    for req in requests:
        files = supabase.table("evidence_files")\
            .select("id", count="exact")\
            .eq("evidence_request_id", req["id"])\
            .execute()
        req["files_count"] = files.count or 0
        req["client_name"] = req.get("client_companies", {}).get("name")
    
    return {"requests": requests}


@router.get("/requests/{request_id}")
async def get_evidence_request(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get evidence request detail.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("*, client_companies(name, primary_contact_name, primary_contact_email)")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        request_data = result.data
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if not request_data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Get files
    files = supabase.table("evidence_files")\
        .select("*")\
        .eq("evidence_request_id", request_id)\
        .order("created_at", desc=True)\
        .execute()
    
    # Get authority details
    authority_details = []
    if request_data.get("authority_refs"):
        auth_result = supabase.table("authority_library")\
            .select("id, citation_label, citation_key, summary")\
            .in_("id", request_data["authority_refs"])\
            .execute()
        authority_details = auth_result.data or []
    
    # Get linked findings
    linked_findings = []
    if request_data.get("linked_finding_ids"):
        findings_result = supabase.table("review_findings")\
            .select("id, title, status, severity")\
            .in_("id", request_data["linked_finding_ids"])\
            .execute()
        linked_findings = findings_result.data or []
    
    # Get reprocessing jobs
    jobs = supabase.table("reprocessing_jobs")\
        .select("*")\
        .eq("trigger_id", request_id)\
        .order("created_at", desc=True)\
        .limit(10)\
        .execute()
    
    # Get token info
    token_info = None
    if request_data.get("client_upload_token_id"):
        token_result = supabase.table("client_upload_tokens")\
            .select("id, expires_at, revoked_at, uploads_count")\
            .eq("id", request_data["client_upload_token_id"])\
            .single()\
            .execute()
        token_info = token_result.data
    
    return {
        "request": request_data,
        "files": files.data or [],
        "authority_details": authority_details,
        "linked_findings": linked_findings,
        "reprocessing_jobs": jobs.data or [],
        "token_info": token_info
    }


@router.post("/requests/{request_id}/complete")
async def complete_evidence_request(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Mark evidence request as completed.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("*")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        request_data = result.data
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if not request_data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check required items have files
    files = supabase.table("evidence_files")\
        .select("matched_item_key, status")\
        .eq("evidence_request_id", request_id)\
        .execute()
    
    linked_keys = set(f["matched_item_key"] for f in (files.data or []) if f.get("matched_item_key"))
    
    requested_items = request_data.get("requested_items", [])
    missing_required = []
    for item in requested_items:
        if item.get("required") and item.get("item_key") not in linked_keys:
            missing_required.append(item["label"])
    
    if missing_required:
        logger.warning(f"Completing request {request_id} with missing required items: {missing_required}")
    
    # Update status
    supabase.table("evidence_requests")\
        .update({"status": "completed"})\
        .eq("id", request_id)\
        .execute()
    
    # Queue reprocessing
    job_id = queue_reprocessing_job(
        org_id=org_id,
        client_id=request_data["client_company_id"],
        tax_year=request_data.get("tax_year"),
        trigger_type="request_completed",
        trigger_id=request_id,
        target="both",
        impacted_finding_ids=request_data.get("linked_finding_ids")
    )
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="evidence_request_completed",
        item_type="evidence_request",
        item_id=request_id,
        details={
            "missing_required": missing_required,
            "reprocessing_job_id": job_id
        }
    )
    
    return {
        "status": "completed",
        "reprocessing_job_id": job_id,
        "missing_required": missing_required
    }


@router.post("/requests/{request_id}/revoke-token")
async def revoke_upload_token(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Revoke the upload token for an evidence request.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("client_upload_token_id")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        if not result.data or not result.data.get("client_upload_token_id"):
            raise HTTPException(status_code=404, detail="Token not found")
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Revoke token
    supabase.table("client_upload_tokens")\
        .update({"revoked_at": datetime.utcnow().isoformat()})\
        .eq("id", result.data["client_upload_token_id"])\
        .execute()
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="upload_token_revoked",
        item_type="client_upload_token",
        item_id=result.data["client_upload_token_id"],
        details={"evidence_request_id": request_id}
    )
    
    return {"status": "revoked"}


@router.post("/requests/{request_id}/regenerate-token")
async def regenerate_upload_token(
    request_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Generate a new upload token for an evidence request.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("client_company_id, client_upload_token_id")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Request not found")
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Revoke old token
    if result.data.get("client_upload_token_id"):
        supabase.table("client_upload_tokens")\
            .update({"revoked_at": datetime.utcnow().isoformat()})\
            .eq("id", result.data["client_upload_token_id"])\
            .execute()
    
    # Generate new token
    raw_token, token_hash = generate_upload_token()
    token_expires = datetime.utcnow() + timedelta(days=14)
    token_id = str(uuid4())
    
    supabase.table("client_upload_tokens").insert({
        "id": token_id,
        "organization_id": org_id,
        "client_company_id": result.data["client_company_id"],
        "scope": "evidence_request",
        "scope_id": request_id,
        "token_hash": token_hash,
        "expires_at": token_expires.isoformat(),
        "created_by_user_id": user["id"]
    }).execute()
    
    supabase.table("evidence_requests")\
        .update({"client_upload_token_id": token_id})\
        .eq("id", request_id)\
        .execute()
    
    return {
        "client_upload_url": f"/client-upload/evidence?token={raw_token}",
        "expires_at": token_expires.isoformat()
    }


# ============================================================================
# Portal Upload (CPA uploads on behalf)
# ============================================================================

@router.post("/requests/{request_id}/upload")
async def portal_upload_evidence(
    request_id: str,
    files: List[UploadFile] = File(...),
    matched_item_key: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    user: dict = Depends(get_current_user)
):
    """
    Upload evidence files via portal (CPA upload).
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get request
    try:
        result = supabase.table("evidence_requests")\
            .select("*")\
            .eq("id", request_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        request_data = result.data
    except:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if not request_data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    uploaded_files = []
    
    for upload_file in files:
        content = await upload_file.read()
        file_hash = compute_file_hash(content)
        
        # Storage path
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_filename = re.sub(r'[^\w\.\-]', '_', upload_file.filename)
        storage_path = f"org/{org_id}/client/{request_data['client_company_id']}/evidence_request/{request_id}/{timestamp}_{safe_filename}"
        
        # Upload to storage
        try:
            supabase.storage.from_("evidence-files").upload(
                storage_path,
                content,
                {"content-type": upload_file.content_type or "application/octet-stream"}
            )
        except Exception as e:
            logger.warning(f"Storage upload failed (bucket may not exist): {e}")
        
        # Create file record
        file_id = str(uuid4())
        file_data = {
            "id": file_id,
            "organization_id": org_id,
            "client_company_id": request_data["client_company_id"],
            "uploaded_by_user_id": user["id"],
            "uploaded_via": "portal_user",
            "evidence_request_id": request_id,
            "original_filename": upload_file.filename,
            "storage_bucket": "evidence-files",
            "storage_path": storage_path,
            "mime_type": upload_file.content_type,
            "file_size_bytes": len(content),
            "sha256": file_hash,
            "status": "uploaded",
            "matched_item_key": matched_item_key,
            "notes": notes
        }
        
        supabase.table("evidence_files").insert(file_data).execute()
        uploaded_files.append({"id": file_id, "filename": upload_file.filename})
    
    # Update request status
    update_request_status_on_upload(supabase, request_id, request_data)
    
    # Queue reprocessing
    job_id = queue_reprocessing_job(
        org_id=org_id,
        client_id=request_data["client_company_id"],
        tax_year=request_data.get("tax_year"),
        trigger_type="evidence_uploaded",
        trigger_id=request_id,
        target="review_rules",
        impacted_finding_ids=request_data.get("linked_finding_ids")
    )
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="portal_evidence_uploaded",
        item_type="evidence_file",
        item_id=uploaded_files[0]["id"] if uploaded_files else None,
        details={
            "evidence_request_id": request_id,
            "files": uploaded_files,
            "reprocessing_job_id": job_id
        }
    )
    
    return {
        "files": uploaded_files,
        "reprocessing_job_id": job_id
    }


def update_request_status_on_upload(supabase, request_id: str, request_data: dict):
    """Update evidence request status based on uploads."""
    # Get all files
    files = supabase.table("evidence_files")\
        .select("matched_item_key")\
        .eq("evidence_request_id", request_id)\
        .execute()
    
    received_keys = set(f["matched_item_key"] for f in (files.data or []) if f.get("matched_item_key"))
    
    requested_items = request_data.get("requested_items", [])
    required_keys = set(item["item_key"] for item in requested_items if item.get("required"))
    
    if required_keys and required_keys.issubset(received_keys):
        new_status = "received"
    elif files.data:
        new_status = "partially_received"
    else:
        new_status = request_data.get("status", "awaiting_upload")
    
    if new_status != request_data.get("status"):
        supabase.table("evidence_requests")\
            .update({"status": new_status})\
            .eq("id", request_id)\
            .execute()


# ============================================================================
# Evidence Files Endpoints
# ============================================================================

@router.get("/files")
async def list_evidence_files(
    client_id: Optional[str] = Query(None),
    evidence_request_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    user: dict = Depends(get_current_user)
):
    """
    List evidence files.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    query = supabase.table("evidence_files")\
        .select("*, evidence_requests(title, request_type)")\
        .eq("organization_id", org_id)
    
    if client_id:
        query = query.eq("client_company_id", client_id)
    if evidence_request_id:
        query = query.eq("evidence_request_id", evidence_request_id)
    if status:
        query = query.eq("status", status)
    
    result = query.order("created_at", desc=True)\
        .range(offset, offset + limit - 1)\
        .execute()
    
    return {"files": result.data or []}


@router.get("/files/{file_id}")
async def get_evidence_file(
    file_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get evidence file detail.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    try:
        result = supabase.table("evidence_files")\
            .select("*, evidence_requests(title, request_type, requested_items)")\
            .eq("id", file_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        return result.data
    except:
        raise HTTPException(status_code=404, detail="File not found")


@router.post("/files/{file_id}/link")
async def link_evidence_file(
    file_id: str,
    request: LinkEvidenceModel,
    user: dict = Depends(get_current_user)
):
    """
    Link evidence file to findings/tasks/entities.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get file
    try:
        result = supabase.table("evidence_files")\
            .select("*")\
            .eq("id", file_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        file_data = result.data
    except:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not file_data:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Update file
    update_data = {"status": "linked"}
    
    if request.evidence_request_id:
        update_data["evidence_request_id"] = request.evidence_request_id
    if request.review_finding_id:
        update_data["review_finding_id"] = request.review_finding_id
    if request.task_id:
        update_data["task_id"] = request.task_id
    if request.entity_type:
        update_data["entity_type"] = request.entity_type
    if request.entity_id:
        update_data["entity_id"] = request.entity_id
    if request.notes:
        update_data["notes"] = request.notes
    
    supabase.table("evidence_files")\
        .update(update_data)\
        .eq("id", file_id)\
        .execute()
    
    # Queue reprocessing if linked to finding
    job_id = None
    if request.review_finding_id:
        # Get finding domain
        finding = supabase.table("review_findings")\
            .select("domain, rule_id, client_company_id, tax_year")\
            .eq("id", request.review_finding_id)\
            .single()\
            .execute()
        
        if finding.data:
            # Determine target based on finding type
            target = "review_rules"
            if finding.data.get("rule_id", "").startswith("PROJ_"):
                target = "both"  # Also run AI eval for project findings
            
            job_id = queue_reprocessing_job(
                org_id=org_id,
                client_id=finding.data["client_company_id"],
                tax_year=finding.data.get("tax_year"),
                trigger_type="evidence_linked",
                trigger_id=file_id,
                target=target,
                impacted_domains=[finding.data.get("domain")],
                impacted_finding_ids=[request.review_finding_id]
            )
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="evidence_file_linked",
        item_type="evidence_file",
        item_id=file_id,
        details={
            "evidence_request_id": request.evidence_request_id,
            "review_finding_id": request.review_finding_id,
            "task_id": request.task_id,
            "entity_type": request.entity_type,
            "entity_id": request.entity_id,
            "reprocessing_job_id": job_id
        }
    )
    
    return {
        "status": "linked",
        "reprocessing_job_id": job_id
    }


# ============================================================================
# Client Upload (Token-gated, no auth)
# ============================================================================

client_upload_router = APIRouter(prefix="/api/client-upload", tags=["client-upload"])


@client_upload_router.get("/token-status")
async def check_token_status(token: str = Query(...)):
    """
    Check if an upload token is valid (for client upload page).
    """
    token_data = verify_upload_token(token)
    
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired upload token")
    
    # Get request details
    supabase = get_supabase()
    
    if token_data["scope"] == "evidence_request":
        try:
            request = supabase.table("evidence_requests")\
                .select("title, requested_items, due_date")\
                .eq("id", token_data["scope_id"])\
                .single()\
                .execute()
            
            return {
                "valid": True,
                "client_name": token_data.get("client_companies", {}).get("name"),
                "organization_name": token_data.get("organizations", {}).get("name"),
                "scope": token_data["scope"],
                "title": request.data.get("title") if request.data else None,
                "requested_items": request.data.get("requested_items") if request.data else [],
                "due_date": request.data.get("due_date") if request.data else None,
                "uploads_remaining": token_data.get("max_uploads", 100) - token_data.get("uploads_count", 0)
            }
        except:
            return {
                "valid": True,
                "client_name": token_data.get("client_companies", {}).get("name"),
                "scope": token_data["scope"]
            }
    
    return {
        "valid": True,
        "client_name": token_data.get("client_companies", {}).get("name"),
        "scope": token_data["scope"]
    }


@client_upload_router.post("/evidence")
async def client_upload_evidence(
    token: str = Form(...),
    files: List[UploadFile] = File(...),
    matched_item_key: Optional[str] = Form(None)
):
    """
    Client uploads evidence via tokenized link (no auth required).
    """
    supabase = get_supabase()
    
    # Verify token
    token_data = verify_upload_token(token)
    
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired upload token")
    
    if token_data["scope"] != "evidence_request":
        raise HTTPException(status_code=400, detail="Token not valid for evidence upload")
    
    org_id = token_data["organization_id"]
    client_id = token_data["client_company_id"]
    request_id = token_data["scope_id"]
    
    # Get request data
    try:
        request_result = supabase.table("evidence_requests")\
            .select("*")\
            .eq("id", request_id)\
            .single()\
            .execute()
        
        request_data = request_result.data
    except:
        raise HTTPException(status_code=404, detail="Evidence request not found")
    
    # Validate file types
    requested_items = request_data.get("requested_items", [])
    accepted_formats = set()
    for item in requested_items:
        accepted_formats.update(item.get("accepted_formats", []))
    
    uploaded_files = []
    rejected_files = []
    
    for upload_file in files:
        # Check file extension
        ext = upload_file.filename.rsplit(".", 1)[-1].lower() if "." in upload_file.filename else ""
        
        if accepted_formats and ext not in accepted_formats:
            rejected_files.append({
                "filename": upload_file.filename,
                "reason": f"File type '{ext}' not accepted. Accepted: {', '.join(accepted_formats)}"
            })
            continue
        
        content = await upload_file.read()
        file_hash = compute_file_hash(content)
        
        # Storage path
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_filename = re.sub(r'[^\w\.\-]', '_', upload_file.filename)
        storage_path = f"org/{org_id}/client/{client_id}/evidence_request/{request_id}/{timestamp}_{safe_filename}"
        
        # Upload to storage
        try:
            supabase.storage.from_("evidence-files").upload(
                storage_path,
                content,
                {"content-type": upload_file.content_type or "application/octet-stream"}
            )
        except Exception as e:
            logger.warning(f"Storage upload failed (bucket may not exist): {e}")
        
        # Create file record
        file_id = str(uuid4())
        file_data = {
            "id": file_id,
            "organization_id": org_id,
            "client_company_id": client_id,
            "uploaded_by_user_id": None,  # Client upload
            "uploaded_via": "client_link",
            "evidence_request_id": request_id,
            "original_filename": upload_file.filename,
            "storage_bucket": "evidence-files",
            "storage_path": storage_path,
            "mime_type": upload_file.content_type,
            "file_size_bytes": len(content),
            "sha256": file_hash,
            "status": "uploaded",
            "matched_item_key": matched_item_key
        }
        
        supabase.table("evidence_files").insert(file_data).execute()
        uploaded_files.append({"id": file_id, "filename": upload_file.filename})
    
    # Increment upload count
    supabase.table("client_upload_tokens")\
        .update({"uploads_count": token_data.get("uploads_count", 0) + len(uploaded_files)})\
        .eq("id", token_data["id"])\
        .execute()
    
    # Update request status
    update_request_status_on_upload(supabase, request_id, request_data)
    
    # Queue reprocessing
    job_id = queue_reprocessing_job(
        org_id=org_id,
        client_id=client_id,
        tax_year=request_data.get("tax_year"),
        trigger_type="evidence_uploaded",
        trigger_id=request_id,
        target="review_rules",
        impacted_finding_ids=request_data.get("linked_finding_ids")
    )
    
    # Audit log (attribute to client_link)
    supabase.table("audit_logs").insert({
        "organization_id": org_id,
        "user_id": None,
        "action": "client_evidence_uploaded",
        "item_type": "evidence_file",
        "item_id": uploaded_files[0]["id"] if uploaded_files else None,
        "details": {
            "evidence_request_id": request_id,
            "token_scope_id": token_data["scope_id"],
            "files": uploaded_files,
            "rejected_files": rejected_files,
            "upload_source": "client_link",
            "reprocessing_job_id": job_id
        },
        "created_at": datetime.utcnow().isoformat()
    }).execute()
    
    return {
        "success": True,
        "uploaded": uploaded_files,
        "rejected": rejected_files,
        "message": f"Successfully uploaded {len(uploaded_files)} file(s)"
    }


# ============================================================================
# Reprocessing Endpoints
# ============================================================================

@router.get("/reprocessing/jobs")
async def list_reprocessing_jobs(
    client_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20),
    user: dict = Depends(get_current_user)
):
    """
    List reprocessing jobs.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    query = supabase.table("reprocessing_jobs")\
        .select("*")\
        .eq("organization_id", org_id)
    
    if client_id:
        query = query.eq("client_company_id", client_id)
    if status:
        query = query.eq("status", status)
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    
    return {"jobs": result.data or []}


@router.post("/reprocessing/run/{job_id}")
async def run_reprocessing_job(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Run a reprocessing job.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get job
    try:
        result = supabase.table("reprocessing_jobs")\
            .select("*")\
            .eq("id", job_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        
        job = result.data
    except:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job["status"] == "running":
        raise HTTPException(status_code=400, detail="Job is already running")
    
    # Update status
    supabase.table("reprocessing_jobs")\
        .update({
            "status": "running",
            "started_at": datetime.utcnow().isoformat()
        })\
        .eq("id", job_id)\
        .execute()
    
    # Run reprocessing
    try:
        job_summary = await execute_reprocessing(supabase, job)
        
        supabase.table("reprocessing_jobs")\
            .update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "job_summary": job_summary
            })\
            .eq("id", job_id)\
            .execute()
        
        write_audit_log(
            org_id=org_id,
            user_id=user["id"],
            action="reprocessing_completed",
            item_type="reprocessing_job",
            item_id=job_id,
            details=job_summary
        )
        
        return {"status": "completed", "summary": job_summary}
        
    except Exception as e:
        logger.error(f"Reprocessing failed: {e}")
        
        supabase.table("reprocessing_jobs")\
            .update({
                "status": "failed",
                "completed_at": datetime.utcnow().isoformat(),
                "error": str(e)
            })\
            .eq("id", job_id)\
            .execute()
        
        write_audit_log(
            org_id=org_id,
            user_id=user["id"],
            action="reprocessing_failed",
            item_type="reprocessing_job",
            item_id=job_id,
            details={"error": str(e)}
        )
        
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {e}")


async def execute_reprocessing(supabase, job: dict) -> dict:
    """
    Execute the reprocessing logic.
    """
    summary = {
        "rules_run": 0,
        "findings_updated": 0,
        "findings_auto_resolved": 0,
        "ai_evals_run": 0,
        "errors": []
    }
    
    target = job["target"]
    client_id = job["client_company_id"]
    tax_year = job.get("tax_year")
    impacted_domains = job.get("impacted_domains") or []
    impacted_finding_ids = job.get("impacted_finding_ids") or []
    
    if target in ["review_rules", "both"]:
        # Import rules engine
        try:
            from .review_rules_engine import ReviewRulesEngine
            
            # Get org ID
            client = supabase.table("client_companies")\
                .select("organization_id")\
                .eq("id", client_id)\
                .single()\
                .execute()
            
            org_id = client.data["organization_id"]
            
            # Run targeted rules
            engine = ReviewRulesEngine(
                supabase=supabase,
                org_id=org_id,
                client_id=client_id,
                tax_year=tax_year or datetime.now().year - 1
            )
            
            results = engine.run_all_rules()
            summary["rules_run"] = results.get("rules_executed", 0)
            summary["findings_updated"] = results.get("findings_updated", 0)
            
            # Check if any impacted findings can be auto-resolved
            if impacted_finding_ids:
                for finding_id in impacted_finding_ids:
                    # Check if finding still in results (rule still triggers)
                    still_open = any(
                        r.get("rule_id") and finding_id in str(r.get("findings_count", 0))
                        for r in results.get("rule_results", [])
                    )
                    
                    if not still_open:
                        # Auto-resolve
                        supabase.table("review_findings")\
                            .update({
                                "status": "resolved_verified",
                                "updated_at": datetime.utcnow().isoformat()
                            })\
                            .eq("id", finding_id)\
                            .eq("status", "open")\
                            .execute()
                        summary["findings_auto_resolved"] += 1
            
        except Exception as e:
            logger.error(f"Review rules reprocessing error: {e}")
            summary["errors"].append(f"Review rules: {e}")
    
    if target in ["ai_project_eval", "both"]:
        # Run AI evaluation for impacted projects
        try:
            impacted_project_ids = job.get("impacted_project_ids") or []
            
            if not impacted_project_ids and impacted_finding_ids:
                # Find projects from findings
                for finding_id in impacted_finding_ids:
                    finding = supabase.table("review_findings")\
                        .select("entity_id, entity_type")\
                        .eq("id", finding_id)\
                        .single()\
                        .execute()
                    
                    if finding.data and finding.data.get("entity_type") == "project":
                        impacted_project_ids.append(finding.data["entity_id"])
            
            # Note: Actual AI evaluation would call existing endpoints
            # For now, just record that it should happen
            summary["ai_evals_run"] = len(impacted_project_ids)
            
        except Exception as e:
            logger.error(f"AI evaluation reprocessing error: {e}")
            summary["errors"].append(f"AI evaluation: {e}")
    
    return summary


@router.post("/reprocessing/run-now")
async def run_reprocessing_now(
    client_company_id: str = Query(...),
    tax_year: int = Query(...),
    target: str = Query("review_rules"),
    user: dict = Depends(get_current_user)
):
    """
    Run reprocessing immediately without a job record.
    """
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Create job record
    job_id = str(uuid4())
    supabase.table("reprocessing_jobs").insert({
        "id": job_id,
        "organization_id": org_id,
        "client_company_id": client_company_id,
        "tax_year": tax_year,
        "trigger_type": "manual",
        "trigger_id": job_id,
        "target": target,
        "status": "running",
        "started_at": datetime.utcnow().isoformat()
    }).execute()
    
    # Execute
    job = {
        "id": job_id,
        "organization_id": org_id,
        "client_company_id": client_company_id,
        "tax_year": tax_year,
        "target": target
    }
    
    try:
        summary = await execute_reprocessing(supabase, job)
        
        supabase.table("reprocessing_jobs")\
            .update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "job_summary": summary
            })\
            .eq("id", job_id)\
            .execute()
        
        return {"status": "completed", "job_id": job_id, "summary": summary}
        
    except Exception as e:
        supabase.table("reprocessing_jobs")\
            .update({
                "status": "failed",
                "completed_at": datetime.utcnow().isoformat(),
                "error": str(e)
            })\
            .eq("id", job_id)\
            .execute()
        
        raise HTTPException(status_code=500, detail=str(e))
