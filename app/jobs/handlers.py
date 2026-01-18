"""
Job Handlers

Implements handler functions for each job type. Each handler receives a JobContext
and returns a result dictionary.
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from app.jobs.job_types import JobType
from app.jobs.runner import JobContext, register_handler
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ============================================================================
# RD Parse Session Handler
# ============================================================================

async def handle_rd_parse_session(ctx: JobContext) -> Dict[str, Any]:
    """
    Parse an R&D analysis session from uploaded files.
    
    Stages:
    1. reading_files - Load files from storage
    2. parsing_sheets - Parse Excel/CSV sheets
    3. canonical_ingestion - Write to canonical tables
    4. gap_identification - Identify missing data
    5. ai_eval_queued - Queue AI evaluation (optional)
    """
    from app.rd_parser import (
        RDAnalysisSession, parse_employees, parse_projects, parse_timesheets,
        parse_vendors, parse_expenses, calculate_qre, identify_data_gaps
    )
    
    session_id = ctx.params.get("session_id")
    include_ai_eval = ctx.params.get("include_ai_eval", True)
    file_ids = ctx.params.get("file_ids")
    
    if not session_id:
        raise ValueError("session_id is required")
    
    supabase = get_supabase()
    
    # Lock the session to prevent concurrent processing
    lock_key = f"rd_parse:{session_id}"
    if not ctx.acquire_lock(lock_key, expires_in_seconds=1800, reason="RD parsing"):
        raise RuntimeError("Session is already being processed")
    
    try:
        ctx.update_progress(5, "reading_files", "Loading uploaded files...")
        
        # Fetch session info
        session_result = supabase.table("rd_analysis_sessions")\
            .select("*")\
            .eq("id", session_id)\
            .single()\
            .execute()
        
        if not session_result.data:
            raise ValueError(f"Session {session_id} not found")
        
        session_data = session_result.data
        client_id = session_data.get("client_company_id")
        tax_year = session_data.get("tax_year") or ctx.tax_year
        
        # Get files to process
        files_query = supabase.table("intake_files")\
            .select("*")\
            .eq("session_id", session_id)
        
        if file_ids:
            files_query = files_query.in_("id", file_ids)
        
        files_result = files_query.execute()
        files = files_result.data or []
        
        if not files:
            raise ValueError("No files found to process")
        
        ctx.log(f"Found {len(files)} files to process")
        
        # Initialize session object
        session = RDAnalysisSession(
            tax_year=tax_year,
            company_name=session_data.get("company_name"),
            industry=session_data.get("industry")
        )
        
        # Stage 2: Parse sheets
        ctx.update_progress(20, "parsing_sheets", f"Parsing {len(files)} files...")
        
        parsed_counts = {
            "employees": 0,
            "projects": 0,
            "timesheets": 0,
            "vendors": 0,
            "expenses": 0
        }
        
        for i, file_info in enumerate(files):
            if ctx.check_cancelled():
                return {"cancelled": True}
            
            ctx.heartbeat()
            file_type = file_info.get("file_type", "").lower()
            file_name = file_info.get("original_filename", "unknown")
            
            ctx.update_progress(
                20 + (i / len(files)) * 30,
                "parsing_sheets",
                f"Parsing {file_name}...",
                counters={"files_done": i, "files_total": len(files)}
            )
            
            try:
                # Download file content
                storage_path = file_info.get("storage_path")
                if storage_path:
                    file_content = supabase.storage.from_("intake-files")\
                        .download(storage_path)
                else:
                    ctx.warn(f"File {file_name} has no storage path, skipping")
                    continue
                
                # Parse based on file type
                if "employee" in file_type or "payroll" in file_type:
                    employees = parse_employees(file_content, file_name)
                    session.employees.extend(employees)
                    parsed_counts["employees"] += len(employees)
                
                elif "project" in file_type:
                    projects = parse_projects(file_content, file_name)
                    session.projects.extend(projects)
                    parsed_counts["projects"] += len(projects)
                
                elif "timesheet" in file_type or "time" in file_type:
                    # Parse timesheet allocations
                    parsed_counts["timesheets"] += 1
                
                elif "vendor" in file_type or "contractor" in file_type:
                    vendors = parse_vendors(file_content, file_name)
                    session.vendors.extend(vendors)
                    parsed_counts["vendors"] += len(vendors)
                
                elif "expense" in file_type or "supply" in file_type or "ap" in file_type:
                    expenses = parse_expenses(file_content, file_name)
                    session.expenses.extend(expenses)
                    parsed_counts["expenses"] += len(expenses)
                
                # Update file status
                supabase.table("intake_files")\
                    .update({"processing_status": "parsed"})\
                    .eq("id", file_info["id"])\
                    .execute()
                    
            except Exception as e:
                ctx.warn(f"Error parsing {file_name}: {str(e)}")
                supabase.table("intake_files")\
                    .update({
                        "processing_status": "error",
                        "processing_error": str(e)
                    })\
                    .eq("id", file_info["id"])\
                    .execute()
        
        # Stage 3: Canonical ingestion
        ctx.update_progress(55, "canonical_ingestion", "Writing to database...")
        
        # Write employees
        if session.employees:
            employee_records = []
            for emp in session.employees:
                employee_records.append({
                    "organization_id": ctx.organization_id,
                    "client_company_id": client_id,
                    "tax_year": str(tax_year),
                    "employee_external_id": emp.employee_id,
                    "name": emp.name,
                    "job_title": emp.job_title,
                    "department": emp.department,
                    "location_state": emp.location,
                    "w2_wages": float(emp.w2_wages or 0),
                    "stock_compensation": float(emp.stock_compensation or 0),
                    "severance": float(emp.severance or 0),
                    "rd_allocation_pct": emp.rd_allocation_percent,
                    "source_session_id": session_id
                })
            
            supabase.table("employees")\
                .upsert(employee_records, on_conflict="client_company_id,employee_external_id,tax_year")\
                .execute()
        
        # Write projects
        if session.projects:
            project_records = []
            for proj in session.projects:
                project_records.append({
                    "organization_id": ctx.organization_id,
                    "client_company_id": client_id,
                    "project_external_id": proj.project_id,
                    "name": proj.project_name,
                    "description": proj.description,
                    "category": proj.category,
                    "qualification_status": "pending_review",
                    "source_session_id": session_id
                })
            
            supabase.table("projects")\
                .upsert(project_records, on_conflict="client_company_id,project_external_id")\
                .execute()
        
        # Write vendors
        if session.vendors:
            vendor_records = []
            for vendor in session.vendors:
                vendor_records.append({
                    "organization_id": ctx.organization_id,
                    "client_company_id": client_id,
                    "vendor_external_id": vendor.vendor_id,
                    "name": vendor.vendor_name,
                    "risk_structure": vendor.risk_bearer,
                    "ip_rights": vendor.ip_rights,
                    "country": vendor.country,
                    "is_qualified": vendor.qualified,
                    "source_session_id": session_id
                })
            
            supabase.table("vendors")\
                .upsert(vendor_records, on_conflict="client_company_id,vendor_external_id")\
                .execute()
        
        ctx.heartbeat()
        
        # Stage 4: Calculate QRE
        ctx.update_progress(70, "calculating_qre", "Computing QRE totals...")
        
        session = calculate_qre(session)
        
        # Stage 5: Gap identification
        ctx.update_progress(80, "gap_identification", "Identifying data gaps...")
        
        gaps = identify_data_gaps(session)
        
        # Store gaps
        if gaps:
            gap_records = []
            for gap in gaps:
                gap_records.append({
                    "organization_id": ctx.organization_id,
                    "client_company_id": client_id,
                    "session_id": session_id,
                    "gap_type": gap.get("type"),
                    "severity": gap.get("severity", "medium"),
                    "title": gap.get("title"),
                    "description": gap.get("description"),
                    "status": "open"
                })
            
            supabase.table("data_gaps")\
                .insert(gap_records)\
                .execute()
        
        # Update session status
        supabase.table("rd_analysis_sessions")\
            .update({
                "status": "parsed",
                "parsed_at": datetime.utcnow().isoformat(),
                "summary_stats": {
                    "employees": parsed_counts["employees"],
                    "projects": parsed_counts["projects"],
                    "vendors": parsed_counts["vendors"],
                    "expenses": parsed_counts["expenses"],
                    "gaps_identified": len(gaps),
                    "total_qre": float(session.total_qre),
                    "wage_qre": float(session.wage_qre),
                    "supply_qre": float(session.supply_qre),
                    "contract_qre": float(session.contract_qre)
                }
            })\
            .eq("id", session_id)\
            .execute()
        
        # Stage 6: Queue AI evaluation (optional)
        if include_ai_eval and session.projects:
            ctx.update_progress(90, "ai_eval_queued", "Queueing AI evaluation...")
            
            project_ids = [p.project_id for p in session.projects[:50]]  # Limit for safety
            
            child_job = ctx.create_child_job(
                job_type=JobType.AI_EVALUATE_PROJECTS,
                params={
                    "project_ids": project_ids,
                    "tax_year": tax_year,
                    "use_evidence": True
                },
                priority=ctx.params.get("priority", 5)
            )
            
            ctx.log(f"Created AI evaluation job {child_job['id']} for {len(project_ids)} projects")
        
        ctx.update_progress(100, "completed", "Parse complete")
        
        return {
            "session_id": session_id,
            "parsed_counts": parsed_counts,
            "gaps_identified": len(gaps),
            "qre_summary": {
                "total_qre": float(session.total_qre),
                "wage_qre": float(session.wage_qre),
                "supply_qre": float(session.supply_qre),
                "contract_qre": float(session.contract_qre)
            },
            "ai_eval_job_id": child_job["id"] if include_ai_eval and session.projects else None
        }
        
    finally:
        ctx.release_lock(lock_key)


# ============================================================================
# AI Evaluate Projects Handler
# ============================================================================

async def handle_ai_evaluate_projects(ctx: JobContext) -> Dict[str, Any]:
    """
    Evaluate multiple projects using AI (Gemini).
    
    Processes projects with concurrency limits and tracks individual results.
    """
    from app.ai_evaluation_routes import (
        evaluate_project, EvaluateProjectRequest,
        GEMINI_AVAILABLE
    )
    import asyncio
    
    if not GEMINI_AVAILABLE:
        raise RuntimeError("AI evaluation not available - Gemini not configured")
    
    project_ids = ctx.params.get("project_ids", [])
    tax_year = ctx.params.get("tax_year", 2024)
    use_evidence = ctx.params.get("use_evidence", True)
    force = ctx.params.get("force", False)
    concurrency = ctx.params.get("concurrency", 3)
    
    if not project_ids:
        raise ValueError("project_ids is required")
    
    total_projects = len(project_ids)
    ctx.log(f"Starting AI evaluation for {total_projects} projects")
    
    results = {
        "total": total_projects,
        "completed": 0,
        "not_changed": 0,
        "failed": 0,
        "project_results": []
    }
    
    # Create semaphore for concurrency control
    semaphore = asyncio.Semaphore(concurrency)
    
    async def evaluate_single(project_id: str, index: int):
        async with semaphore:
            if ctx.check_cancelled():
                return None
            
            ctx.update_progress(
                (index / total_projects) * 90,
                "evaluating",
                f"Evaluating project {index + 1}/{total_projects}",
                counters={
                    "projects_done": index,
                    "projects_total": total_projects,
                    "completed": results["completed"],
                    "failed": results["failed"]
                }
            )
            
            try:
                # Create mock user for internal call
                mock_user = {"id": ctx.user_id}
                
                request = EvaluateProjectRequest(
                    project_id=project_id,
                    tax_year=tax_year,
                    use_evidence=use_evidence,
                    force=force
                )
                
                result = await evaluate_project(request, mock_user)
                
                status = result.get("status", "unknown")
                
                if status == "not_changed":
                    results["not_changed"] += 1
                elif status == "completed":
                    results["completed"] += 1
                else:
                    results["completed"] += 1
                
                results["project_results"].append({
                    "project_id": project_id,
                    "status": status,
                    "gaps_count": len(result.get("gaps", [])),
                    "qualified": result.get("evaluation", {}).get("qualified_boolean")
                })
                
                return result
                
            except Exception as e:
                results["failed"] += 1
                results["project_results"].append({
                    "project_id": project_id,
                    "status": "error",
                    "error": str(e)
                })
                ctx.warn(f"Failed to evaluate project {project_id}: {str(e)}")
                return None
    
    # Process all projects with concurrency
    tasks = [
        evaluate_single(pid, i) 
        for i, pid in enumerate(project_ids)
    ]
    
    await asyncio.gather(*tasks, return_exceptions=True)
    
    ctx.update_progress(100, "completed", f"Evaluated {total_projects} projects")
    
    return results


# ============================================================================
# AI Evaluate Single Project Handler
# ============================================================================

async def handle_ai_evaluate_single_project(ctx: JobContext) -> Dict[str, Any]:
    """
    Evaluate a single project using AI.
    Wrapper for lighter-weight single project evaluation.
    """
    from app.ai_evaluation_routes import (
        evaluate_project, EvaluateProjectRequest
    )
    
    project_id = ctx.params.get("project_id")
    tax_year = ctx.params.get("tax_year", 2024)
    use_evidence = ctx.params.get("use_evidence", True)
    force = ctx.params.get("force", False)
    
    if not project_id:
        raise ValueError("project_id is required")
    
    ctx.update_progress(10, "preparing", "Preparing evaluation...")
    
    mock_user = {"id": ctx.user_id}
    
    request = EvaluateProjectRequest(
        project_id=project_id,
        tax_year=tax_year,
        use_evidence=use_evidence,
        force=force
    )
    
    ctx.update_progress(30, "evaluating", "Running AI evaluation...")
    
    result = await evaluate_project(request, mock_user)
    
    ctx.update_progress(100, "completed", "Evaluation complete")
    
    return {
        "project_id": project_id,
        "status": result.get("status"),
        "evaluation": result.get("evaluation"),
        "gaps": result.get("gaps", [])
    }


# ============================================================================
# Generate Excel Report Handler
# ============================================================================

async def handle_generate_excel_report(ctx: JobContext) -> Dict[str, Any]:
    """
    Generate comprehensive Excel study workbook.
    """
    from app.rd_excel_generator import generate_rd_workbook
    from app.study_routes import adapt_workspace_to_session
    
    supabase = get_supabase()
    client_id = ctx.client_company_id
    tax_year = ctx.tax_year or ctx.params.get("tax_year", 2024)
    study_id = ctx.params.get("study_id")
    
    if not client_id:
        raise ValueError("client_company_id is required")
    
    ctx.update_progress(10, "loading_data", "Loading workspace data...")
    
    # Fetch all required data
    client = supabase.table("client_companies")\
        .select("*")\
        .eq("id", client_id)\
        .single()\
        .execute().data
    
    projects = supabase.table("projects")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .execute().data or []
    
    ctx.heartbeat()
    
    employees = supabase.table("employees")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", str(tax_year))\
        .execute().data or []
    
    vendors = supabase.table("vendors")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .execute().data or []
    
    contracts = supabase.table("contracts")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .execute().data or []
    
    ap_transactions = supabase.table("ap_transactions")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .execute().data or []
    
    supplies = supabase.table("supplies")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .execute().data or []
    
    ctx.update_progress(30, "fetching_evaluations", "Loading AI evaluations...")
    ctx.heartbeat()
    
    # Get latest evaluations
    evaluations = {}
    for p in projects:
        pid = p.get("id")
        if pid:
            ev = supabase.table("project_ai_evaluations")\
                .select("*")\
                .eq("project_id", pid)\
                .eq("tax_year", tax_year)\
                .order("evaluation_version", desc=True)\
                .limit(1)\
                .execute().data
            if ev:
                evaluations[pid] = ev[0]
    
    gaps = supabase.table("project_gaps")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .execute().data or []
    
    qre_summary = (supabase.table("qre_summaries")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute().data or [None])[0]
    
    ctx.update_progress(50, "adapting_data", "Preparing data model...")
    ctx.heartbeat()
    
    # Adapt to RDAnalysisSession
    session = adapt_workspace_to_session(
        client_company=client,
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
    
    ctx.update_progress(70, "generating_workbook", "Generating Excel workbook...")
    ctx.heartbeat()
    
    # Generate workbook
    workbook_bytes = generate_rd_workbook(session)
    
    ctx.update_progress(85, "uploading", "Uploading to storage...")
    
    # Upload to storage
    company_name = (client.get("name") or "client").replace(" ", "_")[:30]
    filename = f"{company_name}_RD_Study_{tax_year}_{datetime.utcnow().strftime('%Y%m%d')}.xlsx"
    storage_path = f"org/{ctx.organization_id}/client/{client_id}/reports/{filename}"
    
    supabase.storage.from_("study-artifacts")\
        .upload(storage_path, workbook_bytes, {"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
    
    # Create signed URL
    signed_url = supabase.storage.from_("study-artifacts")\
        .create_signed_url(storage_path, 3600)
    
    download_url = signed_url.get("signedURL") or signed_url.get("signedUrl") if isinstance(signed_url, dict) else None
    
    # Create artifact record if study_id provided
    if study_id:
        import hashlib
        sha256 = hashlib.sha256(workbook_bytes).hexdigest()
        
        supabase.table("study_artifacts_v2").upsert({
            "study_id": study_id,
            "artifact_type": "excel_study_workbook",
            "generation_status": "completed",
            "storage_bucket": "study-artifacts",
            "storage_path": storage_path,
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "sha256": sha256,
            "metadata": {
                "sheet_count": 15,
                "project_count": len(projects),
                "employee_count": len(employees),
                "total_qre": float(session.total_qre)
            },
            "created_by_user_id": ctx.user_id,
            "completed_at": datetime.utcnow().isoformat()
        }, on_conflict="study_id,artifact_type").execute()
    
    ctx.update_progress(100, "completed", "Excel report generated")
    
    return {
        "filename": filename,
        "storage_path": storage_path,
        "download_url": download_url,
        "file_size": len(workbook_bytes),
        "summary": {
            "projects": len(projects),
            "employees": len(employees),
            "total_qre": float(session.total_qre)
        }
    }


# ============================================================================
# Generate Study Artifacts Handler
# ============================================================================

async def handle_generate_study_artifacts(ctx: JobContext) -> Dict[str, Any]:
    """
    Generate all artifacts for a finalized study.
    """
    from app.study_packaging_service import (
        generate_excel_study_workbook,
        generate_form_6765_export_xlsx,
        generate_section_41_narratives_docx,
        generate_cover_summary_pdf,
        generate_client_package_zip,
        _upsert_artifact_row
    )
    
    supabase = get_supabase()
    study_id = ctx.params.get("study_id")
    study_version = ctx.params.get("study_version")
    artifact_types = ctx.params.get("artifact_types", [])
    force = ctx.params.get("force_regenerate", False)
    
    if not study_id:
        raise ValueError("study_id is required")
    
    # Get study info
    study = supabase.table("studies_v2")\
        .select("*")\
        .eq("id", study_id)\
        .single()\
        .execute().data
    
    if not study:
        raise ValueError(f"Study {study_id} not found")
    
    client_id = study.get("client_company_id")
    tax_year = study.get("tax_year")
    
    # Get client info
    client = supabase.table("client_companies")\
        .select("*")\
        .eq("id", client_id)\
        .single()\
        .execute().data
    
    client_name = client.get("name", "Client")
    
    # Get approved credit estimate
    credit_estimate = (supabase.table("credit_estimates")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .eq("status", "approved")\
        .order("estimate_version", desc=True)\
        .limit(1)\
        .execute().data or [{}])[0]
    
    # Get readiness info
    readiness = (supabase.table("study_finalization_checks")\
        .select("*")\
        .eq("client_company_id", client_id)\
        .eq("tax_year", tax_year)\
        .order("computed_at", desc=True)\
        .limit(1)\
        .execute().data or [{}])[0]
    
    generated_artifacts = {}
    total_artifacts = len(artifact_types) if artifact_types else 5
    
    # 1. Excel Workbook
    if not artifact_types or "excel_study_workbook" in artifact_types:
        ctx.update_progress(10, "generating_excel", "Generating Excel workbook...")
        ctx.heartbeat()
        
        try:
            excel_bytes, excel_meta = generate_excel_study_workbook(
                supabase, ctx.organization_id, client_id, tax_year
            )
            
            storage_path = f"org/{ctx.organization_id}/client/{client_id}/studies/{tax_year}/v{study_version}/study_workbook.xlsx"
            supabase.storage.from_("study-artifacts")\
                .upload(storage_path, excel_bytes, {"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "true"})
            
            import hashlib
            _upsert_artifact_row(
                supabase, study_id, "excel_study_workbook",
                status="completed",
                storage_bucket="study-artifacts",
                storage_path=storage_path,
                mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                sha256=hashlib.sha256(excel_bytes).hexdigest(),
                page_count=None,
                metadata=excel_meta,
                created_by_user_id=ctx.user_id,
                completed_at=datetime.utcnow().isoformat()
            )
            
            generated_artifacts["excel_study_workbook"] = {
                "status": "completed",
                "storage_path": storage_path
            }
            
        except Exception as e:
            ctx.warn(f"Failed to generate Excel workbook: {str(e)}")
            generated_artifacts["excel_study_workbook"] = {"status": "failed", "error": str(e)}
    
    # 2. Form 6765 Export
    if not artifact_types or "form_6765_export" in artifact_types:
        ctx.update_progress(30, "generating_form6765", "Generating Form 6765 export...")
        ctx.heartbeat()
        
        try:
            excel_artifact = generated_artifacts.get("excel_study_workbook", {})
            if excel_artifact.get("status") == "completed":
                excel_path = excel_artifact.get("storage_path")
                excel_bytes = supabase.storage.from_("study-artifacts").download(excel_path)
            else:
                # Generate fresh
                excel_bytes, _ = generate_excel_study_workbook(
                    supabase, ctx.organization_id, client_id, tax_year
                )
            
            form_bytes, form_meta = generate_form_6765_export_xlsx(
                excel_workbook_bytes=excel_bytes,
                approved_credit_estimate=credit_estimate,
                client_name=client_name,
                tax_year=tax_year
            )
            
            storage_path = f"org/{ctx.organization_id}/client/{client_id}/studies/{tax_year}/v{study_version}/form_6765_export.xlsx"
            supabase.storage.from_("study-artifacts")\
                .upload(storage_path, form_bytes, {"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "true"})
            
            import hashlib
            _upsert_artifact_row(
                supabase, study_id, "form_6765_export",
                status="completed",
                storage_bucket="study-artifacts",
                storage_path=storage_path,
                mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                sha256=hashlib.sha256(form_bytes).hexdigest(),
                page_count=None,
                metadata=form_meta,
                created_by_user_id=ctx.user_id,
                completed_at=datetime.utcnow().isoformat()
            )
            
            generated_artifacts["form_6765_export"] = {
                "status": "completed",
                "storage_path": storage_path
            }
            
        except Exception as e:
            ctx.warn(f"Failed to generate Form 6765 export: {str(e)}")
            generated_artifacts["form_6765_export"] = {"status": "failed", "error": str(e)}
    
    # 3. Section 41 Narratives (DOCX)
    if not artifact_types or "section_41_narratives_docx" in artifact_types:
        ctx.update_progress(50, "generating_narratives", "Generating Section 41 narratives...")
        ctx.heartbeat()
        
        try:
            narrative_bytes, narrative_meta = generate_section_41_narratives_docx(
                supabase,
                org_id=ctx.organization_id,
                client_id=client_id,
                tax_year=tax_year,
                client_name=client_name
            )
            
            storage_path = f"org/{ctx.organization_id}/client/{client_id}/studies/{tax_year}/v{study_version}/section_41_narratives.docx"
            supabase.storage.from_("study-artifacts")\
                .upload(storage_path, narrative_bytes, {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "upsert": "true"})
            
            import hashlib
            _upsert_artifact_row(
                supabase, study_id, "section_41_narratives_docx",
                status="completed",
                storage_bucket="study-artifacts",
                storage_path=storage_path,
                mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                sha256=hashlib.sha256(narrative_bytes).hexdigest(),
                page_count=None,
                metadata=narrative_meta,
                created_by_user_id=ctx.user_id,
                completed_at=datetime.utcnow().isoformat()
            )
            
            generated_artifacts["section_41_narratives_docx"] = {
                "status": "completed",
                "storage_path": storage_path
            }
            
        except Exception as e:
            ctx.warn(f"Failed to generate narratives: {str(e)}")
            generated_artifacts["section_41_narratives_docx"] = {"status": "failed", "error": str(e)}
    
    # 4. Cover Summary PDF
    if not artifact_types or "client_cover_summary_pdf" in artifact_types:
        ctx.update_progress(70, "generating_cover", "Generating cover summary PDF...")
        ctx.heartbeat()
        
        try:
            cover_bytes, cover_meta = generate_cover_summary_pdf(
                supabase,
                client_id=client_id,
                client_name=client_name,
                tax_year=tax_year,
                approved_credit_estimate=credit_estimate,
                readiness=readiness
            )
            
            storage_path = f"org/{ctx.organization_id}/client/{client_id}/studies/{tax_year}/v{study_version}/cover_summary.pdf"
            supabase.storage.from_("study-artifacts")\
                .upload(storage_path, cover_bytes, {"content-type": "application/pdf", "upsert": "true"})
            
            import hashlib
            _upsert_artifact_row(
                supabase, study_id, "client_cover_summary_pdf",
                status="completed",
                storage_bucket="study-artifacts",
                storage_path=storage_path,
                mime_type="application/pdf",
                sha256=hashlib.sha256(cover_bytes).hexdigest(),
                page_count=cover_meta.get("page_count"),
                metadata=cover_meta,
                created_by_user_id=ctx.user_id,
                completed_at=datetime.utcnow().isoformat()
            )
            
            generated_artifacts["client_cover_summary_pdf"] = {
                "status": "completed",
                "storage_path": storage_path
            }
            
        except Exception as e:
            ctx.warn(f"Failed to generate cover PDF: {str(e)}")
            generated_artifacts["client_cover_summary_pdf"] = {"status": "failed", "error": str(e)}
    
    # 5. Client Package ZIP
    if not artifact_types or "client_package_zip" in artifact_types:
        ctx.update_progress(85, "generating_zip", "Creating client package ZIP...")
        ctx.heartbeat()
        
        try:
            # Need to load artifacts for ZIP
            artifacts_for_zip = {}
            for art_type, art_info in generated_artifacts.items():
                if art_info.get("status") == "completed":
                    artifacts_for_zip[art_type] = {
                        "storage_bucket": "study-artifacts",
                        "storage_path": art_info.get("storage_path")
                    }
            
            zip_bytes, zip_meta = generate_client_package_zip(
                supabase,
                study_row=study,
                artifacts=artifacts_for_zip,
                include_section_174=client.get("purchased_sections", {}).get("section_174", False)
            )
            
            storage_path = f"org/{ctx.organization_id}/client/{client_id}/studies/{tax_year}/v{study_version}/client_package.zip"
            supabase.storage.from_("study-artifacts")\
                .upload(storage_path, zip_bytes, {"content-type": "application/zip", "upsert": "true"})
            
            import hashlib
            _upsert_artifact_row(
                supabase, study_id, "client_package_zip",
                status="completed",
                storage_bucket="study-artifacts",
                storage_path=storage_path,
                mime_type="application/zip",
                sha256=hashlib.sha256(zip_bytes).hexdigest(),
                page_count=None,
                metadata=zip_meta,
                created_by_user_id=ctx.user_id,
                completed_at=datetime.utcnow().isoformat()
            )
            
            generated_artifacts["client_package_zip"] = {
                "status": "completed",
                "storage_path": storage_path
            }
            
        except Exception as e:
            ctx.warn(f"Failed to generate ZIP package: {str(e)}")
            generated_artifacts["client_package_zip"] = {"status": "failed", "error": str(e)}
    
    ctx.update_progress(100, "completed", "All artifacts generated")
    
    # Update study status
    completed_count = sum(1 for a in generated_artifacts.values() if a.get("status") == "completed")
    failed_count = sum(1 for a in generated_artifacts.values() if a.get("status") == "failed")
    
    if failed_count == 0:
        supabase.table("studies_v2")\
            .update({"status": "final", "locked_at": datetime.utcnow().isoformat()})\
            .eq("id", study_id)\
            .execute()
    
    return {
        "study_id": study_id,
        "study_version": study_version,
        "artifacts": generated_artifacts,
        "completed_count": completed_count,
        "failed_count": failed_count
    }


# ============================================================================
# Generate Defense Pack Handler
# ============================================================================

async def handle_generate_defense_pack(ctx: JobContext) -> Dict[str, Any]:
    """
    Generate audit defense pack ZIP.
    """
    supabase = get_supabase()
    study_id = ctx.params.get("study_id")
    include_evidence = ctx.params.get("include_evidence", True)
    include_audit_trail = ctx.params.get("include_audit_trail", True)
    
    if not study_id:
        raise ValueError("study_id is required")
    
    import zipfile
    import io
    import csv
    
    ctx.update_progress(10, "loading_study", "Loading study data...")
    
    study = supabase.table("studies_v2")\
        .select("*")\
        .eq("id", study_id)\
        .single()\
        .execute().data
    
    if not study:
        raise ValueError(f"Study {study_id} not found")
    
    client_id = study.get("client_company_id")
    tax_year = study.get("tax_year")
    
    zip_buf = io.BytesIO()
    
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Include study artifacts
        ctx.update_progress(20, "collecting_artifacts", "Collecting study artifacts...")
        ctx.heartbeat()
        
        artifacts = supabase.table("study_artifacts_v2")\
            .select("*")\
            .eq("study_id", study_id)\
            .eq("generation_status", "completed")\
            .execute().data or []
        
        for artifact in artifacts:
            try:
                data = supabase.storage.from_(artifact["storage_bucket"])\
                    .download(artifact["storage_path"])
                filename = artifact["storage_path"].split("/")[-1]
                zf.writestr(f"artifacts/{filename}", data)
            except Exception as e:
                ctx.warn(f"Could not include artifact {artifact.get('artifact_type')}: {str(e)}")
        
        # Include evidence files
        if include_evidence:
            ctx.update_progress(40, "collecting_evidence", "Collecting evidence files...")
            ctx.heartbeat()
            
            evidence_files = supabase.table("evidence_files")\
                .select("*")\
                .eq("client_company_id", client_id)\
                .limit(500)\
                .execute().data or []
            
            for i, ef in enumerate(evidence_files[:100]):  # Limit for size
                try:
                    data = supabase.storage.from_(ef.get("storage_bucket", "evidence-files"))\
                        .download(ef.get("storage_path"))
                    filename = ef.get("original_filename", f"evidence_{i}")
                    zf.writestr(f"evidence/{filename}", data)
                except Exception:
                    pass
            
            # Evidence index CSV
            csv_buf = io.StringIO()
            writer = csv.writer(csv_buf)
            writer.writerow(["file_id", "filename", "entity_type", "entity_id", "created_at"])
            for ef in evidence_files:
                writer.writerow([
                    ef.get("id"),
                    ef.get("original_filename"),
                    ef.get("entity_type"),
                    ef.get("entity_id"),
                    ef.get("created_at")
                ])
            zf.writestr("evidence_index.csv", csv_buf.getvalue())
        
        # Include audit trail
        if include_audit_trail:
            ctx.update_progress(70, "collecting_audit_trail", "Collecting audit trail...")
            ctx.heartbeat()
            
            audit_logs = supabase.table("audit_log")\
                .select("*")\
                .eq("organization_id", ctx.organization_id)\
                .order("created_at", desc=True)\
                .limit(5000)\
                .execute().data or []
            
            csv_buf = io.StringIO()
            writer = csv.writer(csv_buf)
            writer.writerow(["timestamp", "action", "entity_type", "entity_id", "user_id", "metadata"])
            for log in audit_logs:
                writer.writerow([
                    log.get("created_at"),
                    log.get("action"),
                    log.get("entity_type"),
                    log.get("entity_id"),
                    log.get("user_id"),
                    str(log.get("metadata", {}))
                ])
            zf.writestr("audit_trail.csv", csv_buf.getvalue())
        
        # Include study metadata
        ctx.update_progress(90, "finalizing", "Finalizing package...")
        
        import json
        zf.writestr("study_metadata.json", json.dumps({
            "study_id": study_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "study_version": study.get("study_version"),
            "generated_at": datetime.utcnow().isoformat(),
            "artifacts_included": len(artifacts),
            "evidence_files_included": len(evidence_files) if include_evidence else 0
        }, indent=2))
    
    zip_buf.seek(0)
    zip_bytes = zip_buf.getvalue()
    
    # Upload to storage
    storage_path = f"org/{ctx.organization_id}/client/{client_id}/defense_packs/defense_pack_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    supabase.storage.from_("study-artifacts")\
        .upload(storage_path, zip_bytes, {"content-type": "application/zip"})
    
    # Create signed URL
    signed_url = supabase.storage.from_("study-artifacts")\
        .create_signed_url(storage_path, 86400)  # 24 hours
    
    download_url = signed_url.get("signedURL") or signed_url.get("signedUrl") if isinstance(signed_url, dict) else None
    
    ctx.update_progress(100, "completed", "Defense pack generated")
    
    return {
        "storage_path": storage_path,
        "download_url": download_url,
        "file_size": len(zip_bytes),
        "artifacts_included": len(artifacts),
        "evidence_included": include_evidence
    }


# ============================================================================
# Evidence Reprocessing Handler
# ============================================================================

async def handle_evidence_reprocessing(ctx: JobContext) -> Dict[str, Any]:
    """
    Reprocess evidence and run targeted rules.
    """
    from app.review_rules_engine import run_review_rules
    
    supabase = get_supabase()
    evidence_file_id = ctx.params.get("evidence_file_id")
    evidence_request_id = ctx.params.get("evidence_request_id")
    reprocess_scope = ctx.params.get("reprocess_scope", "full")
    rule_ids = ctx.params.get("rule_ids")
    trigger_ai_eval = ctx.params.get("trigger_ai_eval", False)
    
    client_id = ctx.client_company_id
    tax_year = ctx.tax_year
    
    ctx.update_progress(10, "loading", "Loading evidence data...")
    
    # Get evidence files to process
    if evidence_file_id:
        files = supabase.table("evidence_files")\
            .select("*")\
            .eq("id", evidence_file_id)\
            .execute().data or []
    elif evidence_request_id:
        files = supabase.table("evidence_files")\
            .select("*")\
            .eq("evidence_request_id", evidence_request_id)\
            .execute().data or []
    else:
        # All evidence for client
        files = supabase.table("evidence_files")\
            .select("*")\
            .eq("client_company_id", client_id)\
            .limit(100)\
            .execute().data or []
    
    if not files:
        return {"message": "No evidence files to process", "processed": 0}
    
    ctx.log(f"Processing {len(files)} evidence files")
    
    processed_files = []
    affected_entities = set()
    
    for i, ef in enumerate(files):
        if ctx.check_cancelled():
            return {"cancelled": True, "processed": i}
        
        ctx.update_progress(
            10 + (i / len(files)) * 60,
            "processing",
            f"Processing file {i + 1}/{len(files)}",
            counters={"done": i, "total": len(files)}
        )
        ctx.heartbeat()
        
        # Track affected entities
        entity_type = ef.get("entity_type")
        entity_id = ef.get("entity_id")
        if entity_type and entity_id:
            affected_entities.add((entity_type, entity_id))
        
        # Update file status
        supabase.table("evidence_files")\
            .update({"reprocessed_at": datetime.utcnow().isoformat()})\
            .eq("id", ef["id"])\
            .execute()
        
        processed_files.append(ef["id"])
    
    # Run review rules
    ctx.update_progress(75, "running_rules", "Running review rules...")
    ctx.heartbeat()
    
    try:
        rule_results = run_review_rules(
            supabase,
            org_id=ctx.organization_id,
            client_id=client_id,
            tax_year=tax_year,
            scope=reprocess_scope,
            rule_ids=rule_ids
        )
    except Exception as e:
        ctx.warn(f"Review rules failed: {str(e)}")
        rule_results = {"error": str(e)}
    
    # Trigger AI eval if requested
    ai_eval_job_id = None
    if trigger_ai_eval and affected_entities:
        ctx.update_progress(90, "queueing_ai_eval", "Queueing AI evaluation...")
        
        # Get project IDs from affected entities
        project_ids = [
            entity_id for entity_type, entity_id in affected_entities
            if entity_type == "project"
        ]
        
        if project_ids:
            child_job = ctx.create_child_job(
                job_type=JobType.AI_EVALUATE_PROJECTS,
                params={
                    "project_ids": project_ids,
                    "tax_year": tax_year,
                    "force": True
                }
            )
            ai_eval_job_id = child_job["id"]
    
    ctx.update_progress(100, "completed", "Evidence reprocessing complete")
    
    return {
        "processed_files": len(processed_files),
        "affected_entities": len(affected_entities),
        "rule_results": rule_results,
        "ai_eval_job_id": ai_eval_job_id
    }


# ============================================================================
# Register All Handlers
# ============================================================================

def register_all_handlers():
    """Register all job handlers with the global runner."""
    register_handler(JobType.RD_PARSE_SESSION, handle_rd_parse_session)
    register_handler(JobType.AI_EVALUATE_PROJECTS, handle_ai_evaluate_projects)
    register_handler(JobType.AI_EVALUATE_SINGLE_PROJECT, handle_ai_evaluate_single_project)
    register_handler(JobType.GENERATE_EXCEL_REPORT, handle_generate_excel_report)
    register_handler(JobType.GENERATE_STUDY_ARTIFACTS, handle_generate_study_artifacts)
    register_handler(JobType.GENERATE_DEFENSE_PACK, handle_generate_defense_pack)
    register_handler(JobType.EVIDENCE_REPROCESSING, handle_evidence_reprocessing)
    
    logger.info("All job handlers registered")


# Auto-register on import
register_all_handlers()
