"""
Demo Mode Routes

Provides demo data seeding and guided walkthrough functionality.
"""

import logging
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.supabase_client import get_supabase
from app.auth_permissions import (
    AuthContext, get_auth_context,
    Capability
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/demo", tags=["demo"])


# =============================================================================
# MODELS
# =============================================================================

class DemoSession(BaseModel):
    id: str
    user_id: str
    organization_id: Optional[str]
    client_company_id: Optional[str]
    demo_type: str
    current_step: int
    completed_steps: List[str]
    started_at: str
    completed_at: Optional[str]


class DemoTourStep(BaseModel):
    id: str
    title: str
    description: str
    target_route: str
    target_element: Optional[str]  # CSS selector for highlight
    action_type: str  # 'navigate', 'click', 'observe'
    hints: List[str]


DEMO_TOUR_STEPS: List[Dict] = [
    {
        "id": "welcome",
        "title": "Welcome to TaxScape Pro",
        "description": "This guided tour will walk you through the complete R&D tax credit workflow.",
        "target_route": "/workspace",
        "target_element": None,
        "action_type": "observe",
        "hints": ["The dashboard shows your pipeline progress and readiness score"]
    },
    {
        "id": "view_projects",
        "title": "Review Your Projects",
        "description": "View the R&D projects imported for this client. Each project will be evaluated for qualification.",
        "target_route": "/workspace/projects",
        "target_element": "[data-tour='projects-table']",
        "action_type": "navigate",
        "hints": ["Projects are the foundation of your R&D study", "Each project goes through the four-part test"]
    },
    {
        "id": "project_detail",
        "title": "Project Qualification",
        "description": "Click on a project to see its qualification status and AI evaluation results.",
        "target_route": "/workspace/projects",
        "target_element": "[data-tour='project-row']",
        "action_type": "click",
        "hints": ["AI evaluates each project against the four-part test", "You can review and override AI decisions"]
    },
    {
        "id": "view_gaps",
        "title": "Resolve Information Gaps",
        "description": "AI identifies missing information that needs to be addressed. Let's resolve a gap.",
        "target_route": "/workspace/gaps",
        "target_element": "[data-tour='gap-card']",
        "action_type": "navigate",
        "hints": ["Gaps block study generation until resolved", "You can upload evidence or provide explanations"]
    },
    {
        "id": "upload_evidence",
        "title": "Upload Supporting Evidence",
        "description": "Upload documents that support the R&D activities and expenditures.",
        "target_route": "/workspace/evidence",
        "target_element": "[data-tour='upload-button']",
        "action_type": "click",
        "hints": ["Evidence strengthens audit defensibility", "AI extracts key information from uploaded documents"]
    },
    {
        "id": "run_evaluation",
        "title": "Run AI Evaluation",
        "description": "Trigger the AI four-part test evaluation on all projects.",
        "target_route": "/workspace/rd-analysis",
        "target_element": "[data-tour='evaluate-button']",
        "action_type": "click",
        "hints": ["AI provides qualification recommendations", "Review confidence scores for each project"]
    },
    {
        "id": "generate_study",
        "title": "Generate Study Package",
        "description": "When ready, generate the complete R&D tax credit study package.",
        "target_route": "/workspace/studies",
        "target_element": "[data-tour='generate-button']",
        "action_type": "navigate",
        "hints": ["The study includes Form 6765 calculations", "Download Excel reports and audit packages"]
    },
    {
        "id": "complete",
        "title": "Tour Complete!",
        "description": "You've completed the guided tour. Explore the demo data and try different workflows.",
        "target_route": "/workspace",
        "target_element": None,
        "action_type": "observe",
        "hints": ["Check the Action Center for next steps", "Try generating a study with the demo data"]
    }
]


# =============================================================================
# DEMO DATA TEMPLATES
# =============================================================================

DEMO_PROJECTS = [
    {
        "name": "Cloud Infrastructure Optimization Platform",
        "description": "Development of an AI-powered platform to automatically optimize cloud resource allocation and reduce costs through predictive scaling algorithms.",
        "uncertainty_type": "Developing novel machine learning models for real-time resource prediction across heterogeneous cloud environments",
        "experimentation_description": "Iterative development of prediction algorithms using time-series analysis, reinforcement learning, and ensemble methods. Multiple prototypes tested across AWS, Azure, and GCP.",
        "technological_basis": "Computer science principles including machine learning, distributed systems, and cloud computing architectures",
        "permitted_purpose": "Create a new software product that autonomously manages cloud infrastructure with improved efficiency",
        "status": "active"
    },
    {
        "name": "Natural Language Processing Pipeline",
        "description": "Building a custom NLP system for automated document classification and information extraction from unstructured legal documents.",
        "uncertainty_type": "Creating accurate entity extraction and classification models for domain-specific legal terminology",
        "experimentation_description": "Fine-tuning transformer models on proprietary dataset, experimenting with attention mechanisms and custom tokenization strategies.",
        "technological_basis": "Deep learning, natural language processing, and information retrieval techniques",
        "permitted_purpose": "Improved product functionality for legal document automation",
        "status": "active"
    },
    {
        "name": "Real-time Data Pipeline Architecture",
        "description": "Designing a high-throughput data processing system capable of handling millions of events per second with sub-second latency.",
        "uncertainty_type": "Achieving consistent sub-100ms latency while maintaining exactly-once delivery semantics at scale",
        "experimentation_description": "Evaluated Apache Kafka, Pulsar, and custom solutions. Developed novel partitioning strategies and backpressure handling mechanisms.",
        "technological_basis": "Distributed systems engineering, stream processing, and fault-tolerant computing",
        "permitted_purpose": "New process development for real-time analytics capabilities",
        "status": "active"
    },
    {
        "name": "Mobile Authentication Framework",
        "description": "Research into biometric authentication methods combining facial recognition and behavioral analysis for mobile applications.",
        "uncertainty_type": "Balancing security strength with user experience and device compatibility constraints",
        "experimentation_description": "",  # Intentionally missing for demo
        "technological_basis": "Cryptography, computer vision, and mobile security principles",
        "permitted_purpose": "Improved security and user experience for mobile products",
        "status": "active"
    },
    {
        "name": "Automated Testing Infrastructure",
        "description": "Development of an intelligent test generation and execution system using machine learning to identify high-value test cases.",
        "uncertainty_type": "",  # Intentionally missing for demo
        "experimentation_description": "Applied genetic algorithms and coverage analysis to optimize test selection. Compared against random and greedy baseline approaches.",
        "technological_basis": "Software engineering, search-based optimization, and code analysis",
        "permitted_purpose": "Improved software development process efficiency",
        "status": "active"
    }
]

DEMO_EMPLOYEES = [
    {"name": "Alice Chen", "job_title": "Senior Software Engineer", "department": "Engineering", "hourly_rate": 95.00, "rd_percentage": 80},
    {"name": "Bob Martinez", "job_title": "Machine Learning Engineer", "department": "AI/ML", "hourly_rate": 105.00, "rd_percentage": 90},
    {"name": "Carol Williams", "job_title": "Data Scientist", "department": "AI/ML", "hourly_rate": 90.00, "rd_percentage": 85},
    {"name": "David Kim", "job_title": "DevOps Engineer", "department": "Infrastructure", "hourly_rate": 85.00, "rd_percentage": 40},
    {"name": "Emily Johnson", "job_title": "Product Manager", "department": "Product", "hourly_rate": 80.00, "rd_percentage": 30},
    {"name": "Frank Brown", "job_title": "QA Engineer", "department": "Engineering", "hourly_rate": 70.00, "rd_percentage": 50},
    {"name": "Grace Lee", "job_title": "Software Engineer", "department": "Engineering", "hourly_rate": 75.00},  # Missing rd_percentage
    {"name": "Henry Wilson", "job_title": "Research Scientist", "department": "R&D", "hourly_rate": 110.00, "rd_percentage": 95},
]

DEMO_VENDORS = [
    {"name": "CloudTech Solutions", "vendor_type": "contractor", "country_code": "US"},
    {"name": "DataPro Analytics", "vendor_type": "contractor", "country_code": "US"},
    {"name": "Offshore Dev Partners", "vendor_type": "contractor", "country_code": "IN"},  # Foreign vendor flag
    {"name": "Lab Equipment Inc", "vendor_type": "supplier", "country_code": "US"},
]


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.post("/seed")
async def seed_demo_data(
    client_name: str = Query(default="Demo Tech Company"),
    tax_year: int = Query(default=2024),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Seed demo data for the current organization.
    Creates a demo client with projects, employees, vendors, and sample data.
    Any authenticated user can create demo data.
    """
    # No capability check - any authenticated user can create demo data
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Get org_id from auth or try to find one for the user
        org_id = auth.org_id
        if not org_id:
            # Try to find org from organization_members
            try:
                member = supabase.table("organization_members")\
                    .select("organization_id")\
                    .eq("user_id", auth.user_id)\
                    .eq("status", "active")\
                    .limit(1)\
                    .execute()
                if member.data:
                    org_id = member.data[0].get("organization_id")
            except Exception:
                pass
        
        # If still no org, create one for the user
        if not org_id:
            org_result = supabase.table("organizations").insert({
                "name": f"Demo Organization",
                "owner_id": auth.user_id
            }).execute()
            if org_result.data:
                org_id = org_result.data[0]["id"]
                # Add user as member
                supabase.table("organization_members").insert({
                    "organization_id": org_id,
                    "user_id": auth.user_id,
                    "role": "admin",
                    "status": "active"
                }).execute()
        
        # Create demo client (only use columns that exist in the schema)
        slug = client_name.lower().replace(" ", "-")
        slug = "".join(c for c in slug if c.isalnum() or c == "-")
        
        client = supabase.table("client_companies").insert({
            "organization_id": org_id,
            "name": client_name,
            "slug": slug,
            "industry": "Technology",
            "tax_year": str(tax_year),
            "created_by": auth.user_id,
            "status": "active"
        }).execute()
        
        client_id = client.data[0]["id"]
        
        # Create projects (projects don't have client_company_id column)
        project_ids = []
        for proj in DEMO_PROJECTS:
            result = supabase.table("projects").insert({
                "organization_id": org_id,
                "user_id": auth.user_id,
                "name": proj.get("name", "Demo Project"),
                "description": proj.get("description", ""),
                "technical_uncertainty": proj.get("technical_uncertainty", ""),
                "process_of_experimentation": proj.get("process_of_experimentation", "")
            }).execute()
            project_ids.append(result.data[0]["id"])
        
        # Create employees (use columns that exist in schema)
        employee_ids = []
        for emp in DEMO_EMPLOYEES:
            try:
                result = supabase.table("employees").insert({
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "user_id": auth.user_id,
                    "name": emp.get("name", "Demo Employee"),
                    "title": emp.get("title", emp.get("job_title", "Engineer")),
                    "department": emp.get("department", "Engineering"),
                    "rd_percentage": emp.get("rd_percentage", 80),
                    "total_wages": emp.get("total_wages", emp.get("annual_salary", 100000))
                }).execute()
                employee_ids.append(result.data[0]["id"])
            except Exception as e:
                logger.warning(f"Could not create employee: {e}")
        
        # Create contractors (formerly vendors)
        vendor_ids = []
        for vendor in DEMO_VENDORS:
            try:
                result = supabase.table("contractors").insert({
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "user_id": auth.user_id,
                    "name": vendor.get("name", "Demo Contractor"),
                    "location": vendor.get("country_code", "US"),
                    "cost": vendor.get("hourly_rate", 150),
                    "is_qualified": vendor.get("is_us_based", True)
                }).execute()
                vendor_ids.append(result.data[0]["id"])
            except Exception as e:
                logger.warning(f"Could not create contractor: {e}")
        
        # Create sample timesheets
        timesheet_count = 0
        for month_offset in range(3):  # Just 3 months of data
            work_date = datetime.now() - timedelta(days=30 * month_offset)
            for emp_id in employee_ids[:3]:  # First 3 employees
                for proj_id in project_ids[:2]:  # First 2 projects
                    try:
                        supabase.table("timesheets").insert({
                            "organization_id": org_id,
                            "client_company_id": client_id,
                            "user_id": auth.user_id,
                            "employee_id": emp_id,
                            "project_id": proj_id,
                            "work_date": work_date.strftime("%Y-%m-%d"),
                            "hours": random.randint(4, 8)
                        }).execute()
                        timesheet_count += 1
                    except Exception as e:
                        logger.warning(f"Could not create timesheet: {e}")
        
        # Create sample expenses (formerly ap_transactions)
        ap_count = 0
        categories = ["supplies", "cloud", "contract"]
        for month_offset in range(3):
            txn_date = datetime.now() - timedelta(days=30 * month_offset)
            try:
                supabase.table("expenses").insert({
                    "organization_id": org_id,
                    "user_id": auth.user_id,
                    "category": random.choice(categories),
                    "amount": random.randint(1000, 10000),
                    "expense_date": txn_date.strftime("%Y-%m-%d"),
                    "description": "R&D related expense",
                    "vendor_name": "Demo Vendor"
                }).execute()
                ap_count += 1
            except Exception as e:
                logger.warning(f"Could not create expense: {e}")
        
        # Skip demo_sessions table if it doesn't exist
        try:
            supabase.table("demo_sessions").upsert({
                "user_id": auth.user_id,
                "organization_id": org_id,
                "client_company_id": client_id,
                "demo_type": "guided",
                "current_step": 0,
                "completed_steps": []
            }, on_conflict="user_id,organization_id").execute()
        except Exception as e:
            logger.warning(f"Could not create demo session: {e}")
        
        return {
            "success": True,
            "client_company_id": client_id,
            "client_name": client_name,
            "seeded_data": {
                "projects": len(project_ids),
                "employees": len(employee_ids),
                "vendors": len(vendor_ids),
                "timesheets": timesheet_count,
                "ap_transactions": ap_count
            }
        }
        
    except Exception as e:
        logger.error(f"Error seeding demo data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to seed demo data: {str(e)}")


@router.get("/tour/steps")
async def get_tour_steps(
    auth: AuthContext = Depends(get_auth_context)
) -> List[DemoTourStep]:
    """Get all demo tour steps."""
    return [DemoTourStep(**step) for step in DEMO_TOUR_STEPS]


@router.get("/session")
async def get_demo_session(
    auth: AuthContext = Depends(get_auth_context)
) -> Optional[DemoSession]:
    """Get current user's demo session."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        query = supabase.table("demo_sessions")\
            .select("*")\
            .eq("user_id", auth.user_id)
        
        # Handle null organization_id
        if auth.org_id:
            query = query.eq("organization_id", auth.org_id)
        else:
            query = query.is_("organization_id", "null")
        
        result = query.order("started_at", desc=True).limit(1).execute()
        
        if not result.data:
            return None
        
        return DemoSession(**result.data[0])
    except Exception as e:
        logger.warning(f"Failed to get demo session: {e}")
        return None


@router.post("/session/start")
async def start_demo_session(
    client_company_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Start or restart a demo session."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Delete existing session first (handles null org_id gracefully)
        delete_query = supabase.table("demo_sessions")\
            .delete()\
            .eq("user_id", auth.user_id)
        if auth.org_id:
            delete_query = delete_query.eq("organization_id", auth.org_id)
        else:
            delete_query = delete_query.is_("organization_id", "null")
        delete_query.execute()
        
        # Insert new session
        result = supabase.table("demo_sessions").insert({
            "user_id": auth.user_id,
            "organization_id": auth.org_id,
            "client_company_id": client_company_id,
            "demo_type": "guided",
            "current_step": 0,
            "completed_steps": [],
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None
        }).execute()
        
        return {"success": True, "session_id": result.data[0]["id"]}
    except Exception as e:
        logger.error(f"Failed to start demo session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start demo session: {str(e)}")


@router.post("/session/advance")
async def advance_demo_step(
    step_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Mark a step as complete and advance to next."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Get current session with null-safe org_id handling
        query = supabase.table("demo_sessions")\
            .select("*")\
            .eq("user_id", auth.user_id)
        
        if auth.org_id:
            query = query.eq("organization_id", auth.org_id)
        else:
            query = query.is_("organization_id", "null")
        
        result = query.order("started_at", desc=True).limit(1).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="No active demo session")
        
        session = result.data[0]
        completed = session.get("completed_steps", [])
        if step_id not in completed:
            completed.append(step_id)
        
        # Find next step
        current_idx = session.get("current_step", 0)
        next_idx = min(current_idx + 1, len(DEMO_TOUR_STEPS) - 1)
        
        is_complete = next_idx >= len(DEMO_TOUR_STEPS) - 1
        
        supabase.table("demo_sessions")\
            .update({
                "current_step": next_idx,
                "completed_steps": completed,
                "completed_at": datetime.utcnow().isoformat() if is_complete else None
            })\
            .eq("id", session["id"])\
            .execute()
        
        return {
            "success": True,
            "current_step": next_idx,
            "completed_steps": completed,
            "is_complete": is_complete,
            "next_step": DEMO_TOUR_STEPS[next_idx] if next_idx < len(DEMO_TOUR_STEPS) else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to advance demo step: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to advance demo step: {str(e)}")


@router.delete("/session")
async def end_demo_session(
    auth: AuthContext = Depends(get_auth_context)
):
    """End the current demo session."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        query = supabase.table("demo_sessions")\
            .delete()\
            .eq("user_id", auth.user_id)
        
        if auth.org_id:
            query = query.eq("organization_id", auth.org_id)
        else:
            query = query.is_("organization_id", "null")
        
        query.execute()
        return {"success": True}
    except Exception as e:
        logger.warning(f"Failed to end demo session: {e}")
        return {"success": True}  # Return success anyway to not block UI


@router.delete("/data")
async def delete_demo_data(
    client_company_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """Delete all demo data for a client. Only works on demo clients."""
    auth.require_capability(Capability.MANAGE_CLIENTS)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Verify this is a demo client
    client = supabase.table("client_companies")\
        .select("is_demo")\
        .eq("id", client_company_id)\
        .single()\
        .execute()
    
    if not client.data or not client.data.get("is_demo"):
        raise HTTPException(status_code=400, detail="Can only delete demo clients")
    
    # Delete all related data (cascade should handle most)
    supabase.table("client_companies")\
        .delete()\
        .eq("id", client_company_id)\
        .execute()
    
    return {"success": True, "deleted_client_id": client_company_id}

