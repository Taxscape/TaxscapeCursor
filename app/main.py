from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, APIRouter, Header, status, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import io
import os
import uuid
import logging
from datetime import datetime

from app import chatbot_agent, excel_engine
from app.supabase_client import get_supabase, verify_supabase_token, get_user_profile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TaxScape Pro API",
    description="R&D Tax Credit Calculation and AI Auditor API",
    version="1.0.0"
)

# CORS configuration - allow all origins for flexibility
# The frontend URL can be on Vercel, localhost, or any other domain
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
    "https://*.vercel.app",
]

# Get additional allowed origins from environment
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins:
    allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Railway deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    port = os.environ.get("PORT", "8000")
    logger.info(f"🚀 TaxScape Pro API starting on port {port}")
    logger.info(f"📊 Supabase connected: {get_supabase() is not None}")
    logger.info(f"🤖 AI Service: {'Configured' if os.environ.get('GOOGLE_CLOUD_API_KEY') else 'NOT CONFIGURED - set GOOGLE_CLOUD_API_KEY'}")

# --- Routers ---
api_router = APIRouter(prefix="/api", tags=["api"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


# --- Auth Dependency ---
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Supabase JWT token."""
    logger.info(f"[Auth] get_current_user called, has authorization: {authorization is not None}")
    
    if not authorization:
        logger.warning("[Auth] Authorization header missing")
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    logger.info(f"[Auth] Authorization parts count: {len(parts)}, first part: {parts[0] if parts else 'N/A'}")
    
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning(f"[Auth] Invalid authorization header format")
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = parts[1]
    logger.info(f"[Auth] Token extracted, length: {len(token)}, starts with: {token[:20]}...")
    
    user_data = verify_supabase_token(token)
    
    if not user_data:
        logger.warning("[Auth] Token verification returned None")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    logger.info(f"[Auth] User authenticated: {user_data.get('email')}")
    return user_data


async def get_admin_user(user: dict = Depends(get_current_user)):
    """Verify user is an admin."""
    profile = get_user_profile(user["id"])
    if not profile or not profile.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# --- Helper Functions ---
def load_dataframe(upload_file: UploadFile, contents: bytes) -> pd.DataFrame:
    """Read CSV or Excel payloads into a DataFrame."""
    try:
        filename = (upload_file.filename or "").lower()
        file_size = len(contents)
        
        # Log file details for debugging
        logger.info(f"Processing file: {filename}, size: {file_size} bytes, content_type: {upload_file.content_type}")
        
        # Validate file is not empty
        if file_size == 0:
            raise ValueError("File is empty. Please upload a file with data.")
        
        # Validate file size (max 10MB)
        if file_size > 10 * 1024 * 1024:
            raise ValueError(f"File too large ({file_size / 1024 / 1024:.1f} MB). Maximum allowed: 10MB")
        
        buffer = io.BytesIO(contents)
        
        if filename.endswith(".xlsx"):
            logger.info(f"Reading {filename} as XLSX using openpyxl engine")
            try:
                df = pd.read_excel(buffer, engine='openpyxl')
                if df.empty:
                    raise ValueError("Excel file has no data rows. Please ensure the file contains data.")
                logger.info(f"Successfully read XLSX file. Shape: {df.shape}, Columns: {list(df.columns)}")
                return df
            except ValueError:
                raise
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error reading XLSX file: {type(e).__name__}: {error_msg}")
                if "openpyxl" in error_msg.lower():
                    raise ValueError(f"Cannot read Excel file. The file may be corrupted or in an unsupported format.")
                if "zipfile" in error_msg.lower():
                    raise ValueError(f"Invalid Excel file. The file may be corrupted or not a valid .xlsx file.")
                raise ValueError(f"Failed to read Excel file (.xlsx): {error_msg}")
        
        if filename.endswith(".xls"):
            logger.info(f"Reading {filename} as XLS (legacy format)")
            try:
                df = pd.read_excel(buffer, engine='xlrd')
                if df.empty:
                    raise ValueError("Excel file has no data rows. Please ensure the file contains data.")
                logger.info(f"Successfully read XLS file. Shape: {df.shape}, Columns: {list(df.columns)}")
                return df
            except ValueError:
                raise
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error reading XLS file: {type(e).__name__}: {error_msg}")
                if "xlrd" in error_msg.lower():
                    raise ValueError(f"Cannot read legacy Excel file (.xls). Try saving as .xlsx format.")
                raise ValueError(f"Failed to read Excel file (.xls): {error_msg}")
        
        # CSV files or unrecognized extensions - try CSV
        buffer.seek(0)
        logger.info(f"Reading {filename} as CSV")
        try:
            # Try to detect encoding
            try:
                df = pd.read_csv(buffer, encoding='utf-8')
            except UnicodeDecodeError:
                buffer.seek(0)
                df = pd.read_csv(buffer, encoding='latin-1')
            
            if df.empty:
                raise ValueError("CSV file has no data rows. Please ensure the file contains data.")
            logger.info(f"Successfully read CSV file. Shape: {df.shape}, Columns: {list(df.columns)}")
            return df
        except ValueError:
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error reading CSV file: {type(e).__name__}: {error_msg}")
            if "tokenizing" in error_msg.lower():
                raise ValueError(f"CSV parsing error. Please ensure the file uses proper CSV formatting (comma-separated values).")
            raise ValueError(f"Failed to read CSV file: {error_msg}")
            
    except ValueError:
        raise  # Re-raise validation errors
    except Exception as e:
        logger.error(f"Unexpected error in load_dataframe: {type(e).__name__}: {str(e)}")
        raise ValueError(f"Failed to process file: {str(e)}")


def _percent_to_decimal(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        val = float(value)
        return val / 100.0 if val > 1 else val
    except (TypeError, ValueError):
        return 0.0


def _get_user_context_data(user_id: str) -> Dict[str, Any]:
    """Fetch user's employees, contractors, and projects for AI context."""
    supabase = get_supabase()
    if not supabase:
        return {"employees": [], "contractors": [], "projects": [], "summary": {}}
    
    try:
        employees = supabase.table("employees").select("*").eq("user_id", user_id).execute()
        contractors = supabase.table("contractors").select("*").eq("user_id", user_id).execute()
        projects = supabase.table("projects").select("*").eq("user_id", user_id).execute()
        
        total_wages = sum(e.get("total_wages", 0) for e in employees.data)
        total_contractor_costs = sum(c.get("cost", 0) for c in contractors.data)
        
        return {
            "employees": employees.data,
            "contractors": contractors.data,
            "projects": projects.data,
            "summary": {
                "total_employees": len(employees.data),
                "total_wages": total_wages,
                "total_contractors": len(contractors.data),
                "total_contractor_costs": total_contractor_costs,
                "total_projects": len(projects.data),
            }
        }
    except Exception as e:
        print(f"Error fetching user context: {e}")
        return {"employees": [], "contractors": [], "projects": [], "summary": {}}


def _build_context_prompt(context: Dict[str, Any]) -> str:
    """Build a context string from user data to prepend to the AI conversation."""
    if not context or not context.get("summary"):
        return ""
    
    summary = context["summary"]
    if summary["total_employees"] == 0 and summary["total_contractors"] == 0 and summary["total_projects"] == 0:
        return ""
    
    lines = ["\n\n--- USER'S UPLOADED DATA CONTEXT ---"]
    
    if summary["total_employees"] > 0:
        lines.append(f"\nEmployees ({summary['total_employees']} total, ${summary['total_wages']:,.2f} total wages):")
        for emp in context["employees"][:10]:  # Limit to 10
            lines.append(f"  - {emp.get('name', 'Unknown')}: {emp.get('title', 'N/A')}, ${emp.get('total_wages', 0):,.2f} wages, {emp.get('qualified_percent', 80)}% qualified")
        if len(context["employees"]) > 10:
            lines.append(f"  ... and {len(context['employees']) - 10} more employees")
    
    if summary["total_contractors"] > 0:
        lines.append(f"\nContractors ({summary['total_contractors']} total, ${summary['total_contractor_costs']:,.2f} total costs):")
        for con in context["contractors"][:10]:
            qualified = "Qualified" if con.get("is_qualified", True) else "Not Qualified"
            lines.append(f"  - {con.get('name', 'Unknown')}: ${con.get('cost', 0):,.2f}, {con.get('location', 'US')}, {qualified}")
        if len(context["contractors"]) > 10:
            lines.append(f"  ... and {len(context['contractors']) - 10} more contractors")
    
    if summary["total_projects"] > 0:
        lines.append(f"\nProjects ({summary['total_projects']} total):")
        for proj in context["projects"][:5]:
            lines.append(f"  - {proj.get('name', 'Unknown')}: {proj.get('qualification_status', 'pending')}")
        if len(context["projects"]) > 5:
            lines.append(f"  ... and {len(context['projects']) - 5} more projects")
    
    lines.append("\n--- END OF USER DATA CONTEXT ---\n")
    lines.append("Use this data when discussing the user's R&D activities. Reference specific employees, contractors, or projects when relevant.\n")
    
    return "\n".join(lines)


def _structured_to_excel_payload(structured: Dict[str, Any]):
    """Convert structured chat output to Excel report format."""
    projects_section = structured.get("projects", [])
    projects_data = []
    for project in projects_section:
        if not isinstance(project, dict):
            continue
        projects_data.append({
            "name": project.get("name", "Project"),
            "technical_uncertainty": project.get("technical_uncertainty") or project.get("reason"),
            "process_of_experimentation": project.get("experimentation") or project.get("process_of_experimentation"),
        })

    wages_section = structured.get("wages") or {}
    wage_entries = (
        wages_section.get("breakdown")
        or wages_section.get("details")
        or wages_section.get("wages")
        or []
    )
    employees_data = []
    for entry in wage_entries:
        if not isinstance(entry, dict):
            continue
        pct = entry.get("qualified_percent") or entry.get("technical_pct")
        employees_data.append({
            "name": entry.get("name") or entry.get("role") or "Employee",
            "title": entry.get("role", "Engineer"),
            "state": entry.get("location", "US"),
            "total_wages": float(entry.get("box1_wages") or entry.get("wage") or entry.get("box1") or 0),
            "allocations": [{
                "project_name": projects_data[0]["name"] if projects_data else "R&D Project",
                "allocation_percent": _percent_to_decimal(pct),
            }],
        })

    contractors_section = structured.get("contractors") or []
    contractors_data = []
    default_project = projects_data[0]["name"] if projects_data else "R&D Project"
    
    if isinstance(contractors_section, list):
        for contractor in contractors_section:
            if not isinstance(contractor, dict):
                continue
            contractors_data.append({
                "name": contractor.get("vendor") or contractor.get("name") or "Contractor",
                "cost": float(contractor.get("amount") or contractor.get("cost") or 0),
                "is_qualified": contractor.get("qualification_status", "Qualified").lower() != "non_qualified",
                "project_name": contractor.get("project_name", default_project),
            })
    elif isinstance(contractors_section, dict):
        qualified_amount = contractors_section.get("qualified") or contractors_section.get("us_contract_research_included")
        if qualified_amount:
            contractors_data.append({
                "name": "Qualified Contractors",
                "cost": float(qualified_amount),
                "is_qualified": True,
                "project_name": default_project,
            })
        foreign_amount = contractors_section.get("foreign") or contractors_section.get("foreign_excluded")
        if foreign_amount:
            contractors_data.append({
                "name": "Foreign Contractors",
                "cost": float(foreign_amount),
                "is_qualified": False,
                "project_name": default_project,
            })

    return excel_engine.generate_excel_report(projects_data, employees_data, contractors_data)


# --- Pydantic Models ---
class ChatMessageModel(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessageModel]
    session_id: Optional[str] = None
    include_context: Optional[bool] = True

class StructuredStudy(BaseModel):
    payload: Dict[str, Any]
    session_id: Optional[str] = None
    title: Optional[str] = "R&D Tax Credit Study"

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    technical_uncertainty: Optional[str] = None
    process_of_experimentation: Optional[str] = None

class EmployeeCreate(BaseModel):
    name: str
    title: Optional[str] = None
    state: Optional[str] = None
    total_wages: float = 0
    qualified_percent: float = 0

class ContractorCreate(BaseModel):
    name: str
    cost: float = 0
    is_qualified: bool = True
    location: str = "US"
    project_id: Optional[str] = None
    notes: Optional[str] = None

class DemoRequest(BaseModel):
    name: str
    email: str
    company: Optional[str] = None
    message: Optional[str] = None


# --- Organization Models ---
class OrganizationCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    tax_year: Optional[str] = "2024"

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    tax_year: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None

class InviteMemberRequest(BaseModel):
    email: str
    role: str = "member"  # admin, project_lead, vendor_approver, supply_approver, hr_verifier, member

class UpdateMemberRequest(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None  # active, pending, inactive

class CreateTaskRequest(BaseModel):
    title: str
    category: str  # projects, vendors, supplies, wages
    assigned_to: Optional[str] = None
    item_id: Optional[str] = None
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[str] = None

class UpdateTaskRequest(BaseModel):
    status: Optional[str] = None  # pending, verified, denied
    comment: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None


# --- Organization Router ---
org_router = APIRouter(prefix="/organizations", tags=["organizations"])


def get_user_organization(user: dict) -> Optional[Dict]:
    """Get the user's organization."""
    supabase = get_supabase()
    if not supabase:
        return None
    
    try:
        profile = supabase.table("profiles").select("organization_id").eq("id", user["id"]).single().execute()
        if profile.data and profile.data.get("organization_id"):
            org = supabase.table("organizations").select("*").eq("id", profile.data["organization_id"]).single().execute()
            return org.data
    except Exception as e:
        logger.error(f"Error getting user organization: {e}")
    return None


def check_org_admin(user: dict, org_id: str) -> bool:
    """Check if user is an admin of the organization."""
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
        return member.data and member.data.get("role") == "admin" and member.data.get("status") == "active"
    except Exception as e:
        logger.error(f"Error checking org admin: {e}")
    return False


def log_audit(org_id: str, user_id: str, action: str, item_type: str = None, item_id: str = None, details: dict = None):
    """Log an action to the audit log."""
    supabase = get_supabase()
    if not supabase:
        return
    
    try:
        supabase.table("audit_logs").insert({
            "organization_id": org_id,
            "user_id": user_id,
            "action": action,
            "item_type": item_type,
            "item_id": item_id,
            "details": details or {},
        }).execute()
    except Exception as e:
        logger.error(f"Error logging audit: {e}")


@org_router.get("/current")
async def get_current_organization(user: dict = Depends(get_current_user)):
    """Get the current user's organization."""
    org = get_user_organization(user)
    if not org:
        return {"organization": None}
    
    supabase = get_supabase()
    
    # Get member info
    try:
        member = supabase.table("organization_members")\
            .select("role, status")\
            .eq("organization_id", org["id"])\
            .eq("user_id", user["id"])\
            .single()\
            .execute()
        
        org["user_role"] = member.data.get("role") if member.data else "member"
        org["user_status"] = member.data.get("status") if member.data else "active"
    except Exception as e:
        logger.error(f"Error getting member info: {e}")
        org["user_role"] = "member"
        org["user_status"] = "active"
    
    return {"organization": org}


@org_router.post("")
async def create_organization(org: OrganizationCreate, user: dict = Depends(get_current_user)):
    """Create a new organization (user becomes admin)."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Create organization
        org_result = supabase.table("organizations").insert({
            "name": org.name,
            "industry": org.industry,
            "tax_year": org.tax_year,
        }).execute()
        
        new_org = org_result.data[0]
        org_id = new_org["id"]
        
        # Update user's profile with organization
        supabase.table("profiles").update({
            "organization_id": org_id,
            "company_name": org.name,
        }).eq("id", user["id"]).execute()
        
        # Add user as admin member
        supabase.table("organization_members").insert({
            "organization_id": org_id,
            "user_id": user["id"],
            "role": "admin",
            "status": "active",
            "accepted_at": datetime.utcnow().isoformat(),
        }).execute()
        
        # Log the action
        log_audit(org_id, user["id"], "organization_created", "organization", org_id, {"name": org.name})
        
        return {"organization": new_org}
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@org_router.patch("/{org_id}")
async def update_organization(org_id: str, org: OrganizationUpdate, user: dict = Depends(get_current_user)):
    """Update organization details (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        update_data = {k: v for k, v in org.dict().items() if v is not None}
        if update_data:
            result = supabase.table("organizations").update(update_data).eq("id", org_id).execute()
            log_audit(org_id, user["id"], "organization_updated", "organization", org_id, update_data)
            return {"organization": result.data[0]}
        return {"organization": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@org_router.get("/{org_id}/members")
async def get_organization_members(org_id: str, user: dict = Depends(get_current_user)):
    """Get all members of the organization."""
    supabase = get_supabase()
    if not supabase:
        return {"members": []}
    
    # Verify user is a member
    current_org = get_user_organization(user)
    if not current_org or current_org["id"] != org_id:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    try:
        result = supabase.table("organization_members")\
            .select("*, profiles(id, email, full_name)")\
            .eq("organization_id", org_id)\
            .order("created_at", desc=True)\
            .execute()
        
        members = []
        for m in result.data:
            profile = m.get("profiles", {})
            members.append({
                "id": m["id"],
                "user_id": m["user_id"],
                "email": profile.get("email"),
                "name": profile.get("full_name"),
                "role": m["role"],
                "status": m["status"],
                "invited_at": m.get("invited_at"),
                "accepted_at": m.get("accepted_at"),
            })
        
        return {"members": members}
    except Exception as e:
        logger.error(f"Error fetching members: {e}")
        return {"members": []}


@org_router.post("/{org_id}/invite")
async def invite_member(org_id: str, invite: InviteMemberRequest, user: dict = Depends(get_current_user)):
    """Invite a new member to the organization (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Check if user exists
        existing_user = supabase.table("profiles").select("id").eq("email", invite.email).execute()
        
        if existing_user.data:
            # User exists - add them as member
            invited_user_id = existing_user.data[0]["id"]
            
            # Check if already a member
            existing_member = supabase.table("organization_members")\
                .select("id")\
                .eq("organization_id", org_id)\
                .eq("user_id", invited_user_id)\
                .execute()
            
            if existing_member.data:
                raise HTTPException(status_code=400, detail="User is already a member")
            
            # Add member
            result = supabase.table("organization_members").insert({
                "organization_id": org_id,
                "user_id": invited_user_id,
                "role": invite.role,
                "status": "pending",
                "invited_by": user["id"],
            }).execute()
            
            # Update invited user's profile with organization
            supabase.table("profiles").update({
                "organization_id": org_id,
            }).eq("id", invited_user_id).execute()
            
            log_audit(org_id, user["id"], "member_invited", "member", invited_user_id, {"email": invite.email, "role": invite.role})
            
            return {"success": True, "message": f"Invited {invite.email}", "member": result.data[0]}
        else:
            # User doesn't exist - would need to send email invite
            # For now, just return a message
            log_audit(org_id, user["id"], "member_invite_pending", "member", None, {"email": invite.email, "role": invite.role})
            return {"success": True, "message": f"Invitation sent to {invite.email}", "pending": True}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inviting member: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@org_router.patch("/{org_id}/members/{member_user_id}")
async def update_member(org_id: str, member_user_id: str, update: UpdateMemberRequest, user: dict = Depends(get_current_user)):
    """Update a member's role or status (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        update_data = {k: v for k, v in update.dict().items() if v is not None}
        if update_data:
            result = supabase.table("organization_members")\
                .update(update_data)\
                .eq("organization_id", org_id)\
                .eq("user_id", member_user_id)\
                .execute()
            
            log_audit(org_id, user["id"], "member_updated", "member", member_user_id, update_data)
            return {"success": True, "member": result.data[0] if result.data else None}
        return {"success": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@org_router.delete("/{org_id}/members/{member_user_id}")
async def remove_member(org_id: str, member_user_id: str, user: dict = Depends(get_current_user)):
    """Remove a member from the organization (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Cannot remove yourself
    if member_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        supabase.table("organization_members")\
            .delete()\
            .eq("organization_id", org_id)\
            .eq("user_id", member_user_id)\
            .execute()
        
        # Remove organization from user's profile
        supabase.table("profiles").update({
            "organization_id": None,
        }).eq("id", member_user_id).execute()
        
        log_audit(org_id, user["id"], "member_removed", "member", member_user_id, {})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Task Management ---
@org_router.get("/{org_id}/tasks")
async def get_tasks(org_id: str, status: Optional[str] = None, category: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get verification tasks for the organization."""
    current_org = get_user_organization(user)
    if not current_org or current_org["id"] != org_id:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    supabase = get_supabase()
    if not supabase:
        return {"tasks": []}
    
    try:
        query = supabase.table("verification_tasks")\
            .select("*, profiles!assigned_to(id, email, full_name)")\
            .eq("organization_id", org_id)
        
        if status:
            query = query.eq("status", status)
        if category:
            query = query.eq("category", category)
        
        result = query.order("created_at", desc=True).execute()
        
        tasks = []
        for t in result.data:
            assignee = t.get("profiles", {})
            tasks.append({
                **{k: v for k, v in t.items() if k != "profiles"},
                "assignee_name": assignee.get("full_name") if assignee else None,
                "assignee_email": assignee.get("email") if assignee else None,
            })
        
        return {"tasks": tasks}
    except Exception as e:
        logger.error(f"Error fetching tasks: {e}")
        return {"tasks": []}


@org_router.post("/{org_id}/tasks")
async def create_task(org_id: str, task: CreateTaskRequest, user: dict = Depends(get_current_user)):
    """Create a new verification task (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        task_data = {
            "organization_id": org_id,
            "title": task.title,
            "category": task.category,
            "description": task.description,
            "priority": task.priority,
            "status": "pending",
        }
        if task.assigned_to:
            task_data["assigned_to"] = task.assigned_to
        if task.item_id:
            task_data["item_id"] = task.item_id
        if task.due_date:
            task_data["due_date"] = task.due_date
        
        result = supabase.table("verification_tasks").insert(task_data).execute()
        
        log_audit(org_id, user["id"], "task_created", "task", result.data[0]["id"], {"title": task.title})
        return {"task": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@org_router.patch("/{org_id}/tasks/{task_id}")
async def update_task(org_id: str, task_id: str, update: UpdateTaskRequest, user: dict = Depends(get_current_user)):
    """Update a verification task."""
    current_org = get_user_organization(user)
    if not current_org or current_org["id"] != org_id:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Get the task first
        task = supabase.table("verification_tasks").select("*").eq("id", task_id).single().execute()
        if not task.data:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Check permission - admin can update anything, assigned user can update status
        is_admin = check_org_admin(user, org_id)
        is_assigned = task.data.get("assigned_to") == user["id"]
        
        if not is_admin and not is_assigned:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")
        
        update_data = {k: v for k, v in update.dict().items() if v is not None}
        
        # If verifying/denying, add verification metadata
        if update.status in ["verified", "denied"]:
            update_data["verified_at"] = datetime.utcnow().isoformat()
            update_data["verified_by"] = user["id"]
        
        result = supabase.table("verification_tasks")\
            .update(update_data)\
            .eq("id", task_id)\
            .execute()
        
        log_audit(org_id, user["id"], f"task_{update.status or 'updated'}", "task", task_id, update_data)
        return {"task": result.data[0] if result.data else None}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Audit Log ---
@org_router.get("/{org_id}/audit-log")
async def get_audit_log(org_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
    """Get audit log for the organization (admin only)."""
    if not check_org_admin(user, org_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase()
    if not supabase:
        return {"logs": []}
    
    try:
        result = supabase.table("audit_logs")\
            .select("*, profiles(id, email, full_name)")\
            .eq("organization_id", org_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        
        logs = []
        for log in result.data:
            user_info = log.get("profiles", {})
            logs.append({
                "id": log["id"],
                "action": log["action"],
                "item_type": log.get("item_type"),
                "item_id": log.get("item_id"),
                "details": log.get("details", {}),
                "user_name": user_info.get("full_name") if user_info else None,
                "user_email": user_info.get("email") if user_info else None,
                "created_at": log["created_at"],
            })
        
        return {"logs": logs}
    except Exception as e:
        logger.error(f"Error fetching audit log: {e}")
        return {"logs": []}


# --- Public Endpoints (no auth required) ---
@api_router.post("/chat_demo")
async def chat_demo(request: ChatRequest):
    """Public chat endpoint for demos."""
    messages_dicts = [{"role": m.role, "content": m.content} for m in request.messages]
    ai_text = chatbot_agent.get_chat_response(messages_dicts)
    structured = chatbot_agent.extract_json_from_response(ai_text)
    return {"response": ai_text, "structured": structured}


@api_router.post("/chat_excel")
async def chat_excel_endpoint(payload: StructuredStudy):
    """Generate Excel from structured chat output."""
    excel_file = _structured_to_excel_payload(payload.payload)
    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=TaxScape_Study_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


@api_router.post("/demo_request")
async def submit_demo_request(request: DemoRequest):
    """Submit a demo request from the landing page."""
    supabase = get_supabase()
    
    if not supabase:
        # If no database, just log and return success (don't block the form)
        logger.info(f"Demo request received: {request.name} ({request.email}) - {request.company}")
        return {"success": True, "message": "Demo request received. We'll be in touch soon!"}
    
    try:
        result = supabase.table("demo_requests").insert({
            "name": request.name,
            "email": request.email,
            "company": request.company,
            "message": request.message,
            "status": "pending"
        }).execute()
        
        logger.info(f"Demo request saved: {request.email}")
        return {"success": True, "message": "Thank you! We'll contact you shortly to schedule your demo."}
    except Exception as e:
        logger.error(f"Error saving demo request: {e}")
        # Still return success to user - we don't want to block them
        return {"success": True, "message": "Demo request received. We'll be in touch soon!"}


# --- Authenticated Endpoints ---
@api_router.post("/chat")
async def chat_endpoint(request: ChatRequest, user: dict = Depends(get_current_user)):
    """Authenticated chat endpoint with persistence and user context."""
    supabase = get_supabase()
    
    # Build messages with user context if requested
    messages_dicts = [{"role": m.role, "content": m.content} for m in request.messages]
    
    # Get user context if requested
    user_context_prompt = None
    if request.include_context:
        context = _get_user_context_data(user["id"])
        user_context_prompt = _build_context_prompt(context)
    
    ai_text = chatbot_agent.get_chat_response(messages_dicts, user_context_prompt)
    structured = chatbot_agent.extract_json_from_response(ai_text)
    
    # Save to database if Supabase is available
    session_id = request.session_id
    if supabase:
        try:
            # Create new session if needed
            if not session_id:
                session_result = supabase.table("chat_sessions").insert({
                    "user_id": user["id"],
                    "title": "Audit Session",
                    "structured_output": structured,
                }).execute()
                session_id = session_result.data[0]["id"]
            else:
                # Update existing session with structured output
                if structured:
                    supabase.table("chat_sessions").update({
                        "structured_output": structured,
                        "updated_at": datetime.utcnow().isoformat(),
                    }).eq("id", session_id).execute()
            
            # Save the latest user message
            if request.messages:
                last_user_msg = request.messages[-1]
                supabase.table("chat_messages").insert({
                    "session_id": session_id,
                    "role": last_user_msg.role,
                    "content": last_user_msg.content,
                }).execute()
            
            # Save assistant response
            supabase.table("chat_messages").insert({
                "session_id": session_id,
                "role": "assistant",
                "content": ai_text,
            }).execute()
        except Exception as e:
            print(f"Error saving chat: {e}")
    
    return {"response": ai_text, "structured": structured, "session_id": session_id}


def _parse_file_to_text(file: UploadFile, contents: bytes) -> str:
    """Parse uploaded file to text for AI context."""
    filename = (file.filename or "").lower()
    
    try:
        if filename.endswith('.pdf'):
            # Parse PDF
            try:
                from PyPDF2 import PdfReader
                buffer = io.BytesIO(contents)
                reader = PdfReader(buffer)
                text_parts = []
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
                return f"[PDF: {file.filename}]\n" + "\n".join(text_parts)
            except Exception as e:
                logger.error(f"Error parsing PDF: {e}")
                return f"[PDF: {file.filename}] - Could not extract text"
        
        elif filename.endswith(('.xlsx', '.xls', '.csv')):
            # Parse spreadsheet
            try:
                df = load_dataframe(file, contents)
                # Convert to readable format (limit rows for context)
                preview = df.head(50).to_string()
                columns = ", ".join(df.columns.tolist())
                return f"[Spreadsheet: {file.filename}]\nColumns: {columns}\nRows: {len(df)}\n\nData Preview:\n{preview}"
            except Exception as e:
                logger.error(f"Error parsing spreadsheet: {e}")
                return f"[Spreadsheet: {file.filename}] - Could not parse file"
        
        else:
            # Try to read as text
            try:
                text = contents.decode('utf-8')
                return f"[File: {file.filename}]\n{text[:10000]}"  # Limit text size
            except:
                return f"[File: {file.filename}] - Binary file, cannot display"
    except Exception as e:
        logger.error(f"Error parsing file {file.filename}: {e}")
        return f"[File: {file.filename}] - Error parsing file"


@api_router.post("/chat_with_files")
async def chat_with_files_endpoint(
    messages_json: str = Form(...),
    session_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(get_current_user)
):
    """Chat endpoint with file attachments for AI context."""
    import json
    
    try:
        messages_data = json.loads(messages_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid messages JSON")
    
    messages_dicts = [{"role": m["role"], "content": m["content"]} for m in messages_data]
    
    # Parse all uploaded files to text
    file_context_parts = []
    for file in files:
        contents = await file.read()
        file_text = _parse_file_to_text(file, contents)
        file_context_parts.append(file_text)
    
    # Build the file context string
    file_context = ""
    if file_context_parts:
        file_context = "\n\n--- ATTACHED FILES ---\n" + "\n\n".join(file_context_parts) + "\n--- END OF ATTACHED FILES ---\n\n"
        file_context += "The user has attached the above files. Analyze them in the context of R&D tax credit qualification.\n"
    
    # Get user's existing data context
    user_data_context = _get_user_context_data(user["id"])
    user_context_prompt = _build_context_prompt(user_data_context)
    
    # Combine file context with user context
    combined_context = file_context + (user_context_prompt or "")
    
    # Get AI response
    ai_text = chatbot_agent.get_chat_response(messages_dicts, combined_context if combined_context else None)
    structured = chatbot_agent.extract_json_from_response(ai_text)
    
    # Save to database
    supabase = get_supabase()
    result_session_id = session_id
    
    if supabase:
        try:
            if not result_session_id:
                session_result = supabase.table("chat_sessions").insert({
                    "user_id": user["id"],
                    "title": "Audit Session with Files",
                    "structured_output": structured,
                }).execute()
                result_session_id = session_result.data[0]["id"]
            else:
                if structured:
                    supabase.table("chat_sessions").update({
                        "structured_output": structured,
                        "updated_at": datetime.utcnow().isoformat(),
                    }).eq("id", result_session_id).execute()
            
            # Save messages
            if messages_data:
                last_msg = messages_data[-1]
                content_with_files = last_msg["content"]
                if files:
                    content_with_files += f"\n[Attached {len(files)} file(s): {', '.join(f.filename or 'unnamed' for f in files)}]"
                
                supabase.table("chat_messages").insert({
                    "session_id": result_session_id,
                    "role": last_msg["role"],
                    "content": content_with_files,
                }).execute()
            
            supabase.table("chat_messages").insert({
                "session_id": result_session_id,
                "role": "assistant",
                "content": ai_text,
            }).execute()
        except Exception as e:
            logger.error(f"Error saving chat with files: {e}")
    
    return {"response": ai_text, "structured": structured, "session_id": result_session_id}


@api_router.get("/user_context")
async def get_user_context(user: dict = Depends(get_current_user)):
    """Get user's uploaded data for context display."""
    context = _get_user_context_data(user["id"])
    return context


@api_router.get("/chat/sessions")
async def get_chat_sessions(user: dict = Depends(get_current_user)):
    """Get all chat sessions for the current user."""
    supabase = get_supabase()
    if not supabase:
        return {"sessions": []}
    
    try:
        result = supabase.table("chat_sessions")\
            .select("*")\
            .eq("user_id", user["id"])\
            .order("created_at", desc=True)\
            .execute()
        return {"sessions": result.data}
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return {"sessions": []}


@api_router.get("/chat/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, user: dict = Depends(get_current_user)):
    """Get messages for a specific chat session."""
    supabase = get_supabase()
    if not supabase:
        return {"messages": []}
    
    try:
        # Verify session belongs to user
        session = supabase.table("chat_sessions")\
            .select("*")\
            .eq("id", session_id)\
            .eq("user_id", user["id"])\
            .single()\
            .execute()
        
        if not session.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        messages = supabase.table("chat_messages")\
            .select("*")\
            .eq("session_id", session_id)\
            .order("created_at")\
            .execute()
        
        return {"session": session.data, "messages": messages.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return {"messages": []}


@api_router.post("/generate_study")
async def generate_study(payload: StructuredStudy, user: dict = Depends(get_current_user)):
    """Generate Excel study and save to database."""
    supabase = get_supabase()
    
    # Generate Excel file
    excel_file = _structured_to_excel_payload(payload.payload)
    excel_bytes = excel_file.read()
    excel_file.seek(0)
    
    # Calculate totals from structured data
    total_qre = 0
    wages = payload.payload.get("wages", {})
    if isinstance(wages, dict):
        wage_entries = wages.get("breakdown") or wages.get("details") or []
        for entry in wage_entries:
            if isinstance(entry, dict):
                wage = float(entry.get("box1_wages") or entry.get("wage") or 0)
                pct = _percent_to_decimal(entry.get("qualified_percent") or entry.get("technical_pct") or 80)
                total_qre += wage * pct
    
    contractors = payload.payload.get("contractors", [])
    if isinstance(contractors, list):
        for c in contractors:
            if isinstance(c, dict) and c.get("is_qualified", True):
                total_qre += float(c.get("amount") or c.get("cost") or 0) * 0.65
    
    total_credit = total_qre * 0.065  # Simplified credit calculation
    
    # Save study record to database
    if supabase:
        try:
            study_id = str(uuid.uuid4())
            file_path = f"{user['id']}/{study_id}.xlsx"
            
            # Upload to Supabase Storage
            try:
                supabase.storage.from_("studies").upload(file_path, excel_bytes)
                file_url = supabase.storage.from_("studies").get_public_url(file_path)
            except Exception as e:
                print(f"Storage upload error: {e}")
                file_url = None
                file_path = None
            
            # Save study metadata
            supabase.table("studies").insert({
                "id": study_id,
                "user_id": user["id"],
                "chat_session_id": payload.session_id,
                "title": payload.title,
                "file_path": file_path,
                "file_url": file_url,
                "total_qre": total_qre,
                "total_credit": total_credit,
                "status": "generated",
                "metadata": payload.payload,
            }).execute()
        except Exception as e:
            print(f"Error saving study: {e}")
    
    excel_file.seek(0)
    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={payload.title.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


@api_router.get("/studies")
async def get_studies(user: dict = Depends(get_current_user)):
    """Get all studies for the current user."""
    supabase = get_supabase()
    if not supabase:
        return {"studies": []}
    
    try:
        result = supabase.table("studies")\
            .select("*")\
            .eq("user_id", user["id"])\
            .order("created_at", desc=True)\
            .execute()
        return {"studies": result.data}
    except Exception as e:
        print(f"Error fetching studies: {e}")
        return {"studies": []}


# --- Data Management Endpoints ---
@api_router.get("/projects")
async def get_projects(user: dict = Depends(get_current_user)):
    """Get all projects for the current user."""
    supabase = get_supabase()
    if not supabase:
        return {"projects": []}
    
    try:
        result = supabase.table("projects")\
            .select("*")\
            .eq("user_id", user["id"])\
            .order("created_at", desc=True)\
            .execute()
        return {"projects": result.data}
    except Exception as e:
        print(f"Error fetching projects: {e}")
        return {"projects": []}


@api_router.post("/projects")
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    """Create a new project."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        result = supabase.table("projects").insert({
            "user_id": user["id"],
            "name": project.name,
            "description": project.description,
            "technical_uncertainty": project.technical_uncertainty,
            "process_of_experimentation": project.process_of_experimentation,
        }).execute()
        return {"project": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/employees")
async def get_employees(user: dict = Depends(get_current_user)):
    """Get all employees for the current user."""
    supabase = get_supabase()
    if not supabase:
        return {"employees": []}
    
    try:
        result = supabase.table("employees")\
            .select("*")\
            .eq("user_id", user["id"])\
            .order("created_at", desc=True)\
            .execute()
        return {"employees": result.data}
    except Exception as e:
        print(f"Error fetching employees: {e}")
        return {"employees": []}


@api_router.post("/employees")
async def create_employee(employee: EmployeeCreate, user: dict = Depends(get_current_user)):
    """Create a new employee."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        result = supabase.table("employees").insert({
            "user_id": user["id"],
            "name": employee.name,
            "title": employee.title,
            "state": employee.state,
            "total_wages": employee.total_wages,
            "qualified_percent": employee.qualified_percent,
        }).execute()
        return {"employee": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/contractors")
async def get_contractors(user: dict = Depends(get_current_user)):
    """Get all contractors for the current user."""
    supabase = get_supabase()
    if not supabase:
        return {"contractors": []}
    
    try:
        result = supabase.table("contractors")\
            .select("*")\
            .eq("user_id", user["id"])\
            .order("created_at", desc=True)\
            .execute()
        return {"contractors": result.data}
    except Exception as e:
        print(f"Error fetching contractors: {e}")
        return {"contractors": []}


@api_router.post("/contractors")
async def create_contractor(contractor: ContractorCreate, user: dict = Depends(get_current_user)):
    """Create a new contractor."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        result = supabase.table("contractors").insert({
            "user_id": user["id"],
            "name": contractor.name,
            "cost": contractor.cost,
            "is_qualified": contractor.is_qualified,
            "location": contractor.location,
            "project_id": contractor.project_id,
            "notes": contractor.notes,
        }).execute()
        return {"contractor": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/upload_payroll")
async def upload_payroll(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload payroll data from CSV/Excel."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    print(f"Upload payroll initiated by user {user['id']}, file: {file.filename}")
    
    # Validate file extension
    filename = (file.filename or "").lower()
    if not any(filename.endswith(ext) for ext in ['.xlsx', '.xls', '.csv']):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: .xlsx, .xls, .csv. Got: {file.filename}"
        )
    
    try:
        contents = await file.read()
        print(f"Read {len(contents)} bytes from {file.filename}")
        
        df = load_dataframe(file, contents)
        print(f"DataFrame loaded successfully. Columns: {list(df.columns)}")
        
        df.columns = [c.lower().strip() for c in df.columns]
        print(f"Normalized columns: {list(df.columns)}")
    except ValueError as e:
        # Validation or parsing error with detailed message
        print(f"File parsing error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unexpected error parsing file: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {type(e).__name__}: {str(e)}")
    
    count = 0
    errors = []
    for idx, row in df.iterrows():
        name = row.get('name') or row.get('employee name') or row.get('employee')
        if not name or pd.isna(name):
            continue
        
        try:
            wages = row.get('wages') or row.get('total wages') or row.get('salary') or row.get('total_wages') or 0
            if pd.isna(wages):
                wages = 0
            
            qualified_pct = row.get('qualified_percent') or row.get('qualified percent') or row.get('allocation') or 80
            if pd.isna(qualified_pct):
                qualified_pct = 80
            
            title = row.get('title') or row.get('position') or row.get('role') or 'Unknown'
            if pd.isna(title):
                title = 'Unknown'
            
            state = row.get('state') or row.get('location') or 'Unknown'
            if pd.isna(state):
                state = 'Unknown'
            
            supabase.table("employees").insert({
                "user_id": user["id"],
                "name": str(name),
                "title": str(title),
                "state": str(state),
                "total_wages": float(wages),
                "qualified_percent": float(qualified_pct),
            }).execute()
            count += 1
        except Exception as e:
            error_msg = f"Row {idx}: {str(e)}"
            print(f"Error inserting employee: {error_msg}")
            errors.append(error_msg)
    
    print(f"Upload complete. Inserted {count} employees, {len(errors)} errors")
    return {"message": f"Uploaded {count} employees.", "count": count, "errors": errors[:5] if errors else []}


@api_router.post("/upload_contractors")
async def upload_contractors(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload contractor data from CSV/Excel."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    print(f"Upload contractors initiated by user {user['id']}, file: {file.filename}")
    
    # Validate file extension
    filename = (file.filename or "").lower()
    if not any(filename.endswith(ext) for ext in ['.xlsx', '.xls', '.csv']):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: .xlsx, .xls, .csv. Got: {file.filename}"
        )
    
    try:
        contents = await file.read()
        print(f"Read {len(contents)} bytes from {file.filename}")
        
        df = load_dataframe(file, contents)
        print(f"DataFrame loaded successfully. Columns: {list(df.columns)}")
        
        df.columns = [c.lower().strip() for c in df.columns]
        print(f"Normalized columns: {list(df.columns)}")
    except ValueError as e:
        # Validation or parsing error with detailed message
        print(f"File parsing error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unexpected error parsing file: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {type(e).__name__}: {str(e)}")
    
    count = 0
    errors = []
    for idx, row in df.iterrows():
        name = row.get('name') or row.get('contractor') or row.get('vendor')
        if not name or pd.isna(name):
            continue
        
        try:
            cost_val = row.get('cost') or row.get('amount') or row.get('total') or 0
            if pd.isna(cost_val):
                cost_val = 0
            cost = float(cost_val)
            
            qualified_val = row.get('qualified') or row.get('is qualified') or row.get('is_qualified')
            if pd.isna(qualified_val) or qualified_val is None:
                qualified = True
            elif isinstance(qualified_val, str):
                qualified = qualified_val.strip().lower() in ('yes', 'true', '1', 'y')
            else:
                qualified = bool(qualified_val)
            
            location = row.get('location') or row.get('country') or 'US'
            if pd.isna(location):
                location = 'US'
            
            notes = row.get('notes') or row.get('description') or ''
            if pd.isna(notes):
                notes = ''
            
            supabase.table("contractors").insert({
                "user_id": user["id"],
                "name": str(name),
                "cost": cost,
                "is_qualified": qualified,
                "location": str(location),
                "notes": str(notes) if notes else None,
            }).execute()
            count += 1
        except Exception as e:
            error_msg = f"Row {idx}: {str(e)}"
            print(f"Error inserting contractor: {error_msg}")
            errors.append(error_msg)
    
    print(f"Upload complete. Inserted {count} contractors, {len(errors)} errors")
    return {"message": f"Uploaded {count} contractors.", "count": count, "errors": errors[:5] if errors else []}


@api_router.get("/dashboard")
async def get_dashboard(user: dict = Depends(get_current_user)):
    """Get dashboard summary data."""
    supabase = get_supabase()
    if not supabase:
        return {
            "total_credit": 0,
            "total_wages": 0,
            "total_qre": 0,
            "project_count": 0,
            "employee_count": 0,
            "contractor_count": 0,
            "study_count": 0,
        }
    
    try:
        projects = supabase.table("projects").select("id").eq("user_id", user["id"]).execute()
        employees = supabase.table("employees").select("id, total_wages, qualified_percent").eq("user_id", user["id"]).execute()
        contractors = supabase.table("contractors").select("id, cost, is_qualified").eq("user_id", user["id"]).execute()
        studies = supabase.table("studies").select("id, total_credit").eq("user_id", user["id"]).execute()
        
        total_wages = sum(e.get("total_wages", 0) for e in employees.data)
        total_qre = sum(
            e.get("total_wages", 0) * (e.get("qualified_percent", 80) / 100)
            for e in employees.data
        )
        contractor_qre = sum(
            c.get("cost", 0) * 0.65
            for c in contractors.data
            if c.get("is_qualified", True)
        )
        total_credit = (total_qre + contractor_qre) * 0.065
        
        return {
            "total_credit": round(total_credit, 2),
            "total_wages": round(total_wages, 2),
            "total_qre": round(total_qre + contractor_qre, 2),
            "project_count": len(projects.data),
            "employee_count": len(employees.data),
            "contractor_count": len(contractors.data),
            "study_count": len(studies.data),
        }
    except Exception as e:
        print(f"Error fetching dashboard: {e}")
        return {
            "total_credit": 0,
            "total_wages": 0,
            "total_qre": 0,
            "project_count": 0,
            "employee_count": 0,
            "contractor_count": 0,
            "study_count": 0,
        }


# --- Admin Endpoints ---
@admin_router.get("/users")
async def admin_get_users(user: dict = Depends(get_admin_user)):
    """Get all users (admin only)."""
    supabase = get_supabase()
    if not supabase:
        return {"users": []}
    
    try:
        result = supabase.table("profiles")\
            .select("*")\
            .order("created_at", desc=True)\
            .execute()
        return {"users": result.data}
    except Exception as e:
        print(f"Error fetching users: {e}")
        return {"users": []}


@admin_router.get("/studies")
async def admin_get_studies(user: dict = Depends(get_admin_user)):
    """Get all studies (admin only)."""
    supabase = get_supabase()
    if not supabase:
        return {"studies": []}
    
    try:
        result = supabase.table("studies")\
            .select("*, profiles(email, company_name)")\
            .order("created_at", desc=True)\
            .execute()
        return {"studies": result.data}
    except Exception as e:
        print(f"Error fetching studies: {e}")
        return {"studies": []}


@admin_router.get("/chat_sessions")
async def admin_get_chat_sessions(user: dict = Depends(get_admin_user)):
    """Get all chat sessions (admin only)."""
    supabase = get_supabase()
    if not supabase:
        return {"sessions": []}
    
    try:
        result = supabase.table("chat_sessions")\
            .select("*, profiles(email, company_name)")\
            .order("created_at", desc=True)\
            .limit(100)\
            .execute()
        return {"sessions": result.data}
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return {"sessions": []}


@admin_router.get("/stats")
async def admin_get_stats(user: dict = Depends(get_admin_user)):
    """Get admin statistics."""
    supabase = get_supabase()
    if not supabase:
        return {"total_users": 0, "total_studies": 0, "total_sessions": 0}
    
    try:
        users = supabase.table("profiles").select("id", count="exact").execute()
        studies = supabase.table("studies").select("id", count="exact").execute()
        sessions = supabase.table("chat_sessions").select("id", count="exact").execute()
        
        return {
            "total_users": users.count or 0,
            "total_studies": studies.count or 0,
            "total_sessions": sessions.count or 0,
        }
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return {"total_users": 0, "total_studies": 0, "total_sessions": 0}


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint for Railway and monitoring."""
    supabase = get_supabase()
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected" if supabase else "not configured",
            "ai": "configured" if os.environ.get("GOOGLE_CLOUD_API_KEY") else "not configured"
        }
    }

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "TaxScape Pro API",
        "version": "1.0.3",  # Updated to verify deployment
        "code_version": "2024-12-03-v5",  # Track code changes - FIXED jwt.decode issue
        "description": "R&D Tax Credit Calculation and AI Auditor",
        "docs": "/docs",
        "health": "/health"
    }

@app.post("/debug/token")
async def debug_token(authorization: Optional[str] = Header(None)):
    """Debug endpoint to test token verification."""
    from jose import jwt
    
    if not authorization:
        return {"error": "No authorization header"}
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return {"error": f"Invalid format, parts: {len(parts)}"}
    
    token = parts[1]
    
    try:
        # Use get_unverified_claims instead of decode
        decoded = jwt.get_unverified_claims(token)
        return {
            "success": True,
            "token_length": len(token),
            "decoded_sub": decoded.get("sub"),
            "decoded_email": decoded.get("email"),
            "decoded_iss": decoded.get("iss"),
            "decoded_exp": decoded.get("exp"),
        }
    except Exception as e:
        return {
            "error": str(e),
            "token_length": len(token),
            "token_start": token[:50] if token else None
        }


# Register Routers
app.include_router(api_router)
app.include_router(admin_router)
app.include_router(org_router)
