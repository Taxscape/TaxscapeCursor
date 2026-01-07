"""
Study Generation Routes

Backend pipeline for generating R&D tax credit studies from workspace canonical tables.
Adapts workspace data to the existing Excel generator format.
"""

import io
import os
import json
import uuid
import hashlib
import logging
import zipfile
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.supabase_client import get_supabase, verify_supabase_token, get_user_profile
from app.rd_parser import (
    RDAnalysisSession, RDProject, RDEmployee, RDVendor, RDExpense, 
    FourPartTestResult, TestStatus, GapItem
)
from app.rd_excel_generator import generate_rd_report

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studies", tags=["studies"])


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class StudyGenerateOptions(BaseModel):
    include_unqualified: bool = True
    include_only_approved: bool = False
    project_filter_ids: Optional[List[str]] = None
    regenerate_if_same_inputs: bool = True
    credit_method: str = "both"  # 'regular', 'asc', 'both'


class StudyGenerateRequest(BaseModel):
    client_company_id: str
    tax_year: int = Field(default_factory=lambda: datetime.now().year)
    options: StudyGenerateOptions = Field(default_factory=StudyGenerateOptions)


class StudyDecisionRequest(BaseModel):
    project_id: str
    decision: str  # 'qualified', 'not_qualified', 'needs_follow_up', 'waived'
    reason_code: Optional[str] = None
    review_notes: Optional[str] = None
    risk_acknowledged: bool = False


class StudySummary(BaseModel):
    study_id: str
    version: int
    status: str
    total_qre: float
    total_credit: float
    qualified_projects: int
    risk_flags_count: int
    generated_at: str
    artifact_download_url: Optional[str] = None


class StudyDetail(BaseModel):
    id: str
    organization_id: str
    client_company_id: str
    tax_year: int
    study_type: str
    status: str
    version: int
    total_qre: float
    total_credit: float
    qualified_projects_count: int
    risk_flags_count: int
    credit_method: str
    recommended_method: Optional[str]
    notes: Optional[str]
    generated_by: Optional[str]
    generated_at: str
    inputs_snapshot_hash: str
    locked: bool
    approved_by: Optional[str]
    approved_at: Optional[str]
    approval_notes: Optional[str]
    evaluation_ids: List[str]
    evidence_ids: List[str]
    artifacts: List[Dict[str, Any]]
    decisions: List[Dict[str, Any]]


# =============================================================================
# AUTH & PERMISSION HELPERS
# =============================================================================

async def get_current_user(authorization: str = None):
    """Extract and verify user from authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization required")
    
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    user = verify_supabase_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def check_cpa_or_executive(user: dict, org_id: str) -> bool:
    """Check if user is CPA or Executive of the organization"""
    supabase = get_supabase()
    if not supabase:
        return False
    
    try:
        member = supabase.table("organization_members")\
            .select("role, status")\
            .eq("organization_id", org_id)\
            .eq("user_id", user["id"])\
            .single()\
            .execute()
        
        if not member.data:
            return False
        
        role = member.data.get("role")
        status = member.data.get("status")
        return role in ("cpa", "executive", "admin") and status == "active"
    except Exception as e:
        logger.error(f"Error checking user role: {e}")
        return False


# =============================================================================
# WORKSPACE DATA ADAPTER
# =============================================================================

def compute_inputs_hash(
    projects: List[Dict],
    employees: List[Dict],
    vendors: List[Dict],
    expenses: List[Dict],
    evaluations: List[Dict]
) -> str:
    """Compute SHA256 hash of input data for reproducibility"""
    data = {
        "projects": sorted([p.get("id", "") for p in projects]),
        "employees": sorted([e.get("id", "") for e in employees]),
        "vendors": sorted([v.get("id", "") for v in vendors]),
        "expenses": sorted([e.get("id", "") for e in expenses]),
        "evaluations": sorted([ev.get("id", "") for ev in evaluations]),
        "project_count": len(projects),
        "employee_count": len(employees),
    }
    json_str = json.dumps(data, sort_keys=True)
    return hashlib.sha256(json_str.encode()).hexdigest()


def adapt_workspace_to_session(
    client_company: Dict,
    projects: List[Dict],
    employees: List[Dict],
    vendors: List[Dict],
    contracts: List[Dict],
    ap_transactions: List[Dict],
    supplies: List[Dict],
    evaluations: Dict[str, Dict],  # project_id -> evaluation
    gaps: List[Dict],
    qre_summary: Optional[Dict],
    tax_year: int
) -> RDAnalysisSession:
    """
    Adapt workspace canonical tables into RDAnalysisSession format 
    for the existing Excel generator.
    """
    session_id = str(uuid.uuid4())
    
    # Convert projects
    rd_projects = []
    qualified_count = 0
    
    for proj in projects:
        proj_id = proj.get("id", "")
        evaluation = evaluations.get(proj_id, {})
        four_part_json = evaluation.get("four_part_test_json", {})
        
        # Build FourPartTestResult
        fpt = FourPartTestResult(
            permitted_purpose=_map_test_status(four_part_json.get("permitted_purpose", {}).get("status")),
            permitted_purpose_reasoning=four_part_json.get("permitted_purpose", {}).get("reasoning", ""),
            elimination_uncertainty=_map_test_status(four_part_json.get("elimination_uncertainty", {}).get("status")),
            elimination_uncertainty_reasoning=four_part_json.get("elimination_uncertainty", {}).get("reasoning", ""),
            process_experimentation=_map_test_status(four_part_json.get("process_experimentation", {}).get("status")),
            process_experimentation_reasoning=four_part_json.get("process_experimentation", {}).get("reasoning", ""),
            technological_nature=_map_test_status(four_part_json.get("technological_nature", {}).get("status")),
            technological_nature_reasoning=four_part_json.get("technological_nature", {}).get("reasoning", ""),
        )
        
        is_qualified = evaluation.get("qualified_boolean", False)
        if is_qualified:
            qualified_count += 1
        
        rd_projects.append(RDProject(
            project_id=proj_id,
            project_name=proj.get("name", "Unknown Project"),
            category=proj.get("category", ""),
            description=proj.get("description", ""),
            budget=proj.get("estimated_credit", 0),
            four_part_test=fpt,
            confidence_score=evaluation.get("confidence_score", 0),
            missing_info=evaluation.get("missing_info", []),
            ai_summary=evaluation.get("ai_summary", ""),
            qualified=is_qualified
        ))
    
    # Convert employees
    rd_employees = []
    total_wage_qre = 0
    
    for emp in employees:
        w2_wages = emp.get("total_wages", 0) or 0
        qre_percent = (emp.get("qualified_percent", 0) or 0) / 100
        qre_wage_base = w2_wages * qre_percent
        total_wage_qre += qre_wage_base
        
        rd_employees.append(RDEmployee(
            employee_id=emp.get("id", ""),
            name=emp.get("name", "Unknown"),
            job_title=emp.get("title", ""),
            department=emp.get("department", ""),
            location=emp.get("state", ""),
            w2_wages=w2_wages,
            qre_wage_base=qre_wage_base,
            rd_allocation_percent=emp.get("qualified_percent", 0) or 0,
            stock_compensation=emp.get("stock_compensation", 0) or 0,
            severance=emp.get("severance", 0) or 0
        ))
    
    # Convert vendors
    rd_vendors = []
    for vendor in vendors:
        is_qualified = (
            vendor.get("country", "US") in ["US", "USA", "United States"] and
            vendor.get("risk_bearer", "") != "vendor" and
            vendor.get("ip_rights", "") != "vendor"
        )
        
        rd_vendors.append(RDVendor(
            vendor_id=vendor.get("id", ""),
            vendor_name=vendor.get("name", "Unknown Vendor"),
            risk_bearer=vendor.get("risk_bearer", ""),
            ip_rights=vendor.get("ip_rights", ""),
            country=vendor.get("country", "US"),
            qualified=is_qualified
        ))
    
    # Convert expenses (contracts + AP transactions + supplies)
    rd_expenses = []
    total_supply_qre = 0
    total_contract_qre = 0
    
    # Contract research from contracts table
    for contract in contracts:
        amount = contract.get("amount", 0) or 0
        vendor_id = contract.get("vendor_id", "")
        vendor = next((v for v in rd_vendors if v.vendor_id == vendor_id), None)
        is_qualified = vendor.qualified if vendor else False
        qre_amount = amount * 0.65 if is_qualified else 0  # 65% rule for contract research
        total_contract_qre += qre_amount
        
        rd_expenses.append(RDExpense(
            transaction_id=contract.get("id", ""),
            vendor_id=vendor_id,
            description=contract.get("description", "Contract Research"),
            amount=amount,
            qre_amount=qre_amount,
            qualified=is_qualified,
            category="contract_research"
        ))
    
    # AP transactions as additional contract research
    for ap in ap_transactions:
        if ap.get("category", "") == "contract_research":
            amount = ap.get("amount", 0) or 0
            vendor_id = ap.get("vendor_id", "")
            vendor = next((v for v in rd_vendors if v.vendor_id == vendor_id), None)
            is_qualified = vendor.qualified if vendor else False
            qre_amount = amount * 0.65 if is_qualified else 0
            total_contract_qre += qre_amount
            
            rd_expenses.append(RDExpense(
                transaction_id=ap.get("id", ""),
                vendor_id=vendor_id,
                description=ap.get("description", ""),
                amount=amount,
                qre_amount=qre_amount,
                qualified=is_qualified,
                category="contract_research"
            ))
    
    # Supplies
    for supply in supplies:
        amount = supply.get("amount", 0) or 0
        is_qualified = supply.get("qualified", True)
        qre_amount = amount if is_qualified else 0
        total_supply_qre += qre_amount
        
        rd_expenses.append(RDExpense(
            transaction_id=supply.get("id", ""),
            vendor_id=supply.get("vendor_id", ""),
            description=supply.get("description", "R&D Supply"),
            amount=amount,
            qre_amount=qre_amount,
            qualified=is_qualified,
            category="supplies"
        ))
    
    # Use QRE summary if available, otherwise use computed values
    if qre_summary:
        final_wage_qre = qre_summary.get("wage_qre", total_wage_qre)
        final_supply_qre = qre_summary.get("supply_qre", total_supply_qre)
        final_contract_qre = qre_summary.get("contract_qre", total_contract_qre)
    else:
        final_wage_qre = total_wage_qre
        final_supply_qre = total_supply_qre
        final_contract_qre = total_contract_qre
    
    total_qre = final_wage_qre + final_supply_qre + final_contract_qre
    
    # Convert gaps
    rd_gaps = []
    for gap in gaps:
        rd_gaps.append(GapItem(
            gap_id=gap.get("id", ""),
            category=gap.get("gap_type", "documentation").split("_")[0],
            item_id=gap.get("project_id", ""),
            item_name=gap.get("description", "")[:50],
            gap_type=gap.get("gap_type", "needs_clarification"),
            description=gap.get("description", ""),
            required_info=[],
            priority=gap.get("severity", "medium")
        ))
    
    # Build session
    return RDAnalysisSession(
        session_id=session_id,
        created_at=datetime.utcnow().isoformat(),
        company_name=client_company.get("name", ""),
        industry=client_company.get("industry", ""),
        tax_year=tax_year,
        projects=rd_projects,
        employees=rd_employees,
        vendors=rd_vendors,
        expenses=rd_expenses,
        gaps=rd_gaps,
        total_qre=total_qre,
        wage_qre=final_wage_qre,
        supply_qre=final_supply_qre,
        contract_qre=final_contract_qre,
        total_employees=len(rd_employees),
        rd_employees=len([e for e in rd_employees if e.rd_allocation_percent > 0]),
        qualified_projects=qualified_count,
        parsing_complete=True,
        analysis_complete=True
    )


def _map_test_status(status: Optional[str]) -> TestStatus:
    """Map string status to TestStatus enum"""
    if not status:
        return TestStatus.MISSING_DATA
    
    status_lower = status.lower()
    if status_lower == "pass":
        return TestStatus.PASS
    elif status_lower == "fail":
        return TestStatus.FAIL
    elif status_lower == "needs_review":
        return TestStatus.NEEDS_REVIEW
    else:
        return TestStatus.MISSING_DATA


def calculate_credit(total_qre: float, method: str = "both") -> Dict[str, float]:
    """Calculate R&D tax credit using different methods"""
    # Regular Credit (20% of QRE exceeding base amount, simplified here as 6.5% effective rate)
    regular_rate = 0.065  # Simplified - actual calculation requires base period data
    regular_credit = total_qre * regular_rate
    
    # Alternative Simplified Credit (ASC) - 14% of QRE above 50% of average QRE
    # Simplified as 6% effective rate
    asc_rate = 0.06
    asc_credit = total_qre * asc_rate
    
    return {
        "regular_credit": regular_credit,
        "asc_credit": asc_credit,
        "recommended": "regular" if regular_credit >= asc_credit else "asc",
        "recommended_credit": max(regular_credit, asc_credit)
    }


# =============================================================================
# STUDY GENERATION ENDPOINTS
# =============================================================================

@router.post("/workspace/generate", response_model=StudySummary)
async def generate_workspace_study(
    request: StudyGenerateRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Query(None, alias="Authorization")
):
    """
    Generate a study from workspace canonical tables.
    
    - Validates user is CPA/Executive
    - Computes inputs_snapshot_hash
    - Builds RDAnalysisSession from workspace data
    - Generates Excel report
    - Stores artifacts and creates study record
    """
    # Auth check
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get client company and verify org membership
    client_result = supabase.table("client_companies")\
        .select("*")\
        .eq("id", request.client_company_id)\
        .single()\
        .execute()
    
    if not client_result.data:
        raise HTTPException(status_code=404, detail="Client company not found")
    
    client_company = client_result.data
    org_id = client_company["organization_id"]
    
    if not check_cpa_or_executive(user, org_id):
        raise HTTPException(status_code=403, detail="CPA or Executive role required to generate studies")
    
    tax_year = request.tax_year
    options = request.options
    
    try:
        # Fetch all workspace data
        # Projects
        projects_query = supabase.table("projects")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)
        
        if options.project_filter_ids:
            projects_query = projects_query.in_("id", options.project_filter_ids)
        
        projects_result = projects_query.execute()
        projects = projects_result.data or []
        
        # Filter by qualification if needed
        if options.include_only_approved:
            projects = [p for p in projects if p.get("status") == "approved"]
        
        # Employees
        employees_result = supabase.table("employees")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .execute()
        employees = employees_result.data or []
        
        # Vendors
        vendors_result = supabase.table("vendors")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .execute()
        vendors = vendors_result.data or []
        
        # Contracts
        contracts_result = supabase.table("contracts")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .eq("tax_year", tax_year)\
            .execute()
        contracts = contracts_result.data or []
        
        # AP Transactions
        ap_result = supabase.table("ap_transactions")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .eq("tax_year", tax_year)\
            .execute()
        ap_transactions = ap_result.data or []
        
        # Supplies
        supplies_result = supabase.table("supplies")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .eq("tax_year", tax_year)\
            .execute()
        supplies = supplies_result.data or []
        
        # Get latest AI evaluations for each project
        project_ids = [p["id"] for p in projects]
        evaluations = {}
        evaluation_ids = []
        
        if project_ids:
            for proj_id in project_ids:
                eval_result = supabase.table("project_ai_evaluations")\
                    .select("*")\
                    .eq("project_id", proj_id)\
                    .eq("tax_year", tax_year)\
                    .order("evaluation_version", desc=True)\
                    .limit(1)\
                    .execute()
                
                if eval_result.data:
                    evaluations[proj_id] = eval_result.data[0]
                    evaluation_ids.append(eval_result.data[0]["id"])
        
        # Get open gaps
        gaps_result = supabase.table("project_gaps")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .eq("tax_year", tax_year)\
            .in_("status", ["open", "in_progress"])\
            .execute()
        gaps = gaps_result.data or []
        
        # Get QRE summary
        qre_result = supabase.table("qre_summaries")\
            .select("*")\
            .eq("client_company_id", request.client_company_id)\
            .eq("tax_year", tax_year)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        qre_summary = qre_result.data[0] if qre_result.data else None
        
        # Compute inputs hash
        inputs_hash = compute_inputs_hash(
            projects, employees, vendors, 
            ap_transactions + supplies, 
            list(evaluations.values())
        )
        
        # Check for existing draft with same hash (if not forcing regeneration)
        if not options.regenerate_if_same_inputs:
            existing = supabase.table("studies")\
                .select("*")\
                .eq("client_company_id", request.client_company_id)\
                .eq("tax_year", tax_year)\
                .eq("inputs_snapshot_hash", inputs_hash)\
                .eq("status", "draft")\
                .order("version", desc=True)\
                .limit(1)\
                .execute()
            
            if existing.data:
                # Return existing study
                study = existing.data[0]
                return StudySummary(
                    study_id=study["id"],
                    version=study["version"],
                    status=study["status"],
                    total_qre=study["total_qre"],
                    total_credit=study["total_credit"],
                    qualified_projects=study["qualified_projects_count"],
                    risk_flags_count=study["risk_flags_count"],
                    generated_at=study["generated_at"],
                    artifact_download_url=f"/api/studies/{study['id']}/download?artifact=excel"
                )
        
        # Adapt workspace data to RDAnalysisSession
        session = adapt_workspace_to_session(
            client_company=client_company,
            projects=projects,
            employees=employees,
            vendors=vendors,
            contracts=contracts,
            ap_transactions=ap_transactions,
            supplies=supplies,
            evaluations=evaluations,
            gaps=gaps,
            qre_summary=qre_summary,
            tax_year=tax_year
        )
        
        # Calculate credit
        credit_info = calculate_credit(session.total_qre, options.credit_method)
        
        # Generate Excel report
        excel_buffer = generate_rd_report(session)
        excel_bytes = excel_buffer.getvalue()
        
        # Compute file checksum
        file_checksum = hashlib.sha256(excel_bytes).hexdigest()
        
        # Get next version number
        version_result = supabase.rpc("get_next_study_version", {
            "p_client_company_id": request.client_company_id,
            "p_tax_year": tax_year
        }).execute()
        version = version_result.data if version_result.data else 1
        
        # Create study record
        study_data = {
            "organization_id": org_id,
            "client_company_id": request.client_company_id,
            "tax_year": tax_year,
            "study_type": "workspace_study",
            "source_context": {
                "project_filter_ids": options.project_filter_ids,
                "include_unqualified": options.include_unqualified,
                "include_only_approved": options.include_only_approved
            },
            "status": "draft",
            "version": version,
            "generated_by": user["id"],
            "generated_at": datetime.utcnow().isoformat(),
            "inputs_snapshot_hash": inputs_hash,
            "total_qre": session.total_qre,
            "total_credit": credit_info["recommended_credit"],
            "qualified_projects_count": session.qualified_projects,
            "risk_flags_count": len(gaps),
            "credit_method": options.credit_method,
            "recommended_method": credit_info["recommended"],
            "evaluation_ids": evaluation_ids,
            "recompute_timestamp": qre_summary.get("created_at") if qre_summary else None,
        }
        
        study_result = supabase.table("studies").insert(study_data).execute()
        
        if not study_result.data:
            raise HTTPException(status_code=500, detail="Failed to create study record")
        
        study = study_result.data[0]
        study_id = study["id"]
        
        # Store Excel file in Supabase Storage
        storage_path = f"{org_id}/{request.client_company_id}/{tax_year}/study_{study_id}.xlsx"
        
        # Upload to storage (if bucket exists)
        try:
            storage_result = supabase.storage.from_("studies").upload(
                storage_path,
                excel_bytes,
                {"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
            )
        except Exception as storage_error:
            logger.warning(f"Storage upload failed (bucket may not exist): {storage_error}")
            # Store path anyway - we'll serve from memory/temp if needed
        
        # Create artifact record
        artifact_data = {
            "study_id": study_id,
            "artifact_type": "excel",
            "storage_path": storage_path,
            "filename": f"RD_Study_{client_company['name']}_{tax_year}_v{version}.xlsx",
            "file_size": len(excel_bytes),
            "sha256_checksum": file_checksum,
            "metadata": {
                "sheet_count": 13,
                "project_count": len(projects),
                "employee_count": len(employees),
                "total_qre": session.total_qre,
                "qualified_projects": session.qualified_projects
            }
        }
        
        supabase.table("study_artifacts").insert(artifact_data).execute()
        
        # Create decisions for each project
        for proj in projects:
            proj_id = proj["id"]
            evaluation = evaluations.get(proj_id, {})
            is_qualified = evaluation.get("qualified_boolean", False)
            
            decision_data = {
                "study_id": study_id,
                "project_id": proj_id,
                "decision": "qualified" if is_qualified else "not_qualified",
                "linked_evaluation_id": evaluation.get("id"),
            }
            supabase.table("study_decisions").insert(decision_data).execute()
        
        # Log audit
        supabase.table("study_audit_logs").insert({
            "study_id": study_id,
            "action": "generated",
            "performed_by": user["id"],
            "details": {
                "version": version,
                "inputs_hash": inputs_hash,
                "project_count": len(projects),
                "total_qre": session.total_qre
            },
            "new_status": "draft"
        }).execute()
        
        return StudySummary(
            study_id=study_id,
            version=version,
            status="draft",
            total_qre=session.total_qre,
            total_credit=credit_info["recommended_credit"],
            qualified_projects=session.qualified_projects,
            risk_flags_count=len(gaps),
            generated_at=study["generated_at"],
            artifact_download_url=f"/api/studies/{study_id}/download?artifact=excel"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating study: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{study_id}", response_model=StudyDetail)
async def get_study_detail(
    study_id: str,
    authorization: str = Query(None, alias="Authorization")
):
    """Get detailed study information including artifacts and decisions"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study_result = supabase.table("studies")\
        .select("*")\
        .eq("id", study_id)\
        .single()\
        .execute()
    
    if not study_result.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study = study_result.data
    
    # Verify user has access
    profile = get_user_profile(user["id"])
    if not profile or profile.get("organization_id") != study["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get artifacts
    artifacts_result = supabase.table("study_artifacts")\
        .select("*")\
        .eq("study_id", study_id)\
        .execute()
    
    # Get decisions
    decisions_result = supabase.table("study_decisions")\
        .select("*")\
        .eq("study_id", study_id)\
        .execute()
    
    return StudyDetail(
        id=study["id"],
        organization_id=study["organization_id"],
        client_company_id=study["client_company_id"],
        tax_year=study["tax_year"],
        study_type=study["study_type"],
        status=study["status"],
        version=study["version"],
        total_qre=study["total_qre"],
        total_credit=study["total_credit"],
        qualified_projects_count=study["qualified_projects_count"],
        risk_flags_count=study["risk_flags_count"],
        credit_method=study["credit_method"],
        recommended_method=study.get("recommended_method"),
        notes=study.get("notes"),
        generated_by=study.get("generated_by"),
        generated_at=study["generated_at"],
        inputs_snapshot_hash=study["inputs_snapshot_hash"],
        locked=study["locked"],
        approved_by=study.get("approved_by"),
        approved_at=study.get("approved_at"),
        approval_notes=study.get("approval_notes"),
        evaluation_ids=study.get("evaluation_ids", []),
        evidence_ids=study.get("evidence_ids", []),
        artifacts=artifacts_result.data or [],
        decisions=decisions_result.data or []
    )


@router.get("/{study_id}/download")
async def download_study_artifact(
    study_id: str,
    artifact: str = Query("excel", description="Artifact type: excel, zip_audit_package, pdf_summary, json_export"),
    authorization: str = Query(None, alias="Authorization")
):
    """Download study artifact (Excel, ZIP, etc.)"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study_result = supabase.table("studies")\
        .select("*")\
        .eq("id", study_id)\
        .single()\
        .execute()
    
    if not study_result.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study = study_result.data
    
    # Verify access
    profile = get_user_profile(user["id"])
    if not profile or profile.get("organization_id") != study["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get artifact
    artifact_result = supabase.table("study_artifacts")\
        .select("*")\
        .eq("study_id", study_id)\
        .eq("artifact_type", artifact)\
        .single()\
        .execute()
    
    if not artifact_result.data:
        raise HTTPException(status_code=404, detail=f"Artifact '{artifact}' not found for this study")
    
    artifact_data = artifact_result.data
    
    # Try to get from storage
    try:
        file_data = supabase.storage.from_("studies").download(artifact_data["storage_path"])
        
        # Log download
        supabase.table("study_audit_logs").insert({
            "study_id": study_id,
            "action": "downloaded",
            "performed_by": user["id"],
            "details": {"artifact_type": artifact}
        }).execute()
        
        # Determine content type
        content_types = {
            "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "zip_audit_package": "application/zip",
            "pdf_summary": "application/pdf",
            "json_export": "application/json"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_types.get(artifact, "application/octet-stream"),
            headers={
                "Content-Disposition": f"attachment; filename={artifact_data['filename']}"
            }
        )
    except Exception as e:
        logger.error(f"Error downloading artifact: {e}")
        raise HTTPException(status_code=500, detail="Failed to download artifact")


@router.post("/{study_id}/audit-package")
async def generate_audit_package(
    study_id: str,
    authorization: str = Query(None, alias="Authorization")
):
    """
    Generate a ZIP audit package containing:
    - Excel report
    - JSON export of study data
    - Evidence files/references
    - README summary
    """
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study_result = supabase.table("studies")\
        .select("*")\
        .eq("id", study_id)\
        .single()\
        .execute()
    
    if not study_result.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study = study_result.data
    
    # Verify CPA/Executive access
    if not check_cpa_or_executive(user, study["organization_id"]):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    try:
        # Get client company for naming
        client_result = supabase.table("client_companies")\
            .select("name")\
            .eq("id", study["client_company_id"])\
            .single()\
            .execute()
        client_name = client_result.data["name"] if client_result.data else "Client"
        
        # Get Excel artifact
        excel_artifact = supabase.table("study_artifacts")\
            .select("*")\
            .eq("study_id", study_id)\
            .eq("artifact_type", "excel")\
            .single()\
            .execute()
        
        # Get decisions with project names
        decisions = supabase.table("study_decisions")\
            .select("*, projects(name)")\
            .eq("study_id", study_id)\
            .execute()
        
        # Get referenced evidence
        evidence_ids = study.get("evidence_ids", [])
        evidence_items = []
        if evidence_ids:
            evidence_result = supabase.table("project_evidence_items")\
                .select("*")\
                .in_("id", evidence_ids)\
                .execute()
            evidence_items = evidence_result.data or []
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add Excel if available
            if excel_artifact.data:
                try:
                    excel_data = supabase.storage.from_("studies").download(
                        excel_artifact.data["storage_path"]
                    )
                    zf.writestr(
                        f"RD_Study_{client_name}_{study['tax_year']}_v{study['version']}.xlsx",
                        excel_data
                    )
                except Exception as e:
                    logger.warning(f"Could not include Excel in audit package: {e}")
            
            # Add JSON export
            json_export = {
                "study_id": study["id"],
                "version": study["version"],
                "tax_year": study["tax_year"],
                "client_company_id": study["client_company_id"],
                "generated_at": study["generated_at"],
                "inputs_snapshot_hash": study["inputs_snapshot_hash"],
                "total_qre": study["total_qre"],
                "total_credit": study["total_credit"],
                "qualified_projects_count": study["qualified_projects_count"],
                "credit_method": study["credit_method"],
                "recommended_method": study.get("recommended_method"),
                "evaluation_ids": study.get("evaluation_ids", []),
                "decisions": decisions.data or [],
                "evidence_references": [
                    {
                        "id": e["id"],
                        "evidence_type": e["evidence_type"],
                        "filename": e.get("metadata", {}).get("filename", "unknown"),
                        "extracted_text_preview": (e.get("extracted_text", "") or "")[:500]
                    }
                    for e in evidence_items
                ]
            }
            zf.writestr("study_data.json", json.dumps(json_export, indent=2, default=str))
            
            # Add README
            readme_content = f"""R&D TAX CREDIT STUDY - AUDIT PACKAGE
=====================================

Study Information:
- Study ID: {study['id']}
- Version: {study['version']}
- Tax Year: {study['tax_year']}
- Generated: {study['generated_at']}
- Status: {study['status']}

Summary:
- Total QRE: ${study['total_qre']:,.2f}
- Estimated Credit: ${study['total_credit']:,.2f}
- Qualified Projects: {study['qualified_projects_count']}
- Risk Flags: {study['risk_flags_count']}

Traceability:
- Inputs Hash: {study['inputs_snapshot_hash']}
- AI Evaluations Used: {len(study.get('evaluation_ids', []))}
- Evidence Items Referenced: {len(evidence_items)}

Contents:
1. RD_Study_*.xlsx - 13-worksheet Excel report
2. study_data.json - Machine-readable study data
3. evidence/ - Referenced evidence files (if available)
4. README.txt - This file

Integrity:
- All files are checksummed
- Study data is immutable once approved
- Regeneration creates new version, preserves history

Generated by TaxScape Pro - R&D Tax Credit Automation
"""
            zf.writestr("README.txt", readme_content)
            
            # Add evidence references folder
            if evidence_items:
                evidence_manifest = []
                for ev in evidence_items:
                    evidence_manifest.append({
                        "id": ev["id"],
                        "type": ev["evidence_type"],
                        "filename": ev.get("metadata", {}).get("filename"),
                        "storage_path": ev.get("file_id"),
                        "extraction_status": ev.get("extraction_status")
                    })
                zf.writestr("evidence/manifest.json", json.dumps(evidence_manifest, indent=2))
        
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()
        
        # Compute checksum
        zip_checksum = hashlib.sha256(zip_bytes).hexdigest()
        
        # Store ZIP
        storage_path = f"{study['organization_id']}/{study['client_company_id']}/{study['tax_year']}/audit_package_{study_id}.zip"
        
        try:
            supabase.storage.from_("studies").upload(
                storage_path,
                zip_bytes,
                {"content-type": "application/zip"}
            )
        except Exception as storage_error:
            logger.warning(f"Could not upload audit package to storage: {storage_error}")
        
        # Create artifact record
        filename = f"Audit_Package_{client_name}_{study['tax_year']}_v{study['version']}.zip"
        
        artifact_data = {
            "study_id": study_id,
            "artifact_type": "zip_audit_package",
            "storage_path": storage_path,
            "filename": filename,
            "file_size": len(zip_bytes),
            "sha256_checksum": zip_checksum,
            "metadata": {
                "contains_excel": bool(excel_artifact.data),
                "contains_json": True,
                "evidence_count": len(evidence_items)
            }
        }
        
        # Upsert (replace if exists)
        supabase.table("study_artifacts")\
            .upsert(artifact_data, on_conflict="study_id,artifact_type")\
            .execute()
        
        # Log
        supabase.table("study_audit_logs").insert({
            "study_id": study_id,
            "action": "audit_package_generated",
            "performed_by": user["id"],
            "details": {
                "checksum": zip_checksum,
                "size_bytes": len(zip_bytes)
            }
        }).execute()
        
        return {
            "success": True,
            "download_url": f"/api/studies/{study_id}/download?artifact=zip_audit_package",
            "filename": filename,
            "size_bytes": len(zip_bytes),
            "checksum": zip_checksum
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating audit package: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STUDY WORKFLOW ENDPOINTS
# =============================================================================

@router.post("/{study_id}/submit-review")
async def submit_study_for_review(
    study_id: str,
    authorization: str = Query(None, alias="Authorization")
):
    """Submit study for review (draft → in_review)"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study = supabase.table("studies").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study_data = study.data
    
    if study_data["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft studies can be submitted for review")
    
    if study_data["locked"]:
        raise HTTPException(status_code=400, detail="Study is locked")
    
    # Update status
    supabase.table("studies").update({
        "status": "in_review",
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", study_id).execute()
    
    # Log
    supabase.table("study_audit_logs").insert({
        "study_id": study_id,
        "action": "submitted_review",
        "performed_by": user["id"],
        "previous_status": "draft",
        "new_status": "in_review"
    }).execute()
    
    return {"success": True, "status": "in_review"}


@router.post("/{study_id}/approve")
async def approve_study(
    study_id: str,
    approval_notes: Optional[str] = None,
    authorization: str = Query(None, alias="Authorization")
):
    """Approve study (in_review → approved). Locks the study."""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study = supabase.table("studies").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study_data = study.data
    
    # Verify CPA/Executive
    if not check_cpa_or_executive(user, study_data["organization_id"]):
        raise HTTPException(status_code=403, detail="CPA or Executive role required to approve")
    
    if study_data["status"] not in ["draft", "in_review"]:
        raise HTTPException(status_code=400, detail="Study must be in draft or in_review status to approve")
    
    # Supersede older approved studies
    supabase.rpc("supersede_older_studies", {"p_study_id": study_id}).execute()
    
    # Approve and lock
    supabase.table("studies").update({
        "status": "approved",
        "approved_by": user["id"],
        "approved_at": datetime.utcnow().isoformat(),
        "approval_notes": approval_notes,
        "locked": True,
        "locked_at": datetime.utcnow().isoformat(),
        "locked_by": user["id"],
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", study_id).execute()
    
    # Lock decisions
    supabase.table("study_decisions").update({
        "locked": True,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("study_id", study_id).execute()
    
    # Log
    supabase.table("study_audit_logs").insert({
        "study_id": study_id,
        "action": "approved",
        "performed_by": user["id"],
        "previous_status": study_data["status"],
        "new_status": "approved",
        "details": {"approval_notes": approval_notes}
    }).execute()
    
    return {"success": True, "status": "approved", "locked": True}


@router.post("/{study_id}/reject")
async def reject_study(
    study_id: str,
    rejection_reason: str,
    authorization: str = Query(None, alias="Authorization")
):
    """Reject study (in_review → rejected)"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study = supabase.table("studies").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study_data = study.data
    
    if not check_cpa_or_executive(user, study_data["organization_id"]):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    if study_data["status"] != "in_review":
        raise HTTPException(status_code=400, detail="Only studies in review can be rejected")
    
    # Reject
    supabase.table("studies").update({
        "status": "rejected",
        "rejected_by": user["id"],
        "rejected_at": datetime.utcnow().isoformat(),
        "rejection_reason": rejection_reason,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", study_id).execute()
    
    # Log
    supabase.table("study_audit_logs").insert({
        "study_id": study_id,
        "action": "rejected",
        "performed_by": user["id"],
        "previous_status": "in_review",
        "new_status": "rejected",
        "details": {"rejection_reason": rejection_reason}
    }).execute()
    
    return {"success": True, "status": "rejected"}


# =============================================================================
# STUDY LISTING
# =============================================================================

@router.get("/client/{client_company_id}")
async def list_client_studies(
    client_company_id: str,
    tax_year: Optional[int] = None,
    status: Optional[str] = None,
    authorization: str = Query(None, alias="Authorization")
):
    """List all studies for a client company"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Build query
    query = supabase.table("studies")\
        .select("*, study_artifacts(artifact_type, filename)")\
        .eq("client_company_id", client_company_id)\
        .order("version", desc=True)
    
    if tax_year:
        query = query.eq("tax_year", tax_year)
    
    if status:
        query = query.eq("status", status)
    
    result = query.execute()
    
    return {"studies": result.data or []}


@router.get("/{study_id}/traceability")
async def get_study_traceability(
    study_id: str,
    authorization: str = Query(None, alias="Authorization")
):
    """Get full traceability information for a study"""
    user = await get_current_user(authorization)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Get study
    study = supabase.table("studies").select("*").eq("id", study_id).single().execute()
    if not study.data:
        raise HTTPException(status_code=404, detail="Study not found")
    
    study_data = study.data
    
    # Get evaluations used
    evaluation_ids = study_data.get("evaluation_ids", [])
    evaluations = []
    if evaluation_ids:
        eval_result = supabase.table("project_ai_evaluations")\
            .select("id, project_id, evaluation_version, model_name, prompt_version, confidence_score, created_at")\
            .in_("id", evaluation_ids)\
            .execute()
        evaluations = eval_result.data or []
    
    # Get evidence referenced
    evidence_ids = study_data.get("evidence_ids", [])
    evidence = []
    if evidence_ids:
        ev_result = supabase.table("project_evidence_items")\
            .select("id, evidence_type, metadata, extraction_status, created_at")\
            .in_("id", evidence_ids)\
            .execute()
        evidence = ev_result.data or []
    
    # Get audit log
    audit_result = supabase.table("study_audit_logs")\
        .select("*")\
        .eq("study_id", study_id)\
        .order("performed_at", desc=True)\
        .execute()
    
    return {
        "study_id": study_id,
        "version": study_data["version"],
        "inputs_snapshot_hash": study_data["inputs_snapshot_hash"],
        "generated_at": study_data["generated_at"],
        "recompute_timestamp": study_data.get("recompute_timestamp"),
        "evaluations": evaluations,
        "evidence": evidence,
        "audit_log": audit_result.data or []
    }

