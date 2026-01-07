"""
Suggestions & Action Center Routes

Provides deterministic suggestions and next best actions for passive AI assistance.
Aggregates from staleness model, gaps, tasks, and automated review.
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

router = APIRouter(prefix="/api/copilot", tags=["copilot-suggestions"])


# =============================================================================
# SUGGESTION TYPES
# =============================================================================

class SuggestionType(str, Enum):
    RECOMPUTE = "recompute"
    RE_EVALUATE = "re_evaluate"
    RESOLVE_GAP = "resolve_gap"
    UPLOAD_EVIDENCE = "upload_evidence"
    ASSIGN_TASK = "assign_task"
    COMPLETE_TASK = "complete_task"
    ANSWER_QUESTIONNAIRE = "answer_questionnaire"
    REVIEW_PROJECT = "review_project"
    GENERATE_STUDY = "generate_study"
    APPROVE_STUDY = "approve_study"


class SuggestionPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Suggestion(BaseModel):
    id: str
    type: SuggestionType
    priority: SuggestionPriority
    title: str
    description: str
    reason: str
    action_label: str
    action_route: Optional[str] = None
    action_params: Dict[str, Any] = Field(default_factory=dict)
    target_type: Optional[str] = None  # 'project', 'gap', 'task', etc.
    target_id: Optional[str] = None
    estimated_effort: str = "S"  # S, M, L
    blocking: bool = False
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SuggestionsResponse(BaseModel):
    suggestions: List[Suggestion]
    total_count: int
    critical_count: int
    dismissed_count: int
    client_company_id: Optional[str]
    tax_year: Optional[int]


# =============================================================================
# SUGGESTION GENERATION (DETERMINISTIC)
# =============================================================================

def generate_suggestions(
    auth: AuthContext,
    client_company_id: str,
    tax_year: int,
    dismissed_keys: set,
    limit: int = 20
) -> List[Suggestion]:
    """
    Generate deterministic suggestions from workspace state.
    No AI calls - pure rule-based logic.
    """
    suggestions = []
    supabase = get_supabase()
    
    if not supabase:
        return suggestions
    
    try:
        # 1. Check staleness - needs recompute
        staleness = _check_staleness(supabase, client_company_id, tax_year)
        if staleness.get("is_stale") and f"recompute_{client_company_id}_{tax_year}" not in dismissed_keys:
            suggestions.append(Suggestion(
                id=f"recompute_{client_company_id}_{tax_year}",
                type=SuggestionType.RECOMPUTE,
                priority=SuggestionPriority.HIGH,
                title="Data needs recompute",
                description=f"Inputs changed since last recompute on {staleness.get('last_recompute_at', 'unknown')}",
                reason="QRE totals and derived outputs may be stale",
                action_label="Recompute Now",
                action_route="/workspace/rd-analysis",
                action_params={"action": "recompute"},
                estimated_effort="S",
                blocking=False
            ))
        
        # 2. Check unresolved critical gaps
        gaps = _get_open_gaps(supabase, client_company_id, tax_year)
        for gap in gaps[:5]:  # Limit to 5 gap suggestions
            gap_key = f"gap_{gap['id']}"
            if gap_key in dismissed_keys:
                continue
            
            priority = SuggestionPriority.CRITICAL if gap.get("severity") == "high" else SuggestionPriority.HIGH
            suggestions.append(Suggestion(
                id=gap_key,
                type=SuggestionType.RESOLVE_GAP,
                priority=priority,
                title=f"Resolve: {gap.get('description', 'Information gap')[:50]}",
                description=gap.get("description", ""),
                reason=f"Blocking project qualification ({gap.get('gap_type', 'unknown')})",
                action_label="Resolve Gap",
                action_route=f"/workspace/projects/{gap.get('project_id')}",
                action_params={"tab": "gaps", "gap_id": gap["id"]},
                target_type="gap",
                target_id=gap["id"],
                estimated_effort="M",
                blocking=gap.get("severity") == "high"
            ))
        
        # 3. Check projects without AI evaluation
        unevaluated = _get_unevaluated_projects(supabase, client_company_id, tax_year)
        for proj in unevaluated[:3]:
            proj_key = f"evaluate_{proj['id']}"
            if proj_key in dismissed_keys:
                continue
            
            suggestions.append(Suggestion(
                id=proj_key,
                type=SuggestionType.RE_EVALUATE,
                priority=SuggestionPriority.MEDIUM,
                title=f"Evaluate: {proj.get('name', 'Project')[:40]}",
                description="Project hasn't been evaluated with AI yet",
                reason="Run four-part test to determine qualification",
                action_label="Run AI Evaluation",
                action_route=f"/workspace/projects/{proj['id']}",
                action_params={"tab": "qualification", "action": "evaluate"},
                target_type="project",
                target_id=proj["id"],
                estimated_effort="S",
                blocking=False
            ))
        
        # 4. Check incomplete tasks assigned to user
        if auth.has_capability(Capability.VIEW_ASSIGNED_TASKS):
            tasks = _get_user_pending_tasks(supabase, auth.user_id, client_company_id)
            for task in tasks[:3]:
                task_key = f"task_{task['id']}"
                if task_key in dismissed_keys:
                    continue
                
                is_overdue = task.get("due_date") and task["due_date"] < datetime.utcnow().isoformat()
                priority = SuggestionPriority.CRITICAL if is_overdue else SuggestionPriority.MEDIUM
                
                suggestions.append(Suggestion(
                    id=task_key,
                    type=SuggestionType.COMPLETE_TASK,
                    priority=priority,
                    title=f"Task: {task.get('title', 'Untitled')[:40]}",
                    description=task.get("description", "")[:100],
                    reason="Overdue" if is_overdue else f"Due {task.get('due_date', 'soon')}",
                    action_label="Complete Task",
                    action_route="/workspace/tasks",
                    action_params={"task_id": task["id"]},
                    target_type="task",
                    target_id=task["id"],
                    estimated_effort="M",
                    blocking=is_overdue
                ))
        
        # 5. Check unanswered questionnaire items
        questionnaire_items = _get_unanswered_questionnaire_items(supabase, client_company_id, tax_year)
        if questionnaire_items and f"questionnaire_{client_company_id}" not in dismissed_keys:
            suggestions.append(Suggestion(
                id=f"questionnaire_{client_company_id}",
                type=SuggestionType.ANSWER_QUESTIONNAIRE,
                priority=SuggestionPriority.MEDIUM,
                title=f"{len(questionnaire_items)} unanswered questions",
                description="Project questionnaire items need responses",
                reason="Required for complete qualification documentation",
                action_label="Answer Questions",
                action_route="/workspace/projects",
                action_params={"filter": "questionnaire"},
                estimated_effort="M",
                blocking=False
            ))
        
        # 6. Check if ready for study generation
        if auth.has_capability(Capability.GENERATE_STUDIES):
            readiness = _check_study_readiness(supabase, client_company_id, tax_year)
            if readiness.get("ready") and f"generate_study_{client_company_id}_{tax_year}" not in dismissed_keys:
                suggestions.append(Suggestion(
                    id=f"generate_study_{client_company_id}_{tax_year}",
                    type=SuggestionType.GENERATE_STUDY,
                    priority=SuggestionPriority.LOW,
                    title="Ready to generate study",
                    description=f"{readiness.get('qualified_projects', 0)} qualified projects ready",
                    reason="All critical gaps resolved, data is current",
                    action_label="Generate Study",
                    action_route="/workspace/studies",
                    action_params={"action": "new"},
                    estimated_effort="S",
                    blocking=False
                ))
        
        # 7. Check for studies pending approval
        if auth.has_capability(Capability.APPROVE_STUDIES):
            pending_studies = _get_pending_approval_studies(supabase, client_company_id, tax_year)
            for study in pending_studies[:2]:
                study_key = f"approve_study_{study['id']}"
                if study_key in dismissed_keys:
                    continue
                
                suggestions.append(Suggestion(
                    id=study_key,
                    type=SuggestionType.APPROVE_STUDY,
                    priority=SuggestionPriority.HIGH,
                    title=f"Review Study v{study.get('version', 1)}",
                    description="Study submitted for approval",
                    reason=f"${study.get('total_credit', 0):,.0f} estimated credit",
                    action_label="Review & Approve",
                    action_route="/workspace/studies",
                    action_params={"study_id": study["id"]},
                    target_type="study",
                    target_id=study["id"],
                    estimated_effort="M",
                    blocking=False
                ))
        
        # Sort by priority and limit
        priority_order = {
            SuggestionPriority.CRITICAL: 0,
            SuggestionPriority.HIGH: 1,
            SuggestionPriority.MEDIUM: 2,
            SuggestionPriority.LOW: 3,
        }
        suggestions.sort(key=lambda s: (priority_order.get(s.priority, 99), s.created_at))
        
        return suggestions[:limit]
        
    except Exception as e:
        logger.error(f"Error generating suggestions: {e}")
        return []


def _check_staleness(supabase, client_company_id: str, tax_year: int) -> Dict[str, Any]:
    """Check if workspace data is stale"""
    try:
        # Get last recompute time from qre_summaries
        qre = supabase.table("qre_summaries")\
            .select("created_at")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        
        last_recompute = qre.data[0]["created_at"] if qre.data else None
        
        # Check if any inputs modified after recompute
        if last_recompute:
            # Check projects
            projects = supabase.table("projects")\
                .select("id")\
                .eq("client_company_id", client_company_id)\
                .gt("updated_at", last_recompute)\
                .limit(1)\
                .execute()
            
            if projects.data:
                return {"is_stale": True, "last_recompute_at": last_recompute, "reason": "projects_updated"}
            
            # Check employees
            employees = supabase.table("employees")\
                .select("id")\
                .eq("client_company_id", client_company_id)\
                .gt("updated_at", last_recompute)\
                .limit(1)\
                .execute()
            
            if employees.data:
                return {"is_stale": True, "last_recompute_at": last_recompute, "reason": "employees_updated"}
        else:
            # Never recomputed
            return {"is_stale": True, "last_recompute_at": None, "reason": "never_computed"}
        
        return {"is_stale": False, "last_recompute_at": last_recompute}
        
    except Exception as e:
        logger.warning(f"Error checking staleness: {e}")
        return {"is_stale": False}


def _get_open_gaps(supabase, client_company_id: str, tax_year: int) -> List[Dict]:
    """Get open/in_progress gaps"""
    try:
        result = supabase.table("project_gaps")\
            .select("*")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)\
            .in_("status", ["open", "in_progress"])\
            .order("severity", desc=True)\
            .limit(10)\
            .execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Error fetching gaps: {e}")
        return []


def _get_unevaluated_projects(supabase, client_company_id: str, tax_year: int) -> List[Dict]:
    """Get projects without AI evaluation"""
    try:
        # Get all projects
        projects = supabase.table("projects")\
            .select("id, name")\
            .eq("client_company_id", client_company_id)\
            .execute()
        
        if not projects.data:
            return []
        
        # Get projects with evaluations
        evals = supabase.table("project_ai_evaluations")\
            .select("project_id")\
            .eq("tax_year", tax_year)\
            .execute()
        
        evaluated_ids = {e["project_id"] for e in (evals.data or [])}
        
        return [p for p in projects.data if p["id"] not in evaluated_ids]
        
    except Exception as e:
        logger.warning(f"Error fetching unevaluated projects: {e}")
        return []


def _get_user_pending_tasks(supabase, user_id: str, client_company_id: str) -> List[Dict]:
    """Get pending tasks for user"""
    try:
        result = supabase.table("tasks")\
            .select("*")\
            .eq("assigned_to", user_id)\
            .eq("client_company_id", client_company_id)\
            .in_("status", ["pending", "in_progress"])\
            .order("due_date")\
            .limit(10)\
            .execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Error fetching tasks: {e}")
        return []


def _get_unanswered_questionnaire_items(supabase, client_company_id: str, tax_year: int) -> List[Dict]:
    """Get questionnaire items without answers"""
    try:
        result = supabase.table("project_questionnaire_items")\
            .select("id, question, project_id")\
            .eq("tax_year", tax_year)\
            .is_("response", None)\
            .limit(20)\
            .execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Error fetching questionnaire items: {e}")
        return []


def _check_study_readiness(supabase, client_company_id: str, tax_year: int) -> Dict[str, Any]:
    """Check if ready for study generation"""
    try:
        # Count qualified projects
        evals = supabase.table("project_ai_evaluations")\
            .select("id, qualified_boolean")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)\
            .execute()
        
        qualified = len([e for e in (evals.data or []) if e.get("qualified_boolean")])
        
        # Check for critical gaps
        gaps = supabase.table("project_gaps")\
            .select("id")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)\
            .eq("severity", "high")\
            .in_("status", ["open", "in_progress"])\
            .limit(1)\
            .execute()
        
        has_critical_gaps = bool(gaps.data)
        
        return {
            "ready": qualified > 0 and not has_critical_gaps,
            "qualified_projects": qualified,
            "has_critical_gaps": has_critical_gaps,
        }
        
    except Exception as e:
        logger.warning(f"Error checking study readiness: {e}")
        return {"ready": False}


def _get_pending_approval_studies(supabase, client_company_id: str, tax_year: int) -> List[Dict]:
    """Get studies pending approval"""
    try:
        result = supabase.table("studies")\
            .select("*")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)\
            .eq("status", "in_review")\
            .order("generated_at", desc=True)\
            .limit(5)\
            .execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Error fetching pending studies: {e}")
        return []


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get("/suggestions", response_model=SuggestionsResponse)
@rate_limit("suggestions")
async def get_suggestions(
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    limit: int = Query(default=20, le=50),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get deterministic suggestions for the current workspace context.
    Suggestions are rule-based, not AI-generated.
    """
    # Verify client access
    verify_client_access(auth, client_company_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Get dismissed suggestions
    dismissed_result = supabase.table("dismissed_suggestions")\
        .select("suggestion_key, snooze_until")\
        .eq("user_id", auth.user_id)\
        .eq("client_company_id", client_company_id)\
        .eq("tax_year", tax_year)\
        .execute()
    
    now = datetime.utcnow()
    dismissed_keys = set()
    for d in (dismissed_result.data or []):
        snooze_until = d.get("snooze_until")
        if snooze_until is None or snooze_until > now.isoformat():
            dismissed_keys.add(d["suggestion_key"])
    
    # Generate suggestions
    suggestions = generate_suggestions(
        auth=auth,
        client_company_id=client_company_id,
        tax_year=tax_year,
        dismissed_keys=dismissed_keys,
        limit=limit
    )
    
    critical_count = len([s for s in suggestions if s.priority == SuggestionPriority.CRITICAL])
    
    return SuggestionsResponse(
        suggestions=suggestions,
        total_count=len(suggestions),
        critical_count=critical_count,
        dismissed_count=len(dismissed_keys),
        client_company_id=client_company_id,
        tax_year=tax_year
    )


class DismissSuggestionRequest(BaseModel):
    suggestion_key: str
    snooze_hours: Optional[int] = None  # None = permanent dismiss, number = snooze for hours


@router.post("/suggestions/dismiss")
async def dismiss_suggestion(
    request: DismissSuggestionRequest,
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """Dismiss or snooze a suggestion"""
    verify_client_access(auth, client_company_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    snooze_until = None
    if request.snooze_hours:
        snooze_until = (datetime.utcnow() + timedelta(hours=request.snooze_hours)).isoformat()
    
    # Upsert dismissed suggestion
    supabase.table("dismissed_suggestions").upsert({
        "user_id": auth.user_id,
        "organization_id": auth.org_id,
        "client_company_id": client_company_id,
        "tax_year": tax_year,
        "suggestion_type": request.suggestion_key.split("_")[0],
        "suggestion_key": request.suggestion_key,
        "dismissed_at": datetime.utcnow().isoformat(),
        "snooze_until": snooze_until,
    }, on_conflict="user_id,client_company_id,tax_year,suggestion_key").execute()
    
    return {"success": True, "dismissed_key": request.suggestion_key}


@router.post("/suggestions/restore")
async def restore_suggestion(
    suggestion_key: str = Query(...),
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """Restore a dismissed suggestion"""
    verify_client_access(auth, client_company_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    supabase.table("dismissed_suggestions")\
        .delete()\
        .eq("user_id", auth.user_id)\
        .eq("client_company_id", client_company_id)\
        .eq("tax_year", tax_year)\
        .eq("suggestion_key", suggestion_key)\
        .execute()
    
    return {"success": True, "restored_key": suggestion_key}

