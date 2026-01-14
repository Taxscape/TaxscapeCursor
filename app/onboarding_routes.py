"""
Onboarding Routes for CPA First-Run Experience
Implements conversational onboarding with structured actions and audit logging.
"""

import logging
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel, Field

from .supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ============================================================================
# Auth Dependency (matches main.py pattern for Supabase JWT verification)
# ============================================================================

def verify_supabase_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return user data."""
    supabase = get_supabase()
    
    try:
        # Get user from Supabase using the token
        user_response = supabase.auth.get_user(token)
        
        if user_response and user_response.user:
            user = user_response.user
            return {
                "id": user.id,
                "email": user.email,
                "user_metadata": user.user_metadata or {},
                "app_metadata": user.app_metadata or {},
            }
        return None
    except Exception as e:
        logger.warning(f"[Onboarding Auth] Token verification failed: {e}")
        return None


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Supabase JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = parts[1]
    user_data = verify_supabase_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user_data


router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

# ============================================================================
# Step Keys and Ordering
# ============================================================================

STEP_KEYS = [
    "experience_level",
    "client_selection", 
    "tax_years_selection",
    "purchased_sections_confirmation",
    "scope_confirmation",
    "kickoff_summary_confirmation",
    "handoff_to_intake_package",
    "onboarding_complete"
]

STEP_ORDER = {key: idx for idx, key in enumerate(STEP_KEYS)}

# ============================================================================
# Pydantic Models
# ============================================================================

class OnboardingAction(BaseModel):
    """Structured action returned by the onboarding agent."""
    type: str  # set_experience_level, select_client, set_tax_years, etc.
    label: str  # Display text
    payload: Dict[str, Any] = Field(default_factory=dict)
    blocking: bool = False  # True if must do next
    reason: Optional[str] = None  # Why this action is being asked


class OnboardingUpdate(BaseModel):
    """Represents an update applied by the backend."""
    field: str
    value: Any
    step_key: Optional[str] = None


class StartOnboardingResponse(BaseModel):
    """Response from POST /api/onboarding/start"""
    session_id: str
    current_step_key: str
    context_snapshot: Dict[str, Any]
    agent_message: str
    actions: List[OnboardingAction]
    ui_hints: Dict[str, Any] = Field(default_factory=dict)


class MessageRequest(BaseModel):
    """Request body for POST /api/onboarding/message"""
    session_id: str
    message: str
    client_action: Optional[Dict[str, Any]] = None


class MessageResponse(BaseModel):
    """Response from POST /api/onboarding/message"""
    message_text: str
    actions: List[OnboardingAction]
    next_step_key: str
    updates: List[OnboardingUpdate]
    missing_fields: List[str]
    blocked_reason: Optional[str] = None


class OnboardingStatus(BaseModel):
    """Response from GET /api/onboarding/status"""
    session: Dict[str, Any]
    steps: List[Dict[str, Any]]
    missing_fields: List[str]
    recommended_next_action: Optional[OnboardingAction] = None


class StepCompleteRequest(BaseModel):
    """Request body for POST /api/onboarding/step/complete"""
    session_id: str
    step_key: str
    completion_method: str = "manual_user_action"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StepCompleteResponse(BaseModel):
    """Response from POST /api/onboarding/step/complete"""
    success: bool
    session: Dict[str, Any]
    steps: List[Dict[str, Any]]
    next_step_key: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def write_audit_log(
    supabase,
    event_type: str,
    organization_id: str,
    user_id: str,
    client_company_id: Optional[str] = None,
    step_key: Optional[str] = None,
    completion_method: Optional[str] = None,
    before_value: Any = None,
    after_value: Any = None,
    reason: Optional[str] = None,
    metadata: Dict[str, Any] = None
):
    """Write an audit log entry for onboarding events."""
    try:
        payload = {
            "organization_id": organization_id,
            "user_id": user_id,
            "event_type": event_type,
            "metadata": {
                "client_company_id": client_company_id,
                "step_key": step_key,
                "completion_method": completion_method,
                "before": before_value,
                "after": after_value,
                "reason": reason,
                **(metadata or {})
            }
        }
        supabase.table("audit_logs").insert(payload).execute()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def get_next_step_key(current_step: str) -> Optional[str]:
    """Get the next step key in the sequence."""
    current_idx = STEP_ORDER.get(current_step, -1)
    next_idx = current_idx + 1
    if next_idx < len(STEP_KEYS):
        return STEP_KEYS[next_idx]
    return None


def get_missing_fields(session: Dict[str, Any]) -> List[str]:
    """Determine which required fields are still missing."""
    missing = []
    
    context = session.get("context_snapshot", {})
    known = context.get("known_fields", {})
    
    if not known.get("experience_level"):
        missing.append("experience_level")
    if not session.get("client_company_id"):
        missing.append("client_company_id")
    if not session.get("tax_years") or len(session.get("tax_years", [])) == 0:
        missing.append("tax_years")
    if not session.get("purchased_sections") or len(session.get("purchased_sections", {})) == 0:
        missing.append("purchased_sections")
    if not session.get("study_scope"):
        missing.append("study_scope")
    
    return missing


def generate_agent_message(
    step_key: str,
    experience_level: Optional[str],
    session: Dict[str, Any],
    user_message: Optional[str] = None
) -> tuple[str, List[OnboardingAction]]:
    """
    Generate the agent's response message and actions for a given step.
    Adapts guidance depth based on experience level.
    """
    
    is_new = experience_level == "new"
    is_some = experience_level == "some"
    
    actions = []
    message = ""
    
    if step_key == "experience_level":
        message = """👋 Welcome to TaxScape! I'm your onboarding guide, and I'll help you set up your first R&D tax credit study.

Before we dive in, I'd love to know a bit about your experience with R&D tax credits. This helps me adjust how much detail I provide.

**How would you describe your R&D tax credit experience?**"""
        
        actions = [
            OnboardingAction(
                type="set_experience_level",
                label="I'm new to R&D credits",
                payload={"experience_level": "new"},
                blocking=True,
                reason="Select your experience level"
            ),
            OnboardingAction(
                type="set_experience_level",
                label="I have some experience",
                payload={"experience_level": "some"},
                blocking=True,
                reason="Select your experience level"
            ),
            OnboardingAction(
                type="set_experience_level",
                label="I'm experienced",
                payload={"experience_level": "experienced"},
                blocking=True,
                reason="Select your experience level"
            ),
        ]
    
    elif step_key == "client_selection":
        if is_new:
            message = """Great! Now let's identify the client company you'll be working on.

**What is a client in TaxScape?**
A client is the company claiming the R&D tax credit. You'll upload their payroll, expenses, and project information to build the study.

**Please select or create the client company for this study:**"""
        else:
            message = """Now, which client company is this study for?

**Select or create the client:**"""
        
        actions = [
            OnboardingAction(
                type="select_client",
                label="Select existing client",
                payload={"action": "select"},
                blocking=True,
                reason="Choose the client company for this study"
            ),
            OnboardingAction(
                type="select_client",
                label="Create new client",
                payload={"action": "create"},
                blocking=True,
                reason="Add a new client company"
            ),
        ]
    
    elif step_key == "tax_years_selection":
        client_name = session.get("client_company_name", "the client")
        
        if is_new:
            message = f"""Now let's set up the tax year(s) for **{client_name}**'s R&D study.

**What's a tax year?**
The tax year refers to the period for which you're claiming the credit. Usually this matches the company's fiscal year. You can study multiple years at once if needed.

**Which tax year(s) should this study cover?**"""
        else:
            message = f"""Which tax year(s) should **{client_name}**'s study cover?"""
        
        current_year = datetime.now().year
        years = [current_year - 1, current_year - 2, current_year - 3]
        
        actions = [
            OnboardingAction(
                type="set_tax_years",
                label=f"{year}",
                payload={"year": year},
                blocking=False,
                reason="Select one or more tax years"
            )
            for year in years
        ]
        actions.append(
            OnboardingAction(
                type="set_tax_years",
                label="Confirm selection",
                payload={"action": "confirm"},
                blocking=True,
                reason="Confirm your tax year selection"
            )
        )
    
    elif step_key == "purchased_sections_confirmation":
        if is_new:
            message = """Next, let's confirm which credit sections this client has purchased.

**What are the sections?**
- **Section 41**: The main federal R&D tax credit for qualified research expenses (QREs)
- **Section 174**: Amortization of R&D expenditures (required since 2022)
- **State Credits**: Many states offer additional R&D credits

**Which sections apply to this study?**"""
        else:
            message = """Which credit sections apply to this study?"""
        
        actions = [
            OnboardingAction(
                type="set_purchased_sections",
                label="Section 41 (Federal R&D Credit)",
                payload={"section": "section_41", "enabled": True},
                blocking=False,
                reason="Toggle Section 41"
            ),
            OnboardingAction(
                type="set_purchased_sections",
                label="Section 174 (R&D Amortization)",
                payload={"section": "section_174", "enabled": True},
                blocking=False,
                reason="Toggle Section 174"
            ),
            OnboardingAction(
                type="set_purchased_sections",
                label="State Credits",
                payload={"section": "state_credits", "enabled": True},
                blocking=False,
                reason="Toggle state credits"
            ),
            OnboardingAction(
                type="set_purchased_sections",
                label="Confirm sections",
                payload={"action": "confirm"},
                blocking=True,
                reason="Confirm your selection"
            ),
        ]
    
    elif step_key == "scope_confirmation":
        if is_new:
            message = """Almost there! Let's define the scope of this study.

**What's the study scope?**
This describes what you'll be analyzing — typically "Full R&D Credit Study" covers wages, supplies, and contractor expenses.

**What's the scope for this engagement?**"""
        else:
            message = """What's the scope of this engagement?"""
        
        actions = [
            OnboardingAction(
                type="set_scope",
                label="Full R&D Credit Study",
                payload={"scope": "Full R&D Credit Study"},
                blocking=True,
                reason="Standard comprehensive study"
            ),
            OnboardingAction(
                type="set_scope",
                label="Wages Only",
                payload={"scope": "Wages Only"},
                blocking=True,
                reason="Focus on qualified wages"
            ),
            OnboardingAction(
                type="set_scope",
                label="Documentation Review",
                payload={"scope": "Documentation Review"},
                blocking=True,
                reason="Review existing documentation"
            ),
            OnboardingAction(
                type="set_scope",
                label="Custom scope",
                payload={"action": "custom"},
                blocking=True,
                reason="Enter a custom scope description"
            ),
        ]
    
    elif step_key == "kickoff_summary_confirmation":
        client_name = session.get("client_company_name", "Unknown Client")
        tax_years = session.get("tax_years", [])
        sections = session.get("purchased_sections", {})
        scope = session.get("study_scope", "Not specified")
        
        years_str = ", ".join(str(y) for y in tax_years) if tax_years else "None selected"
        sections_list = [k for k, v in sections.items() if v]
        sections_str = ", ".join(s.replace("_", " ").title() for s in sections_list) if sections_list else "None selected"
        
        message = f"""🎉 Here's a summary of your study setup:

**Client:** {client_name}
**Tax Year(s):** {years_str}
**Sections:** {sections_str}
**Scope:** {scope}

Does everything look correct?"""
        
        actions = [
            OnboardingAction(
                type="confirm_summary",
                label="Yes, looks good!",
                payload={"confirmed": True},
                blocking=True,
                reason="Confirm and proceed"
            ),
            OnboardingAction(
                type="confirm_summary",
                label="I need to make changes",
                payload={"confirmed": False, "action": "edit"},
                blocking=True,
                reason="Go back and edit"
            ),
        ]
    
    elif step_key == "handoff_to_intake_package":
        message = """✅ Excellent! Your study is all set up.

**Next Step: Generate Intake Package**
The next step is to generate an intake package — this is the template you'll use to collect payroll, expense, and project data from the client.

Ready to generate the intake package?"""
        
        actions = [
            OnboardingAction(
                type="go_to_intake_package",
                label="Generate Intake Package",
                payload={"action": "generate"},
                blocking=True,
                reason="Create the data collection template"
            ),
            OnboardingAction(
                type="go_to_intake_package",
                label="Skip for now",
                payload={"action": "skip"},
                blocking=False,
                reason="Go to portal and do this later"
            ),
        ]
    
    elif step_key == "onboarding_complete":
        message = """🎊 **Onboarding Complete!**

You're all set to start working on your R&D tax credit study. Here's what you can do next:

1. **Upload Data** — Add payroll, GL, and expense files
2. **Classify Employees** — Let AI help identify R&D personnel
3. **Review Projects** — Document qualified research activities

The TaxScape AI agents are ready to assist you at every step. Good luck!"""
        
        actions = [
            OnboardingAction(
                type="go_to_portal",
                label="Go to Portal",
                payload={"route": "/portal"},
                blocking=False,
                reason="Start working on your study"
            ),
        ]
    
    return message, actions


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/start", response_model=StartOnboardingResponse)
async def start_onboarding(user: dict = Depends(get_current_user)):
    """
    Start or resume an onboarding session.
    If an active session exists, returns it. Otherwise creates a new one.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        # Get user's profile with organization
        profile = supabase.table("profiles")\
            .select("*, organization_id")\
            .eq("id", user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        org_id = profile.data.get("organization_id")
        if not org_id:
            # Try to get from organization_members
            membership = supabase.table("organization_members")\
                .select("organization_id")\
                .eq("user_id", user_id)\
                .limit(1)\
                .execute()
            
            if membership.data:
                org_id = membership.data[0]["organization_id"]
            else:
                raise HTTPException(status_code=400, detail="User not associated with an organization")
        
        existing_session_id = profile.data.get("onboarding_session_id")
        
        # Check for existing active session
        if existing_session_id:
            existing = supabase.table("onboarding_sessions")\
                .select("*")\
                .eq("id", existing_session_id)\
                .eq("status", "active")\
                .single()\
                .execute()
            
            if existing.data:
                # Return existing session
                session = existing.data
                context = session.get("context_snapshot", {})
                current_step = context.get("last_step_key", "experience_level")
                
                # Get experience level from profile
                exp_level = profile.data.get("experience_level")
                
                message, actions = generate_agent_message(
                    current_step,
                    exp_level,
                    session
                )
                
                # Update last seen
                supabase.table("profiles")\
                    .update({"onboarding_last_seen_at": datetime.utcnow().isoformat()})\
                    .eq("id", user_id)\
                    .execute()
                
                return StartOnboardingResponse(
                    session_id=str(session["id"]),
                    current_step_key=current_step,
                    context_snapshot=context,
                    agent_message=message,
                    actions=actions,
                    ui_hints={"resuming": True}
                )
        
        # Create new session
        session_id = str(uuid4())
        context_snapshot = {
            "known_fields": {},
            "missing_fields": ["experience_level", "client_company_id", "tax_years", "purchased_sections", "study_scope"],
            "last_step_key": "experience_level",
            "last_agent_message_id": None
        }
        
        session_data = {
            "id": session_id,
            "organization_id": org_id,
            "user_id": user_id,
            "status": "active",
            "context_snapshot": context_snapshot
        }
        
        supabase.table("onboarding_sessions").insert(session_data).execute()
        
        # Initialize all step logs
        for step_key in STEP_KEYS:
            step_status = "in_progress" if step_key == "experience_level" else "not_started"
            supabase.table("onboarding_step_logs").insert({
                "onboarding_session_id": session_id,
                "step_key": step_key,
                "status": step_status
            }).execute()
        
        # Update profile
        supabase.table("profiles").update({
            "onboarding_session_id": session_id,
            "onboarding_last_seen_at": datetime.utcnow().isoformat()
        }).eq("id", user_id).execute()
        
        # Write audit log
        write_audit_log(
            supabase,
            "onboarding_started",
            org_id,
            user_id
        )
        
        # Generate initial message
        message, actions = generate_agent_message("experience_level", None, {})
        
        return StartOnboardingResponse(
            session_id=session_id,
            current_step_key="experience_level",
            context_snapshot=context_snapshot,
            agent_message=message,
            actions=actions,
            ui_hints={"new_session": True}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting onboarding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    user: dict = Depends(get_current_user)
):
    """
    Send a message to the onboarding agent and get a response.
    Handles both free-text messages and structured client actions.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    session_id = request.session_id
    
    try:
        # Verify session ownership
        session = supabase.table("onboarding_sessions")\
            .select("*")\
            .eq("id", session_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not session.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_data = session.data
        context = session_data.get("context_snapshot", {})
        current_step = context.get("last_step_key", "experience_level")
        org_id = session_data["organization_id"]
        
        # Get profile for experience level
        profile = supabase.table("profiles")\
            .select("experience_level")\
            .eq("id", user_id)\
            .single()\
            .execute()
        
        exp_level = profile.data.get("experience_level") if profile.data else None
        
        updates = []
        next_step = current_step
        blocked_reason = None
        
        # Process client action if provided
        if request.client_action:
            action_type = request.client_action.get("type")
            payload = request.client_action.get("payload", {})
            
            if action_type == "set_experience_level":
                new_level = payload.get("experience_level")
                if new_level in ["new", "some", "experienced"]:
                    # Update profile
                    supabase.table("profiles")\
                        .update({"experience_level": new_level})\
                        .eq("id", user_id)\
                        .execute()
                    
                    # Update context
                    context["known_fields"]["experience_level"] = new_level
                    
                    # Complete step
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat(),
                            "metadata": {"value": new_level}
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "experience_level")\
                        .execute()
                    
                    # Start next step
                    next_step = "client_selection"
                    supabase.table("onboarding_step_logs")\
                        .update({"status": "in_progress"})\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", next_step)\
                        .execute()
                    
                    updates.append(OnboardingUpdate(
                        field="experience_level",
                        value=new_level,
                        step_key="experience_level"
                    ))
                    
                    exp_level = new_level
                    
                    write_audit_log(
                        supabase, "experience_level_set", org_id, user_id,
                        step_key="experience_level",
                        completion_method="manual_user_action",
                        after_value=new_level
                    )
            
            elif action_type == "select_client":
                client_id = payload.get("client_id")
                client_name = payload.get("client_name")
                
                if client_id:
                    # Update session
                    supabase.table("onboarding_sessions")\
                        .update({"client_company_id": client_id})\
                        .eq("id", session_id)\
                        .execute()
                    
                    session_data["client_company_id"] = client_id
                    session_data["client_company_name"] = client_name
                    context["known_fields"]["client_company_id"] = client_id
                    context["known_fields"]["client_company_name"] = client_name
                    
                    # Complete step
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat(),
                            "metadata": {"client_id": client_id, "client_name": client_name}
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "client_selection")\
                        .execute()
                    
                    next_step = "tax_years_selection"
                    supabase.table("onboarding_step_logs")\
                        .update({"status": "in_progress"})\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", next_step)\
                        .execute()
                    
                    updates.append(OnboardingUpdate(
                        field="client_company_id",
                        value=client_id,
                        step_key="client_selection"
                    ))
                    
                    write_audit_log(
                        supabase, "client_selected", org_id, user_id,
                        client_company_id=client_id,
                        step_key="client_selection",
                        completion_method="manual_user_action",
                        after_value={"client_id": client_id, "client_name": client_name}
                    )
            
            elif action_type == "set_tax_years":
                if payload.get("action") == "confirm":
                    # Confirm selected years
                    tax_years = context.get("known_fields", {}).get("tax_years", [])
                    if tax_years:
                        supabase.table("onboarding_sessions")\
                            .update({"tax_years": tax_years})\
                            .eq("id", session_id)\
                            .execute()
                        
                        session_data["tax_years"] = tax_years
                        
                        supabase.table("onboarding_step_logs")\
                            .update({
                                "status": "completed",
                                "completion_method": "manual_user_action",
                                "completed_by_user_id": user_id,
                                "completed_at": datetime.utcnow().isoformat(),
                                "metadata": {"tax_years": tax_years}
                            })\
                            .eq("onboarding_session_id", session_id)\
                            .eq("step_key", "tax_years_selection")\
                            .execute()
                        
                        next_step = "purchased_sections_confirmation"
                        supabase.table("onboarding_step_logs")\
                            .update({"status": "in_progress"})\
                            .eq("onboarding_session_id", session_id)\
                            .eq("step_key", next_step)\
                            .execute()
                        
                        updates.append(OnboardingUpdate(
                            field="tax_years",
                            value=tax_years,
                            step_key="tax_years_selection"
                        ))
                        
                        write_audit_log(
                            supabase, "tax_years_set", org_id, user_id,
                            client_company_id=session_data.get("client_company_id"),
                            step_key="tax_years_selection",
                            completion_method="manual_user_action",
                            after_value=tax_years
                        )
                else:
                    # Toggle year selection
                    year = payload.get("year")
                    if year:
                        tax_years = context.get("known_fields", {}).get("tax_years", [])
                        if year in tax_years:
                            tax_years.remove(year)
                        else:
                            tax_years.append(year)
                            tax_years.sort(reverse=True)
                        context["known_fields"]["tax_years"] = tax_years
            
            elif action_type == "set_purchased_sections":
                if payload.get("action") == "confirm":
                    sections = context.get("known_fields", {}).get("purchased_sections", {})
                    if sections:
                        supabase.table("onboarding_sessions")\
                            .update({"purchased_sections": sections})\
                            .eq("id", session_id)\
                            .execute()
                        
                        session_data["purchased_sections"] = sections
                        
                        supabase.table("onboarding_step_logs")\
                            .update({
                                "status": "completed",
                                "completion_method": "manual_user_action",
                                "completed_by_user_id": user_id,
                                "completed_at": datetime.utcnow().isoformat(),
                                "metadata": {"purchased_sections": sections}
                            })\
                            .eq("onboarding_session_id", session_id)\
                            .eq("step_key", "purchased_sections_confirmation")\
                            .execute()
                        
                        next_step = "scope_confirmation"
                        supabase.table("onboarding_step_logs")\
                            .update({"status": "in_progress"})\
                            .eq("onboarding_session_id", session_id)\
                            .eq("step_key", next_step)\
                            .execute()
                        
                        updates.append(OnboardingUpdate(
                            field="purchased_sections",
                            value=sections,
                            step_key="purchased_sections_confirmation"
                        ))
                        
                        write_audit_log(
                            supabase, "purchased_sections_confirmed", org_id, user_id,
                            client_company_id=session_data.get("client_company_id"),
                            step_key="purchased_sections_confirmation",
                            completion_method="manual_user_action",
                            after_value=sections
                        )
                else:
                    section = payload.get("section")
                    enabled = payload.get("enabled", True)
                    if section:
                        sections = context.get("known_fields", {}).get("purchased_sections", {})
                        sections[section] = not sections.get(section, False)  # Toggle
                        context["known_fields"]["purchased_sections"] = sections
            
            elif action_type == "set_scope":
                scope = payload.get("scope")
                if scope:
                    supabase.table("onboarding_sessions")\
                        .update({"study_scope": scope})\
                        .eq("id", session_id)\
                        .execute()
                    
                    session_data["study_scope"] = scope
                    context["known_fields"]["study_scope"] = scope
                    
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat(),
                            "metadata": {"scope": scope}
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "scope_confirmation")\
                        .execute()
                    
                    next_step = "kickoff_summary_confirmation"
                    supabase.table("onboarding_step_logs")\
                        .update({"status": "in_progress"})\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", next_step)\
                        .execute()
                    
                    updates.append(OnboardingUpdate(
                        field="study_scope",
                        value=scope,
                        step_key="scope_confirmation"
                    ))
                    
                    write_audit_log(
                        supabase, "scope_confirmed", org_id, user_id,
                        client_company_id=session_data.get("client_company_id"),
                        step_key="scope_confirmation",
                        completion_method="manual_user_action",
                        after_value=scope
                    )
            
            elif action_type == "confirm_summary":
                if payload.get("confirmed"):
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat()
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "kickoff_summary_confirmation")\
                        .execute()
                    
                    next_step = "handoff_to_intake_package"
                    supabase.table("onboarding_step_logs")\
                        .update({"status": "in_progress"})\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", next_step)\
                        .execute()
                else:
                    # User wants to edit - go back to first step that needs changing
                    next_step = "client_selection"
                    blocked_reason = "User requested to edit setup"
            
            elif action_type == "go_to_intake_package":
                if payload.get("action") == "generate":
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat()
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "handoff_to_intake_package")\
                        .execute()
                    
                    next_step = "onboarding_complete"
                    
                    # Mark onboarding complete
                    supabase.table("onboarding_step_logs")\
                        .update({
                            "status": "completed",
                            "completion_method": "manual_user_action",
                            "completed_by_user_id": user_id,
                            "completed_at": datetime.utcnow().isoformat()
                        })\
                        .eq("onboarding_session_id", session_id)\
                        .eq("step_key", "onboarding_complete")\
                        .execute()
                    
                    supabase.table("onboarding_sessions")\
                        .update({"status": "completed"})\
                        .eq("id", session_id)\
                        .execute()
                    
                    supabase.table("profiles")\
                        .update({"has_seen_onboarding": True})\
                        .eq("id", user_id)\
                        .execute()
                    
                    write_audit_log(
                        supabase, "onboarding_completed", org_id, user_id,
                        client_company_id=session_data.get("client_company_id")
                    )
                else:
                    # Skip to portal
                    next_step = "onboarding_complete"
        
        # Parse free-text message if no structured action
        elif request.message:
            msg_lower = request.message.lower().strip()
            
            # Simple NLU for experience level
            if current_step == "experience_level":
                if any(w in msg_lower for w in ["new", "beginner", "first time", "never"]):
                    # Trigger experience level action
                    request.client_action = {
                        "type": "set_experience_level",
                        "payload": {"experience_level": "new"}
                    }
                    return await send_message(request, user)
                elif any(w in msg_lower for w in ["some", "a bit", "little"]):
                    request.client_action = {
                        "type": "set_experience_level",
                        "payload": {"experience_level": "some"}
                    }
                    return await send_message(request, user)
                elif any(w in msg_lower for w in ["experienced", "expert", "years"]):
                    request.client_action = {
                        "type": "set_experience_level",
                        "payload": {"experience_level": "experienced"}
                    }
                    return await send_message(request, user)
        
        # Update context snapshot
        context["last_step_key"] = next_step
        context["missing_fields"] = get_missing_fields(session_data)
        
        supabase.table("onboarding_sessions")\
            .update({"context_snapshot": context})\
            .eq("id", session_id)\
            .execute()
        
        # Update last seen
        supabase.table("profiles")\
            .update({"onboarding_last_seen_at": datetime.utcnow().isoformat()})\
            .eq("id", user_id)\
            .execute()
        
        # Generate response message
        message, actions = generate_agent_message(next_step, exp_level, session_data)
        
        return MessageResponse(
            message_text=message,
            actions=actions,
            next_step_key=next_step,
            updates=updates,
            missing_fields=context.get("missing_fields", []),
            blocked_reason=blocked_reason
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing onboarding message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=OnboardingStatus)
async def get_onboarding_status(
    session_id: str = Query(...),
    user: dict = Depends(get_current_user)
):
    """Get the current status of an onboarding session."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        # Get session
        session = supabase.table("onboarding_sessions")\
            .select("*")\
            .eq("id", session_id)\
            .single()\
            .execute()
        
        if not session.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify access (owner or org admin)
        session_data = session.data
        if session_data["user_id"] != user_id:
            # Check if user is org admin
            membership = supabase.table("organization_members")\
                .select("role")\
                .eq("organization_id", session_data["organization_id"])\
                .eq("user_id", user_id)\
                .single()\
                .execute()
            
            if not membership.data or membership.data["role"] not in ["admin", "executive", "cpa_partner"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get step logs
        steps = supabase.table("onboarding_step_logs")\
            .select("*")\
            .eq("onboarding_session_id", session_id)\
            .execute()
        
        step_data = sorted(
            steps.data or [],
            key=lambda s: STEP_ORDER.get(s["step_key"], 99)
        )
        
        # Determine missing fields
        missing_fields = get_missing_fields(session_data)
        
        # Determine recommended next action
        current_step = session_data.get("context_snapshot", {}).get("last_step_key", "experience_level")
        profile = supabase.table("profiles")\
            .select("experience_level")\
            .eq("id", session_data["user_id"])\
            .single()\
            .execute()
        
        exp_level = profile.data.get("experience_level") if profile.data else None
        _, actions = generate_agent_message(current_step, exp_level, session_data)
        
        recommended_action = actions[0] if actions else None
        
        return OnboardingStatus(
            session=session_data,
            steps=step_data,
            missing_fields=missing_fields,
            recommended_next_action=recommended_action
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting onboarding status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/step/complete", response_model=StepCompleteResponse)
async def complete_step(
    request: StepCompleteRequest,
    user: dict = Depends(get_current_user)
):
    """
    Complete a specific onboarding step with structured metadata.
    Used when frontend performs UI-based selection.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        # Verify session ownership
        session = supabase.table("onboarding_sessions")\
            .select("*")\
            .eq("id", request.session_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not session.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_data = session.data
        org_id = session_data["organization_id"]
        
        # Validate step key
        if request.step_key not in STEP_KEYS:
            raise HTTPException(status_code=400, detail=f"Invalid step key: {request.step_key}")
        
        # Validate completion method
        if request.completion_method not in ["manual_user_action", "ai_validated", "senior_override"]:
            raise HTTPException(status_code=400, detail=f"Invalid completion method: {request.completion_method}")
        
        # Update session based on step
        updates = {}
        if request.step_key == "client_selection" and request.metadata.get("client_id"):
            updates["client_company_id"] = request.metadata["client_id"]
        elif request.step_key == "tax_years_selection" and request.metadata.get("tax_years"):
            updates["tax_years"] = request.metadata["tax_years"]
        elif request.step_key == "purchased_sections_confirmation" and request.metadata.get("purchased_sections"):
            updates["purchased_sections"] = request.metadata["purchased_sections"]
        elif request.step_key == "scope_confirmation" and request.metadata.get("scope"):
            updates["study_scope"] = request.metadata["scope"]
        
        if updates:
            supabase.table("onboarding_sessions")\
                .update(updates)\
                .eq("id", request.session_id)\
                .execute()
        
        # Update step log
        supabase.table("onboarding_step_logs")\
            .update({
                "status": "completed",
                "completion_method": request.completion_method,
                "completed_by_user_id": user_id,
                "completed_at": datetime.utcnow().isoformat(),
                "metadata": request.metadata
            })\
            .eq("onboarding_session_id", request.session_id)\
            .eq("step_key", request.step_key)\
            .execute()
        
        # Start next step
        next_step = get_next_step_key(request.step_key)
        if next_step:
            supabase.table("onboarding_step_logs")\
                .update({"status": "in_progress"})\
                .eq("onboarding_session_id", request.session_id)\
                .eq("step_key", next_step)\
                .execute()
            
            # Update context
            context = session_data.get("context_snapshot", {})
            context["last_step_key"] = next_step
            supabase.table("onboarding_sessions")\
                .update({"context_snapshot": context})\
                .eq("id", request.session_id)\
                .execute()
        
        # Write audit log
        write_audit_log(
            supabase,
            "onboarding_step_updated",
            org_id,
            user_id,
            client_company_id=session_data.get("client_company_id"),
            step_key=request.step_key,
            completion_method=request.completion_method,
            after_value=request.metadata
        )
        
        # Get updated status
        updated_session = supabase.table("onboarding_sessions")\
            .select("*")\
            .eq("id", request.session_id)\
            .single()\
            .execute()
        
        steps = supabase.table("onboarding_step_logs")\
            .select("*")\
            .eq("onboarding_session_id", request.session_id)\
            .execute()
        
        return StepCompleteResponse(
            success=True,
            session=updated_session.data,
            steps=sorted(steps.data or [], key=lambda s: STEP_ORDER.get(s["step_key"], 99)),
            next_step_key=next_step
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing onboarding step: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skip")
async def skip_onboarding(user: dict = Depends(get_current_user)):
    """
    Skip the onboarding process.
    Marks session as abandoned and sets has_seen_onboarding=true.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        # Get profile
        profile = supabase.table("profiles")\
            .select("onboarding_session_id, organization_id")\
            .eq("id", user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        session_id = profile.data.get("onboarding_session_id")
        org_id = profile.data.get("organization_id")
        
        if not org_id:
            membership = supabase.table("organization_members")\
                .select("organization_id")\
                .eq("user_id", user_id)\
                .limit(1)\
                .execute()
            
            if membership.data:
                org_id = membership.data[0]["organization_id"]
        
        # Mark session as abandoned
        if session_id:
            supabase.table("onboarding_sessions")\
                .update({"status": "abandoned"})\
                .eq("id", session_id)\
                .execute()
        
        # Update profile
        supabase.table("profiles")\
            .update({
                "has_seen_onboarding": True,
                "onboarding_session_id": None
            })\
            .eq("id", user_id)\
            .execute()
        
        # Write audit log
        if org_id:
            write_audit_log(
                supabase,
                "onboarding_skipped",
                org_id,
                user_id,
                reason="User chose to skip onboarding"
            )
        
        return {"success": True, "message": "Onboarding skipped"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error skipping onboarding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restart")
async def restart_onboarding(user: dict = Depends(get_current_user)):
    """
    Restart the onboarding process.
    Marks any existing session as abandoned and creates a new one.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        # Get profile
        profile = supabase.table("profiles")\
            .select("onboarding_session_id")\
            .eq("id", user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        existing_session_id = profile.data.get("onboarding_session_id")
        
        # Mark existing session as abandoned
        if existing_session_id:
            supabase.table("onboarding_sessions")\
                .update({"status": "abandoned"})\
                .eq("id", existing_session_id)\
                .execute()
        
        # Clear profile session reference and reset onboarding flag
        supabase.table("profiles")\
            .update({
                "onboarding_session_id": None,
                "has_seen_onboarding": False
            })\
            .eq("id", user_id)\
            .execute()
        
        # Call start to create new session
        return await start_onboarding(user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restarting onboarding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Additional Helper Endpoints
# ============================================================================

@router.get("/check")
async def check_onboarding_required(user: dict = Depends(get_current_user)):
    """
    Check if the current user needs to go through onboarding.
    Returns redirect hint if onboarding is required/incomplete.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user_id = user["id"]
    
    try:
        profile = supabase.table("profiles")\
            .select("has_seen_onboarding, onboarding_session_id, experience_level")\
            .eq("id", user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            return {
                "needs_onboarding": True,
                "reason": "no_profile",
                "redirect": "/onboarding"
            }
        
        has_seen = profile.data.get("has_seen_onboarding", False)
        session_id = profile.data.get("onboarding_session_id")
        
        if has_seen:
            return {
                "needs_onboarding": False,
                "reason": "completed_or_skipped"
            }
        
        if session_id:
            # Check if session is still active
            session = supabase.table("onboarding_sessions")\
                .select("status")\
                .eq("id", session_id)\
                .single()\
                .execute()
            
            if session.data and session.data.get("status") == "active":
                return {
                    "needs_onboarding": True,
                    "reason": "incomplete_session",
                    "session_id": session_id,
                    "redirect": "/onboarding"
                }
        
        # New user who hasn't started onboarding
        return {
            "needs_onboarding": True,
            "reason": "new_user",
            "redirect": "/onboarding"
        }
        
    except Exception as e:
        logger.error(f"Error checking onboarding status: {e}")
        return {
            "needs_onboarding": False,
            "reason": "error",
            "error": str(e)
        }
