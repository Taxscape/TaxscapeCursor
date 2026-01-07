from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import uuid

# Canonical Keys for Four-Part Test
class CriterionKey(str, Enum):
    QUALIFIED_PURPOSE = "qualified_purpose"
    TECHNOLOGICAL_IN_NATURE = "technological_in_nature"
    ELIMINATION_OF_UNCERTAINTY = "elimination_of_uncertainty"
    PROCESS_OF_EXPERIMENTATION = "process_of_experimentation"

# Evidence Categories
class EvidenceType(str, Enum):
    PROJECT_NARRATIVE = "project_narrative"
    TECHNICAL_DOCS = "technical_docs"
    TEST_RESULTS = "test_results"
    SOURCE_CONTROL = "source_control"
    TICKETS = "tickets"
    TIME_LOGS = "time_logs"
    FINANCIAL_SUPPORT = "financial_support"

# Workflow States
class WorkflowOverallState(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    READY_FOR_REVIEW = "ready_for_review"
    NEEDS_FOLLOW_UP = "needs_follow_up"
    APPROVED = "approved"
    REJECTED = "rejected"

class CriterionState(str, Enum):
    MISSING = "missing"
    INCOMPLETE = "incomplete"
    SUFFICIENT = "sufficient"
    FLAGGED = "flagged"
    APPROVED = "approved"
    REJECTED = "rejected"

class WorkflowRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class EvidenceSource(str, Enum):
    UPLOAD = "upload"
    MANUAL_ENTRY = "manual_entry"
    AI_EXTRACTED = "ai_extracted"
    INTEGRATION = "integration"

# NBA Action Types
class NBAActionType(str, Enum):
    REQUEST_EVIDENCE = "request_evidence"
    ASSIGN_TASK = "assign_task"
    EDIT_FIELD = "edit_field"
    UPLOAD_DOC = "upload_doc"
    RE_EVALUATE_AI = "re_evaluate_ai"
    REVIEW_DECISION = "review_decision"

# Configuration Rules
WORKFLOW_CONFIG = {
    CriterionKey.QUALIFIED_PURPOSE: {
        "required_fields": ["description"],
        "required_evidence": [EvidenceType.PROJECT_NARRATIVE],
        "weight": 25
    },
    CriterionKey.TECHNOLOGICAL_IN_NATURE: {
        "required_fields": ["description"],
        "required_evidence": [EvidenceType.PROJECT_NARRATIVE, EvidenceType.TECHNICAL_DOCS],
        "weight": 25
    },
    CriterionKey.ELIMINATION_OF_UNCERTAINTY: {
        "required_fields": ["technical_uncertainty"],
        "required_evidence": [EvidenceType.PROJECT_NARRATIVE],
        "weight": 25
    },
    CriterionKey.PROCESS_OF_EXPERIMENTATION: {
        "required_fields": ["process_of_experimentation"],
        "required_evidence": [EvidenceType.PROJECT_NARRATIVE, EvidenceType.TEST_RESULTS],
        "weight": 25
    }
}

class NextBestAction(BaseModel):
    action_type: NBAActionType
    target: str
    reason: str
    estimated_effort: str # S, M, L
    blocking: bool = False

class WorkflowSummary(BaseModel):
    top_blockers: List[str]
    next_best_actions: List[NextBestAction]
    criterion_breakdown: Dict[str, Any]
    data_freshness: Dict[str, str]
    audit_notes: List[str]

def calculate_readiness_score(criterion_states: Dict[CriterionKey, CriterionState], evidence_count: int) -> int:
    """Deterministic readiness score calculation."""
    score = 0
    
    # Each sufficient criterion adds 20 points
    for key, state in criterion_states.items():
        if state == CriterionState.SUFFICIENT or state == CriterionState.APPROVED:
            score += 20
        elif state == CriterionState.INCOMPLETE:
            score += 10
            
    # Evidence diversity bonus (up to 20 points)
    diversity_bonus = min(20, evidence_count * 2)
    score += diversity_bonus
    
    # Cap score at 100
    score = min(100, score)
    
    # Hard cap at 75 if any criterion is missing or incomplete
    if any(s in [CriterionState.MISSING, CriterionState.INCOMPLETE] for s in criterion_states.values()):
        score = min(75, score)
        
    return score

def determine_risk_level(project_data: Dict[str, Any], evidence_list: List[Dict[str, Any]]) -> WorkflowRiskLevel:
    """Deterministic risk level calculation."""
    # Logic for high risk:
    # 1. High wages but low evidence
    # 2. Flagged criteria
    # 3. Missing crucial fields
    
    risk_points = 0
    
    if project_data.get("qre_total", 0) > 100000 and len(evidence_list) < 2:
        risk_points += 50
        
    if not project_data.get("process_of_experimentation"):
        risk_points += 30
        
    if risk_points >= 50:
        return WorkflowRiskLevel.HIGH
    if risk_points >= 20:
        return WorkflowRiskLevel.MEDIUM
    return WorkflowRiskLevel.LOW

def generate_nbas(project_data: Dict[str, Any], 
                 criterion_states: Dict[CriterionKey, CriterionState], 
                 gaps: List[Any],
                 tasks: List[Any]) -> List[NextBestAction]:
    """Generates a stable, ordered list of Next Best Actions."""
    nbas = []
    
    # 1. Review Decision (If ready)
    all_sufficient = all(s in [CriterionState.SUFFICIENT, CriterionState.APPROVED] for s in criterion_states.values())
    if all_sufficient:
        nbas.append(NextBestAction(
            action_type=NBAActionType.REVIEW_DECISION,
            target="project",
            reason="All four parts of the test have sufficient documentation. Ready for final review.",
            estimated_effort="S"
        ))
        
    # 2. Address Gaps
    for gap in gaps:
        nbas.append(NextBestAction(
            action_type=NBAActionType.UPLOAD_DOC if gap.get("category") == "documentation" else NBAActionType.EDIT_FIELD,
            target=gap.get("item_id", "project"),
            reason=f"Gap identified: {gap.get('description')}",
            estimated_effort="M",
            blocking=True
        ))
        
    # 3. Missing Fields
    for key, config in WORKFLOW_CONFIG.items():
        if criterion_states[key] == CriterionState.MISSING:
            for field in config["required_fields"]:
                if not project_data.get(field):
                    nbas.append(NextBestAction(
                        action_type=NBAActionType.EDIT_FIELD,
                        target=field,
                        reason=f"Field '{field}' is required for {key.replace('_', ' ').title()}.",
                        estimated_effort="S",
                        blocking=True
                    ))
                    
    # Sort: Blocking first, then by effort
    return sorted(nbas, key=lambda x: (not x.blocking, x.estimated_effort))

def recompute_workflow(supabase, project_id: str, org_id: str):
    """
    Main recomputation service logic.
    Idempotent and deterministic.
    """
    # 1. Fetch all relevant data
    project_res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    project = project_res.data
    
    # Get associated data
    evidence_res = supabase.table("project_evidence").select("*").eq("project_id", project_id).execute()
    evidence = evidence_res.data
    
    # Get existing criterion statuses
    criterion_res = supabase.table("project_criterion_status").select("*").eq("project_id", project_id).execute()
    current_criterion_states = {c["criterion_key"]: c for c in criterion_res.data}
    
    # Mocking gaps and tasks for now as they might be in other tables
    # In reality, fetch from verification_tasks and gap analysis logic
    gaps = [] 
    tasks = []
    
    # 2. Determine criterion states
    new_criterion_states = {}
    for key in CriterionKey:
        config = WORKFLOW_CONFIG[key]
        has_fields = all(project.get(f) for f in config["required_fields"])
        has_evidence = any(e["evidence_type"] == et for e in evidence for et in config["required_evidence"])
        
        state = CriterionState.MISSING
        if has_fields and has_evidence:
            state = CriterionState.SUFFICIENT
        elif has_fields or has_evidence:
            state = CriterionState.INCOMPLETE
            
        new_criterion_states[key] = state
        
        # Upsert criterion status
        supabase.table("project_criterion_status").upsert({
            "project_id": project_id,
            "criterion_key": key,
            "state": state,
            "last_updated_at": datetime.utcnow().isoformat()
        }, on_conflict="project_id, criterion_key").execute()
        
    # 3. Calculate overall metrics
    readiness_score = calculate_readiness_score(new_criterion_states, len(evidence))
    risk_level = determine_risk_level(project, evidence)
    nbas = generate_nbas(project, new_criterion_states, gaps, tasks)
    
    # Overall State Logic
    overall_state = WorkflowOverallState.IN_PROGRESS
    if all(s == CriterionState.MISSING for s in new_criterion_states.values()):
        overall_state = WorkflowOverallState.NOT_STARTED
    elif all(s in [CriterionState.SUFFICIENT, CriterionState.APPROVED] for s in new_criterion_states.values()):
        overall_state = WorkflowOverallState.READY_FOR_REVIEW
        
    # 4. Persistence
    summary = WorkflowSummary(
        top_blockers=[n.reason for n in nbas if n.blocking][:3],
        next_best_actions=nbas[:5],
        criterion_breakdown={k: {"state": s} for k, s in new_criterion_states.items()},
        data_freshness={"project": project.get("updated_at", ""), "evidence": evidence[0]["created_at"] if evidence else ""},
        audit_notes=[f"Workflow recomputed at {datetime.utcnow().isoformat()}"]
    )
    
    supabase.table("project_workflow_status").upsert({
        "organization_id": org_id,
        "client_id": project["client_company_id"],
        "project_id": project_id,
        "tax_year": 2024, # Default for now
        "overall_state": overall_state,
        "readiness_score": readiness_score,
        "risk_level": risk_level,
        "computed_summary": summary.dict(),
        "last_computed_at": datetime.utcnow().isoformat()
    }, on_conflict="project_id, tax_year").execute()
    
    return summary




