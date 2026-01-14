"""
CPA Dashboard Routes

Provides aggregated dashboard data for the CPA Home experience.
Single source of truth for pipeline status, readiness, and next actions.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.supabase_client import get_supabase
from app.auth_permissions import (
    AuthContext, get_auth_context, verify_client_access,
    Capability, rate_limit
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class PipelineStep(BaseModel):
    id: str
    name: str
    description: str
    status: str  # 'not_started', 'in_progress', 'completed', 'blocked'
    completion_percent: int
    blockers_count: int
    next_action: Optional[str]
    next_action_route: Optional[str]
    last_updated: Optional[str]


class ReadinessBreakdown(BaseModel):
    data_completeness: int
    questionnaire_completeness: int
    gaps_resolved: int
    evidence_coverage: int
    ai_evaluation_freshness: int
    automated_review_resolved: int
    study_decisions_locked: int


class Blocker(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    description: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    action_route: Optional[str]
    action_label: Optional[str]


class RiskFlag(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    description: str
    entity_id: Optional[str]
    entity_route: Optional[str]


class StudyStatus(BaseModel):
    has_draft: bool
    has_approved: bool
    latest_draft_id: Optional[str]
    latest_draft_version: Optional[int]
    latest_draft_status: Optional[str]
    latest_approved_id: Optional[str]
    latest_approved_version: Optional[int]
    can_generate: bool
    can_submit_review: bool
    can_download_audit_package: bool


class NextAction(BaseModel):
    id: str
    priority: str
    title: str
    reason: str
    effort: str
    blocking: bool
    action_label: str
    action_route: Optional[str]
    action_params: Dict[str, Any] = Field(default_factory=dict)


class ClientDashboardSummary(BaseModel):
    # Context
    client_company_id: str
    client_name: str
    tax_year: int
    organization_id: str
    
    # Timestamps
    last_input_update: Optional[str]
    last_recompute: Optional[str]
    last_ai_evaluation: Optional[str]
    last_study_generation: Optional[str]
    
    # Pipeline
    pipeline_steps: List[PipelineStep]
    current_step: int
    
    # Readiness
    readiness_score: int
    readiness_breakdown: ReadinessBreakdown
    top_blockers: List[Blocker]
    
    # Next Actions
    next_actions: List[NextAction]
    
    # Risk & Audit
    risk_flags: List[RiskFlag]
    high_wage_flags_count: int
    foreign_vendor_flags_count: int
    low_confidence_projects_count: int
    missing_documentation_count: int
    
    # Study
    study_status: StudyStatus
    
    # Summary counts
    projects_count: int
    qualified_projects_count: int
    employees_count: int
    total_qre: float
    estimated_credit: float


# =============================================================================
# MAIN DASHBOARD ENDPOINT
# =============================================================================

@router.get("/client-summary", response_model=ClientDashboardSummary)
@rate_limit("dashboard")
async def get_client_dashboard_summary(
    client_id: str = Query(..., alias="client_company_id"),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get comprehensive dashboard summary for a client.
    This is the single aggregation endpoint for the CPA Home Dashboard.
    """
    verify_client_access(auth, client_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Get client info
        client = supabase.table("client_companies")\
            .select("*, organizations(name)")\
            .eq("id", client_id)\
            .single()\
            .execute()
        
        if not client.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_data = client.data
        
        # Gather all data in parallel-like fashion
        data = _gather_dashboard_data(supabase, client_id, tax_year)
        
        # Build pipeline steps
        pipeline_steps = _build_pipeline_steps(data)
        current_step = _determine_current_step(pipeline_steps)
        
        # Build readiness
        readiness = _compute_readiness(data)
        
        # Build blockers
        blockers = _build_blockers(data)
        
        # Build next actions
        next_actions = _build_next_actions(data, pipeline_steps, blockers)
        
        # Build risk flags
        risk_flags = _build_risk_flags(data)
        
        # Build study status
        study_status = _build_study_status(data)
        
        return ClientDashboardSummary(
            client_company_id=client_id,
            client_name=client_data.get("name", "Unknown"),
            tax_year=tax_year,
            organization_id=client_data.get("organization_id", ""),
            
            last_input_update=data.get("last_input_update"),
            last_recompute=data.get("last_recompute"),
            last_ai_evaluation=data.get("last_ai_evaluation"),
            last_study_generation=data.get("last_study_generation"),
            
            pipeline_steps=pipeline_steps,
            current_step=current_step,
            
            readiness_score=readiness["score"],
            readiness_breakdown=ReadinessBreakdown(**readiness["breakdown"]),
            top_blockers=blockers[:5],  # Top 5 blockers
            
            next_actions=next_actions[:10],  # Top 10 actions
            
            risk_flags=risk_flags[:10],
            high_wage_flags_count=data.get("high_wage_flags_count", 0),
            foreign_vendor_flags_count=data.get("foreign_vendor_flags_count", 0),
            low_confidence_projects_count=data.get("low_confidence_projects_count", 0),
            missing_documentation_count=data.get("missing_requests_count", 0),
            
            study_status=study_status,
            
            projects_count=data.get("projects_count", 0),
            qualified_projects_count=data.get("qualified_projects_count", 0),
            employees_count=data.get("employees_count", 0),
            total_qre=data.get("total_qre", 0),
            estimated_credit=data.get("estimated_credit", 0),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building dashboard summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to build dashboard")


def _gather_dashboard_data(supabase, client_id: str, tax_year: int) -> Dict[str, Any]:
    """Gather all data needed for dashboard in efficient queries.
    Uses try-except for each query to handle missing tables gracefully."""
    data = {}
    
    # Initialize defaults
    data["projects"] = []
    data["projects_count"] = 0
    data["last_input_update"] = None
    data["employees_count"] = 0
    data["vendors_count"] = 0
    data["foreign_vendor_flags_count"] = 0
    data["total_qre"] = 0
    data["estimated_credit"] = 0
    data["last_recompute"] = None
    data["evaluations"] = []
    data["evaluated_projects_count"] = 0
    data["qualified_projects_count"] = 0
    data["low_confidence_projects_count"] = 0
    data["last_ai_evaluation"] = None
    data["gaps"] = []
    data["total_gaps"] = 0
    data["open_gaps_count"] = 0
    data["resolved_gaps_count"] = 0
    data["critical_gaps_count"] = 0
    data["missing_requests"] = []
    data["missing_requests_count"] = 0
    data["critical_missing_count"] = 0
    data["high_wage_flags_count"] = 0
    
    try:
        # Projects - use organization_id since projects don't have client_company_id
        try:
            projects = supabase.table("projects")\
                .select("id, name, updated_at")\
                .execute()
            data["projects"] = projects.data or []
            data["projects_count"] = len(data["projects"])
            if data["projects"]:
                data["last_input_update"] = max(
                    (p.get("updated_at") for p in data["projects"] if p.get("updated_at")), 
                    default=None
                )
        except Exception as e:
            logger.warning(f"Projects query failed: {e}")
        
        # Employees
        try:
            employees = supabase.table("employees")\
                .select("id", count="exact")\
                .eq("client_company_id", client_id)\
                .execute()
            data["employees_count"] = employees.count or 0
        except Exception as e:
            logger.warning(f"Employees query failed: {e}")
        
        # Contractors (formerly vendors)
        try:
            contractors = supabase.table("contractors")\
                .select("id, location", count="exact")\
                .execute()
            data["vendors_count"] = contractors.count or 0
            data["foreign_vendor_flags_count"] = len([
                v for v in (contractors.data or []) 
                if v.get("location") and v["location"] != "US"
            ])
        except Exception as e:
            logger.warning(f"Contractors query failed: {e}")
        
        # QRE Summary - may not exist
        try:
            qre = supabase.table("qre_summaries")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            if qre.data:
                data["last_recompute"] = qre.data[0].get("created_at")
                data["total_qre"] = qre.data[0].get("total_qre", 0)
                data["estimated_credit"] = data["total_qre"] * 0.065
        except Exception as e:
            logger.warning(f"QRE summary query failed: {e}")
        
        # AI Evaluations - may not exist
        try:
            evals = supabase.table("project_ai_evaluations")\
                .select("id, project_id, qualified_boolean, confidence_score, created_at")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .execute()
            
            data["evaluations"] = evals.data or []
            data["evaluated_projects_count"] = len(set(e["project_id"] for e in data["evaluations"]))
            data["qualified_projects_count"] = len([
                e for e in data["evaluations"] if e.get("qualified_boolean")
            ])
            data["low_confidence_projects_count"] = len([
                e for e in data["evaluations"] 
                if e.get("confidence_score", 100) < 70
            ])
            if data["evaluations"]:
                data["last_ai_evaluation"] = max(
                    (e["created_at"] for e in data["evaluations"]), 
                    default=None
                )
        except Exception as e:
            logger.warning(f"AI evaluations query failed: {e}")
        
        # Gaps - may not exist
        try:
            gaps = supabase.table("project_gaps")\
                .select("id, status, severity")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .execute()
            
            data["gaps"] = gaps.data or []
            data["total_gaps"] = len(data["gaps"])
            data["open_gaps_count"] = len([
                g for g in data["gaps"] if g.get("status") in ("open", "in_progress")
            ])
            data["resolved_gaps_count"] = len([
                g for g in data["gaps"] if g.get("status") == "resolved"
            ])
            data["critical_gaps_count"] = len([
                g for g in data["gaps"] 
                if g.get("status") in ("open", "in_progress") and g.get("severity") == "high"
            ])
        except Exception as e:
            logger.warning(f"Gaps query failed: {e}")
        
        # Missing field requests - may not exist
        try:
            missing = supabase.table("missing_field_requests")\
                .select("id, entity_type, field_key, severity, status")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .in_("status", ["open", "in_progress"])\
                .execute()
        
            data["missing_requests"] = missing.data or []
            data["missing_requests_count"] = len(data["missing_requests"])
        except Exception as e:
            logger.warning(f"Missing field requests query failed: {e}")
        
        # Evidence - may not exist
        data["evidence_count"] = 0
        try:
            evidence = supabase.table("project_evidence_items")\
                .select("id", count="exact")\
                .eq("client_company_id", client_id)\
                .execute()
            data["evidence_count"] = evidence.count or 0
        except Exception as e:
            logger.warning(f"Evidence query failed: {e}")
        
        # Studies
        data["studies"] = []
        data["last_study_generation"] = None
        try:
            studies = supabase.table("studies")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .order("version", desc=True)\
                .execute()
            
            data["studies"] = studies.data or []
            if data["studies"]:
                data["last_study_generation"] = max(
                    (s.get("generated_at") for s in data["studies"] if s.get("generated_at")), 
                    default=None
                )
        except Exception as e:
            logger.warning(f"Studies query failed: {e}")
        
        # Timesheets count - may not exist
        data["timesheets_count"] = 0
        try:
            timesheets = supabase.table("timesheets")\
                .select("id", count="exact")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .execute()
            data["timesheets_count"] = timesheets.count or 0
        except Exception as e:
            logger.warning(f"Timesheets query failed: {e}")
        
    except Exception as e:
        logger.error(f"Error gathering dashboard data: {e}")
    
    return data


def _build_pipeline_steps(data: Dict[str, Any]) -> List[PipelineStep]:
    """Build the pipeline step cards."""
    steps = []
    
    # Step 1: Import/Connect Data
    has_data = data["projects_count"] > 0 or data["employees_count"] > 0
    steps.append(PipelineStep(
        id="import",
        name="Import Data",
        description="Import projects, employees, vendors, and financial data",
        status="completed" if has_data else "not_started",
        completion_percent=100 if has_data else 0,
        blockers_count=0,
        next_action="Import data" if not has_data else None,
        next_action_route="/workspace/projects" if not has_data else None,
        last_updated=data.get("last_input_update")
    ))
    
    # Step 2: Verify & Clean
    missing_count = data.get("missing_requests_count", 0)
    verify_status = "completed" if missing_count == 0 and has_data else "in_progress" if has_data else "not_started"
    verify_pct = 100 if missing_count == 0 else max(0, 100 - (missing_count * 5))
    steps.append(PipelineStep(
        id="verify",
        name="Verify & Clean",
        description="Review and complete missing information",
        status=verify_status,
        completion_percent=verify_pct if has_data else 0,
        blockers_count=missing_count,
        next_action=f"Complete {missing_count} missing fields" if missing_count > 0 else None,
        next_action_route="/workspace/missing-info" if missing_count > 0 else None,
        last_updated=None
    ))
    
    # Step 3: Recompute
    has_recompute = data.get("last_recompute") is not None
    steps.append(PipelineStep(
        id="recompute",
        name="Recompute QRE",
        description="Calculate qualified research expenses and §174 allocations",
        status="completed" if has_recompute else "not_started" if has_data else "blocked",
        completion_percent=100 if has_recompute else 0,
        blockers_count=0 if has_data else 1,
        next_action="Run recompute" if has_data and not has_recompute else None,
        next_action_route="/workspace/rd-analysis" if has_data and not has_recompute else None,
        last_updated=data.get("last_recompute")
    ))
    
    # Step 4: Qualify Projects
    projects_count = data["projects_count"]
    evaluated_count = data.get("evaluated_projects_count", 0)
    eval_pct = (evaluated_count * 100 // projects_count) if projects_count > 0 else 0
    steps.append(PipelineStep(
        id="qualify",
        name="Qualify Projects",
        description="Run AI four-part test evaluation on projects",
        status="completed" if evaluated_count >= projects_count and projects_count > 0 else "in_progress" if evaluated_count > 0 else "not_started",
        completion_percent=eval_pct,
        blockers_count=projects_count - evaluated_count,
        next_action=f"Evaluate {projects_count - evaluated_count} projects" if evaluated_count < projects_count else None,
        next_action_route="/workspace/projects" if evaluated_count < projects_count else None,
        last_updated=data.get("last_ai_evaluation")
    ))
    
    # Step 5: Resolve Gaps
    open_gaps = data.get("open_gaps_count", 0)
    total_gaps = data.get("total_gaps", 0)
    resolved_gaps = data.get("resolved_gaps_count", 0)
    gaps_pct = (resolved_gaps * 100 // total_gaps) if total_gaps > 0 else 100
    steps.append(PipelineStep(
        id="resolve",
        name="Resolve Gaps",
        description="Address information gaps and collect evidence",
        status="completed" if open_gaps == 0 and evaluated_count > 0 else "in_progress" if open_gaps > 0 else "not_started",
        completion_percent=gaps_pct,
        blockers_count=open_gaps,
        next_action=f"Resolve {open_gaps} gaps" if open_gaps > 0 else None,
        next_action_route="/workspace/gaps" if open_gaps > 0 else None,
        last_updated=None
    ))
    
    # Step 6: Generate Study
    studies = data.get("studies", [])
    has_draft = any(s["status"] == "draft" for s in studies)
    has_approved = any(s["status"] == "approved" for s in studies)
    study_status = "completed" if has_approved else "in_progress" if has_draft else "not_started"
    steps.append(PipelineStep(
        id="generate",
        name="Generate Study",
        description="Create the R&D tax credit study package",
        status=study_status,
        completion_percent=100 if has_approved else 50 if has_draft else 0,
        blockers_count=data.get("critical_gaps_count", 0),
        next_action="Generate study" if not has_draft and open_gaps == 0 else "Review draft" if has_draft else None,
        next_action_route="/workspace/studies" if not has_approved else None,
        last_updated=data.get("last_study_generation")
    ))
    
    # Step 7: Approve & Lock
    steps.append(PipelineStep(
        id="approve",
        name="Approve & Lock",
        description="Final review and approval of the study",
        status="completed" if has_approved else "in_progress" if has_draft else "not_started",
        completion_percent=100 if has_approved else 0,
        blockers_count=0,
        next_action="Approve study" if has_draft and not has_approved else None,
        next_action_route="/workspace/studies" if has_draft and not has_approved else None,
        last_updated=None
    ))
    
    return steps


def _determine_current_step(steps: List[PipelineStep]) -> int:
    """Determine which step the user should focus on."""
    for i, step in enumerate(steps):
        if step.status in ("not_started", "in_progress", "blocked"):
            return i
    return len(steps) - 1


def _compute_readiness(data: Dict[str, Any]) -> Dict[str, Any]:
    """Compute readiness score and breakdown."""
    projects_count = data.get("projects_count", 0)
    employees_count = data.get("employees_count", 0)
    
    # Data completeness
    data_score = 0
    if projects_count > 0:
        data_score += 40
    if employees_count > 0:
        data_score += 30
    if data.get("vendors_count", 0) > 0:
        data_score += 15
    if data.get("timesheets_count", 0) > 0:
        data_score += 15
    
    # Questionnaire completeness
    missing_count = data.get("missing_requests_count", 0)
    quest_score = max(0, 100 - (missing_count * 5)) if projects_count > 0 else 0
    
    # Gaps resolved
    total_gaps = data.get("total_gaps", 0)
    resolved_gaps = data.get("resolved_gaps_count", 0)
    gaps_score = (resolved_gaps * 100 // total_gaps) if total_gaps > 0 else 100
    
    # Evidence coverage
    evidence_count = data.get("evidence_count", 0)
    evidence_score = min(100, 20 + (evidence_count * 8)) if projects_count > 0 else 0
    
    # AI evaluation freshness
    evaluated_count = data.get("evaluated_projects_count", 0)
    ai_score = (evaluated_count * 100 // projects_count) if projects_count > 0 else 0
    
    # Review resolved (placeholder)
    review_score = 100
    
    # Study decisions
    studies = data.get("studies", [])
    has_approved = any(s["status"] == "approved" for s in studies)
    has_draft = any(s["status"] == "draft" for s in studies)
    study_score = 100 if has_approved else 60 if has_draft else 0
    
    # Weighted total
    total = (
        (data_score * 15) +
        (quest_score * 15) +
        (gaps_score * 20) +
        (evidence_score * 15) +
        (ai_score * 20) +
        (review_score * 5) +
        (study_score * 10)
    ) // 100
    
    return {
        "score": total,
        "breakdown": {
            "data_completeness": data_score,
            "questionnaire_completeness": quest_score,
            "gaps_resolved": gaps_score,
            "evidence_coverage": evidence_score,
            "ai_evaluation_freshness": ai_score,
            "automated_review_resolved": review_score,
            "study_decisions_locked": study_score,
        }
    }


def _build_blockers(data: Dict[str, Any]) -> List[Blocker]:
    """Build list of blockers preventing completion."""
    blockers = []
    
    if data["projects_count"] == 0:
        blockers.append(Blocker(
            id="no_projects",
            type="data_missing",
            severity="critical",
            title="No Projects",
            description="Import at least one R&D project to begin",
            entity_type=None,
            entity_id=None,
            action_route="/workspace/projects",
            action_label="Import Projects"
        ))
    
    if data["employees_count"] == 0:
        blockers.append(Blocker(
            id="no_employees",
            type="data_missing",
            severity="high",
            title="No Employees",
            description="Import employee data for wage QRE calculations",
            entity_type=None,
            entity_id=None,
            action_route="/workspace/employees",
            action_label="Import Employees"
        ))
    
    critical_gaps = data.get("critical_gaps_count", 0)
    if critical_gaps > 0:
        blockers.append(Blocker(
            id="critical_gaps",
            type="unresolved_gap",
            severity="critical",
            title=f"{critical_gaps} Critical Gaps",
            description="Critical information gaps must be resolved before study generation",
            entity_type="gap",
            entity_id=None,
            action_route="/workspace/gaps?severity=high",
            action_label="Resolve Gaps"
        ))
    
    missing_count = data.get("missing_requests_count", 0)
    if missing_count > 5:
        blockers.append(Blocker(
            id="missing_fields",
            type="missing_info",
            severity="high",
            title=f"{missing_count} Missing Fields",
            description="Complete required fields for accurate calculations",
            entity_type=None,
            entity_id=None,
            action_route="/workspace/missing-info",
            action_label="Complete Fields"
        ))
    
    unevaluated = data["projects_count"] - data.get("evaluated_projects_count", 0)
    if unevaluated > 0 and data["projects_count"] > 0:
        blockers.append(Blocker(
            id="unevaluated",
            type="evaluation_pending",
            severity="medium",
            title=f"{unevaluated} Unevaluated Projects",
            description="Run AI qualification on remaining projects",
            entity_type="project",
            entity_id=None,
            action_route="/workspace/projects?filter=unevaluated",
            action_label="Evaluate Projects"
        ))
    
    return blockers


def _build_next_actions(
    data: Dict[str, Any], 
    pipeline_steps: List[PipelineStep],
    blockers: List[Blocker]
) -> List[NextAction]:
    """Build prioritized next actions list."""
    actions = []
    
    # Add blocker-derived actions first
    for blocker in blockers[:3]:
        actions.append(NextAction(
            id=f"blocker_{blocker.id}",
            priority="critical" if blocker.severity == "critical" else "high",
            title=blocker.title,
            reason=blocker.description,
            effort="M",
            blocking=True,
            action_label=blocker.action_label or "Fix",
            action_route=blocker.action_route,
            action_params={}
        ))
    
    # Add pipeline step actions
    for step in pipeline_steps:
        if step.next_action and step.status != "completed":
            priority = "high" if step.status == "blocked" else "medium"
            actions.append(NextAction(
                id=f"step_{step.id}",
                priority=priority,
                title=step.next_action,
                reason=step.description,
                effort="S",
                blocking=step.status == "blocked",
                action_label=step.next_action,
                action_route=step.next_action_route,
                action_params={}
            ))
    
    return actions


def _build_risk_flags(data: Dict[str, Any]) -> List[RiskFlag]:
    """Build risk and audit defense flags."""
    flags = []
    
    if data.get("high_wage_flags_count", 0) > 0:
        flags.append(RiskFlag(
            id="high_wages",
            type="high_wage",
            severity="medium",
            title="High Wage Allocations",
            description=f"{data['high_wage_flags_count']} employees have unusually high R&D wage allocations",
            entity_id=None,
            entity_route="/workspace/employees?flag=high_wage"
        ))
    
    if data.get("foreign_vendor_flags_count", 0) > 0:
        flags.append(RiskFlag(
            id="foreign_vendors",
            type="foreign_vendor",
            severity="medium",
            title="Foreign Vendors",
            description=f"{data['foreign_vendor_flags_count']} vendors are outside the US (contract research exclusion may apply)",
            entity_id=None,
            entity_route="/workspace/contractors?flag=foreign"
        ))
    
    if data.get("low_confidence_projects_count", 0) > 0:
        flags.append(RiskFlag(
            id="low_confidence",
            type="low_confidence",
            severity="high",
            title="Low Confidence Evaluations",
            description=f"{data['low_confidence_projects_count']} projects have AI confidence scores below 70%",
            entity_id=None,
            entity_route="/workspace/projects?filter=low_confidence"
        ))
    
    missing_count = data.get("missing_requests_count", 0)
    if missing_count > 0:
        flags.append(RiskFlag(
            id="missing_docs",
            type="documentation",
            severity="medium" if missing_count < 10 else "high",
            title="Missing Documentation",
            description=f"{missing_count} fields are missing required documentation",
            entity_id=None,
            entity_route="/workspace/missing-info"
        ))
    
    return flags


def _build_study_status(data: Dict[str, Any]) -> StudyStatus:
    """Build study status information."""
    studies = data.get("studies", [])
    
    drafts = [s for s in studies if s["status"] == "draft"]
    approved = [s for s in studies if s["status"] == "approved"]
    in_review = [s for s in studies if s["status"] == "in_review"]
    
    latest_draft = drafts[0] if drafts else None
    latest_approved = approved[0] if approved else None
    
    can_generate = (
        data.get("projects_count", 0) > 0 and
        data.get("critical_gaps_count", 0) == 0 and
        data.get("evaluated_projects_count", 0) > 0
    )
    
    can_submit = latest_draft is not None and not in_review
    can_download = latest_approved is not None
    
    return StudyStatus(
        has_draft=len(drafts) > 0,
        has_approved=len(approved) > 0,
        latest_draft_id=latest_draft["id"] if latest_draft else None,
        latest_draft_version=latest_draft["version"] if latest_draft else None,
        latest_draft_status=latest_draft["status"] if latest_draft else None,
        latest_approved_id=latest_approved["id"] if latest_approved else None,
        latest_approved_version=latest_approved["version"] if latest_approved else None,
        can_generate=can_generate,
        can_submit_review=can_submit,
        can_download_audit_package=can_download
    )


# =============================================================================
# READINESS ENDPOINTS
# =============================================================================

@router.post("/readiness/recompute")
@rate_limit("readiness")
async def recompute_readiness(
    client_id: str = Query(..., alias="client_company_id"),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Recompute and store readiness scores for a client.
    Called after data changes, recompute, evaluation, etc.
    """
    verify_client_access(auth, client_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Gather data and compute
        data = _gather_dashboard_data(supabase, client_id, tax_year)
        readiness = _compute_readiness(data)
        blockers = _build_blockers(data)
        actions = _build_next_actions(data, _build_pipeline_steps(data), blockers)
        
        # Mark old snapshots as not current
        supabase.table("readiness_snapshots")\
            .update({"is_current": False})\
            .eq("client_company_id", client_id)\
            .eq("tax_year", tax_year)\
            .eq("scope_type", "client")\
            .eq("is_current", True)\
            .execute()
        
        # Insert new snapshot
        supabase.table("readiness_snapshots").insert({
            "organization_id": auth.org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "scope_type": "client",
            "project_id": None,
            "score": readiness["score"],
            "component_scores": readiness["breakdown"],
            "blockers": [b.dict() for b in blockers],
            "recommended_actions": [a.dict() for a in actions],
            "is_current": True,
        }).execute()
        
        return {
            "success": True,
            "score": readiness["score"],
            "breakdown": readiness["breakdown"],
            "blockers_count": len(blockers)
        }
        
    except Exception as e:
        logger.error(f"Error recomputing readiness: {e}")
        raise HTTPException(status_code=500, detail="Failed to recompute readiness")


@router.get("/readiness/history")
async def get_readiness_history(
    client_id: str = Query(..., alias="client_company_id"),
    tax_year: int = Query(default=2024),
    limit: int = Query(default=30, le=100),
    auth: AuthContext = Depends(get_auth_context)
):
    """Get readiness score history for charting."""
    verify_client_access(auth, client_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    result = supabase.table("readiness_snapshots")\
        .select("score, component_scores, computed_at")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("scope_type", "client")\
        .order("computed_at", desc=True)\
        .limit(limit)\
        .execute()
    
    return {"history": result.data or []}

