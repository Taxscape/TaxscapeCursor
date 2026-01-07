"""
AI Evaluation Routes - Workspace AI Qualification Pipeline

Provides endpoints for:
- Project evaluation using Gemini (Four-Part Test)
- Evidence upload and text extraction
- Gap generation and management
- Narrative draft generation

Builds on existing rd_parser.py evaluation logic.
"""

import os
import io
import json
import uuid
import hashlib
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header
from pydantic import BaseModel, Field

# Reuse existing modules
from app.rd_parser import (
    GEMINI_AVAILABLE, _get_gemini_client, RD_MODEL_NAME, 
    FOUR_PART_TEST_DEFINITIONS, TestStatus, FourPartTestResult,
    parse_pdf_file, parse_docx_file, PDF_AVAILABLE, DOCX_AVAILABLE,
    generate_ai_content
)
from app.supabase_client import get_supabase, verify_supabase_token
from app.task_engine import TaskCreateRequest, TaskType, TaskPriority, create_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/ai", tags=["workspace-ai"])

# =============================================================================
# PROMPT CONFIGURATION (versioned for auditability)
# =============================================================================

PROMPT_VERSION = "v2.0.0"  # Increment when changing prompts

WORKSPACE_EVALUATION_PROMPT = """
{four_part_definitions}

---

## PROJECT TO EVALUATE

**Project ID:** {project_id}
**Project Name:** {project_name}
**Category:** {category}
**Description:** {description}
**Technical Uncertainty:** {technical_uncertainty}
**Process of Experimentation:** {process_of_experimentation}
**Product Line:** {product_line}
**Start Date:** {start_date}
**End Date:** {end_date}

## QUESTIONNAIRE RESPONSES
{questionnaire_answers}

## EVIDENCE DOCUMENTS
{evidence_summary}

## TIME ALLOCATION DATA
{time_allocation}

## FINANCIAL DATA
{financial_data}

---

## YOUR TASK

Evaluate this project against each of the four tests using STRICT IRS Section 41 criteria.

CRITICAL RULES:
1. ONLY cite facts present in the provided data - do NOT invent or assume
2. When evidence is missing, explicitly state what documentation is needed
3. If a questionnaire answer provides relevant info, cite it by ID
4. If evidence document excerpts are provided, cite them by evidence_id and page/section
5. Be CONSERVATIVE - mark as "needs_review" rather than "pass" if evidence is incomplete

Respond in this EXACT JSON format (no markdown code blocks, just raw JSON):
{{
    "permitted_purpose": {{
        "status": "pass" | "fail" | "needs_review" | "missing_data",
        "reasoning": "Cite specific evidence. Reference questionnaire item IDs or evidence IDs.",
        "citations": [{{"type": "questionnaire|evidence", "id": "...", "excerpt": "..."}}]
    }},
    "elimination_uncertainty": {{
        "status": "pass" | "fail" | "needs_review" | "missing_data",
        "reasoning": "What technical uncertainty existed? Cite specific facts.",
        "citations": []
    }},
    "process_experimentation": {{
        "status": "pass" | "fail" | "needs_review" | "missing_data",
        "reasoning": "What systematic evaluation was performed? Cite evidence.",
        "citations": []
    }},
    "technological_nature": {{
        "status": "pass" | "fail" | "needs_review" | "missing_data",
        "reasoning": "What scientific/engineering principles? Cite facts.",
        "citations": []
    }},
    "confidence_score": 0.0 to 1.0,
    "summary": "2-3 sentence overall assessment",
    "missing_info": ["specific document or information needed"],
    "suggested_gaps": [
        {{
            "gap_type": "missing_uncertainty|missing_experimentation|missing_tech_basis|missing_permitted_purpose|missing_project_narrative|missing_test_evidence|needs_clarification",
            "severity": "low|medium|high|critical",
            "title": "Short title",
            "description": "What is missing and why it matters",
            "required_info": ["what to provide"],
            "linked_criterion": "permitted_purpose|elimination_uncertainty|process_experimentation|technological_nature"
        }}
    ]
}}
"""

# =============================================================================
# SCHEMAS
# =============================================================================

class EvaluateProjectRequest(BaseModel):
    project_id: str
    tax_year: int = 2024
    use_evidence: bool = True
    force: bool = False  # Force re-evaluation even if hash matches

class EvaluateClientRequest(BaseModel):
    client_company_id: str
    tax_year: int = 2024
    use_evidence: bool = True
    concurrency: int = Field(default=3, le=10)  # Max concurrent evaluations

class EvidenceUploadResponse(BaseModel):
    evidence_id: str
    original_filename: str
    file_type: str
    extraction_status: str
    extracted_text_preview: Optional[str] = None

class GapCreateRequest(BaseModel):
    project_id: str
    gap_type: str
    severity: str = "medium"
    title: str
    description: Optional[str] = None
    required_info: List[str] = []
    linked_criterion_key: Optional[str] = None

class GapUpdateRequest(BaseModel):
    status: Optional[str] = None
    resolution_notes: Optional[str] = None
    waived_reason: Optional[str] = None

class TaskFromGapRequest(BaseModel):
    gap_id: str
    title: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None

class DraftNarrativeRequest(BaseModel):
    project_id: str
    narrative_type: str = "full_narrative"  # project_summary, technical_uncertainty, etc.
    include_evidence_citations: bool = True

# =============================================================================
# AUTH DEPENDENCY
# =============================================================================

async def get_current_user(authorization: str = Header(None)):
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

def get_user_context(user_id: str) -> Dict[str, Any]:
    """Get user's organization and role."""
    supabase = get_supabase()
    try:
        result = supabase.table("profiles").select("organization_id, role").eq("id", user_id).single().execute()
        return result.data or {}
    except Exception as e:
        logger.error(f"Error getting user context: {e}")
        return {}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def compute_inputs_hash(project: Dict, questionnaire_items: List, evidence_items: List) -> str:
    """Compute hash of all inputs for staleness detection."""
    hash_parts = [
        project.get("name", ""),
        project.get("description", ""),
        project.get("technical_uncertainty", ""),
        project.get("process_of_experimentation", ""),
        str(project.get("updated_at", "")),
    ]
    
    # Add questionnaire answers
    for item in sorted(questionnaire_items, key=lambda x: x.get("id", "")):
        hash_parts.append(item.get("response_text", "") or "")
    
    # Add evidence IDs (presence matters, not content)
    for ev in sorted(evidence_items, key=lambda x: x.get("id", "")):
        hash_parts.append(ev.get("id", ""))
    
    combined = "|".join(hash_parts)
    return hashlib.md5(combined.encode()).hexdigest()


def format_questionnaire_for_prompt(items: List[Dict]) -> str:
    """Format questionnaire items for AI prompt."""
    if not items:
        return "No questionnaire responses provided."
    
    lines = []
    for item in items:
        status = item.get("response_status", "unanswered")
        response = item.get("response_text", "")
        question = item.get("question_text", "Unknown question")
        intent = item.get("question_intent", "general")
        
        lines.append(f"- [ID: {item.get('id', 'N/A')[:8]}] [{intent}] Q: {question}")
        if response:
            lines.append(f"  A: {response}")
        else:
            lines.append(f"  A: (unanswered)")
    
    return "\n".join(lines)


def format_evidence_for_prompt(items: List[Dict]) -> str:
    """Format evidence items for AI prompt."""
    if not items:
        return "No evidence documents provided."
    
    lines = []
    for item in items:
        ev_type = item.get("evidence_type", "other")
        filename = item.get("original_filename", "Unknown")
        excerpt = item.get("extracted_text", "")
        
        lines.append(f"- [Evidence ID: {item.get('id', 'N/A')[:8]}] [{ev_type}] {filename}")
        if excerpt:
            # Truncate for token efficiency
            truncated = excerpt[:2000] + "..." if len(excerpt) > 2000 else excerpt
            lines.append(f"  Excerpt: {truncated}")
    
    return "\n".join(lines)


def parse_ai_response(response_text: str) -> Dict[str, Any]:
    """Parse AI response with robust JSON extraction and retry logic."""
    # Strip markdown code blocks
    text = response_text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}. Response: {text[:500]}")
        raise ValueError(f"AI response was not valid JSON: {str(e)}")


def generate_gaps_from_evaluation(
    evaluation_result: Dict,
    project_id: str,
    org_id: str,
    client_id: str,
    tax_year: int,
    user_id: str,
    evaluation_id: str
) -> List[Dict]:
    """Generate gap records from AI evaluation results."""
    gaps = []
    
    # From explicit suggested_gaps
    for gap_suggestion in evaluation_result.get("suggested_gaps", []):
        gaps.append({
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "client_company_id": client_id,
            "project_id": project_id,
            "tax_year": tax_year,
            "gap_type": gap_suggestion.get("gap_type", "needs_clarification"),
            "severity": gap_suggestion.get("severity", "medium"),
            "title": gap_suggestion.get("title", "Review needed"),
            "description": gap_suggestion.get("description"),
            "required_info": gap_suggestion.get("required_info", []),
            "linked_criterion_key": gap_suggestion.get("linked_criterion"),
            "status": "open",
            "ai_generated": True,
            "source_evaluation_id": evaluation_id,
            "created_by": user_id,
        })
    
    # From missing_info array
    for missing in evaluation_result.get("missing_info", []):
        # Check if not already covered by suggested_gaps
        already_covered = any(
            g.get("description", "").lower() in missing.lower() or
            missing.lower() in g.get("description", "").lower()
            for g in gaps
        )
        if not already_covered:
            gaps.append({
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "client_company_id": client_id,
                "project_id": project_id,
                "tax_year": tax_year,
                "gap_type": "needs_clarification",
                "severity": "medium",
                "title": f"Missing: {missing[:50]}...",
                "description": missing,
                "required_info": [missing],
                "status": "open",
                "ai_generated": True,
                "source_evaluation_id": evaluation_id,
                "created_by": user_id,
            })
    
    return gaps


# =============================================================================
# EVALUATION ENDPOINTS
# =============================================================================

@router.post("/evaluate-project")
async def evaluate_project(
    request: EvaluateProjectRequest,
    user: Dict = Depends(get_current_user)
):
    """
    Evaluate a single project against the Four-Part Test using Gemini.
    
    - Assembles inputs from project, questionnaire, evidence
    - Checks staleness hash before calling AI (unless force=True)
    - Persists versioned evaluation result
    - Generates gaps from AI suggestions
    """
    if not GEMINI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI evaluation not available - Gemini not configured")
    
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    # Fetch project
    project_result = supabase.table("projects").select("*").eq("id", request.project_id).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = project_result.data
    client_id = project.get("client_company_id") or project.get("organization_id")
    
    # Fetch questionnaire items
    questionnaire_result = supabase.table("project_questionnaire_items").select("*").eq("project_id", request.project_id).execute()
    questionnaire_items = questionnaire_result.data or []
    
    # Fetch evidence if enabled
    evidence_items = []
    if request.use_evidence:
        evidence_result = supabase.table("project_evidence_items").select("*").eq("project_id", request.project_id).execute()
        evidence_items = evidence_result.data or []
    
    # Compute inputs hash
    current_hash = compute_inputs_hash(project, questionnaire_items, evidence_items)
    
    # Check if we can skip evaluation (hash matches and not forced)
    if not request.force:
        latest_eval = supabase.table("project_ai_evaluations")\
            .select("*")\
            .eq("project_id", request.project_id)\
            .eq("tax_year", request.tax_year)\
            .eq("is_latest", True)\
            .single()\
            .execute()
        
        if latest_eval.data and latest_eval.data.get("inputs_snapshot_hash") == current_hash:
            return {
                "status": "not_changed",
                "message": "Inputs have not changed since last evaluation",
                "evaluation": latest_eval.data,
                "gaps": []
            }
    
    # Get next version number
    version_result = supabase.table("project_ai_evaluations")\
        .select("evaluation_version")\
        .eq("project_id", request.project_id)\
        .eq("tax_year", request.tax_year)\
        .order("evaluation_version", desc=True)\
        .limit(1)\
        .execute()
    
    next_version = 1
    if version_result.data:
        next_version = version_result.data[0].get("evaluation_version", 0) + 1
    
    # Assemble prompt
    prompt = WORKSPACE_EVALUATION_PROMPT.format(
        four_part_definitions=FOUR_PART_TEST_DEFINITIONS,
        project_id=project.get("id", ""),
        project_name=project.get("name", "Unnamed Project"),
        category=project.get("product_line", "Not specified"),
        description=project.get("description", "No description provided"),
        technical_uncertainty=project.get("technical_uncertainty", "Not provided"),
        process_of_experimentation=project.get("process_of_experimentation", "Not provided"),
        product_line=project.get("product_line", "Not specified"),
        start_date=str(project.get("start_date", "Not specified")),
        end_date=str(project.get("end_date", "Not specified")),
        questionnaire_answers=format_questionnaire_for_prompt(questionnaire_items),
        evidence_summary=format_evidence_for_prompt(evidence_items),
        time_allocation="(See questionnaire and evidence for time allocation details)",
        financial_data="(Financial data available in linked timesheets and expenses)"
    )
    
    # Call Gemini
    try:
        response_text = generate_ai_content(prompt, temperature=0.2, max_output_tokens=4096)
        result = parse_ai_response(response_text)
        
    except Exception as e:
        logger.error(f"AI evaluation failed for project {request.project_id}: {e}")
        
        # Store error evaluation
        error_eval = {
            "organization_id": org_id,
            "client_company_id": client_id,
            "project_id": request.project_id,
            "tax_year": request.tax_year,
            "evaluation_version": next_version,
            "four_part_test_json": {},
            "confidence_score": 0,
            "qualified_boolean": False,
            "missing_info": [],
            "ai_summary": "",
            "model_provider": "gemini",
            "model_name": RD_MODEL_NAME,
            "prompt_version": PROMPT_VERSION,
            "inputs_snapshot_hash": current_hash,
            "status": "error",
            "error_message": str(e),
            "created_by": user["id"],
        }
        supabase.table("project_ai_evaluations").insert(error_eval).execute()
        
        raise HTTPException(status_code=500, detail=f"AI evaluation failed: {str(e)}")
    
    # Determine qualified status
    status_map = {"pass": True, "fail": False, "needs_review": None, "missing_data": None}
    
    tests_passed = 0
    needs_review = False
    for test_key in ["permitted_purpose", "elimination_uncertainty", "process_experimentation", "technological_nature"]:
        test_result = result.get(test_key, {})
        status = test_result.get("status", "missing_data")
        if status == "pass":
            tests_passed += 1
        elif status == "needs_review" or status == "missing_data":
            needs_review = True
    
    qualified = tests_passed == 4
    
    # Build four_part_test_json
    four_part_json = {}
    for test_key in ["permitted_purpose", "elimination_uncertainty", "process_experimentation", "technological_nature"]:
        test_data = result.get(test_key, {})
        four_part_json[test_key] = {
            "status": test_data.get("status", "missing_data"),
            "reasoning": test_data.get("reasoning", ""),
            "citations": test_data.get("citations", [])
        }
    
    # Create evaluation record
    evaluation_id = str(uuid.uuid4())
    evaluation_record = {
        "id": evaluation_id,
        "organization_id": org_id,
        "client_company_id": client_id,
        "project_id": request.project_id,
        "tax_year": request.tax_year,
        "evaluation_version": next_version,
        "four_part_test_json": four_part_json,
        "confidence_score": result.get("confidence_score", 0.5),
        "qualified_boolean": qualified,
        "missing_info": result.get("missing_info", []),
        "ai_summary": result.get("summary", ""),
        "model_provider": "gemini",
        "model_name": RD_MODEL_NAME,
        "prompt_version": PROMPT_VERSION,
        "inputs_snapshot_hash": current_hash,
        "evidence_ids_used": [e.get("id") for e in evidence_items],
        "status": "needs_review" if needs_review else "completed",
        "created_by": user["id"],
    }
    
    supabase.table("project_ai_evaluations").insert(evaluation_record).execute()
    
    # Update project status
    ai_status = "qualified" if qualified else ("needs_review" if needs_review else "not_qualified")
    supabase.table("projects").update({
        "ai_qualification_status": ai_status,
        "last_ai_evaluation_at": datetime.utcnow().isoformat()
    }).eq("id", request.project_id).execute()
    
    # Generate gaps
    gaps = generate_gaps_from_evaluation(
        result, request.project_id, org_id, client_id, 
        request.tax_year, user["id"], evaluation_id
    )
    
    # Insert gaps (upsert by type+criterion to avoid duplicates)
    if gaps:
        # Clear old AI-generated open gaps for this project
        supabase.table("project_gaps")\
            .delete()\
            .eq("project_id", request.project_id)\
            .eq("ai_generated", True)\
            .eq("status", "open")\
            .execute()
        
        # Insert new gaps
        supabase.table("project_gaps").insert(gaps).execute()
    
    return {
        "status": "completed",
        "evaluation": evaluation_record,
        "gaps": gaps,
        "next_best_actions": [
            {"action": "review_gaps", "count": len(gaps)} if gaps else None,
            {"action": "upload_evidence"} if result.get("missing_info") else None,
        ]
    }


@router.post("/evaluate-client")
async def evaluate_client(
    request: EvaluateClientRequest,
    user: Dict = Depends(get_current_user)
):
    """
    Evaluate all projects for a client company.
    Queues evaluations and processes them with limited concurrency.
    """
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    # Fetch all projects for client
    projects_result = supabase.table("projects")\
        .select("id, name")\
        .eq("client_company_id", request.client_company_id)\
        .execute()
    
    projects = projects_result.data or []
    
    if not projects:
        return {"status": "no_projects", "message": "No projects found for this client"}
    
    results = {
        "total": len(projects),
        "completed": 0,
        "failed": 0,
        "not_changed": 0,
        "project_results": []
    }
    
    # Process projects (in production, this would be async/queued)
    for project in projects:
        try:
            eval_request = EvaluateProjectRequest(
                project_id=project["id"],
                tax_year=request.tax_year,
                use_evidence=request.use_evidence,
                force=False
            )
            
            result = await evaluate_project(eval_request, user)
            
            if result.get("status") == "not_changed":
                results["not_changed"] += 1
            else:
                results["completed"] += 1
            
            results["project_results"].append({
                "project_id": project["id"],
                "project_name": project["name"],
                "status": result.get("status"),
                "gaps_count": len(result.get("gaps", []))
            })
            
        except Exception as e:
            results["failed"] += 1
            results["project_results"].append({
                "project_id": project["id"],
                "project_name": project["name"],
                "status": "error",
                "error": str(e)
            })
    
    return results


# =============================================================================
# EVIDENCE ENDPOINTS
# =============================================================================

@router.post("/evidence/upload")
async def upload_evidence(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    evidence_type: str = Form("other"),
    description: str = Form(None),
    tags: str = Form(""),  # Comma-separated
    user: Dict = Depends(get_current_user)
):
    """
    Upload evidence file and trigger text extraction.
    Stores file in Supabase Storage and creates evidence record.
    """
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    # Get project to verify access and get client_id
    project_result = supabase.table("projects").select("id, client_company_id, organization_id").eq("id", project_id).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = project_result.data
    client_id = project.get("client_company_id") or project.get("organization_id")
    
    # Read file content
    content = await file.read()
    filename = file.filename or "unknown"
    
    # Determine file type
    ext = filename.lower().split(".")[-1] if "." in filename else "other"
    file_type_map = {
        "pdf": "pdf", "docx": "docx", "doc": "docx",
        "xlsx": "xlsx", "xls": "xlsx", "csv": "csv",
        "txt": "txt", "png": "image", "jpg": "image", "jpeg": "image"
    }
    file_type = file_type_map.get(ext, "other")
    
    # Generate storage key
    evidence_id = str(uuid.uuid4())
    storage_key = f"{org_id}/{client_id}/evidence/{evidence_id}/{filename}"
    
    # Upload to Supabase Storage (if available)
    # For now, we'll store the extracted text directly
    
    # Extract text
    extracted_text = ""
    extraction_status = "pending"
    extraction_error = None
    
    try:
        if file_type == "pdf" and PDF_AVAILABLE:
            extracted_text = parse_pdf_file(content, filename)
            extraction_status = "completed"
        elif file_type == "docx" and DOCX_AVAILABLE:
            extracted_text = parse_docx_file(content, filename)
            extraction_status = "completed"
        elif file_type == "txt":
            extracted_text = content.decode("utf-8", errors="ignore")
            extraction_status = "completed"
        elif file_type == "csv":
            extracted_text = content.decode("utf-8", errors="ignore")[:50000]  # Limit CSV
            extraction_status = "completed"
        else:
            extraction_status = "pending"  # Would need async processing
    except Exception as e:
        extraction_status = "failed"
        extraction_error = str(e)
        logger.error(f"Text extraction failed for {filename}: {e}")
    
    # Create evidence record
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    evidence_record = {
        "id": evidence_id,
        "organization_id": org_id,
        "client_company_id": client_id,
        "project_id": project_id,
        "storage_object_key": storage_key,
        "original_filename": filename,
        "file_type": file_type,
        "file_size_bytes": len(content),
        "mime_type": file.content_type,
        "evidence_type": evidence_type,
        "tags": tag_list,
        "description": description,
        "extraction_status": extraction_status,
        "extracted_text": extracted_text[:100000] if extracted_text else None,  # Limit stored text
        "extraction_error": extraction_error,
        "extracted_at": datetime.utcnow().isoformat() if extraction_status == "completed" else None,
        "uploaded_by": user["id"],
    }
    
    supabase.table("project_evidence_items").insert(evidence_record).execute()
    
    # Update project staleness
    supabase.table("projects").update({
        "last_inputs_updated_at": datetime.utcnow().isoformat()
    }).eq("id", project_id).execute()
    
    return EvidenceUploadResponse(
        evidence_id=evidence_id,
        original_filename=filename,
        file_type=file_type,
        extraction_status=extraction_status,
        extracted_text_preview=extracted_text[:500] if extracted_text else None
    )


@router.post("/evidence/{evidence_id}/extract")
async def extract_evidence_text(
    evidence_id: str,
    user: Dict = Depends(get_current_user)
):
    """
    Trigger or refresh text extraction for an evidence item.
    """
    supabase = get_supabase()
    
    # Fetch evidence
    result = supabase.table("project_evidence_items").select("*").eq("id", evidence_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    evidence = result.data
    
    # For now, return current status (async extraction would be handled separately)
    return {
        "evidence_id": evidence_id,
        "extraction_status": evidence.get("extraction_status"),
        "extracted_text_length": len(evidence.get("extracted_text", "") or ""),
        "message": "Extraction status retrieved. Async re-extraction not yet implemented."
    }


@router.get("/evidence")
async def list_evidence(
    project_id: str,
    evidence_type: str = None,
    user: Dict = Depends(get_current_user)
):
    """List evidence items for a project."""
    supabase = get_supabase()
    
    query = supabase.table("project_evidence_items").select("*").eq("project_id", project_id)
    
    if evidence_type:
        query = query.eq("evidence_type", evidence_type)
    
    result = query.order("created_at", desc=True).execute()
    
    return {"data": result.data or []}


# =============================================================================
# GAPS ENDPOINTS
# =============================================================================

@router.get("/gaps")
async def list_gaps(
    project_id: str = None,
    client_company_id: str = None,
    status: str = None,
    severity: str = None,
    tax_year: int = 2024,
    user: Dict = Depends(get_current_user)
):
    """List gaps with filtering."""
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    query = supabase.table("project_gaps").select("*").eq("organization_id", org_id).eq("tax_year", tax_year)
    
    if project_id:
        query = query.eq("project_id", project_id)
    if client_company_id:
        query = query.eq("client_company_id", client_company_id)
    if status:
        query = query.eq("status", status)
    if severity:
        query = query.eq("severity", severity)
    
    result = query.order("priority_score", desc=True).order("created_at", desc=True).execute()
    
    return {"data": result.data or []}


@router.post("/gaps")
async def create_gap(
    gap: GapCreateRequest,
    user: Dict = Depends(get_current_user)
):
    """Create a manual gap."""
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    # Get project for client_id
    project_result = supabase.table("projects").select("client_company_id").eq("id", gap.project_id).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    
    client_id = project_result.data.get("client_company_id")
    
    gap_record = {
        "organization_id": org_id,
        "client_company_id": client_id,
        "project_id": gap.project_id,
        "tax_year": 2024,
        "gap_type": gap.gap_type,
        "severity": gap.severity,
        "title": gap.title,
        "description": gap.description,
        "required_info": gap.required_info,
        "linked_criterion_key": gap.linked_criterion_key,
        "status": "open",
        "ai_generated": False,
        "created_by": user["id"],
    }
    
    result = supabase.table("project_gaps").insert(gap_record).execute()
    
    return {"data": result.data[0] if result.data else None}


@router.patch("/gaps/{gap_id}")
async def update_gap(
    gap_id: str,
    updates: GapUpdateRequest,
    user: Dict = Depends(get_current_user)
):
    """Update a gap (status, resolution, waiver)."""
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    user_role = user_context.get("role", "")
    
    update_data = {}
    
    if updates.status:
        update_data["status"] = updates.status
        
        if updates.status == "resolved":
            update_data["resolved_by"] = user["id"]
            update_data["resolved_at"] = datetime.utcnow().isoformat()
        
        if updates.status == "waived":
            # Check if user has permission to waive
            allowed_roles = ["admin", "cpa", "executive", "managing_partner", "reviewer"]
            if user_role not in allowed_roles:
                raise HTTPException(status_code=403, detail="Only CPAs/executives can waive gaps")
            
            update_data["waived_by"] = user["id"]
            update_data["waived_at"] = datetime.utcnow().isoformat()
    
    if updates.resolution_notes:
        update_data["resolution_notes"] = updates.resolution_notes
    
    if updates.waived_reason:
        update_data["waived_reason"] = updates.waived_reason
    
    result = supabase.table("project_gaps").update(update_data).eq("id", gap_id).execute()
    
    return {"data": result.data[0] if result.data else None}


@router.post("/gaps/{gap_id}/create-task")
async def create_task_from_gap(
    gap_id: str,
    request: TaskFromGapRequest,
    user: Dict = Depends(get_current_user)
):
    """Create a task from a gap for delegation."""
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    
    # Fetch gap
    gap_result = supabase.table("project_gaps").select("*").eq("id", gap_id).single().execute()
    if not gap_result.data:
        raise HTTPException(status_code=404, detail="Gap not found")
    
    gap = gap_result.data
    
    # Determine task type based on gap type
    gap_type_to_task_type = {
        "missing_uncertainty": TaskType.REQUEST_UNCERTAINTY_STATEMENT,
        "missing_experimentation": TaskType.REQUEST_PROCESS_OF_EXPERIMENTATION_DETAILS,
        "missing_project_narrative": TaskType.REQUEST_PROJECT_NARRATIVE,
        "missing_test_evidence": TaskType.REQUEST_TEST_RESULTS_UPLOAD,
        "missing_tech_basis": TaskType.REQUEST_TECHNICAL_DOCUMENT_UPLOAD,
    }
    
    task_type = gap_type_to_task_type.get(gap.get("gap_type"), TaskType.GENERIC)
    
    # Build task title
    title = request.title or f"Provide {gap.get('title', 'missing information')}"
    
    # Create task request
    task_request = TaskCreateRequest(
        client_id=gap.get("client_company_id"),
        project_id=gap.get("project_id"),
        criterion_key=gap.get("linked_criterion_key"),
        task_type=task_type,
        title=title,
        description=gap.get("description") or f"Please provide the following:\n" + "\n".join(f"- {r}" for r in gap.get("required_info", [])),
        priority=TaskPriority.HIGH if gap.get("severity") in ["high", "critical"] else TaskPriority.MEDIUM,
        due_date=request.due_date,
        assigned_to=request.assigned_to,
        related_entities={"gap_id": gap_id},
        required_artifacts=[{"type": "document_upload", "description": r} for r in gap.get("required_info", [])],
        initiated_by_ai=gap.get("ai_generated", False),
    )
    
    # Create task using task engine
    task_result = create_task(supabase, task_request, user["id"])
    
    # Link task to gap
    supabase.table("project_gaps").update({
        "linked_task_id": task_result.get("id"),
        "status": "in_progress"
    }).eq("id", gap_id).execute()
    
    return {
        "task": task_result,
        "gap_id": gap_id,
        "message": "Task created and linked to gap"
    }


# =============================================================================
# NARRATIVE DRAFT ENDPOINTS
# =============================================================================

@router.post("/draft-narrative")
async def draft_narrative(
    request: DraftNarrativeRequest,
    user: Dict = Depends(get_current_user)
):
    """
    Generate a compliant project narrative draft using AI.
    Only uses facts from existing data - no hallucination.
    """
    if not GEMINI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI not available")
    
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    # Fetch project data
    project_result = supabase.table("projects").select("*").eq("id", request.project_id).single().execute()
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = project_result.data
    
    # Fetch questionnaire answers
    questionnaire_result = supabase.table("project_questionnaire_items")\
        .select("*")\
        .eq("project_id", request.project_id)\
        .eq("response_status", "answered")\
        .execute()
    questionnaire_items = questionnaire_result.data or []
    
    # Fetch evidence excerpts if requested
    evidence_items = []
    if request.include_evidence_citations:
        evidence_result = supabase.table("project_evidence_items")\
            .select("id, original_filename, evidence_type, extracted_text")\
            .eq("project_id", request.project_id)\
            .eq("extraction_status", "completed")\
            .execute()
        evidence_items = evidence_result.data or []
    
    # Build prompt for narrative generation
    narrative_prompt = f"""You are drafting a professional R&D tax credit narrative for IRS documentation.

CRITICAL RULES:
1. ONLY use facts present in the provided data below
2. NEVER invent or assume any technical details
3. Cite questionnaire responses and evidence when making claims
4. Use professional, audit-ready language
5. If information is missing, explicitly note it as "[NEEDS INPUT: ...]"

PROJECT DATA:
- Name: {project.get('name', 'Unnamed')}
- Description: {project.get('description', 'No description provided')}
- Technical Uncertainty: {project.get('technical_uncertainty', 'Not documented')}
- Process of Experimentation: {project.get('process_of_experimentation', 'Not documented')}
- Product Line: {project.get('product_line', 'Not specified')}

QUESTIONNAIRE RESPONSES:
{format_questionnaire_for_prompt(questionnaire_items) if questionnaire_items else 'No questionnaire responses available.'}

EVIDENCE EXCERPTS:
{format_evidence_for_prompt(evidence_items) if evidence_items else 'No evidence documents available.'}

TASK: Generate a {request.narrative_type} narrative that:
1. Addresses the Four-Part Test requirements
2. Cites specific questionnaire IDs and evidence IDs in brackets
3. Identifies any gaps with [NEEDS INPUT: ...]
4. Uses professional language suitable for IRS audit

Output the narrative text only, no JSON or additional formatting.
"""

    try:
        response_text = generate_ai_content(narrative_prompt, temperature=0.3, max_output_tokens=2048)
        narrative_text = response_text.strip()
        
    except Exception as e:
        logger.error(f"Narrative generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Narrative generation failed: {str(e)}")
    
    # Store draft
    draft_record = {
        "organization_id": org_id,
        "project_id": request.project_id,
        "narrative_type": request.narrative_type,
        "draft_content": narrative_text,
        "evidence_ids_cited": [e.get("id") for e in evidence_items],
        "questionnaire_item_ids_used": [q.get("id") for q in questionnaire_items],
        "status": "draft",
        "model_name": RD_MODEL_NAME,
        "prompt_version": PROMPT_VERSION,
        "created_by": user["id"],
    }
    
    result = supabase.table("project_narrative_drafts").insert(draft_record).execute()
    
    return {
        "draft": result.data[0] if result.data else None,
        "narrative_text": narrative_text,
        "citations": {
            "questionnaire_ids": [q.get("id") for q in questionnaire_items],
            "evidence_ids": [e.get("id") for e in evidence_items]
        }
    }


@router.post("/narratives/{draft_id}/accept")
async def accept_narrative_draft(
    draft_id: str,
    target_field: str = Query(default="description"),  # Which project field to update
    user: Dict = Depends(get_current_user)
):
    """Accept a narrative draft and optionally apply to project field."""
    supabase = get_supabase()
    
    # Fetch draft
    draft_result = supabase.table("project_narrative_drafts").select("*").eq("id", draft_id).single().execute()
    if not draft_result.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    draft = draft_result.data
    
    # Update draft status
    supabase.table("project_narrative_drafts").update({
        "status": "accepted",
        "accepted_by": user["id"],
        "accepted_at": datetime.utcnow().isoformat()
    }).eq("id", draft_id).execute()
    
    # Optionally update project field
    field_mapping = {
        "description": "description",
        "technical_uncertainty": "technical_uncertainty",
        "process_of_experimentation": "process_of_experimentation",
    }
    
    if target_field in field_mapping:
        supabase.table("projects").update({
            field_mapping[target_field]: draft.get("draft_content"),
            "last_inputs_updated_at": datetime.utcnow().isoformat()
        }).eq("id", draft.get("project_id")).execute()
    
    return {
        "message": f"Draft accepted and applied to {target_field}",
        "draft_id": draft_id,
        "project_id": draft.get("project_id")
    }


# =============================================================================
# NEXT BEST ACTIONS (Copilot Support)
# =============================================================================

@router.get("/next-best-actions")
async def get_next_best_actions(
    project_id: str = None,
    client_company_id: str = None,
    tax_year: int = 2024,
    user: Dict = Depends(get_current_user)
):
    """
    Get AI-recommended next best actions based on current state.
    Uses gaps, questionnaire status, and evaluation results.
    """
    supabase = get_supabase()
    user_context = get_user_context(user["id"])
    org_id = user_context.get("organization_id")
    
    actions = []
    
    # If project_id provided, get project-specific actions
    if project_id:
        # Check for open gaps
        gaps_result = supabase.table("project_gaps")\
            .select("id, gap_type, severity, title")\
            .eq("project_id", project_id)\
            .eq("status", "open")\
            .order("severity", desc=True)\
            .limit(5)\
            .execute()
        
        for gap in gaps_result.data or []:
            actions.append({
                "action_type": "resolve_gap",
                "target": gap.get("title"),
                "target_id": gap.get("id"),
                "severity": gap.get("severity"),
                "reason": f"Gap: {gap.get('gap_type', 'unknown').replace('_', ' ')}",
                "estimated_effort": "M" if gap.get("severity") == "high" else "S",
                "blocking": gap.get("severity") == "critical"
            })
        
        # Check evaluation staleness
        project_result = supabase.table("projects")\
            .select("last_inputs_updated_at, last_ai_evaluation_at, ai_qualification_status")\
            .eq("id", project_id)\
            .single()\
            .execute()
        
        if project_result.data:
            project = project_result.data
            inputs_updated = project.get("last_inputs_updated_at")
            eval_at = project.get("last_ai_evaluation_at")
            
            if not eval_at or (inputs_updated and inputs_updated > eval_at):
                actions.append({
                    "action_type": "re_evaluate",
                    "target": "Project evaluation",
                    "target_id": project_id,
                    "reason": "Data changed since last AI evaluation",
                    "estimated_effort": "S",
                    "blocking": False
                })
        
        # Check unanswered questionnaire items
        questionnaire_result = supabase.table("project_questionnaire_items")\
            .select("id, question_text, question_intent")\
            .eq("project_id", project_id)\
            .eq("response_status", "unanswered")\
            .limit(3)\
            .execute()
        
        for item in questionnaire_result.data or []:
            actions.append({
                "action_type": "answer_question",
                "target": item.get("question_text", "")[:50] + "...",
                "target_id": item.get("id"),
                "reason": f"Questionnaire: {item.get('question_intent', 'general')}",
                "estimated_effort": "S",
                "blocking": False
            })
    
    # If client_company_id, get client-wide actions
    elif client_company_id:
        # Projects needing evaluation
        projects_result = supabase.table("projects")\
            .select("id, name, ai_qualification_status")\
            .eq("client_company_id", client_company_id)\
            .eq("ai_qualification_status", "not_evaluated")\
            .limit(5)\
            .execute()
        
        for project in projects_result.data or []:
            actions.append({
                "action_type": "evaluate_project",
                "target": project.get("name"),
                "target_id": project.get("id"),
                "reason": "Project has not been evaluated",
                "estimated_effort": "S",
                "blocking": False
            })
        
        # Count open gaps across client
        gaps_count_result = supabase.table("project_gaps")\
            .select("id", count="exact")\
            .eq("client_company_id", client_company_id)\
            .eq("status", "open")\
            .execute()
        
        gap_count = gaps_count_result.count if hasattr(gaps_count_result, 'count') else 0
        if gap_count > 0:
            actions.append({
                "action_type": "review_gaps",
                "target": f"{gap_count} open gaps",
                "target_id": client_company_id,
                "reason": "Client has unresolved gaps",
                "estimated_effort": "M" if gap_count > 5 else "S",
                "blocking": False
            })
    
    return {
        "actions": actions,
        "total_count": len(actions),
        "has_blocking": any(a.get("blocking") for a in actions)
    }


# =============================================================================
# EVALUATION HISTORY
# =============================================================================

@router.get("/evaluations")
async def list_evaluations(
    project_id: str,
    tax_year: int = 2024,
    limit: int = 10,
    user: Dict = Depends(get_current_user)
):
    """Get evaluation history for a project."""
    supabase = get_supabase()
    
    result = supabase.table("project_ai_evaluations")\
        .select("*")\
        .eq("project_id", project_id)\
        .eq("tax_year", tax_year)\
        .order("evaluation_version", desc=True)\
        .limit(limit)\
        .execute()
    
    return {"data": result.data or []}


@router.get("/evaluations/latest")
async def get_latest_evaluation(
    project_id: str,
    tax_year: int = 2024,
    user: Dict = Depends(get_current_user)
):
    """Get the latest evaluation for a project."""
    supabase = get_supabase()
    
    result = supabase.table("project_ai_evaluations")\
        .select("*")\
        .eq("project_id", project_id)\
        .eq("tax_year", tax_year)\
        .eq("is_latest", True)\
        .single()\
        .execute()
    
    if not result.data:
        return {"data": None, "message": "No evaluation found"}
    
    return {"data": result.data}


# Export router with different name to avoid conflict
ai_evaluation_router = router


