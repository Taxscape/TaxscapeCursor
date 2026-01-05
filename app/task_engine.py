"""
TaxScape Pro - Structured Task & RBAC Engine
=============================================
Handles task routing, permission enforcement, and lifecycle management.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid

logger = logging.getLogger(__name__)

# =============================================================================
# ENUMS & CONSTANTS
# =============================================================================

class CPARole(str, Enum):
    MANAGING_PARTNER = "managing_partner"
    REVIEWER = "reviewer"
    PREPARER = "preparer"
    ASSOCIATE = "associate"
    OPS_ADMIN = "ops_admin"

class TaskType(str, Enum):
    REQUEST_PROJECT_NARRATIVE = "request_project_narrative"
    REQUEST_PROCESS_OF_EXPERIMENTATION_DETAILS = "request_process_of_experimentation_details"
    REQUEST_UNCERTAINTY_STATEMENT = "request_uncertainty_statement"
    REQUEST_TECHNICAL_DOCUMENT_UPLOAD = "request_technical_document_upload"
    REQUEST_TEST_RESULTS_UPLOAD = "request_test_results_upload"
    RESOLVE_FINANCIAL_ANOMALY = "resolve_financial_anomaly"
    VERIFY_EMPLOYEE_ALLOCATION = "verify_employee_allocation"
    VERIFY_CONTRACTOR_QUALIFICATION = "verify_contractor_qualification"
    CONFIRM_SUPPLY_ELIGIBILITY = "confirm_supply_eligibility"
    REVIEW_AI_EVALUATION = "review_ai_evaluation"
    FINAL_REVIEW_AND_SIGNOFF = "final_review_and_signoff"
    GENERIC = "generic"

class TaskStatus(str, Enum):
    DRAFT = "draft"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    CHANGES_REQUESTED = "changes_requested"
    ACCEPTED = "accepted"
    DENIED = "denied"
    BLOCKED = "blocked"
    ESCALATED = "escalated"
    CLOSED = "closed"

class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

# Valid status transitions
STATUS_TRANSITIONS: Dict[TaskStatus, List[TaskStatus]] = {
    TaskStatus.DRAFT: [TaskStatus.ASSIGNED, TaskStatus.CLOSED],
    TaskStatus.ASSIGNED: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CLOSED],
    TaskStatus.IN_PROGRESS: [TaskStatus.SUBMITTED, TaskStatus.BLOCKED, TaskStatus.ESCALATED],
    TaskStatus.SUBMITTED: [TaskStatus.ACCEPTED, TaskStatus.DENIED, TaskStatus.CHANGES_REQUESTED],
    TaskStatus.CHANGES_REQUESTED: [TaskStatus.IN_PROGRESS, TaskStatus.CLOSED],
    TaskStatus.ACCEPTED: [TaskStatus.CLOSED],
    TaskStatus.DENIED: [TaskStatus.CLOSED, TaskStatus.IN_PROGRESS],
    TaskStatus.BLOCKED: [TaskStatus.IN_PROGRESS, TaskStatus.ESCALATED, TaskStatus.CLOSED],
    TaskStatus.ESCALATED: [TaskStatus.IN_PROGRESS, TaskStatus.CLOSED],
    TaskStatus.CLOSED: [TaskStatus.IN_PROGRESS], # Reopen
}

# =============================================================================
# SCHEMAS
# =============================================================================

class TaskCreateRequest(BaseModel):
    client_id: str
    project_id: Optional[str] = None
    criterion_key: Optional[str] = None
    task_type: TaskType = TaskType.GENERIC
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None # If None, auto-route
    related_entities: Optional[Dict[str, Any]] = None
    acceptance_criteria: Optional[List[Dict[str, Any]]] = None
    required_artifacts: Optional[List[Dict[str, Any]]] = None
    initiated_by_ai: bool = False

class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None

class TaskSubmissionRequest(BaseModel):
    artifacts: List[Dict[str, Any]] = []
    notes: Optional[str] = None

class TaskReviewRequest(BaseModel):
    decision: str # 'accepted', 'denied', 'changes_requested'
    reason_code: str
    notes: Optional[str] = None

# =============================================================================
# PERMISSION ENGINE
# =============================================================================

PERMISSION_MATRIX: Dict[CPARole, List[str]] = {
    CPARole.MANAGING_PARTNER: [
        "client.create", "client.edit", "client.delete", "client.configure_engagement",
        "team.manage", "metrics.view_firm",
        "project.create", "project.edit", "project.upload_evidence", "project.trigger_ai_eval",
        "project.mark_criterion", "project.mark_ready_review", "project.approve_reject",
        "task.create", "task.assign", "task.change_status", "task.submit",
        "task.review", "task.escalate", "task.close"
    ],
    CPARole.REVIEWER: [
        "client.create", "client.edit", "client.configure_engagement",
        "project.create", "project.edit", "project.upload_evidence", "project.trigger_ai_eval",
        "project.mark_criterion", "project.mark_ready_review", "project.approve_reject",
        "task.create", "task.assign", "task.change_status", "task.submit",
        "task.review", "task.escalate", "task.close"
    ],
    CPARole.PREPARER: [
        "client.edit", "client.configure_engagement",
        "project.create", "project.edit", "project.upload_evidence", "project.trigger_ai_eval",
        "project.mark_ready_review",
        "task.create", "task.assign", "task.change_status", "task.submit", "task.escalate"
    ],
    CPARole.ASSOCIATE: [
        "project.edit", "project.upload_evidence",
        "task.change_status", "task.submit"
    ],
    CPARole.OPS_ADMIN: [
        "team.manage", "metrics.view_firm"
    ]
}

def check_permission(user_role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    try:
        role = CPARole(user_role)
        return permission in PERMISSION_MATRIX.get(role, [])
    except ValueError:
        return False

def get_user_permissions(user_role: str) -> List[str]:
    """Get all permissions for a role."""
    try:
        role = CPARole(user_role)
        return PERMISSION_MATRIX.get(role, [])
    except ValueError:
        return []

# =============================================================================
# ROUTING ENGINE
# =============================================================================

def get_task_type_config(supabase, org_id: str, task_type: str) -> Dict[str, Any]:
    """Get task type configuration, preferring org-specific over global."""
    # Try org-specific first
    res = supabase.table("task_type_config").select("*").eq("organization_id", org_id).eq("task_type", task_type).execute()
    if res.data:
        return res.data[0]
    
    # Fall back to global
    res = supabase.table("task_type_config").select("*").is_("organization_id", "null").eq("task_type", task_type).execute()
    if res.data:
        return res.data[0]
    
    # Return defaults
    return {
        "default_sla_days": 3,
        "default_priority": "medium",
        "route_to_role": "preparer",
        "requires_review": False,
        "requires_partner_signoff": False,
        "acceptance_criteria_template": [],
        "required_artifacts_template": [],
        "escalation_path": ["preparer", "reviewer", "managing_partner"]
    }

def get_team_assignment(supabase, org_id: str, client_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """Get team assignment for routing, checking project override first."""
    assignment = {}
    
    # Check project-level override
    if project_id:
        res = supabase.table("project_team_overrides").select("*").eq("project_id", project_id).execute()
        if res.data:
            assignment.update({k: v for k, v in res.data[0].items() if v is not None})
    
    # Fill in from client-level
    res = supabase.table("client_team_assignments").select("*").eq("client_id", client_id).execute()
    if res.data:
        client_assignment = res.data[0]
        for key in ["preparer_user_id", "reviewer_user_id", "partner_user_id", "default_associate_user_id"]:
            if key not in assignment or assignment.get(key) is None:
                assignment[key] = client_assignment.get(key)
    
    return assignment

def route_task(supabase, org_id: str, client_id: str, project_id: Optional[str], task_type: str) -> Dict[str, Any]:
    """Determine the best assignee and settings for a new task."""
    config = get_task_type_config(supabase, org_id, task_type)
    assignment = get_team_assignment(supabase, org_id, client_id, project_id)
    
    target_role = config.get("route_to_role", "preparer")
    
    # Map role to team assignment field
    role_to_field = {
        "associate": "default_associate_user_id",
        "preparer": "preparer_user_id",
        "reviewer": "reviewer_user_id",
        "managing_partner": "partner_user_id"
    }
    
    assignee_id = assignment.get(role_to_field.get(target_role, "preparer_user_id"))
    
    # Calculate due date
    sla_days = config.get("default_sla_days", 3)
    due_date = (datetime.utcnow() + timedelta(days=sla_days)).date().isoformat()
    
    routing_decision = {
        "assigned_to": assignee_id,
        "due_date": due_date,
        "priority": config.get("default_priority", "medium"),
        "requires_review": config.get("requires_review", False),
        "requires_partner_signoff": config.get("requires_partner_signoff", False),
        "acceptance_criteria": config.get("acceptance_criteria_template", []),
        "required_artifacts": config.get("required_artifacts_template", []),
        "escalation_path": config.get("escalation_path", []),
        "routing_reason": f"Routed to {target_role} based on task type '{task_type}'"
    }
    
    return routing_decision

# =============================================================================
# TASK LIFECYCLE MANAGEMENT
# =============================================================================

def create_task(supabase, org_id: str, user_id: str, req: TaskCreateRequest) -> Dict[str, Any]:
    """Create a new structured task with automatic routing."""
    
    # Generate dedup key
    dedup_key = f"{req.client_id}:{req.project_id or 'client'}:{req.criterion_key or 'none'}:{req.task_type}:{datetime.utcnow().year}"
    
    # Check for duplicates
    existing = supabase.table("structured_tasks").select("id").eq("dedup_key", dedup_key).eq("status", "assigned").execute()
    if existing.data:
        logger.warning(f"Duplicate task detected: {dedup_key}")
        return {"error": "Duplicate task already exists", "existing_task_id": existing.data[0]["id"]}
    
    # Get routing decision
    routing = route_task(supabase, org_id, req.client_id, req.project_id, req.task_type)
    
    task_data = {
        "organization_id": org_id,
        "client_id": req.client_id,
        "project_id": req.project_id,
        "criterion_key": req.criterion_key,
        "task_type": req.task_type,
        "title": req.title,
        "description": req.description,
        "status": "assigned" if routing.get("assigned_to") else "draft",
        "priority": req.priority or routing.get("priority", "medium"),
        "due_date": req.due_date or routing.get("due_date"),
        "assigned_to": req.assigned_to or routing.get("assigned_to"),
        "created_by": user_id,
        "related_entities": req.related_entities or {},
        "acceptance_criteria": req.acceptance_criteria or routing.get("acceptance_criteria", []),
        "required_artifacts": req.required_artifacts or routing.get("required_artifacts", []),
        "escalation_state": {"level": 0, "escalated_at": [], "escalation_path": routing.get("escalation_path", [])},
        "dedup_key": dedup_key,
        "initiated_by_ai": req.initiated_by_ai
    }
    
    res = supabase.table("structured_tasks").insert(task_data).execute()
    task = res.data[0]
    
    # Log creation event
    log_task_event(supabase, task["id"], user_id, "created", {
        "routing_reason": routing.get("routing_reason"),
        "initiated_by_ai": req.initiated_by_ai
    })
    
    if task.get("assigned_to"):
        log_task_event(supabase, task["id"], user_id, "assigned", {
            "assigned_to": task["assigned_to"],
            "routing_reason": routing.get("routing_reason")
        })
    
    return task

def update_task_status(supabase, task_id: str, user_id: str, new_status: TaskStatus, user_role: str) -> Dict[str, Any]:
    """Update task status with transition validation."""
    
    # Fetch current task
    res = supabase.table("structured_tasks").select("*").eq("id", task_id).single().execute()
    task = res.data
    current_status = TaskStatus(task["status"])
    
    # Validate transition
    allowed = STATUS_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise ValueError(f"Invalid transition from {current_status} to {new_status}")
    
    # Permission checks for certain transitions
    if new_status in [TaskStatus.ACCEPTED, TaskStatus.DENIED]:
        if not check_permission(user_role, "task.review"):
            raise PermissionError("You don't have permission to review tasks")
    
    # Update
    update_data = {"status": new_status.value, "updated_at": datetime.utcnow().isoformat()}
    supabase.table("structured_tasks").update(update_data).eq("id", task_id).execute()
    
    # Log event
    log_task_event(supabase, task_id, user_id, "status_changed", {
        "from_status": current_status.value,
        "to_status": new_status.value
    })
    
    return {"success": True, "new_status": new_status.value}

def submit_task(supabase, task_id: str, user_id: str, submission: TaskSubmissionRequest) -> Dict[str, Any]:
    """Submit task deliverables."""
    
    # Fetch task to validate
    res = supabase.table("structured_tasks").select("*").eq("id", task_id).single().execute()
    task = res.data
    
    if TaskStatus(task["status"]) not in [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.CHANGES_REQUESTED]:
        raise ValueError("Task cannot be submitted in its current state")
    
    # Check acceptance criteria (basic validation)
    required_artifacts = task.get("required_artifacts", [])
    submitted_artifacts = submission.artifacts
    
    # TODO: More sophisticated validation
    
    submission_data = {
        "artifacts": submitted_artifacts,
        "notes": submission.notes,
        "submitted_at": datetime.utcnow().isoformat(),
        "submitted_by": user_id
    }
    
    update_data = {
        "submission": submission_data,
        "status": "submitted",
        "updated_at": datetime.utcnow().isoformat()
    }
    
    supabase.table("structured_tasks").update(update_data).eq("id", task_id).execute()
    
    log_task_event(supabase, task_id, user_id, "submitted", {
        "artifact_count": len(submitted_artifacts)
    })
    
    return {"success": True, "status": "submitted"}

def review_task(supabase, task_id: str, user_id: str, user_role: str, review_req: TaskReviewRequest) -> Dict[str, Any]:
    """Review a submitted task."""
    
    if not check_permission(user_role, "task.review"):
        raise PermissionError("You don't have permission to review tasks")
    
    res = supabase.table("structured_tasks").select("*").eq("id", task_id).single().execute()
    task = res.data
    
    if TaskStatus(task["status"]) != TaskStatus.SUBMITTED:
        raise ValueError("Only submitted tasks can be reviewed")
    
    review_data = {
        "decision": review_req.decision,
        "reason_code": review_req.reason_code,
        "notes": review_req.notes,
        "reviewed_by": user_id,
        "reviewed_at": datetime.utcnow().isoformat()
    }
    
    # Map decision to status
    status_map = {
        "accepted": TaskStatus.ACCEPTED.value,
        "denied": TaskStatus.DENIED.value,
        "changes_requested": TaskStatus.CHANGES_REQUESTED.value
    }
    new_status = status_map.get(review_req.decision, TaskStatus.CHANGES_REQUESTED.value)
    
    update_data = {
        "review": review_data,
        "status": new_status,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    supabase.table("structured_tasks").update(update_data).eq("id", task_id).execute()
    
    log_task_event(supabase, task_id, user_id, "reviewed", {
        "decision": review_req.decision,
        "reason_code": review_req.reason_code
    })
    
    # Trigger workflow recompute if task is accepted and linked to a criterion
    if review_req.decision == "accepted" and task.get("project_id") and task.get("criterion_key"):
        # This would trigger workflow recompute
        logger.info(f"Task accepted for project {task['project_id']}, criterion {task['criterion_key']} - triggering workflow recompute")
    
    return {"success": True, "status": new_status}

def escalate_task(supabase, task_id: str, user_id: str) -> Dict[str, Any]:
    """Escalate a task to the next level in the escalation path."""
    
    res = supabase.table("structured_tasks").select("*").eq("id", task_id).single().execute()
    task = res.data
    
    escalation_state = task.get("escalation_state", {"level": 0, "escalated_at": [], "escalation_path": []})
    current_level = escalation_state.get("level", 0)
    path = escalation_state.get("escalation_path", ["preparer", "reviewer", "managing_partner"])
    
    if current_level >= len(path) - 1:
        raise ValueError("Task is already at highest escalation level")
    
    new_level = current_level + 1
    escalation_state["level"] = new_level
    escalation_state["escalated_at"].append(datetime.utcnow().isoformat())
    
    # Get new assignee based on escalation path
    new_role = path[new_level] if new_level < len(path) else "managing_partner"
    assignment = get_team_assignment(supabase, task["organization_id"], task["client_id"], task.get("project_id"))
    
    role_to_field = {
        "associate": "default_associate_user_id",
        "preparer": "preparer_user_id",
        "reviewer": "reviewer_user_id",
        "managing_partner": "partner_user_id"
    }
    
    new_assignee = assignment.get(role_to_field.get(new_role, "reviewer_user_id"))
    
    update_data = {
        "escalation_state": escalation_state,
        "status": "escalated",
        "assigned_to": new_assignee,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    supabase.table("structured_tasks").update(update_data).eq("id", task_id).execute()
    
    log_task_event(supabase, task_id, user_id, "escalated", {
        "from_level": current_level,
        "to_level": new_level,
        "new_assignee": new_assignee
    })
    
    return {"success": True, "new_level": new_level, "new_assignee": new_assignee}

def log_task_event(supabase, task_id: str, actor_id: str, event_type: str, payload: Dict[str, Any]):
    """Log a task event for audit trail."""
    supabase.table("task_events").insert({
        "task_id": task_id,
        "actor_id": actor_id,
        "event_type": event_type,
        "payload": payload
    }).execute()

# =============================================================================
# TASK QUERIES
# =============================================================================

def get_my_tasks(supabase, user_id: str, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get tasks assigned to the current user."""
    query = supabase.table("structured_tasks").select("*").eq("assigned_to", user_id)
    if status_filter:
        query = query.eq("status", status_filter)
    res = query.order("due_date").execute()
    return res.data

def get_client_tasks(supabase, client_id: str, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all tasks for a client."""
    query = supabase.table("structured_tasks").select("*").eq("client_id", client_id)
    if status_filter:
        query = query.eq("status", status_filter)
    res = query.order("due_date").execute()
    return res.data

def get_review_queue(supabase, org_id: str) -> List[Dict[str, Any]]:
    """Get tasks awaiting review."""
    res = supabase.table("structured_tasks").select("*").eq("organization_id", org_id).eq("status", "submitted").order("due_date").execute()
    return res.data

def get_blockers(supabase, org_id: str) -> List[Dict[str, Any]]:
    """Get tasks that are blocking workflow progress."""
    res = supabase.table("structured_tasks").select("*").eq("organization_id", org_id).in_("status", ["blocked", "escalated"]).order("priority", desc=True).execute()
    return res.data

