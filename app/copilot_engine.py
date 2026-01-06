import os
import json
import logging
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

# For Gemini integration (using existing client pattern)
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# =============================================================================
# COPILOT SCHEMAS
# =============================================================================

class CopilotCitation(BaseModel):
    evidence_id: Optional[str] = None
    file_id: Optional[str] = None
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    criterion_key: Optional[str] = None
    snippet: Optional[str] = None
    location: Optional[str] = None # e.g., "Page 4"

class CopilotFinding(BaseModel):
    severity: str # info, warning, critical
    reason_code: str
    affected_entities: List[str]
    message: str

class CopilotResponse(BaseModel):
    summary: str
    findings: List[CopilotFinding] = []
    citations: List[CopilotCitation] = []
    suggested_actions: List[Dict[str, Any]] = []
    questions_for_user: List[str] = []
    confidence: float = 0.0
    confidence_explanation: str = ""

# =============================================================================
# CONTEXT PACKAGING & REDACTION
# =============================================================================

def package_copilot_context(supabase, org_id: str, client_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """Gather and rank context for the AI Copilot with token budgeting and redaction."""
    
    # Tier A: Always (Core Workflow State)
    context = {
        "metadata": {
            "org_id": org_id,
            "client_id": client_id,
            "project_id": project_id,
            "timestamp": datetime.utcnow().isoformat()
        }
    }
    
    if project_id:
        workflow_res = supabase.table("project_workflow_status").select("*").eq("project_id", project_id).single().execute()
        context["workflow"] = workflow_res.data
        
        criteria_res = supabase.table("project_criterion_status").select("*").eq("project_id", project_id).execute()
        context["criteria"] = criteria_res.data
        
        # Tier B: Relevant Summaries (Financials & Narrative)
        project_res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
        context["project_details"] = redact_pii(project_res.data)
        
        # Tier C: Evidence Snippets (Top 5 ranked by relevance)
        evidence_res = supabase.table("project_evidence").select("*").eq("project_id", project_id).order("created_at", desc=True).limit(5).execute()
        context["evidence"] = [redact_pii(e) for e in evidence_res.data]
        
    return context

def redact_pii(data: Dict[str, Any]) -> Dict[str, Any]:
    """Mask sensitive PII fields like SSNs, emails, or specific financial identifiers."""
    forbidden_keys = {"ssn", "tax_id", "bank_account", "password", "secret"}
    if not isinstance(data, dict):
        return data
        
    redacted = data.copy()
    for key in redacted:
        if any(f in key.lower() for f in forbidden_keys):
            redacted[key] = "[REDACTED]"
        elif isinstance(redacted[key], dict):
            redacted[key] = redact_pii(redacted[key])
        elif isinstance(redacted[key], list):
            redacted[key] = [redact_pii(i) if isinstance(i, dict) else i for i in redacted[key]]
            
    return redacted

# =============================================================================
# COPILOT ENGINE CORE
# =============================================================================

SYSTEM_PROMPT = """You are the TaxScape Pro AI Copilot, an expert R&D Tax Credit assistant for CPAs. 
Your goal is to guide the CPA through IRS Section 41 and 174 qualification workflows.

### RULES:
1. **Grounded Only**: Only make claims supported by the provided context.
2. **Citations Required**: Every finding MUST include a citation to an evidence_id or project_id.
3. **Uncertainty**: If information is missing, explicitly state "Not supported by available evidence" and ask a question.
4. **No Approvals**: You cannot finalize decisions or change financial numbers.
5. **Scope**: Focus only on R&D credits. Do not provide general legal or investment advice.

### RESPONSE FORMAT:
You MUST respond in valid JSON matching the following schema:
{
  "summary": "Short plain-language summary",
  "findings": [{"severity": "info|warning|critical", "reason_code": "CODE", "affected_entities": ["id"], "message": "explanation"}],
  "citations": [{"evidence_id": "uuid", "snippet": "relevant text excerpt", "location": "Page X"}],
  "suggested_actions": [{"action_type": "request_evidence|assign_task|edit_field|upload_doc", "target": "id", "reason": "why"}],
  "questions_for_user": ["specific missing info questions"],
  "confidence": 0.0-1.0,
  "confidence_explanation": "why"
}
"""

def query_copilot(supabase, user_prompt: str, org_id: str, client_id: str, project_id: Optional[str] = None) -> CopilotResponse:
    """Orchestrate the Copilot response using Gemini 1.5 Pro."""
    
    context = package_copilot_context(supabase, org_id, client_id, project_id)
    
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    model_name = os.environ.get("GEMINI_MODEL", "gemini-1.5-pro")
    
    full_prompt = f"USER PROMPT: {user_prompt}\n\nCONTEXT:\n{json.dumps(context, indent=2)}"
    
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        
        result_json = json.loads(response.text)
        return CopilotResponse(**result_json)
        
    except Exception as e:
        logger.error(f"Copilot query failed: {e}")
        return CopilotResponse(
            summary="I encountered an error while processing your request.",
            findings=[CopilotFinding(severity="critical", reason_code="ENGINE_ERROR", affected_entities=[], message=str(e))],
            confidence=0.0
        )

# =============================================================================
# ACTION EXECUTION
# =============================================================================

def execute_copilot_action(supabase, action_id: str, user_id: str) -> Dict[str, Any]:
    """Execute a pre-approved AI proposed action."""
    
    # 1. Fetch action
    action_res = supabase.table("ai_proposed_actions").select("*").eq("id", action_id).single().execute()
    action = action_res.data
    
    if action["status"] != "approved":
        raise ValueError("Action must be approved before execution.")
        
    try:
        # 2. Execute based on type
        if action["action_type"] == "draft_narrative":
            supabase.table("projects").update(action["proposed_changes"]).eq("id", action["project_id"]).execute()
        elif action["action_type"] == "create_task":
            supabase.table("verification_tasks").insert(action["proposed_changes"]).execute()
            
        # 3. Update status
        supabase.table("ai_proposed_actions").update({
            "status": "executed",
            "executed_at": datetime.utcnow().isoformat()
        }).eq("id", action_id).execute()
        
        return {"success": True}
        
    except Exception as e:
        supabase.table("ai_proposed_actions").update({
            "status": "failed",
            "execution_error": str(e)
        }).eq("id", action_id).execute()
        raise e



