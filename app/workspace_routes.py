"""
Workspace API Routes for CPA-centric data management

Provides CRUD endpoints for all canonical workspace entities:
- Employees, Projects, Timesheets, Vendors, Contracts
- AP Transactions, Supplies
- Derived outputs: Questionnaires, §174, Automated Review, QRE Summaries

Also includes bulk import and recompute pipelines.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from decimal import Decimal
import uuid
import hashlib
import io
import json
import logging

import pandas as pd

from app.supabase_client import get_supabase, verify_supabase_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace-data", tags=["workspace-data"])

# =============================================================================
# AUTH DEPENDENCY (shared with main.py)
# =============================================================================

async def get_current_user(authorization: str = None):
    """Extract and verify user from Supabase JWT token."""
    from fastapi import Header
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

def get_user_org_id(user_id: str) -> Optional[str]:
    """Get user's organization ID from profile."""
    supabase = get_supabase()
    if not supabase:
        return None
    try:
        result = supabase.table("profiles").select("organization_id").eq("id", user_id).single().execute()
        if result.data:
            return result.data.get("organization_id")
    except Exception as e:
        logger.error(f"Error getting user org: {e}")
    return None

# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class PaginationParams(BaseModel):
    limit: int = Field(default=50, le=500)
    offset: int = Field(default=0, ge=0)
    sort_by: Optional[str] = None
    sort_order: str = Field(default="desc", pattern="^(asc|desc)$")

class TimesheetCreate(BaseModel):
    employee_id: str
    project_id: Optional[str] = None
    timesheet_id_natural: Optional[str] = None
    tax_year: int = 2024
    period_start: date
    period_end: date
    hours: float
    activity_code: Optional[str] = None

class TimesheetUpdate(BaseModel):
    hours: Optional[float] = None
    activity_code: Optional[str] = None
    approval_status: Optional[str] = None
    approver_notes: Optional[str] = None

class VendorCreate(BaseModel):
    vendor_id_natural: str
    name: str
    service_type: Optional[str] = None
    country: str = "US"
    location_state: Optional[str] = None
    risk_bearer: Optional[str] = None
    ip_rights: Optional[str] = None
    is_qualified_contract_research: bool = False

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    country: Optional[str] = None
    risk_bearer: Optional[str] = None
    ip_rights: Optional[str] = None
    is_qualified_contract_research: Optional[bool] = None

class ContractCreate(BaseModel):
    vendor_id: str
    contract_id_natural: str
    title: str
    sow_summary: Optional[str] = None
    effective_date: Optional[date] = None
    expiration_date: Optional[date] = None
    total_value: Optional[float] = None
    risk_terms: Optional[str] = None
    ip_ownership_terms: Optional[str] = None
    is_qualified_contract_research: bool = False
    project_ids: List[str] = []

class APTransactionCreate(BaseModel):
    vendor_id: Optional[str] = None
    contract_id: Optional[str] = None
    transaction_id_natural: str
    tax_year: int = 2024
    invoice_number: Optional[str] = None
    description: Optional[str] = None
    amount: float
    category: Optional[str] = None
    gl_account: Optional[str] = None
    invoice_date: Optional[date] = None
    payment_date: Optional[date] = None
    qre_eligible_percent: float = 0
    project_id: Optional[str] = None

class SupplyCreate(BaseModel):
    project_id: Optional[str] = None
    supply_id_natural: str
    tax_year: int = 2024
    item_description: str
    category: Optional[str] = None
    purchase_date: Optional[date] = None
    gl_account: Optional[str] = None
    amount: float
    is_qre_eligible: bool = False
    qre_amount: float = 0

class EmployeeExtendedCreate(BaseModel):
    name: str
    employee_id_natural: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    state: Optional[str] = None
    employment_type: str = "full_time"
    exempt_status: str = "exempt"
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    w2_box1_wages: float = 0
    total_wages: float = 0
    payroll_taxes: float = 0
    bonus: float = 0
    stock_compensation: float = 0
    severance: float = 0
    qre_wage_base: float = 0
    rd_percentage: float = 0
    rd_eligibility: str = "partial"
    tax_year: int = 2024

class ProjectExtendedCreate(BaseModel):
    name: str
    project_id_natural: Optional[str] = None
    description: Optional[str] = None
    product_line: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    permitted_purpose_type: Optional[str] = None
    uncertainty_type: Optional[str] = None
    experimentation_summary: Optional[str] = None
    technical_uncertainty: Optional[str] = None
    process_of_experimentation: Optional[str] = None
    pm_system: Optional[str] = None
    budget: Optional[float] = None
    tax_year: int = 2024
    qualification_status: str = "pending"

class ImportPreviewRequest(BaseModel):
    client_company_id: str
    tax_year: int = 2024

class ImportCommitRequest(BaseModel):
    import_file_id: str

class RecomputeRequest(BaseModel):
    client_company_id: str
    tax_year: int = 2024
    regenerate_questionnaire: bool = True
    recompute_174: bool = True
    recompute_review: bool = True
    recompute_qre: bool = True

# =============================================================================
# TIMESHEETS CRUD
# =============================================================================

@router.get("/timesheets")
async def list_timesheets(
    client_id: str,
    tax_year: int = 2024,
    employee_id: Optional[str] = None,
    project_id: Optional[str] = None,
    approval_status: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List timesheets with filtering and pagination."""
    from fastapi import Header
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("timesheets").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if project_id:
        query = query.eq("project_id", project_id)
    if approval_status:
        query = query.eq("approval_status", approval_status)
    
    query = query.order("period_start", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    # Get total count
    count_query = supabase.table("timesheets").select("id", count="exact").eq("client_company_id", client_id).eq("tax_year", tax_year)
    count_result = count_query.execute()
    
    return {
        "data": result.data,
        "pagination": {
            "total": count_result.count if hasattr(count_result, 'count') else len(result.data),
            "limit": limit,
            "offset": offset
        }
    }

@router.post("/timesheets")
async def create_timesheet(
    client_id: str,
    timesheet: TimesheetCreate,
    authorization: str = None
):
    """Create a new timesheet entry."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    supabase = get_supabase()
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "employee_id": timesheet.employee_id,
        "project_id": timesheet.project_id,
        "timesheet_id_natural": timesheet.timesheet_id_natural,
        "tax_year": timesheet.tax_year,
        "period_start": timesheet.period_start.isoformat(),
        "period_end": timesheet.period_end.isoformat(),
        "hours": timesheet.hours,
        "activity_code": timesheet.activity_code,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("timesheets").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.patch("/timesheets/{timesheet_id}")
async def update_timesheet(
    timesheet_id: str,
    updates: TimesheetUpdate,
    authorization: str = None
):
    """Update a timesheet entry."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    update_data["last_modified_by"] = user["id"]
    update_data["version"] = supabase.table("timesheets").select("version").eq("id", timesheet_id).single().execute().data.get("version", 1) + 1
    
    if updates.approval_status == "approved":
        update_data["approved_by"] = user["id"]
        update_data["approved_at"] = datetime.utcnow().isoformat()
    
    result = supabase.table("timesheets").update(update_data).eq("id", timesheet_id).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.delete("/timesheets/{timesheet_id}")
async def delete_timesheet(timesheet_id: str, authorization: str = None):
    """Delete a timesheet entry."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    supabase.table("timesheets").delete().eq("id", timesheet_id).execute()
    
    return {"success": True}

# =============================================================================
# VENDORS CRUD
# =============================================================================

@router.get("/vendors")
async def list_vendors(
    client_id: str,
    qualified_only: bool = False,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List vendors with filtering."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("vendors").select("*").eq("client_company_id", client_id)
    
    if qualified_only:
        query = query.eq("is_qualified_contract_research", True)
    
    query = query.order("name").range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/vendors")
async def create_vendor(
    client_id: str,
    vendor: VendorCreate,
    authorization: str = None
):
    """Create a new vendor."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    # Auto-calculate qualification based on risk/IP
    is_qualified = (
        vendor.risk_bearer in ["company", "taxpayer"] and
        vendor.ip_rights in ["company", "shared"]
    ) if vendor.risk_bearer and vendor.ip_rights else vendor.is_qualified_contract_research
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        **vendor.dict(),
        "is_qualified_contract_research": is_qualified,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("vendors").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, updates: VendorUpdate, authorization: str = None):
    """Update a vendor."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    update_data["last_modified_by"] = user["id"]
    
    # Recalculate qualification if risk/IP changed
    if "risk_bearer" in update_data or "ip_rights" in update_data:
        current = supabase.table("vendors").select("risk_bearer, ip_rights").eq("id", vendor_id).single().execute().data
        risk = update_data.get("risk_bearer", current.get("risk_bearer"))
        ip = update_data.get("ip_rights", current.get("ip_rights"))
        update_data["is_qualified_contract_research"] = (
            risk in ["company", "taxpayer"] and ip in ["company", "shared"]
        )
    
    result = supabase.table("vendors").update(update_data).eq("id", vendor_id).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, authorization: str = None):
    """Delete a vendor."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    supabase.table("vendors").delete().eq("id", vendor_id).execute()
    
    return {"success": True}

# =============================================================================
# CONTRACTS CRUD
# =============================================================================

@router.get("/contracts")
async def list_contracts(
    client_id: str,
    vendor_id: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List contracts."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("contracts").select("*").eq("client_company_id", client_id)
    
    if vendor_id:
        query = query.eq("vendor_id", vendor_id)
    
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/contracts")
async def create_contract(
    client_id: str,
    contract: ContractCreate,
    authorization: str = None
):
    """Create a new contract."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "vendor_id": contract.vendor_id,
        "contract_id_natural": contract.contract_id_natural,
        "title": contract.title,
        "sow_summary": contract.sow_summary,
        "effective_date": contract.effective_date.isoformat() if contract.effective_date else None,
        "expiration_date": contract.expiration_date.isoformat() if contract.expiration_date else None,
        "total_value": contract.total_value,
        "risk_terms": contract.risk_terms,
        "ip_ownership_terms": contract.ip_ownership_terms,
        "is_qualified_contract_research": contract.is_qualified_contract_research,
        "project_ids": contract.project_ids,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("contracts").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# AP TRANSACTIONS CRUD
# =============================================================================

@router.get("/ap-transactions")
async def list_ap_transactions(
    client_id: str,
    tax_year: int = 2024,
    vendor_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List AP transactions with filtering and pagination."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("ap_transactions").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if vendor_id:
        query = query.eq("vendor_id", vendor_id)
    if project_id:
        query = query.eq("project_id", project_id)
    
    query = query.order("invoice_date", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/ap-transactions")
async def create_ap_transaction(
    client_id: str,
    transaction: APTransactionCreate,
    authorization: str = None
):
    """Create a new AP transaction."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    # Calculate QRE amount (65% for qualified contract research)
    qre_amount = 0
    if transaction.qre_eligible_percent > 0:
        qre_amount = transaction.amount * (transaction.qre_eligible_percent / 100) * 0.65
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "vendor_id": transaction.vendor_id,
        "contract_id": transaction.contract_id,
        "transaction_id_natural": transaction.transaction_id_natural,
        "tax_year": transaction.tax_year,
        "invoice_number": transaction.invoice_number,
        "description": transaction.description,
        "amount": transaction.amount,
        "category": transaction.category,
        "gl_account": transaction.gl_account,
        "invoice_date": transaction.invoice_date.isoformat() if transaction.invoice_date else None,
        "payment_date": transaction.payment_date.isoformat() if transaction.payment_date else None,
        "qre_eligible_percent": transaction.qre_eligible_percent,
        "qre_amount": qre_amount,
        "is_qualified_contract_research": transaction.qre_eligible_percent > 0,
        "project_id": transaction.project_id,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("ap_transactions").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# SUPPLIES CRUD
# =============================================================================

@router.get("/supplies")
async def list_supplies(
    client_id: str,
    tax_year: int = 2024,
    project_id: Optional[str] = None,
    qre_eligible_only: bool = False,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List supplies with filtering."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("supplies").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if project_id:
        query = query.eq("project_id", project_id)
    if qre_eligible_only:
        query = query.eq("is_qre_eligible", True)
    
    query = query.order("purchase_date", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/supplies")
async def create_supply(
    client_id: str,
    supply: SupplyCreate,
    authorization: str = None
):
    """Create a new supply entry."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "project_id": supply.project_id,
        "supply_id_natural": supply.supply_id_natural,
        "tax_year": supply.tax_year,
        "item_description": supply.item_description,
        "category": supply.category,
        "purchase_date": supply.purchase_date.isoformat() if supply.purchase_date else None,
        "gl_account": supply.gl_account,
        "amount": supply.amount,
        "is_qre_eligible": supply.is_qre_eligible,
        "qre_amount": supply.qre_amount if supply.is_qre_eligible else 0,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("supplies").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# EXTENDED EMPLOYEES (with new fields)
# =============================================================================

@router.get("/employees-extended")
async def list_employees_extended(
    client_id: str,
    tax_year: int = 2024,
    rd_eligibility: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List employees with extended payroll fields."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("employees").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if rd_eligibility:
        query = query.eq("rd_eligibility", rd_eligibility)
    
    query = query.order("name").range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/employees-extended")
async def create_employee_extended(
    client_id: str,
    employee: EmployeeExtendedCreate,
    authorization: str = None
):
    """Create an employee with extended payroll fields."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "user_id": user["id"],
        "name": employee.name,
        "employee_id_natural": employee.employee_id_natural,
        "title": employee.title,
        "department": employee.department,
        "state": employee.state,
        "employment_type": employee.employment_type,
        "exempt_status": employee.exempt_status,
        "hire_date": employee.hire_date.isoformat() if employee.hire_date else None,
        "termination_date": employee.termination_date.isoformat() if employee.termination_date else None,
        "w2_box1_wages": employee.w2_box1_wages,
        "total_wages": employee.total_wages or employee.w2_box1_wages,
        "payroll_taxes": employee.payroll_taxes,
        "bonus": employee.bonus,
        "stock_compensation": employee.stock_compensation,
        "severance": employee.severance,
        "qre_wage_base": employee.qre_wage_base,
        "rd_percentage": employee.rd_percentage,
        "rd_eligibility": employee.rd_eligibility,
        "tax_year": employee.tax_year,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("employees").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# EXTENDED PROJECTS (with new fields)
# =============================================================================

@router.get("/projects-extended")
async def list_projects_extended(
    client_id: str,
    tax_year: int = 2024,
    qualification_status: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = None
):
    """List projects with extended blueprint fields."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("projects").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if qualification_status:
        query = query.eq("qualification_status", qualification_status)
    
    query = query.order("name").range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/projects-extended")
async def create_project_extended(
    client_id: str,
    project: ProjectExtendedCreate,
    authorization: str = None
):
    """Create a project with extended blueprint fields."""
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "user_id": user["id"],
        "name": project.name,
        "project_id_natural": project.project_id_natural,
        "description": project.description,
        "product_line": project.product_line,
        "start_date": project.start_date.isoformat() if project.start_date else None,
        "end_date": project.end_date.isoformat() if project.end_date else None,
        "permitted_purpose_type": project.permitted_purpose_type,
        "uncertainty_type": project.uncertainty_type,
        "experimentation_summary": project.experimentation_summary,
        "technical_uncertainty": project.technical_uncertainty,
        "process_of_experimentation": project.process_of_experimentation,
        "pm_system": project.pm_system,
        "budget": project.budget,
        "tax_year": project.tax_year,
        "qualification_status": project.qualification_status,
        "source_type": "manual",
        "last_modified_by": user["id"],
    }
    
    result = supabase.table("projects").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# QUESTIONNAIRE ITEMS
# =============================================================================

@router.get("/questionnaire-items")
async def list_questionnaire_items(
    client_id: str,
    project_id: Optional[str] = None,
    tax_year: int = 2024,
    response_status: Optional[str] = None,
    authorization: str = None
):
    """List project questionnaire items."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("project_questionnaire_items").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if project_id:
        query = query.eq("project_id", project_id)
    if response_status:
        query = query.eq("response_status", response_status)
    
    query = query.order("question_order")
    
    result = query.execute()
    
    return {"data": result.data}

@router.patch("/questionnaire-items/{item_id}")
async def update_questionnaire_item(
    item_id: str,
    response_text: str = None,
    response_status: str = None,
    authorization: str = None
):
    """Update questionnaire item response."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    update_data = {"last_modified_by": user["id"]}
    if response_text is not None:
        update_data["response_text"] = response_text
    if response_status:
        update_data["response_status"] = response_status
    
    result = supabase.table("project_questionnaire_items").update(update_data).eq("id", item_id).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# SECTION 174 ENTRIES
# =============================================================================

@router.get("/section-174")
async def list_section_174_entries(
    client_id: str,
    tax_year: int = 2024,
    project_id: Optional[str] = None,
    authorization: str = None
):
    """List §174 capitalization entries."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("section_174_entries").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if project_id:
        query = query.eq("project_id", project_id)
    
    query = query.order("cost_type")
    
    result = query.execute()
    
    return {"data": result.data}

# =============================================================================
# AUTOMATED REVIEW ITEMS
# =============================================================================

@router.get("/review-items")
async def list_review_items(
    client_id: str,
    tax_year: int = 2024,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    authorization: str = None
):
    """List automated review items/flags."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    query = supabase.table("automated_review_items").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
    if category:
        query = query.eq("category", category)
    if severity:
        query = query.eq("severity", severity)
    if status:
        query = query.eq("status", status)
    
    query = query.order("severity", desc=True).order("created_at", desc=True)
    
    result = query.execute()
    
    return {"data": result.data}

@router.patch("/review-items/{item_id}")
async def update_review_item(
    item_id: str,
    status: str,
    resolution_notes: Optional[str] = None,
    authorization: str = None
):
    """Update review item status."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    update_data = {
        "status": status,
        "resolution_notes": resolution_notes,
    }
    
    if status in ["resolved", "waived"]:
        update_data["resolved_by"] = user["id"]
        update_data["resolved_at"] = datetime.utcnow().isoformat()
    
    result = supabase.table("automated_review_items").update(update_data).eq("id", item_id).execute()
    
    return {"data": result.data[0] if result.data else None}

# =============================================================================
# QRE SUMMARY
# =============================================================================

@router.get("/qre-summary")
async def get_qre_summary(
    client_id: str,
    tax_year: int = 2024,
    authorization: str = None
):
    """Get QRE summary for client/year."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    result = supabase.table("qre_summaries").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).single().execute()
    
    if not result.data:
        return {"data": None, "message": "No QRE summary computed yet"}
    
    return {"data": result.data}

# =============================================================================
# BULK IMPORT PIPELINE
# =============================================================================

import base64

# In-memory cache for import file contents (keyed by import_file_id)
# In production, use Redis or Supabase Storage
_import_file_cache: Dict[str, bytes] = {}


def _get_column_value(row: pd.Series, possible_names: List[str], default=None):
    """Get value from row using flexible column name matching."""
    for name in possible_names:
        # Try exact match first
        if name in row.index:
            val = row[name]
            if pd.notna(val):
                return val
        # Try case-insensitive match
        for col in row.index:
            if col.lower().strip() == name.lower():
                val = row[col]
                if pd.notna(val):
                    return val
    return default


def _import_employees(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import employees from DataFrame with flexible column mapping."""
    inserted = 0
    updated = 0
    errors = []
    
    # Normalize column names
    df.columns = [c.strip() for c in df.columns]
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "employee_name", "employee", "Name", "Employee Name"])
            if not name:
                continue
            
            employee_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "job_title": str(_get_column_value(row, ["job_title", "title", "position", "role", "Job Title", "Title"], "Unknown")),
                "department": str(_get_column_value(row, ["department", "dept", "Department", "Dept"], "")),
                "hourly_rate": float(_get_column_value(row, ["hourly_rate", "rate", "hourly", "Hourly Rate", "Rate"], 0)),
                "rd_percentage": float(_get_column_value(row, ["rd_percentage", "rd_percent", "qualified_percent", "R&D %", "RD %", "Qualified %"], 0)),
                "total_wages": float(_get_column_value(row, ["total_wages", "wages", "salary", "annual_salary", "Total Wages", "Wages", "Salary"], 0)),
            }
            
            # Check for existing by name (simple dedup)
            existing = supabase.table("employees")\
                .select("id")\
                .eq("client_company_id", client_id)\
                .eq("name", employee_data["name"])\
                .execute()
            
            if existing.data:
                # Update existing
                supabase.table("employees")\
                    .update(employee_data)\
                    .eq("id", existing.data[0]["id"])\
                    .execute()
                updated += 1
            else:
                # Insert new
                supabase.table("employees").insert(employee_data).execute()
                inserted += 1
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
            logger.warning(f"Employee import error row {idx}: {e}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_projects(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import projects from DataFrame with flexible column mapping."""
    inserted = 0
    updated = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "project_name", "project", "Name", "Project Name", "Project"])
            if not name:
                continue
            
            project_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "description": str(_get_column_value(row, ["description", "desc", "Description", "Desc"], "")),
                "status": str(_get_column_value(row, ["status", "Status"], "active")),
                "uncertainty_type": str(_get_column_value(row, ["uncertainty_type", "uncertainty", "Uncertainty Type", "Uncertainty"], "")),
                "experimentation_description": str(_get_column_value(row, ["experimentation_description", "experimentation", "Experimentation"], "")),
                "technological_basis": str(_get_column_value(row, ["technological_basis", "tech_basis", "Technological Basis"], "")),
                "permitted_purpose": str(_get_column_value(row, ["permitted_purpose", "purpose", "Permitted Purpose"], "")),
            }
            
            existing = supabase.table("projects")\
                .select("id")\
                .eq("client_company_id", client_id)\
                .eq("name", project_data["name"])\
                .execute()
            
            if existing.data:
                supabase.table("projects")\
                    .update(project_data)\
                    .eq("id", existing.data[0]["id"])\
                    .execute()
                updated += 1
            else:
                supabase.table("projects").insert(project_data).execute()
                inserted += 1
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
            logger.warning(f"Project import error row {idx}: {e}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_vendors(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import vendors from DataFrame."""
    inserted = 0
    updated = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "vendor_name", "vendor", "Name", "Vendor Name", "Contractor"])
            if not name:
                continue
            
            vendor_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "vendor_type": str(_get_column_value(row, ["vendor_type", "type", "Vendor Type", "Type"], "contractor")),
                "country_code": str(_get_column_value(row, ["country_code", "country", "location", "Country", "Location"], "US")),
            }
            
            existing = supabase.table("vendors")\
                .select("id")\
                .eq("client_company_id", client_id)\
                .eq("name", vendor_data["name"])\
                .execute()
            
            if existing.data:
                supabase.table("vendors").update(vendor_data).eq("id", existing.data[0]["id"]).execute()
                updated += 1
            else:
                supabase.table("vendors").insert(vendor_data).execute()
                inserted += 1
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_timesheets(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import timesheets from DataFrame."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    # Get employee and project lookup maps
    employees = supabase.table("employees").select("id, name").eq("client_company_id", client_id).execute()
    employee_map = {e["name"].lower(): e["id"] for e in (employees.data or [])}
    
    projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
    project_map = {p["name"].lower(): p["id"] for p in (projects.data or [])}
    
    for idx, row in df.iterrows():
        try:
            emp_name = _get_column_value(row, ["employee_name", "employee", "name", "Employee", "Employee Name"])
            proj_name = _get_column_value(row, ["project_name", "project", "Project", "Project Name"])
            hours = _get_column_value(row, ["hours", "Hours"], 0)
            
            if not emp_name or not hours:
                continue
            
            employee_id = employee_map.get(str(emp_name).lower())
            project_id = project_map.get(str(proj_name).lower()) if proj_name else None
            
            if not employee_id:
                errors.append(f"Row {idx}: Employee '{emp_name}' not found")
                continue
            
            work_date = _get_column_value(row, ["work_date", "date", "Date", "Work Date"])
            if pd.notna(work_date):
                if isinstance(work_date, str):
                    work_date_str = work_date
                else:
                    work_date_str = pd.to_datetime(work_date).strftime("%Y-%m-%d")
            else:
                work_date_str = datetime.now().strftime("%Y-%m-%d")
            
            timesheet_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "employee_id": employee_id,
                "project_id": project_id,
                "tax_year": tax_year,
                "work_date": work_date_str,
                "hours": float(hours),
                "description": str(_get_column_value(row, ["description", "notes", "Description", "Notes"], "")),
            }
            
            supabase.table("timesheets").insert(timesheet_data).execute()
            inserted += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_ap_transactions(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import AP transactions from DataFrame."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    # Get vendor lookup
    vendors = supabase.table("vendors").select("id, name").eq("client_company_id", client_id).execute()
    vendor_map = {v["name"].lower(): v["id"] for v in (vendors.data or [])}
    
    for idx, row in df.iterrows():
        try:
            amount = _get_column_value(row, ["amount", "cost", "total", "Amount", "Cost", "Total"])
            if not amount:
                continue
            
            vendor_name = _get_column_value(row, ["vendor_name", "vendor", "Vendor", "Vendor Name"])
            vendor_id = vendor_map.get(str(vendor_name).lower()) if vendor_name else None
            
            txn_date = _get_column_value(row, ["transaction_date", "date", "Date", "Transaction Date"])
            if pd.notna(txn_date):
                if isinstance(txn_date, str):
                    txn_date_str = txn_date
                else:
                    txn_date_str = pd.to_datetime(txn_date).strftime("%Y-%m-%d")
            else:
                txn_date_str = datetime.now().strftime("%Y-%m-%d")
            
            ap_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "vendor_id": vendor_id,
                "tax_year": tax_year,
                "transaction_date": txn_date_str,
                "amount": float(amount),
                "category": str(_get_column_value(row, ["category", "type", "Category", "Type"], "supplies")),
                "description": str(_get_column_value(row, ["description", "notes", "Description", "Notes"], "")),
            }
            
            supabase.table("ap_transactions").insert(ap_data).execute()
            inserted += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_supplies(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import supplies from DataFrame."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    for idx, row in df.iterrows():
        try:
            amount = _get_column_value(row, ["amount", "cost", "Amount", "Cost"])
            if not amount:
                continue
            
            purchase_date = _get_column_value(row, ["purchase_date", "date", "Date", "Purchase Date"])
            if pd.notna(purchase_date):
                if isinstance(purchase_date, str):
                    date_str = purchase_date
                else:
                    date_str = pd.to_datetime(purchase_date).strftime("%Y-%m-%d")
            else:
                date_str = datetime.now().strftime("%Y-%m-%d")
            
            supply_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "tax_year": tax_year,
                "purchase_date": date_str,
                "amount": float(amount),
                "category": str(_get_column_value(row, ["category", "type", "Category", "Type"], "general")),
                "description": str(_get_column_value(row, ["description", "item", "Description", "Item"], "")),
            }
            
            supabase.table("supplies").insert(supply_data).execute()
            inserted += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_contracts(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int) -> Dict[str, int]:
    """Import contracts from DataFrame."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    # Get vendor lookup
    vendors = supabase.table("vendors").select("id, name").eq("client_company_id", client_id).execute()
    vendor_map = {v["name"].lower(): v["id"] for v in (vendors.data or [])}
    
    for idx, row in df.iterrows():
        try:
            vendor_name = _get_column_value(row, ["vendor_name", "vendor", "contractor", "Vendor", "Contractor"])
            if not vendor_name:
                continue
            
            vendor_id = vendor_map.get(str(vendor_name).lower())
            if not vendor_id:
                errors.append(f"Row {idx}: Vendor '{vendor_name}' not found")
                continue
            
            contract_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "vendor_id": vendor_id,
                "tax_year": tax_year,
                "contract_amount": float(_get_column_value(row, ["contract_amount", "amount", "total", "Amount", "Total"], 0)),
                "start_date": str(_get_column_value(row, ["start_date", "Start Date"], f"{tax_year}-01-01")),
                "end_date": str(_get_column_value(row, ["end_date", "End Date"], f"{tax_year}-12-31")),
                "description": str(_get_column_value(row, ["description", "notes", "Description"], "")),
            }
            
            supabase.table("contracts").insert(contract_data).execute()
            inserted += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


@router.post("/import/preview")
async def preview_import(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    tax_year: int = Form(default=2024),
    authorization: str = None
):
    """
    Upload and preview Excel import.
    Returns detected sheets, row counts, and validation results.
    Stores file content for subsequent commit.
    """
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    # Read file content
    contents = await file.read()
    
    # Calculate hash for deduplication
    file_hash = hashlib.sha256(contents).hexdigest()
    
    supabase = get_supabase()
    
    # Parse Excel
    try:
        buffer = io.BytesIO(contents)
        xl = pd.ExcelFile(buffer)
        
        preview_summary = {
            "sheets": [],
            "row_counts": {},
            "detected_entities": [],
            "validation_issues": [],
            "sample_data": {},
        }
        
        # Flexible sheet name mapping (case-insensitive)
        sheet_mapping = {}
        for sheet_name in xl.sheet_names:
            sheet_lower = sheet_name.lower().replace("_", "").replace(" ", "")
            if "employee" in sheet_lower:
                sheet_mapping[sheet_name] = "employees"
            elif "project" in sheet_lower:
                sheet_mapping[sheet_name] = "projects"
            elif "timesheet" in sheet_lower or "time" in sheet_lower:
                sheet_mapping[sheet_name] = "timesheets"
            elif "vendor" in sheet_lower or "contractor" in sheet_lower:
                sheet_mapping[sheet_name] = "vendors"
            elif "contract" in sheet_lower:
                sheet_mapping[sheet_name] = "contracts"
            elif "ap" in sheet_lower or "transaction" in sheet_lower or "expense" in sheet_lower:
                sheet_mapping[sheet_name] = "ap_transactions"
            elif "suppl" in sheet_lower:
                sheet_mapping[sheet_name] = "supplies"
        
        for sheet_name in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet_name)
            row_count = len(df)
            
            preview_summary["sheets"].append(sheet_name)
            preview_summary["row_counts"][sheet_name] = row_count
            
            entity_type = sheet_mapping.get(sheet_name)
            if entity_type:
                preview_summary["detected_entities"].append({
                    "sheet": sheet_name,
                    "entity": entity_type,
                    "rows": row_count,
                    "columns": list(df.columns)
                })
                
                # Include sample data (first 3 rows)
                preview_summary["sample_data"][sheet_name] = df.head(3).to_dict(orient="records")
        
        # Create import file record
        import_file_id = str(uuid.uuid4())
        
        import_record = {
            "id": import_file_id,
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "filename": file.filename,
            "file_type": "xlsx",
            "file_size_bytes": len(contents),
            "file_hash": file_hash,
            "status": "previewing",
            "preview_summary": preview_summary,
            "sheet_mapping": sheet_mapping,
        }
        
        result = supabase.table("import_files").insert(import_record).execute()
        
        # Store file content in cache for commit
        _import_file_cache[import_file_id] = contents
        
        return {
            "import_file_id": import_file_id,
            "preview": preview_summary,
            "sheet_mapping": sheet_mapping,
            "message": f"Preview complete. Found {len(preview_summary['detected_entities'])} importable sheets with {sum(preview_summary['row_counts'].values())} total rows.",
        }
        
    except Exception as e:
        logger.error(f"Import preview error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")


@router.post("/import/commit")
async def commit_import(
    import_file_id: str = Query(...),
    authorization: str = None
):
    """
    Commit a previewed import. Parses all sheets and inserts into canonical tables.
    Automatically triggers missing info detection and readiness recompute.
    """
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    # Get import file record
    import_record = supabase.table("import_files").select("*").eq("id", import_file_id).single().execute()
    
    if not import_record.data:
        raise HTTPException(status_code=404, detail="Import file not found")
    
    if import_record.data["status"] != "previewing":
        raise HTTPException(status_code=400, detail=f"Import not in preview state: {import_record.data['status']}")
    
    client_id = import_record.data["client_company_id"]
    tax_year = import_record.data.get("tax_year", 2024)
    sheet_mapping = import_record.data.get("sheet_mapping", {})
    
    # Get file content from cache
    contents = _import_file_cache.get(import_file_id)
    if not contents:
        raise HTTPException(status_code=400, detail="File content not found. Please re-upload the file.")
    
    commit_summary = {
        "inserted": {},
        "updated": {},
        "errors": {},
        "total_inserted": 0,
        "total_updated": 0,
    }
    
    try:
        # Mark as processing
        supabase.table("import_files").update({
            "status": "processing",
        }).eq("id", import_file_id).execute()
        
        # Parse Excel and import each sheet
        buffer = io.BytesIO(contents)
        xl = pd.ExcelFile(buffer)
        
        for sheet_name in xl.sheet_names:
            entity_type = sheet_mapping.get(sheet_name)
            if not entity_type:
                continue
            
            df = pd.read_excel(xl, sheet_name=sheet_name)
            if len(df) == 0:
                continue
            
            logger.info(f"Importing {len(df)} rows from sheet '{sheet_name}' as {entity_type}")
            
            result = {"inserted": 0, "updated": 0, "errors": []}
            
            if entity_type == "employees":
                result = _import_employees(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "projects":
                result = _import_projects(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "vendors":
                result = _import_vendors(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "timesheets":
                result = _import_timesheets(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "ap_transactions":
                result = _import_ap_transactions(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "supplies":
                result = _import_supplies(supabase, org_id, client_id, df, tax_year)
            elif entity_type == "contracts":
                result = _import_contracts(supabase, org_id, client_id, df, tax_year)
            
            commit_summary["inserted"][entity_type] = result.get("inserted", 0)
            commit_summary["updated"][entity_type] = result.get("updated", 0)
            commit_summary["errors"][entity_type] = result.get("errors", [])[:5]  # First 5 errors
            commit_summary["total_inserted"] += result.get("inserted", 0)
            commit_summary["total_updated"] += result.get("updated", 0)
        
        # Update import file status
        supabase.table("import_files").update({
            "status": "committed",
            "committed_at": datetime.utcnow().isoformat(),
            "committed_by": user["id"],
            "commit_summary": commit_summary,
        }).eq("id", import_file_id).execute()
        
        # Mark QRE summary as stale
        supabase.table("qre_summaries").update({
            "is_stale": True,
            "last_inputs_updated_at": datetime.utcnow().isoformat(),
        }).eq("client_company_id", client_id).execute()
        
        # Clean up cache
        if import_file_id in _import_file_cache:
            del _import_file_cache[import_file_id]
        
        return {
            "success": True,
            "commit_summary": commit_summary,
            "message": f"Import complete! Inserted {commit_summary['total_inserted']} records, updated {commit_summary['total_updated']} records.",
        }
        
    except Exception as e:
        logger.error(f"Import commit error: {e}")
        
        # Mark as failed
        supabase.table("import_files").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", import_file_id).execute()
        
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

# =============================================================================
# RECOMPUTE PIPELINE
# =============================================================================

@router.post("/recompute")
async def recompute_derived_data(
    request: RecomputeRequest,
    authorization: str = None
):
    """
    Run recompute pipeline for derived data:
    - Project questionnaires
    - §174 capitalization
    - Automated review items
    - QRE summary
    """
    user = await get_current_user(authorization)
    org_id = get_user_org_id(user["id"])
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    supabase = get_supabase()
    client_id = request.client_company_id
    tax_year = request.tax_year
    
    results = {
        "questionnaire": {"generated": 0},
        "section_174": {"computed": 0},
        "review_items": {"generated": 0},
        "qre_summary": None,
    }
    
    try:
        # 1. Generate questionnaire items
        if request.regenerate_questionnaire:
            questionnaire_count = await _generate_questionnaires(supabase, org_id, client_id, tax_year, user["id"])
            results["questionnaire"]["generated"] = questionnaire_count
        
        # 2. Compute §174 entries
        if request.recompute_174:
            s174_count = await _compute_section_174(supabase, org_id, client_id, tax_year, user["id"])
            results["section_174"]["computed"] = s174_count
        
        # 3. Generate automated review items
        if request.recompute_review:
            review_count = await _generate_review_items(supabase, org_id, client_id, tax_year, user["id"])
            results["review_items"]["generated"] = review_count
        
        # 4. Compute QRE summary
        if request.recompute_qre:
            qre_summary = await _compute_qre_summary(supabase, org_id, client_id, tax_year, user["id"])
            results["qre_summary"] = qre_summary
        
        return {
            "success": True,
            "results": results,
            "message": "Recompute completed successfully",
        }
        
    except Exception as e:
        logger.error(f"Recompute error: {e}")
        raise HTTPException(status_code=500, detail=f"Recompute failed: {str(e)}")

# =============================================================================
# RECOMPUTE HELPER FUNCTIONS
# =============================================================================

async def _generate_questionnaires(supabase, org_id: str, client_id: str, tax_year: int, user_id: str) -> int:
    """Generate questionnaire items for all projects."""
    
    # Get projects
    projects = supabase.table("projects").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    if not projects.data:
        return 0
    
    question_bank = [
        {"domain": "permitted_purpose", "text": "What new or improved functionality is this project developing?", "order": 1},
        {"domain": "permitted_purpose", "text": "How does this differ from your existing products/processes?", "order": 2},
        {"domain": "uncertainty", "text": "What technical uncertainties existed at the start of this project?", "order": 3},
        {"domain": "uncertainty", "text": "Was it unclear whether the desired outcome was achievable?", "order": 4},
        {"domain": "experimentation", "text": "What systematic approaches (testing, modeling, prototyping) were used?", "order": 5},
        {"domain": "experimentation", "text": "How many iterations or alternatives were evaluated?", "order": 6},
        {"domain": "technological_nature", "text": "What engineering/scientific principles underlie this work?", "order": 7},
        {"domain": "documentation_evidence", "text": "What documentation exists (design docs, test results, commits)?", "order": 8},
    ]
    
    count = 0
    for project in projects.data:
        # Check for existing questions
        existing = supabase.table("project_questionnaire_items").select("id").eq("project_id", project["id"]).execute()
        
        if existing.data:
            # Skip if questions already exist (preserve responses)
            continue
        
        # Generate questions
        for q in question_bank:
            supabase.table("project_questionnaire_items").insert({
                "organization_id": org_id,
                "client_company_id": client_id,
                "project_id": project["id"],
                "tax_year": tax_year,
                "question_domain": q["domain"],
                "question_text": q["text"],
                "question_order": q["order"],
                "response_status": "unanswered",
                "generated_by": "system",
                "last_modified_by": user_id,
            }).execute()
            count += 1
    
    return count

async def _compute_section_174(supabase, org_id: str, client_id: str, tax_year: int, user_id: str) -> int:
    """Compute §174 capitalization entries."""
    
    # Clear existing entries for recompute
    supabase.table("section_174_entries").delete().eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    count = 0
    
    # 1. Wage costs from employees
    employees = supabase.table("employees").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    total_wage_cost = 0
    for emp in employees.data or []:
        if emp.get("rd_percentage", 0) > 0:
            qre_wage = emp.get("qre_wage_base", 0) or (emp.get("total_wages", 0) * emp.get("rd_percentage", 0) / 100)
            total_wage_cost += qre_wage
    
    if total_wage_cost > 0:
        supabase.table("section_174_entries").insert({
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "cost_type": "wages",
            "cost_amount": total_wage_cost,
            "is_domestic": True,
            "amortization_years": 5,
            "capitalized_amount": total_wage_cost,
            "current_year_expense": total_wage_cost / 5,
            "remaining_basis": total_wage_cost - (total_wage_cost / 5),
            "last_modified_by": user_id,
        }).execute()
        count += 1
    
    # 2. Supply costs
    supplies = supabase.table("supplies").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qre_eligible", True).execute()
    
    total_supply_cost = sum(s.get("qre_amount", 0) or s.get("amount", 0) for s in supplies.data or [])
    
    if total_supply_cost > 0:
        supabase.table("section_174_entries").insert({
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "cost_type": "supplies",
            "cost_amount": total_supply_cost,
            "is_domestic": True,
            "amortization_years": 5,
            "capitalized_amount": total_supply_cost,
            "current_year_expense": total_supply_cost / 5,
            "remaining_basis": total_supply_cost - (total_supply_cost / 5),
            "last_modified_by": user_id,
        }).execute()
        count += 1
    
    # 3. Contract research costs
    ap_transactions = supabase.table("ap_transactions").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qualified_contract_research", True).execute()
    
    total_contract_cost = sum(t.get("qre_amount", 0) for t in ap_transactions.data or [])
    
    if total_contract_cost > 0:
        supabase.table("section_174_entries").insert({
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "cost_type": "contract_research",
            "cost_amount": total_contract_cost,
            "is_domestic": True,
            "amortization_years": 5,
            "capitalized_amount": total_contract_cost,
            "current_year_expense": total_contract_cost / 5,
            "remaining_basis": total_contract_cost - (total_contract_cost / 5),
            "last_modified_by": user_id,
        }).execute()
        count += 1
    
    return count

async def _generate_review_items(supabase, org_id: str, client_id: str, tax_year: int, user_id: str) -> int:
    """Generate automated review/sanity check items."""
    
    # Clear existing open items for recompute
    supabase.table("automated_review_items").delete().eq("client_company_id", client_id).eq("tax_year", tax_year).eq("status", "open").execute()
    
    count = 0
    
    # 1. High wage employees (>$500k)
    employees = supabase.table("employees").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    for emp in employees.data or []:
        wages = emp.get("total_wages", 0)
        if wages > 500000:
            supabase.table("automated_review_items").insert({
                "organization_id": org_id,
                "client_company_id": client_id,
                "tax_year": tax_year,
                "category": "wage_anomaly",
                "severity": "warning",
                "entity_type": "employee",
                "entity_id": emp["id"],
                "entity_name": emp["name"],
                "metric_name": "total_wages",
                "metric_value": str(wages),
                "threshold_value": "500000",
                "message": f"High wage employee: {emp['name']} has ${wages:,.2f} in wages. Verify allocation.",
            }).execute()
            count += 1
        
        # High stock comp
        stock = emp.get("stock_compensation", 0)
        if stock > 200000:
            supabase.table("automated_review_items").insert({
                "organization_id": org_id,
                "client_company_id": client_id,
                "tax_year": tax_year,
                "category": "wage_anomaly",
                "severity": "info",
                "entity_type": "employee",
                "entity_id": emp["id"],
                "entity_name": emp["name"],
                "metric_name": "stock_compensation",
                "metric_value": str(stock),
                "threshold_value": "200000",
                "message": f"High stock compensation: {emp['name']} has ${stock:,.2f}. Excluded from QRE wage base.",
            }).execute()
            count += 1
    
    # 2. Foreign vendors
    vendors = supabase.table("vendors").select("*").eq("client_company_id", client_id).execute()
    
    for vendor in vendors.data or []:
        if vendor.get("country", "US") != "US":
            supabase.table("automated_review_items").insert({
                "organization_id": org_id,
                "client_company_id": client_id,
                "tax_year": tax_year,
                "category": "foreign_vendor",
                "severity": "warning",
                "entity_type": "vendor",
                "entity_id": vendor["id"],
                "entity_name": vendor["name"],
                "metric_name": "country",
                "metric_value": vendor.get("country"),
                "message": f"Foreign vendor: {vendor['name']} ({vendor.get('country')}). Contract research may not qualify.",
            }).execute()
            count += 1
    
    # 3. AP transactions without vendor link
    ap_txns = supabase.table("ap_transactions").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).is_("vendor_id", "null").execute()
    
    for txn in ap_txns.data or []:
        supabase.table("automated_review_items").insert({
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "category": "ap_vendor_link",
            "severity": "info",
            "entity_type": "ap_transaction",
            "entity_id": txn["id"],
            "entity_name": txn.get("transaction_id_natural", txn["id"]),
            "metric_name": "vendor_id",
            "metric_value": "null",
            "message": f"AP transaction {txn.get('transaction_id_natural')} has no linked vendor.",
        }).execute()
        count += 1
    
    # 4. Supplies without project link
    supplies = supabase.table("supplies").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).is_("project_id", "null").eq("is_qre_eligible", True).execute()
    
    for supply in supplies.data or []:
        supabase.table("automated_review_items").insert({
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "category": "supply_project_link",
            "severity": "warning",
            "entity_type": "supply",
            "entity_id": supply["id"],
            "entity_name": supply.get("supply_id_natural", supply["id"]),
            "metric_name": "project_id",
            "metric_value": "null",
            "message": f"QRE-eligible supply {supply.get('supply_id_natural')} has no linked project.",
        }).execute()
        count += 1
    
    # 5. Projects missing documentation
    projects = supabase.table("projects").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    for project in projects.data or []:
        if not project.get("technical_uncertainty") and not project.get("experimentation_summary"):
            supabase.table("automated_review_items").insert({
                "organization_id": org_id,
                "client_company_id": client_id,
                "tax_year": tax_year,
                "category": "project_documentation",
                "severity": "critical",
                "entity_type": "project",
                "entity_id": project["id"],
                "entity_name": project["name"],
                "metric_name": "documentation_completeness",
                "metric_value": "incomplete",
                "message": f"Project {project['name']} is missing technical uncertainty and experimentation documentation.",
            }).execute()
            count += 1
    
    return count

async def _compute_qre_summary(supabase, org_id: str, client_id: str, tax_year: int, user_id: str) -> dict:
    """Compute and persist QRE summary."""
    
    # Calculate wage QRE
    employees = supabase.table("employees").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    wage_qre = 0
    wage_breakdown = {"by_department": {}, "by_eligibility": {}}
    
    for emp in employees.data or []:
        rd_pct = emp.get("rd_percentage", 0) / 100
        if rd_pct > 0:
            qre = emp.get("qre_wage_base", 0)
            if qre == 0:
                # Calculate from wages minus excluded comp
                base = emp.get("total_wages", 0) - emp.get("stock_compensation", 0) - emp.get("severance", 0)
                qre = max(0, base * rd_pct)
            wage_qre += qre
            
            # Breakdown
            dept = emp.get("department", "Unknown")
            wage_breakdown["by_department"][dept] = wage_breakdown["by_department"].get(dept, 0) + qre
            elig = emp.get("rd_eligibility", "partial")
            wage_breakdown["by_eligibility"][elig] = wage_breakdown["by_eligibility"].get(elig, 0) + qre
    
    # Calculate supply QRE
    supplies = supabase.table("supplies").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qre_eligible", True).execute()
    
    supply_qre = sum(s.get("qre_amount", 0) or s.get("amount", 0) for s in supplies.data or [])
    
    # Calculate contract QRE
    ap_txns = supabase.table("ap_transactions").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qualified_contract_research", True).execute()
    
    contract_qre = sum(t.get("qre_amount", 0) for t in ap_txns.data or [])
    
    # Total
    total_qre = wage_qre + supply_qre + contract_qre
    
    # Estimate credit (simplified ASC method: 14% of QRE above base)
    estimated_credit = total_qre * 0.14  # Simplified
    
    summary_data = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "tax_year": tax_year,
        "wage_qre": wage_qre,
        "supply_qre": supply_qre,
        "contract_qre": contract_qre,
        "total_qre": total_qre,
        "wage_breakdown": wage_breakdown,
        "estimated_credit": estimated_credit,
        "credit_method": "asc",
        "last_recompute_at": datetime.utcnow().isoformat(),
        "is_stale": False,
        "computed_by": user_id,
    }
    
    # Upsert
    existing = supabase.table("qre_summaries").select("id").eq("client_company_id", client_id).eq("tax_year", tax_year).execute()
    
    if existing.data:
        supabase.table("qre_summaries").update(summary_data).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("qre_summaries").insert(summary_data).execute()
    
    return {
        "wage_qre": wage_qre,
        "supply_qre": supply_qre,
        "contract_qre": contract_qre,
        "total_qre": total_qre,
        "estimated_credit": estimated_credit,
    }

# =============================================================================
# STALENESS CHECK
# =============================================================================

@router.get("/staleness")
async def check_staleness(
    client_id: str,
    tax_year: int = 2024,
    authorization: str = None
):
    """Check if derived data is stale and needs recompute."""
    user = await get_current_user(authorization)
    supabase = get_supabase()
    
    summary = supabase.table("qre_summaries").select("is_stale, last_recompute_at, last_inputs_updated_at").eq("client_company_id", client_id).eq("tax_year", tax_year).single().execute()
    
    if not summary.data:
        return {
            "is_stale": True,
            "reason": "No QRE summary computed yet",
            "last_recompute_at": None,
        }
    
    return {
        "is_stale": summary.data.get("is_stale", True),
        "last_recompute_at": summary.data.get("last_recompute_at"),
        "last_inputs_updated_at": summary.data.get("last_inputs_updated_at"),
        "reason": "Inputs changed since last recompute" if summary.data.get("is_stale") else None,
    }

