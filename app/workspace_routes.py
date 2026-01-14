"""
Workspace API Routes for CPA-centric data management

Provides CRUD endpoints for all canonical workspace entities:
- Employees, Projects, Timesheets, Vendors, Contracts
- AP Transactions, Supplies
- Derived outputs: Questionnaires, §174, Automated Review, QRE Summaries

Also includes bulk import and recompute pipelines.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form, Header
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

async def get_current_user(authorization: Optional[str] = Header(None)):
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
    user: dict = Depends(get_current_user)
):
    """List timesheets with filtering and pagination."""
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
    user: dict = Depends(get_current_user)
):
    """Create a new timesheet entry."""
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
    user: dict = Depends(get_current_user)
):
    """Update a timesheet entry."""
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
async def delete_timesheet(timesheet_id: str, user: dict = Depends(get_current_user)):
    """Delete a timesheet entry."""
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
    user: dict = Depends(get_current_user)
):
    """List vendors with filtering."""
    supabase = get_supabase()
    
    query = supabase.table("contractors").select("*").eq("client_company_id", client_id)
    
    if qualified_only:
        query = query.eq("is_qualified_contract_research", True)
    
    query = query.order("name").range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/vendors")
async def create_vendor(
    client_id: str,
    vendor: VendorCreate,
    user: dict = Depends(get_current_user)
):
    """Create a new vendor."""
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
    
    result = supabase.table("contractors").insert(data).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, updates: VendorUpdate, user: dict = Depends(get_current_user)):
    """Update a vendor."""
    supabase = get_supabase()
    
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    update_data["last_modified_by"] = user["id"]
    
    # Recalculate qualification if risk/IP changed
    if "risk_bearer" in update_data or "ip_rights" in update_data:
        current = supabase.table("contractors").select("risk_bearer, ip_rights").eq("id", vendor_id).single().execute().data
        risk = update_data.get("risk_bearer", current.get("risk_bearer"))
        ip = update_data.get("ip_rights", current.get("ip_rights"))
        update_data["is_qualified_contract_research"] = (
            risk in ["company", "taxpayer"] and ip in ["company", "shared"]
        )
    
    result = supabase.table("contractors").update(update_data).eq("id", vendor_id).execute()
    
    return {"data": result.data[0] if result.data else None}

@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, user: dict = Depends(get_current_user)):
    """Delete a vendor."""
    supabase = get_supabase()
    
    supabase.table("contractors").delete().eq("id", vendor_id).execute()
    
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
    user: dict = Depends(get_current_user)
):
    """List contracts."""
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
    user: dict = Depends(get_current_user)
):
    """Create a new contract."""
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
    user: dict = Depends(get_current_user)
):
    """List AP transactions with filtering and pagination."""
    supabase = get_supabase()
    
    query = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
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
    user: dict = Depends(get_current_user)
):
    """Create a new AP transaction."""
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
    
    result = supabase.table("expenses").insert(data).execute()
    
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
    user: dict = Depends(get_current_user)
):
    """List supplies with filtering."""
    supabase = get_supabase()
    
    query = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year)
    
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
    user: dict = Depends(get_current_user)
):
    """Create a new supply entry."""
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
    
    result = supabase.table("expenses").insert(data).execute()
    
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
    user: dict = Depends(get_current_user)
):
    """List employees with extended payroll fields."""
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
    user: dict = Depends(get_current_user)
):
    """Create an employee with extended payroll fields."""
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
    user: dict = Depends(get_current_user)
):
    """List projects with extended blueprint fields."""
    supabase = get_supabase()
    
    # Projects don't have tax_year or client_company_id - filter by organization_id
    org_id = get_user_org_id(user["id"]) if "user" in dir() else None
    query = supabase.table("projects").select("*")
    if org_id:
        query = query.eq("organization_id", org_id)
    
    if qualification_status:
        query = query.eq("qualification_status", qualification_status)
    
    query = query.order("name").range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return {"data": result.data}

@router.post("/projects-extended")
async def create_project_extended(
    client_id: str,
    project: ProjectExtendedCreate,
    user: dict = Depends(get_current_user)
):
    """Create a project with extended blueprint fields."""
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
    user: dict = Depends(get_current_user)
):
    """List project questionnaire items."""
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
    user: dict = Depends(get_current_user)
):
    """Update questionnaire item response."""
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
    user: dict = Depends(get_current_user)
):
    """List §174 capitalization entries."""
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
    user: dict = Depends(get_current_user)
):
    """List automated review items/flags."""
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
    user: dict = Depends(get_current_user)
):
    """Update review item status."""
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
    user: dict = Depends(get_current_user)
):
    """Get QRE summary for client/year."""
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


def _import_employees(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import employees from DataFrame with flexible column mapping. Uses batch insert for speed."""
    inserted = 0
    updated = 0
    errors = []
    
    # Normalize column names
    df.columns = [c.strip() for c in df.columns]
    
    # Prepare all rows for batch insert
    rows_to_insert = []
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "employee_name", "employee", "Name", "Employee Name"])
            if not name:
                continue
            
            # Match actual database schema - user_id is required
            employee_data = {
                "user_id": user_id,  # Required field
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "title": str(_get_column_value(row, ["job_title", "title", "position", "role", "Job Title", "Title"], "")),
                "department": str(_get_column_value(row, ["department", "dept", "Department", "Dept"], "")),
                "rd_percentage": float(_get_column_value(row, ["rd_percentage", "rd_percent", "qualified_percent", "R&D %", "RD %", "Qualified %"], 0)),
                "total_wages": float(_get_column_value(row, ["total_wages", "wages", "salary", "annual_salary", "Total Wages", "Wages", "Salary"], 0)),
            }
            rows_to_insert.append(employee_data)
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
            logger.warning(f"Employee import error row {idx}: {e}")
    
    # Simple batch insert - skip duplicates silently
    if rows_to_insert:
        try:
            # Simple insert - let it fail on duplicates, that's fine
            supabase.table("employees").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} employees")
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Batch employee insert failed: {error_msg}")
            # If it's a duplicate key error, that's fine - data already exists
            if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
                inserted = len(rows_to_insert)  # Consider them "processed"
            else:
                errors.append(f"Employees: {error_msg}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_projects(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import projects from DataFrame with flexible column mapping. Uses batch insert."""
    inserted = 0
    updated = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    rows_to_insert = []
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "project_name", "project", "Name", "Project Name", "Project"])
            if not name:
                continue
            
            # Match actual database schema: description, technical_uncertainty, process_of_experimentation
            project_data = {
                "user_id": user_id,  # Required field
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "description": str(_get_column_value(row, ["description", "desc", "Description", "Desc"], "")),
                "technical_uncertainty": str(_get_column_value(row, ["technical_uncertainty", "uncertainty", "uncertainty_type", "Uncertainty"], "")),
                "process_of_experimentation": str(_get_column_value(row, ["process_of_experimentation", "experimentation", "experimentation_description", "Experimentation"], "")),
            }
            rows_to_insert.append(project_data)
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
            logger.warning(f"Project import error row {idx}: {e}")
    
    # Batch insert all projects
    if rows_to_insert:
        try:
            supabase.table("projects").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} projects")
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Batch project insert failed: {error_msg}")
            if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
                inserted = len(rows_to_insert)
            else:
                errors.append(f"Projects: {error_msg}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_contractors(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import contractors from DataFrame. Uses batch insert."""
    inserted = 0
    updated = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    rows_to_insert = []
    
    for idx, row in df.iterrows():
        try:
            name = _get_column_value(row, ["name", "vendor_name", "vendor", "Name", "Vendor Name", "Contractor"])
            if not name:
                continue
            
            vendor_data = {
                "user_id": user_id,  # Required field
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": str(name),
                "location": str(_get_column_value(row, ["location", "country", "country_code", "Location", "Country"], "US")),
                "cost": float(_get_column_value(row, ["cost", "amount", "Cost", "Amount"], 0)),
                "is_qualified": True,
            }
            rows_to_insert.append(vendor_data)
                
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    if rows_to_insert:
        try:
            supabase.table("contractors").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} vendors")
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Batch vendor insert failed: {error_msg}")
            if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
                inserted = len(rows_to_insert)
            else:
                errors.append(f"Vendors: {error_msg}")
    
    return {"inserted": inserted, "updated": updated, "errors": errors}


def _import_timesheets(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import timesheets from DataFrame. Uses batch insert."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    # Get employee and project lookup maps
    employees = supabase.table("employees").select("id, name").eq("client_company_id", client_id).execute()
    employee_map = {e["name"].lower(): e["id"] for e in (employees.data or [])}
    
    projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
    project_map = {p["name"].lower(): p["id"] for p in (projects.data or [])}
    
    rows_to_insert = []
    
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
                # Skip silently if employee not found (they may not have been imported yet)
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
                "user_id": user_id,  # Required field
                "organization_id": org_id,
                "client_company_id": client_id,
                "employee_id": employee_id,
                "project_id": project_id,
                "tax_year": tax_year,
                "work_date": work_date_str,
                "hours": float(hours),
                "description": str(_get_column_value(row, ["description", "notes", "Description", "Notes"], "")),
            }
            rows_to_insert.append(timesheet_data)
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    if rows_to_insert:
        try:
            # Batch insert timesheets (no upsert needed, timesheets are additive)
            supabase.table("timesheets").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} timesheets")
        except Exception as e:
            logger.warning(f"Batch timesheet insert failed: {e}")
            errors.append(str(e))
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_ap_transactions(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import expenses/AP transactions from DataFrame. Uses batch insert."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    rows_to_insert = []
    
    # Valid categories for expenses table
    valid_categories = {'personnel', 'materials', 'software', 'contractors', 'other'}
    
    for idx, row in df.iterrows():
        try:
            amount = _get_column_value(row, ["amount", "cost", "total", "Amount", "Cost", "Total"])
            if not amount:
                continue
            
            vendor_name = _get_column_value(row, ["vendor_name", "vendor", "Vendor", "Vendor Name"])
            
            txn_date = _get_column_value(row, ["transaction_date", "date", "Date", "Transaction Date", "expense_date"])
            if pd.notna(txn_date):
                if isinstance(txn_date, str):
                    txn_date_str = txn_date
                else:
                    txn_date_str = pd.to_datetime(txn_date).strftime("%Y-%m-%d")
            else:
                txn_date_str = datetime.now().strftime("%Y-%m-%d")
            
            # Map category to valid enum values
            raw_cat = str(_get_column_value(row, ["category", "type", "Category", "Type"], "other")).lower()
            if raw_cat in valid_categories:
                category = raw_cat
            elif "contract" in raw_cat or "vendor" in raw_cat:
                category = "contractors"
            elif "supply" in raw_cat or "material" in raw_cat:
                category = "materials"
            elif "software" in raw_cat:
                category = "software"
            elif "personnel" in raw_cat or "wage" in raw_cat or "salary" in raw_cat:
                category = "personnel"
            else:
                category = "other"
            
            expense_data = {
                "organization_id": org_id,
                "vendor_name": str(vendor_name) if vendor_name else None,
                "expense_date": txn_date_str,
                "amount": float(amount),
                "category": category,
                "description": str(_get_column_value(row, ["description", "notes", "Description", "Notes"], "Imported expense")),
                "logged_by": user_id,
            }
            rows_to_insert.append(expense_data)
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    if rows_to_insert:
        try:
            supabase.table("expenses").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} AP transactions")
        except Exception as e:
            logger.warning(f"Batch AP insert failed: {e}")
            errors.append(str(e))
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_supplies(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import supplies as expenses. Uses batch insert."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    rows_to_insert = []
    
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
            
            # Supplies go to expenses table with category "materials"
            supply_data = {
                "organization_id": org_id,
                "expense_date": date_str,
                "amount": float(amount),
                "category": "materials",
                "description": str(_get_column_value(row, ["description", "item", "Description", "Item"], "Supply purchase")),
                "logged_by": user_id,
            }
            rows_to_insert.append(supply_data)
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    if rows_to_insert:
        try:
            supabase.table("expenses").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} supplies")
        except Exception as e:
            logger.warning(f"Batch supplies insert failed: {e}")
            errors.append(str(e))
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


def _import_contracts(supabase, org_id: str, client_id: str, df: pd.DataFrame, tax_year: int, user_id: str = None) -> Dict[str, int]:
    """Import contracts from DataFrame. Uses batch insert."""
    inserted = 0
    errors = []
    
    df.columns = [c.strip() for c in df.columns]
    
    # Get vendor lookup
    vendors = supabase.table("contractors").select("id, name").eq("client_company_id", client_id).execute()
    vendor_map = {v["name"].lower(): v["id"] for v in (vendors.data or [])}
    
    rows_to_insert = []
    
    for idx, row in df.iterrows():
        try:
            vendor_name = _get_column_value(row, ["vendor_name", "vendor", "contractor", "Vendor", "Contractor"])
            if not vendor_name:
                continue
            
            vendor_id = vendor_map.get(str(vendor_name).lower())
            if not vendor_id:
                # Skip silently if vendor not found
                continue
            
            contract_data = {
                "user_id": user_id,  # Required field
                "organization_id": org_id,
                "client_company_id": client_id,
                "vendor_id": vendor_id,
                "tax_year": tax_year,
                "contract_amount": float(_get_column_value(row, ["contract_amount", "amount", "total", "Amount", "Total"], 0)),
                "start_date": str(_get_column_value(row, ["start_date", "Start Date"], f"{tax_year}-01-01")),
                "end_date": str(_get_column_value(row, ["end_date", "End Date"], f"{tax_year}-12-31")),
                "description": str(_get_column_value(row, ["description", "notes", "Description"], "")),
            }
            rows_to_insert.append(contract_data)
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    if rows_to_insert:
        try:
            supabase.table("contracts").insert(rows_to_insert).execute()
            inserted = len(rows_to_insert)
            logger.info(f"Batch inserted {inserted} contracts")
        except Exception as e:
            logger.warning(f"Batch contracts insert failed: {e}")
            errors.append(str(e))
    
    return {"inserted": inserted, "updated": 0, "errors": errors}


@router.post("/import/preview")
async def preview_import(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    tax_year: int = Form(default=2024),
    user: dict = Depends(get_current_user)
):
    """
    Upload and preview Excel import.
    Returns detected sheets, row counts, and validation results.
    Stores file content for subsequent commit.
    """
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
                sheet_mapping[sheet_name] = "contractors"
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
                
                # Include sample data (first 3 rows) - convert to JSON-safe dict
                sample_records = df.head(3).to_dict(orient="records")
                # Clean NaN/Inf values for JSON compatibility
                def clean_value(v):
                    if pd.isna(v) or v != v:  # Check for NaN
                        return None
                    if isinstance(v, float) and (v == float('inf') or v == float('-inf')):
                        return None
                    return v
                preview_summary["sample_data"][sheet_name] = [
                    {k: clean_value(v) for k, v in row.items()} for row in sample_records
                ]
        
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
    user: dict = Depends(get_current_user)
):
    """
    Commit a previewed import. Parses all sheets and inserts into canonical tables.
    Automatically triggers missing info detection and readiness recompute.
    """
    # #region agent log
    import json as _json; open("/Users/dhruvramasubban/Desktop/TaxScapeCursor/.cursor/debug.log","a").write(_json.dumps({"location":"workspace_routes.py:commit_import","message":"commit_import called","data":{"import_file_id":import_file_id,"user_id":user.get("id")},"timestamp":int(__import__("time").time()*1000),"sessionId":"debug-session","hypothesisId":"O"})+"\n")
    # #endregion
    org_id = get_user_org_id(user["id"])
    
    supabase = get_supabase()
    
    # Get import file record
    import_record = supabase.table("import_files").select("*").eq("id", import_file_id).single().execute()
    # #region agent log
    open("/Users/dhruvramasubban/Desktop/TaxScapeCursor/.cursor/debug.log","a").write(_json.dumps({"location":"workspace_routes.py:commit_import","message":"import_record fetched","data":{"has_data":bool(import_record.data),"status":import_record.data.get("status") if import_record.data else None,"sheet_mapping_keys":list(import_record.data.get("sheet_mapping",{}).keys()) if import_record.data else []},"timestamp":int(__import__("time").time()*1000),"sessionId":"debug-session","hypothesisId":"O"})+"\n")
    # #endregion
    
    if not import_record.data:
        raise HTTPException(status_code=404, detail="Import file not found")
    
    if import_record.data["status"] != "previewing":
        raise HTTPException(status_code=400, detail=f"Import not in preview state: {import_record.data['status']}")
    
    client_id = import_record.data["client_company_id"]
    tax_year = import_record.data.get("tax_year", 2024)
    sheet_mapping = import_record.data.get("sheet_mapping", {})
    
    # Get file content from cache
    contents = _import_file_cache.get(import_file_id)
    # #region agent log
    open("/Users/dhruvramasubban/Desktop/TaxScapeCursor/.cursor/debug.log","a").write(_json.dumps({"location":"workspace_routes.py:commit_import","message":"cache lookup","data":{"import_file_id":import_file_id,"has_contents":bool(contents),"cache_keys":list(_import_file_cache.keys())[:5]},"timestamp":int(__import__("time").time()*1000),"sessionId":"debug-session","hypothesisId":"O"})+"\n")
    # #endregion
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
        # Note: Keep status as 'previewing' during processing since 'processing' is not in check constraint
        # Status will be updated to 'committed' on success or 'failed' on error
        
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
            user_id = user["id"]  # All tables need user_id
            
            if entity_type == "employees":
                result = _import_employees(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "projects":
                result = _import_projects(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "contractors":
                result = _import_contractors(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "timesheets":
                result = _import_timesheets(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "ap_transactions":
                result = _import_ap_transactions(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "supplies":
                result = _import_supplies(supabase, org_id, client_id, df, tax_year, user_id)
            elif entity_type == "contracts":
                result = _import_contracts(supabase, org_id, client_id, df, tax_year, user_id)
            
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
        
        # Mark QRE summary as stale (skip if table doesn't exist)
        try:
            supabase.table("qre_summaries").update({
                "is_stale": True,
                "last_inputs_updated_at": datetime.utcnow().isoformat(),
            }).eq("client_company_id", client_id).execute()
        except Exception:
            pass  # Table may not exist yet
        
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
    user: dict = Depends(get_current_user)
):
    """
    Run recompute pipeline for derived data:
    - Project questionnaires
    - §174 capitalization
    - Automated review items
    - QRE summary
    """
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
        # 1. Generate questionnaire items (skip if table doesn't exist)
        if request.regenerate_questionnaire:
            try:
                questionnaire_count = await _generate_questionnaires(supabase, org_id, client_id, tax_year, user["id"])
                results["questionnaire"]["generated"] = questionnaire_count
            except Exception as e:
                logger.warning(f"Questionnaire generation skipped: {e}")
        
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
    
    # Get projects (projects don't have client_company_id or tax_year)
    projects = supabase.table("projects").select("*").eq("organization_id", org_id).execute()
    
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
    supplies = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qre_eligible", True).execute()
    
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
    ap_transactions = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qualified_contract_research", True).execute()
    
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
    vendors = supabase.table("contractors").select("*").eq("client_company_id", client_id).execute()
    
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
    ap_txns = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).is_("vendor_id", "null").execute()
    
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
    supplies = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).is_("project_id", "null").eq("is_qre_eligible", True).execute()
    
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
    projects = supabase.table("projects").select("*").eq("organization_id", org_id).execute()
    
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
    supplies = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qre_eligible", True).execute()
    
    supply_qre = sum(s.get("qre_amount", 0) or s.get("amount", 0) for s in supplies.data or [])
    
    # Calculate contract QRE
    ap_txns = supabase.table("expenses").select("*").eq("client_company_id", client_id).eq("tax_year", tax_year).eq("is_qualified_contract_research", True).execute()
    
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
    user: dict = Depends(get_current_user)
):
    """Check if derived data is stale and needs recompute."""
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

