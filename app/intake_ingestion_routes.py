"""
Intake Ingestion Pipeline Routes (Prompt 9)
Implements:
- File upload with hash-based deduplication
- Deterministic classification with heuristics + AI fallback
- Domain parsers for all 8 data types
- Mapping resolution for ambiguous data
- Finalize intake workflow
"""

import logging
import json
import hashlib
import re
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID, uuid4
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Header, UploadFile, File, Form
from pydantic import BaseModel, Field

from .supabase_client import get_supabase
from .intake_services import (
    StorageService,
    classify_file_enhanced,
    extract_file_content,
    process_multi_sheet_excel,
    parse_sheet_data,
    GEMINI_AVAILABLE
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intake", tags=["intake-ingestion"])

# ============================================================================
# Auth Dependency
# ============================================================================

def verify_supabase_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return user data."""
    supabase = get_supabase()
    try:
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            user = user_response.user
            return {
                "id": user.id,
                "email": user.email,
            }
        return None
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        return None


async def get_current_user(authorization: Optional[str] = Header(None)):
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


# ============================================================================
# Helper Functions
# ============================================================================

def get_user_profile(user_id: str) -> Optional[dict]:
    """Get user profile with organization info."""
    supabase = get_supabase()
    try:
        result = supabase.table("profiles").select("*, organization_id").eq("id", user_id).single().execute()
        return result.data
    except Exception as e:
        logger.error(f"Error fetching profile: {e}")
        return None


def check_cpa_or_executive(user: dict) -> bool:
    """Check if user is CPA or Executive role."""
    profile = get_user_profile(user["id"])
    if not profile:
        return False
    role = profile.get("role", "").lower()
    return role in ["cpa", "executive", "admin"]


def write_audit_log(
    org_id: str,
    user_id: str,
    action: str,
    item_type: str,
    item_id: str = None,
    details: dict = None
):
    """Write to audit_logs table."""
    supabase = get_supabase()
    try:
        supabase.table("audit_logs").insert({
            "organization_id": org_id,
            "user_id": user_id,
            "action": action,
            "item_type": item_type,
            "item_id": item_id,
            "details": details or {},
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def compute_file_hash(content: bytes) -> str:
    """Compute SHA256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def normalize_name(name: str) -> str:
    """Normalize a name for matching purposes."""
    if not name:
        return ""
    # Lowercase, remove extra whitespace, strip punctuation
    normalized = name.lower().strip()
    normalized = re.sub(r'\s+', ' ', normalized)
    normalized = re.sub(r'[^\w\s]', '', normalized)
    return normalized


# ============================================================================
# Classification Service
# ============================================================================

# Keywords for domain classification
DOMAIN_KEYWORDS = {
    "employees_payroll": {
        "sheet_names": ["employee", "payroll", "wages", "w2", "salary", "personnel", "staff"],
        "columns": ["employee", "name", "wages", "salary", "w2", "department", "title", "compensation", 
                   "pay", "gross", "state", "location"],
        "required_columns": ["name", "wages"]
    },
    "projects": {
        "sheet_names": ["project", "r&d", "research", "development", "initiative"],
        "columns": ["project", "name", "description", "owner", "department", "start", "end", 
                   "uncertainty", "experimentation", "technical"],
        "required_columns": ["project", "name"]
    },
    "timesheets": {
        "sheet_names": ["timesheet", "time", "hours", "allocation", "effort"],
        "columns": ["employee", "project", "hours", "time", "period", "week", "date", "allocation", "%"],
        "required_columns": ["hours"]
    },
    "vendors": {
        "sheet_names": ["vendor", "supplier", "contractor", "subcontractor"],
        "columns": ["vendor", "contractor", "supplier", "company", "country", "contract", "service"],
        "required_columns": ["vendor", "name"]
    },
    "contracts": {
        "sheet_names": ["contract", "agreement", "msa", "sow"],
        "columns": ["contract", "agreement", "vendor", "scope", "ip", "rights", "risk"],
        "keywords_in_text": ["statement of work", "master services agreement", "contract research", 
                            "intellectual property", "confidentiality"]
    },
    "ap_transactions": {
        "sheet_names": ["ap", "accounts payable", "invoice", "transaction", "expense", "payment"],
        "columns": ["date", "vendor", "invoice", "description", "amount", "gl", "account", "debit", "credit"],
        "required_columns": ["amount"]
    },
    "supplies": {
        "sheet_names": ["supply", "supplies", "material", "purchase", "inventory"],
        "columns": ["item", "supply", "material", "consumable", "amount", "cost", "consumed", "capitalized"],
        "required_columns": ["item", "amount"]
    },
    "section_174_support": {
        "sheet_names": ["174", "section 174", "r&e", "capitalization"],
        "columns": ["174", "r&e", "software", "development", "domestic", "foreign"],
        "keywords_in_text": ["section 174", "research expenditure", "amortization", "capitalization"]
    }
}


def classify_by_filename(filename: str) -> Tuple[str, float, str]:
    """Classify based on filename patterns."""
    filename_lower = filename.lower()
    
    patterns = [
        (r'payroll|employee|wage|w2|salary|personnel', 'employees_payroll', 0.7),
        (r'project|r&d|research|initiative', 'projects', 0.7),
        (r'timesheet|time\s*sheet|hours|allocation', 'timesheets', 0.7),
        (r'vendor|contractor|supplier', 'vendors', 0.7),
        (r'contract|agreement|msa|sow', 'contracts', 0.7),
        (r'ap\s*transaction|invoice|accounts\s*payable|expense', 'ap_transactions', 0.7),
        (r'supply|supplies|material|consumable', 'supplies', 0.7),
        (r'174|section\s*174|r&e', 'section_174_support', 0.7),
    ]
    
    for pattern, domain, confidence in patterns:
        if re.search(pattern, filename_lower):
            return domain, confidence, f"Filename matches pattern: {pattern}"
    
    return 'unknown', 0.0, "No filename pattern match"


def classify_by_sheet_names(sheet_names: List[str]) -> Tuple[str, float, str]:
    """Classify based on Excel sheet names."""
    if not sheet_names:
        return 'unknown', 0.0, "No sheet names"
    
    best_match = ('unknown', 0.0, "No sheet name match")
    
    for sheet in sheet_names:
        sheet_lower = sheet.lower()
        for domain, keywords in DOMAIN_KEYWORDS.items():
            for kw in keywords.get("sheet_names", []):
                if kw in sheet_lower:
                    confidence = 0.85
                    reason = f"Sheet '{sheet}' matches domain keyword '{kw}'"
                    if confidence > best_match[1]:
                        best_match = (domain, confidence, reason)
    
    return best_match


def classify_by_columns(columns: List[str]) -> Tuple[str, float, str]:
    """Classify based on column headers."""
    if not columns:
        return 'unknown', 0.0, "No columns"
    
    columns_lower = [c.lower() for c in columns]
    columns_text = ' '.join(columns_lower)
    
    scores = {}
    reasons = {}
    
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = 0
        matched = []
        for kw in keywords.get("columns", []):
            if any(kw in col for col in columns_lower):
                score += 1
                matched.append(kw)
        
        if matched:
            scores[domain] = score / len(keywords.get("columns", [1]))
            reasons[domain] = f"Columns match: {matched[:5]}"
    
    if scores:
        best_domain = max(scores, key=scores.get)
        return best_domain, min(scores[best_domain] + 0.3, 0.95), reasons[best_domain]
    
    return 'unknown', 0.0, "No column pattern match"


def classify_file(
    filename: str,
    mime_type: str,
    sheet_names: List[str] = None,
    columns: List[str] = None,
    text_snippet: str = None
) -> Tuple[str, float, str]:
    """
    Deterministic classification with heuristics.
    Returns: (domain, confidence, reason)
    """
    # Start with filename
    domain, confidence, reason = classify_by_filename(filename)
    if confidence >= 0.7:
        return domain, confidence, reason
    
    # Try sheet names for Excel
    if sheet_names:
        sheet_domain, sheet_confidence, sheet_reason = classify_by_sheet_names(sheet_names)
        if sheet_confidence > confidence:
            domain, confidence, reason = sheet_domain, sheet_confidence, sheet_reason
    
    # Try columns
    if columns:
        col_domain, col_confidence, col_reason = classify_by_columns(columns)
        if col_confidence > confidence:
            domain, confidence, reason = col_domain, col_confidence, col_reason
    
    # For PDF/DOCX, check text snippets
    if text_snippet and mime_type in ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
        text_lower = text_snippet.lower()
        for d, keywords in DOMAIN_KEYWORDS.items():
            for kw in keywords.get("keywords_in_text", []):
                if kw in text_lower:
                    if confidence < 0.7:
                        domain = d
                        confidence = 0.75
                        reason = f"Text contains keyword: '{kw}'"
                        break
    
    return domain, confidence, reason


# ============================================================================
# Excel/CSV Reading Utilities
# ============================================================================

def read_excel_metadata(content: bytes, filename: str) -> dict:
    """Read Excel file and extract metadata."""
    try:
        import pandas as pd
        from io import BytesIO
        
        buffer = BytesIO(content)
        
        # Get sheet names
        xl = pd.ExcelFile(buffer)
        sheet_names = xl.sheet_names
        
        # Read first sheet to get headers and preview
        df = pd.read_excel(buffer, sheet_name=0, nrows=20)
        columns = list(df.columns)
        preview = df.fillna('').astype(str).values.tolist()
        
        return {
            "sheet_names": sheet_names,
            "columns": columns,
            "preview": preview[:20],
            "row_count": len(preview)
        }
    except Exception as e:
        logger.error(f"Error reading Excel: {e}")
        return {"sheet_names": [], "columns": [], "preview": [], "error": str(e)}


def read_csv_metadata(content: bytes) -> dict:
    """Read CSV file and extract metadata."""
    try:
        import pandas as pd
        from io import BytesIO, StringIO
        
        # Try to decode
        try:
            text = content.decode('utf-8')
        except:
            text = content.decode('latin-1')
        
        df = pd.read_csv(StringIO(text), nrows=20)
        columns = list(df.columns)
        preview = df.fillna('').astype(str).values.tolist()
        
        return {
            "sheet_names": [],
            "columns": columns,
            "preview": preview[:20],
            "row_count": len(preview)
        }
    except Exception as e:
        logger.error(f"Error reading CSV: {e}")
        return {"sheet_names": [], "columns": [], "preview": [], "error": str(e)}


def extract_pdf_text_snippet(content: bytes) -> str:
    """Extract text snippet from PDF."""
    try:
        from PyPDF2 import PdfReader
        from io import BytesIO
        
        reader = PdfReader(BytesIO(content))
        text = ""
        for page in reader.pages[:3]:  # First 3 pages
            text += page.extract_text() or ""
            if len(text) > 2000:
                break
        return text[:2000]
    except Exception as e:
        logger.error(f"Error reading PDF: {e}")
        return ""


def extract_docx_text_snippet(content: bytes) -> str:
    """Extract text snippet from DOCX."""
    try:
        from docx import Document
        from io import BytesIO
        
        doc = Document(BytesIO(content))
        text = "\n".join([p.text for p in doc.paragraphs[:50]])
        return text[:2000]
    except Exception as e:
        logger.error(f"Error reading DOCX: {e}")
        return ""


# ============================================================================
# Domain Parsers
# ============================================================================

def parse_employees_payroll(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse employee/payroll data."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "rows_updated": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        # Read file
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        # Column mapping (flexible)
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        # Name column
        for name_col in ['name', 'employee_name', 'employee name', 'full_name', 'full name']:
            if name_col in df_cols_lower:
                column_map['name'] = df_cols_lower[name_col]
                result["columns_recognized"].append("name")
                break
        
        if 'name' not in column_map:
            result["columns_missing"].append("name (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains the employee name?",
                "options": list(df.columns),
                "target_field": "name"
            })
        
        # Other columns
        wage_patterns = ['wages', 'w2', 'salary', 'total_wages', 'total wages', 'gross', 'compensation']
        for pattern in wage_patterns:
            if pattern in df_cols_lower:
                column_map['wages'] = df_cols_lower[pattern]
                result["columns_recognized"].append("wages")
                break
        
        title_patterns = ['title', 'job_title', 'job title', 'position']
        for pattern in title_patterns:
            if pattern in df_cols_lower:
                column_map['title'] = df_cols_lower[pattern]
                result["columns_recognized"].append("title")
                break
        
        dept_patterns = ['department', 'dept', 'division', 'team']
        for pattern in dept_patterns:
            if pattern in df_cols_lower:
                column_map['department'] = df_cols_lower[pattern]
                result["columns_recognized"].append("department")
                break
        
        state_patterns = ['state', 'location', 'work_state', 'work state']
        for pattern in state_patterns:
            if pattern in df_cols_lower:
                column_map['state'] = df_cols_lower[pattern]
                result["columns_recognized"].append("state")
                break
        
        # If we have minimum required columns, insert data
        if 'name' in column_map:
            supabase = get_supabase()
            tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
            
            inserted = 0
            updated = 0
            
            for _, row in df.iterrows():
                name = str(row.get(column_map.get('name', ''), '')).strip()
                if not name:
                    continue
                
                employee_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "name": name,
                    "tax_year": tax_year,
                    "source_intake_file_id": file_id
                }
                
                if 'title' in column_map:
                    employee_data["title"] = str(row.get(column_map['title'], ''))
                if 'department' in column_map:
                    employee_data["department"] = str(row.get(column_map['department'], ''))
                if 'state' in column_map:
                    employee_data["location_state"] = str(row.get(column_map['state'], ''))
                if 'wages' in column_map:
                    try:
                        wages = row.get(column_map['wages'], 0)
                        if pd.notna(wages):
                            employee_data["w2_wages"] = float(str(wages).replace(',', '').replace('$', ''))
                    except:
                        pass
                
                # Check for existing
                existing = supabase.table("employees")\
                    .select("id")\
                    .eq("client_company_id", client_id)\
                    .eq("tax_year", tax_year)\
                    .ilike("name", name)\
                    .execute()
                
                if existing.data:
                    # Update
                    supabase.table("employees").update(employee_data).eq("id", existing.data[0]["id"]).execute()
                    updated += 1
                else:
                    # Insert
                    supabase.table("employees").insert(employee_data).execute()
                    inserted += 1
            
            result["rows_inserted"] = inserted
            result["rows_updated"] = updated
            result["success"] = True
        else:
            result["errors"].append("Could not identify name column - mapping required")
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing employees: {e}")
    
    return result


def parse_projects(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse projects data."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "rows_updated": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        # Find project name column
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        name_patterns = ['project', 'project_name', 'project name', 'name', 'title', 'initiative']
        for pattern in name_patterns:
            if pattern in df_cols_lower:
                column_map['name'] = df_cols_lower[pattern]
                result["columns_recognized"].append("project_name")
                break
        
        if 'name' not in column_map:
            result["columns_missing"].append("project_name (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains the project name?",
                "options": list(df.columns),
                "target_field": "project_name"
            })
            return result
        
        # Optional columns
        owner_patterns = ['owner', 'project_owner', 'lead', 'manager', 'contact']
        for pattern in owner_patterns:
            if pattern in df_cols_lower:
                column_map['owner'] = df_cols_lower[pattern]
                result["columns_recognized"].append("owner")
                break
        
        desc_patterns = ['description', 'desc', 'summary', 'overview', 'goals']
        for pattern in desc_patterns:
            if pattern in df_cols_lower:
                column_map['description'] = df_cols_lower[pattern]
                result["columns_recognized"].append("description")
                break
        
        # Insert projects
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        inserted = 0
        updated = 0
        
        for _, row in df.iterrows():
            name = str(row.get(column_map.get('name', ''), '')).strip()
            if not name:
                continue
            
            project_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": name,
                "tax_year": tax_year,
                "source_intake_file_id": file_id
            }
            
            if 'owner' in column_map:
                project_data["project_owner"] = str(row.get(column_map['owner'], ''))
            if 'description' in column_map:
                project_data["description"] = str(row.get(column_map['description'], ''))
            
            # Check for existing
            existing = supabase.table("projects")\
                .select("id")\
                .eq("client_company_id", client_id)\
                .eq("tax_year", tax_year)\
                .ilike("name", name)\
                .execute()
            
            if existing.data:
                supabase.table("projects").update(project_data).eq("id", existing.data[0]["id"]).execute()
                updated += 1
            else:
                supabase.table("projects").insert(project_data).execute()
                inserted += 1
        
        result["rows_inserted"] = inserted
        result["rows_updated"] = updated
        result["success"] = True
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing projects: {e}")
    
    return result


def parse_timesheets(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse timesheet/allocation data."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "rows_updated": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        # Employee column
        emp_patterns = ['employee', 'employee_name', 'employee name', 'name', 'person']
        for pattern in emp_patterns:
            if pattern in df_cols_lower:
                column_map['employee'] = df_cols_lower[pattern]
                result["columns_recognized"].append("employee")
                break
        
        # Project column
        proj_patterns = ['project', 'project_name', 'project name', 'activity']
        for pattern in proj_patterns:
            if pattern in df_cols_lower:
                column_map['project'] = df_cols_lower[pattern]
                result["columns_recognized"].append("project")
                break
        
        # Hours column
        hours_patterns = ['hours', 'time', 'total_hours', 'total hours', 'hrs']
        for pattern in hours_patterns:
            if pattern in df_cols_lower:
                column_map['hours'] = df_cols_lower[pattern]
                result["columns_recognized"].append("hours")
                break
        
        if 'hours' not in column_map:
            result["columns_missing"].append("hours (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains hours worked?",
                "options": list(df.columns),
                "target_field": "hours"
            })
            return result
        
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        # Get existing employees and projects for matching
        employees = supabase.table("employees").select("id, name").eq("client_company_id", client_id).execute()
        emp_lookup = {normalize_name(e["name"]): e["id"] for e in (employees.data or [])}
        
        projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
        proj_lookup = {normalize_name(p["name"]): p["id"] for p in (projects.data or [])}
        
        inserted = 0
        unmatched_employees = set()
        unmatched_projects = set()
        
        for _, row in df.iterrows():
            hours = row.get(column_map.get('hours', ''), 0)
            try:
                hours = float(str(hours).replace(',', ''))
            except:
                continue
            
            if hours <= 0:
                continue
            
            time_log = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "hours": hours,
                "tax_year": tax_year,
                "source": "timesheet",
                "source_intake_file_id": file_id
            }
            
            # Match employee
            if 'employee' in column_map:
                emp_name = str(row.get(column_map['employee'], '')).strip()
                emp_normalized = normalize_name(emp_name)
                if emp_normalized in emp_lookup:
                    time_log["user_id"] = emp_lookup[emp_normalized]
                else:
                    unmatched_employees.add(emp_name)
            
            # Match project
            if 'project' in column_map:
                proj_name = str(row.get(column_map['project'], '')).strip()
                proj_normalized = normalize_name(proj_name)
                if proj_normalized in proj_lookup:
                    time_log["project_id"] = proj_lookup[proj_normalized]
                else:
                    unmatched_projects.add(proj_name)
            
            supabase.table("time_logs").insert(time_log).execute()
            inserted += 1
        
        # Create mappings for unmatched
        if unmatched_employees:
            result["mappings_needed"].append({
                "type": "employee_matching",
                "prompt": "The following employee names could not be matched. Please map them:",
                "options": list(emp_lookup.keys()),
                "unmatched": list(unmatched_employees)
            })
        
        if unmatched_projects:
            result["mappings_needed"].append({
                "type": "project_name_matching",
                "prompt": "The following project names could not be matched. Please map them:",
                "options": list(proj_lookup.keys()),
                "unmatched": list(unmatched_projects)
            })
        
        result["rows_inserted"] = inserted
        result["success"] = True
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing timesheets: {e}")
    
    return result


def parse_vendors(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse vendors data."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "rows_updated": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        # Vendor name
        name_patterns = ['vendor', 'vendor_name', 'vendor name', 'contractor', 'name', 'company']
        for pattern in name_patterns:
            if pattern in df_cols_lower:
                column_map['name'] = df_cols_lower[pattern]
                result["columns_recognized"].append("vendor_name")
                break
        
        if 'name' not in column_map:
            result["columns_missing"].append("vendor_name (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains the vendor name?",
                "options": list(df.columns),
                "target_field": "vendor_name"
            })
            return result
        
        # Country
        country_patterns = ['country', 'location', 'region']
        for pattern in country_patterns:
            if pattern in df_cols_lower:
                column_map['country'] = df_cols_lower[pattern]
                result["columns_recognized"].append("country")
                break
        
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        inserted = 0
        updated = 0
        
        for _, row in df.iterrows():
            name = str(row.get(column_map.get('name', ''), '')).strip()
            if not name:
                continue
            
            vendor_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "name": name,
                "tax_year": tax_year,
                "source_intake_file_id": file_id
            }
            
            country = str(row.get(column_map.get('country', ''), 'United States')).strip() or 'United States'
            vendor_data["country"] = country
            
            # Flag foreign research
            if country.lower() not in ['united states', 'usa', 'us', '']:
                vendor_data["is_foreign_research"] = True
            
            existing = supabase.table("contractors")\
                .select("id")\
                .eq("client_company_id", client_id)\
                .ilike("name", name)\
                .execute()
            
            if existing.data:
                supabase.table("contractors").update(vendor_data).eq("id", existing.data[0]["id"]).execute()
                updated += 1
            else:
                supabase.table("contractors").insert(vendor_data).execute()
                inserted += 1
        
        result["rows_inserted"] = inserted
        result["rows_updated"] = updated
        result["success"] = True
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing vendors: {e}")
    
    return result


def parse_contracts(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str,
    mime_type: str
) -> dict:
    """Parse contract documents."""
    result = {
        "success": False,
        "rows_parsed": 1,
        "rows_inserted": 0,
        "columns_recognized": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        # Extract text snippet
        text_snippet = ""
        if 'pdf' in mime_type:
            text_snippet = extract_pdf_text_snippet(content)
        elif 'document' in mime_type:
            text_snippet = extract_docx_text_snippet(content)
        
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        # Create contract record
        contract_data = {
            "organization_id": org_id,
            "client_company_id": client_id,
            "contract_name": filename,
            "tax_year": tax_year,
            "needs_review": True,
            "source_intake_file_id": file_id,
            "scope_of_work": text_snippet[:1000] if text_snippet else None
        }
        
        supabase.table("contracts").insert(contract_data).execute()
        result["rows_inserted"] = 1
        result["success"] = True
        
        # Create mapping for vendor association
        result["mappings_needed"].append({
            "type": "vendor_matching",
            "prompt": f"Which vendor is this contract '{filename}' associated with?",
            "context": {"text_snippet": text_snippet[:500]}
        })
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing contract: {e}")
    
    return result


def parse_ap_transactions(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse AP transactions."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        # Amount column (required)
        amount_patterns = ['amount', 'total', 'debit', 'cost', 'value']
        for pattern in amount_patterns:
            if pattern in df_cols_lower:
                column_map['amount'] = df_cols_lower[pattern]
                result["columns_recognized"].append("amount")
                break
        
        if 'amount' not in column_map:
            result["columns_missing"].append("amount (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains the transaction amount?",
                "options": list(df.columns),
                "target_field": "amount"
            })
            return result
        
        # Other columns
        date_patterns = ['date', 'transaction_date', 'invoice_date', 'posted']
        for pattern in date_patterns:
            if pattern in df_cols_lower:
                column_map['date'] = df_cols_lower[pattern]
                result["columns_recognized"].append("date")
                break
        
        vendor_patterns = ['vendor', 'vendor_name', 'payee', 'supplier']
        for pattern in vendor_patterns:
            if pattern in df_cols_lower:
                column_map['vendor'] = df_cols_lower[pattern]
                result["columns_recognized"].append("vendor")
                break
        
        desc_patterns = ['description', 'memo', 'detail', 'line_description']
        for pattern in desc_patterns:
            if pattern in df_cols_lower:
                column_map['description'] = df_cols_lower[pattern]
                result["columns_recognized"].append("description")
                break
        
        gl_patterns = ['gl', 'gl_account', 'account', 'account_number']
        for pattern in gl_patterns:
            if pattern in df_cols_lower:
                column_map['gl_account'] = df_cols_lower[pattern]
                result["columns_recognized"].append("gl_account")
                break
        
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        # Get existing vendors for matching
        vendors = supabase.table("contractors").select("id, name").eq("client_company_id", client_id).execute()
        vendor_lookup = {normalize_name(v["name"]): v["id"] for v in (vendors.data or [])}
        
        inserted = 0
        unmatched_vendors = set()
        
        for _, row in df.iterrows():
            amount = row.get(column_map.get('amount', ''), 0)
            try:
                amount = float(str(amount).replace(',', '').replace('$', ''))
            except:
                continue
            
            expense_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "amount": amount,
                "tax_year": tax_year,
                "rd_category": "needs_review",
                "source_intake_file_id": file_id
            }
            
            if 'description' in column_map:
                expense_data["description"] = str(row.get(column_map['description'], ''))
            
            if 'gl_account' in column_map:
                expense_data["gl_account"] = str(row.get(column_map['gl_account'], ''))
            
            if 'vendor' in column_map:
                vendor_name = str(row.get(column_map['vendor'], '')).strip()
                expense_data["vendor_name"] = vendor_name
                vendor_normalized = normalize_name(vendor_name)
                if vendor_normalized in vendor_lookup:
                    expense_data["vendor_id"] = vendor_lookup[vendor_normalized]
                elif vendor_name:
                    unmatched_vendors.add(vendor_name)
            
            if 'date' in column_map:
                try:
                    date_val = pd.to_datetime(row.get(column_map['date']))
                    expense_data["expense_date"] = date_val.strftime('%Y-%m-%d')
                except:
                    pass
            
            supabase.table("expenses").insert(expense_data).execute()
            inserted += 1
        
        if unmatched_vendors:
            result["mappings_needed"].append({
                "type": "vendor_matching",
                "prompt": "The following vendors could not be matched. Please map or create them:",
                "unmatched": list(unmatched_vendors)
            })
        
        result["rows_inserted"] = inserted
        result["success"] = True
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing AP transactions: {e}")
    
    return result


def parse_supplies(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse supplies data."""
    import pandas as pd
    from io import BytesIO, StringIO
    
    result = {
        "success": False,
        "rows_parsed": 0,
        "rows_inserted": 0,
        "columns_recognized": [],
        "columns_missing": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            except:
                df = pd.read_csv(StringIO(content.decode('latin-1')))
        else:
            df = pd.read_excel(BytesIO(content))
        
        result["rows_parsed"] = len(df)
        
        column_map = {}
        df_cols_lower = {c.lower(): c for c in df.columns}
        
        # Item name
        item_patterns = ['item', 'item_name', 'name', 'description', 'supply', 'material']
        for pattern in item_patterns:
            if pattern in df_cols_lower:
                column_map['item'] = df_cols_lower[pattern]
                result["columns_recognized"].append("item")
                break
        
        if 'item' not in column_map:
            result["columns_missing"].append("item (required)")
            result["mappings_needed"].append({
                "type": "column_mapping",
                "prompt": "Which column contains the item/supply name?",
                "options": list(df.columns),
                "target_field": "item"
            })
            return result
        
        # Amount
        amount_patterns = ['amount', 'cost', 'total', 'value', 'price']
        for pattern in amount_patterns:
            if pattern in df_cols_lower:
                column_map['amount'] = df_cols_lower[pattern]
                result["columns_recognized"].append("amount")
                break
        
        # Project
        project_patterns = ['project', 'project_name', 'related_project']
        for pattern in project_patterns:
            if pattern in df_cols_lower:
                column_map['project'] = df_cols_lower[pattern]
                result["columns_recognized"].append("project")
                break
        
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        # Get projects for matching
        projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
        proj_lookup = {normalize_name(p["name"]): p["id"] for p in (projects.data or [])}
        
        inserted = 0
        
        for _, row in df.iterrows():
            item_name = str(row.get(column_map.get('item', ''), '')).strip()
            if not item_name:
                continue
            
            supply_data = {
                "organization_id": org_id,
                "client_company_id": client_id,
                "item_name": item_name,
                "tax_year": tax_year,
                "source_intake_file_id": file_id,
                "qualification_status": "pending"
            }
            
            if 'amount' in column_map:
                try:
                    amount = row.get(column_map['amount'], 0)
                    supply_data["amount"] = float(str(amount).replace(',', '').replace('$', ''))
                except:
                    pass
            
            if 'project' in column_map:
                proj_name = str(row.get(column_map['project'], '')).strip()
                supply_data["project_name"] = proj_name
                proj_normalized = normalize_name(proj_name)
                if proj_normalized in proj_lookup:
                    supply_data["project_id"] = proj_lookup[proj_normalized]
            
            supabase.table("supplies").insert(supply_data).execute()
            inserted += 1
        
        result["rows_inserted"] = inserted
        result["success"] = True
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing supplies: {e}")
    
    return result


def parse_section_174(
    content: bytes,
    filename: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str
) -> dict:
    """Parse Section 174 questionnaire responses."""
    result = {
        "success": False,
        "rows_parsed": 1,
        "rows_inserted": 0,
        "columns_recognized": [],
        "mappings_needed": [],
        "errors": []
    }
    
    try:
        supabase = get_supabase()
        tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
        
        # Store raw content reference and extract what we can
        response_data = {
            "organization_id": org_id,
            "client_company_id": client_id,
            "tax_year": tax_year,
            "source_intake_file_id": file_id,
            "responses": {"raw_file": filename}
        }
        
        supabase.table("section_174_responses").insert(response_data).execute()
        
        result["rows_inserted"] = 1
        result["success"] = True
        result["mappings_needed"].append({
            "type": "category_classification",
            "prompt": "Please review and categorize the Section 174 questionnaire responses."
        })
        
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Error parsing 174 support: {e}")
    
    return result


# Dispatcher for domain parsers
DOMAIN_PARSERS = {
    "employees_payroll": parse_employees_payroll,
    "projects": parse_projects,
    "timesheets": parse_timesheets,
    "vendors": parse_vendors,
    "ap_transactions": parse_ap_transactions,
    "supplies": parse_supplies,
    "section_174_support": parse_section_174,
}


# ============================================================================
# Pydantic Models
# ============================================================================

class OverrideClassificationRequest(BaseModel):
    classification_domain: str
    reason: str


class ResolveMappingRequest(BaseModel):
    resolution: dict


class FinalizeIntakeRequest(BaseModel):
    confirm: bool = True


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/sessions/{session_id}/upload")
async def upload_intake_files(
    session_id: str,
    files: List[UploadFile] = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload files to an intake session."""
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify session
    try:
        session_result = supabase.table("client_intake_sessions")\
            .select("*, client_companies(name)")\
            .eq("id", session_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        session = session_result.data
    except:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    client_id = session["client_company_id"]
    tax_years = session.get("tax_years", [])
    
    uploaded_files = []
    
    for upload_file in files:
        content = await upload_file.read()
        file_hash = compute_file_hash(content)
        
        # Check for duplicate
        existing = supabase.table("intake_files")\
            .select("id, original_filename")\
            .eq("client_intake_session_id", session_id)\
            .eq("sha256", file_hash)\
            .execute()
        
        if existing.data:
            # Duplicate - return existing
            uploaded_files.append({
                "id": existing.data[0]["id"],
                "filename": upload_file.filename,
                "status": "duplicate",
                "existing_file": existing.data[0]["original_filename"]
            })
            continue
        
        mime_type = upload_file.content_type or ""
        
        # Upload to Supabase Storage
        storage_success, storage_path, storage_error = StorageService.upload_file(
            supabase,
            org_id,
            client_id,
            session_id,
            upload_file.filename,
            content,
            mime_type
        )
        
        if not storage_success:
            logger.error(f"Storage upload failed: {storage_error}")
            # Continue anyway with path only
        
        # Extract content for classification using enhanced service
        extracted = extract_file_content(content, upload_file.filename, mime_type)
        
        sheet_names = extracted.get("sheet_names", [])
        columns = extracted.get("columns", [])
        preview = extracted.get("preview", [])
        text_snippet = extracted.get("text_snippet", "")
        sheets_data = extracted.get("sheets_data", [])
        
        # Enhanced classification with AI fallback
        domain, confidence, reason, method = classify_file_enhanced(
            filename=upload_file.filename,
            mime_type=mime_type,
            content=content,
            sheet_names=sheet_names,
            columns=columns,
            text_snippet=text_snippet,
            preview_data=preview,
            use_ai_fallback=True,
            ai_threshold=0.5
        )
        
        # For multi-sheet Excel, check if sheets have different domains
        multi_sheet_info = None
        if len(sheet_names) > 1:
            multi_sheet_info = process_multi_sheet_excel(content)
            # If multiple different domains detected, note it
            domains_found = set(s.get("domain") for s in multi_sheet_info if s.get("domain") != "unknown")
            if len(domains_found) > 1:
                reason += f" [Multi-domain Excel: {', '.join(domains_found)}]"
        
        # Create file record
        file_id = str(uuid4())
        file_record = {
            "id": file_id,
            "client_intake_session_id": session_id,
            "organization_id": org_id,
            "client_company_id": client_id,
            "uploaded_by_user_id": user["id"],
            "original_filename": upload_file.filename,
            "storage_bucket": StorageService.BUCKET_NAME,
            "storage_path": storage_path,
            "mime_type": mime_type,
            "file_size_bytes": len(content),
            "sha256": file_hash,
            "classification_domain": domain,
            "classification_confidence": confidence,
            "classification_reason": reason,
            "classification_method": method,
            "status": "classified" if confidence >= 0.5 else "uploaded",
            "sheet_names": sheet_names,
            "header_row": columns,
            "preview_data": preview
        }
        
        # Store multi-sheet info in metadata if present
        if multi_sheet_info:
            file_record["parse_summary"] = {"multi_sheet_analysis": multi_sheet_info}
        
        supabase.table("intake_files").insert(file_record).execute()
        
        # Update session file count
        supabase.table("client_intake_sessions")\
            .update({
                "received_files_count": session.get("received_files_count", 0) + 1,
                "status": "received_partial"
            })\
            .eq("id", session_id)\
            .execute()
        
        # Update expected_inputs if domain is recognized
        if domain != "unknown" and confidence >= 0.5:
            expected_inputs = session.get("expected_inputs", {})
            domain_key = domain.replace("_payroll", "s_payroll")  # employees_payroll -> employees_payroll
            if domain_key in expected_inputs:
                expected_inputs[domain_key]["status"] = "received"
            elif domain.replace("_payroll", "") in expected_inputs:
                expected_inputs[domain.replace("_payroll", "")]["status"] = "received"
            
            supabase.table("client_intake_sessions")\
                .update({"expected_inputs": expected_inputs})\
                .eq("id", session_id)\
                .execute()
        
        # Audit log
        write_audit_log(
            org_id=org_id,
            user_id=user["id"],
            action="intake_file_uploaded",
            item_type="intake_file",
            item_id=file_id,
            details={
                "filename": upload_file.filename,
                "size": len(content),
                "hash": file_hash,
                "classification_domain": domain,
                "classification_confidence": confidence,
                "session_id": session_id
            }
        )
        
        uploaded_files.append({
            "id": file_id,
            "filename": upload_file.filename,
            "status": "uploaded",
            "classification_domain": domain,
            "classification_confidence": confidence,
            "classification_reason": reason
        })
    
    return {
        "success": True,
        "files": uploaded_files,
        "session_id": session_id
    }


@router.get("/sessions/{session_id}")
async def get_intake_session_detail(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """Get detailed intake session info."""
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    try:
        session_result = supabase.table("client_intake_sessions")\
            .select("*, client_companies(name, tax_year)")\
            .eq("id", session_id)\
            .eq("organization_id", org_id)\
            .single()\
            .execute()
        session = session_result.data
    except:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get files summary
    files_result = supabase.table("intake_files")\
        .select("id, original_filename, classification_domain, status, parse_summary")\
        .eq("client_intake_session_id", session_id)\
        .execute()
    
    # Get open mappings count
    mappings_result = supabase.table("intake_mappings")\
        .select("id")\
        .eq("status", "open")\
        .in_("intake_file_id", [f["id"] for f in (files_result.data or [])])\
        .execute()
    
    return {
        "success": True,
        "session": session,
        "files_count": len(files_result.data or []),
        "files_summary": files_result.data,
        "open_mappings_count": len(mappings_result.data or [])
    }


@router.get("/sessions/{session_id}/files")
async def list_session_files(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """List all files in an intake session."""
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify session access
    session_check = supabase.table("client_intake_sessions")\
        .select("id")\
        .eq("id", session_id)\
        .eq("organization_id", org_id)\
        .execute()
    
    if not session_check.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    files_result = supabase.table("intake_files")\
        .select("*")\
        .eq("client_intake_session_id", session_id)\
        .order("created_at", desc=True)\
        .execute()
    
    return {
        "success": True,
        "files": files_result.data or []
    }


@router.post("/files/{file_id}/override-classification")
async def override_file_classification(
    file_id: str,
    request: OverrideClassificationRequest,
    user: dict = Depends(get_current_user)
):
    """Override file classification."""
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify file access
    file_result = supabase.table("intake_files")\
        .select("*")\
        .eq("id", file_id)\
        .eq("organization_id", org_id)\
        .single()\
        .execute()
    
    if not file_result.data:
        raise HTTPException(status_code=404, detail="File not found")
    
    old_domain = file_result.data.get("classification_domain")
    
    # Update classification
    supabase.table("intake_files")\
        .update({
            "classification_domain": request.classification_domain,
            "classification_confidence": 1.0,
            "classification_reason": f"User override: {request.reason}",
            "classification_method": "user_override",
            "status": "classified"
        })\
        .eq("id", file_id)\
        .execute()
    
    # Audit log
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="intake_classification_overridden",
        item_type="intake_file",
        item_id=file_id,
        details={
            "old_domain": old_domain,
            "new_domain": request.classification_domain,
            "reason": request.reason
        }
    )
    
    return {"success": True, "new_domain": request.classification_domain}


@router.post("/sessions/{session_id}/process")
async def process_intake_session(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """Process all files in an intake session."""
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get session
    session_result = supabase.table("client_intake_sessions")\
        .select("*")\
        .eq("id", session_id)\
        .eq("organization_id", org_id)\
        .single()\
        .execute()
    
    if not session_result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_result.data
    client_id = session["client_company_id"]
    tax_years = session.get("tax_years", [])
    
    # Update session status
    supabase.table("client_intake_sessions")\
        .update({"status": "processing"})\
        .eq("id", session_id)\
        .execute()
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="intake_processing_started",
        item_type="client_intake_session",
        item_id=session_id,
        details={}
    )
    
    # Get files to process
    files_result = supabase.table("intake_files")\
        .select("*")\
        .eq("client_intake_session_id", session_id)\
        .in_("status", ["uploaded", "classified"])\
        .execute()
    
    process_results = []
    mappings_created = 0
    total_parsed = 0
    total_inserted = 0
    expected_inputs = session.get("expected_inputs", {})
    
    for file_data in (files_result.data or []):
        file_id = file_data["id"]
        domain = file_data.get("classification_domain", "unknown")
        filename = file_data.get("original_filename", "")
        
        if domain == "unknown":
            # Create domain assignment mapping
            supabase.table("intake_mappings").insert({
                "intake_file_id": file_id,
                "mapping_type": "sheet_domain_assignment",
                "status": "open",
                "prompt": f"Please classify the file '{filename}' into a data domain.",
                "options": list(DOMAIN_PARSERS.keys())
            }).execute()
            
            supabase.table("intake_files")\
                .update({"status": "needs_mapping"})\
                .eq("id", file_id)\
                .execute()
            
            mappings_created += 1
            process_results.append({
                "file_id": file_id,
                "filename": filename,
                "status": "needs_mapping",
                "reason": "Unknown domain - requires classification"
            })
            continue
        
        # Update status to parsing
        supabase.table("intake_files")\
            .update({"status": "parsing"})\
            .eq("id", file_id)\
            .execute()
        
        # Try to download file content from storage
        storage_path = file_data.get("storage_path", "")
        content, download_error = StorageService.download_file(supabase, storage_path)
        
        if not content:
            logger.warning(f"Could not download file from storage: {download_error}")
            # Fall back to using cached parse_summary if multi-sheet was analyzed
            cached_analysis = file_data.get("parse_summary", {}).get("multi_sheet_analysis")
            if cached_analysis:
                # Use cached multi-sheet analysis
                content = None  # Will use cached data
            else:
                # Mark as needing re-upload
                supabase.table("intake_files")\
                    .update({
                        "status": "failed",
                        "parse_error": f"File not in storage: {download_error}. Please re-upload."
                    })\
                    .eq("id", file_id)\
                    .execute()
                
                process_results.append({
                    "file_id": file_id,
                    "filename": filename,
                    "status": "failed",
                    "error": "File not available in storage - please re-upload"
                })
                continue
        
        # Parse with enhanced service
        try:
            mime_type = file_data.get("mime_type", "")
            
            if content:
                # Extract structured content
                extracted = extract_file_content(content, filename, mime_type)
                sheets_data = extracted.get("sheets_data", [])
            else:
                # Use cached multi-sheet analysis
                sheets_data = file_data.get("parse_summary", {}).get("multi_sheet_analysis", [])
            
            parse_result = {
                "success": False,
                "rows_parsed": 0,
                "rows_inserted": 0,
                "rows_updated": 0,
                "columns_recognized": [],
                "columns_missing": [],
                "mappings_needed": [],
                "errors": []
            }
            
            if sheets_data:
                # Multi-sheet or single-sheet parsing
                for sheet in sheets_data:
                    sheet_domain = sheet.get("domain", domain)
                    if sheet_domain == "unknown":
                        sheet_domain = domain
                    
                    sheet_result = parse_sheet_data(
                        sheet_data=sheet,
                        domain=sheet_domain,
                        org_id=org_id,
                        client_id=client_id,
                        tax_years=tax_years,
                        file_id=file_id,
                        supabase=supabase
                    )
                    
                    # Aggregate results
                    parse_result["rows_parsed"] += sheet_result.get("rows_parsed", 0)
                    parse_result["rows_inserted"] += sheet_result.get("rows_inserted", 0)
                    parse_result["rows_updated"] += sheet_result.get("rows_updated", 0)
                    parse_result["columns_recognized"].extend(sheet_result.get("columns_recognized", []))
                    parse_result["columns_missing"].extend(sheet_result.get("columns_missing", []))
                    parse_result["mappings_needed"].extend(sheet_result.get("mappings_needed", []))
                    parse_result["errors"].extend(sheet_result.get("errors", []))
                    
                    if sheet_result.get("success"):
                        parse_result["success"] = True
            else:
                parse_result["errors"].append("No sheet data available for parsing")
            
            # Create any needed mappings
            for mapping_info in parse_result.get("mappings_needed", []):
                supabase.table("intake_mappings").insert({
                    "intake_file_id": file_id,
                    "mapping_type": mapping_info.get("type", "column_mapping"),
                    "status": "open",
                    "prompt": mapping_info.get("prompt", "Mapping required"),
                    "options": mapping_info.get("options", []),
                    "context": mapping_info
                }).execute()
                mappings_created += 1
            
            status = "needs_mapping" if parse_result.get("mappings_needed") else ("parsed" if parse_result.get("success") else "failed")
            
            supabase.table("intake_files")\
                .update({
                    "status": status,
                    "parse_summary": parse_result,
                    "parse_error": "; ".join(parse_result.get("errors", [])) if parse_result.get("errors") else None
                })\
                .eq("id", file_id)\
                .execute()
            
            total_parsed += parse_result.get("rows_parsed", 0)
            total_inserted += parse_result.get("rows_inserted", 0)
            
            # Update expected inputs
            for key in expected_inputs:
                if domain.startswith(key.replace("_", "")) or key.startswith(domain.replace("_", "")):
                    expected_inputs[key]["status"] = "parsed" if status == "parsed" else "needs_mapping"
            
            process_results.append({
                "file_id": file_id,
                "filename": filename,
                "domain": domain,
                "status": status,
                "rows_parsed": parse_result.get("rows_parsed", 0),
                "rows_inserted": parse_result.get("rows_inserted", 0),
                "rows_updated": parse_result.get("rows_updated", 0)
            })
            
        except Exception as e:
            logger.error(f"Error processing file {file_id}: {e}")
            supabase.table("intake_files")\
                .update({
                    "status": "failed",
                    "parse_error": str(e)
                })\
                .eq("id", file_id)\
                .execute()
            
            process_results.append({
                "file_id": file_id,
                "filename": filename,
                "status": "failed",
                "error": str(e)
            })
        else:
            # Contract handling or unknown parser
            supabase.table("intake_files")\
                .update({"status": "parsed", "parse_summary": {"note": "Document stored for review"}})\
                .eq("id", file_id)\
                .execute()
            
            process_results.append({
                "file_id": file_id,
                "filename": filename,
                "domain": domain,
                "status": "parsed",
                "note": "Document stored for manual review"
            })
    
    # Update session
    final_status = "needs_mapping" if mappings_created > 0 else "received_partial"
    
    supabase.table("client_intake_sessions")\
        .update({
            "status": final_status,
            "expected_inputs": expected_inputs,
            "parsed_summary": {
                "total_files_processed": len(process_results),
                "total_rows_parsed": total_parsed,
                "total_records_inserted": total_inserted,
                "mappings_created": mappings_created
            }
        })\
        .eq("id", session_id)\
        .execute()
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="intake_processing_completed",
        item_type="client_intake_session",
        item_id=session_id,
        details={
            "files_processed": len(process_results),
            "mappings_created": mappings_created,
            "total_inserted": total_inserted
        }
    )
    
    return {
        "success": True,
        "session_status": final_status,
        "results": process_results,
        "mappings_created": mappings_created,
        "summary": {
            "total_rows_parsed": total_parsed,
            "total_records_inserted": total_inserted
        }
    }


@router.get("/files/{file_id}/mappings")
async def get_file_mappings(
    file_id: str,
    user: dict = Depends(get_current_user)
):
    """Get all mappings for a file."""
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Verify file access
    file_check = supabase.table("intake_files")\
        .select("id")\
        .eq("id", file_id)\
        .eq("organization_id", org_id)\
        .execute()
    
    if not file_check.data:
        raise HTTPException(status_code=404, detail="File not found")
    
    mappings_result = supabase.table("intake_mappings")\
        .select("*")\
        .eq("intake_file_id", file_id)\
        .order("created_at")\
        .execute()
    
    return {
        "success": True,
        "mappings": mappings_result.data or []
    }


@router.post("/mappings/{mapping_id}/resolve")
async def resolve_mapping(
    mapping_id: str,
    request: ResolveMappingRequest,
    user: dict = Depends(get_current_user)
):
    """Resolve a mapping task."""
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get mapping
    mapping_result = supabase.table("intake_mappings")\
        .select("*, intake_files(organization_id, client_intake_session_id)")\
        .eq("id", mapping_id)\
        .single()\
        .execute()
    
    if not mapping_result.data:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    mapping = mapping_result.data
    
    if mapping["intake_files"]["organization_id"] != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update mapping
    supabase.table("intake_mappings")\
        .update({
            "status": "resolved",
            "resolution": request.resolution,
            "resolved_by_user_id": user["id"],
            "resolved_at": datetime.utcnow().isoformat()
        })\
        .eq("id", mapping_id)\
        .execute()
    
    # Check if all mappings for file are resolved
    file_id = mapping["intake_file_id"]
    open_mappings = supabase.table("intake_mappings")\
        .select("id")\
        .eq("intake_file_id", file_id)\
        .eq("status", "open")\
        .execute()
    
    if not open_mappings.data:
        # All mappings resolved - update file status
        supabase.table("intake_files")\
            .update({"status": "parsed"})\
            .eq("id", file_id)\
            .execute()
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="intake_mapping_resolved",
        item_type="intake_mapping",
        item_id=mapping_id,
        details={
            "mapping_type": mapping.get("mapping_type"),
            "resolution": request.resolution
        }
    )
    
    return {"success": True, "remaining_mappings": len(open_mappings.data or [])}


@router.post("/sessions/{session_id}/finalize")
async def finalize_intake_session(
    session_id: str,
    request: FinalizeIntakeRequest,
    user: dict = Depends(get_current_user)
):
    """Finalize an intake session."""
    supabase = get_supabase()
    
    if not check_cpa_or_executive(user):
        raise HTTPException(status_code=403, detail="CPA or Executive role required")
    
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    # Get session
    session_result = supabase.table("client_intake_sessions")\
        .select("*, client_companies(purchased_sections)")\
        .eq("id", session_id)\
        .eq("organization_id", org_id)\
        .single()\
        .execute()
    
    if not session_result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_result.data
    expected_inputs = session.get("expected_inputs", {})
    purchased_sections = session.get("client_companies", {}).get("purchased_sections", {})
    
    # Check blockers
    blockers = []
    
    # Check for open mappings
    files_result = supabase.table("intake_files")\
        .select("id")\
        .eq("client_intake_session_id", session_id)\
        .execute()
    
    file_ids = [f["id"] for f in (files_result.data or [])]
    
    if file_ids:
        open_mappings = supabase.table("intake_mappings")\
            .select("id, prompt, mapping_type")\
            .eq("status", "open")\
            .in_("intake_file_id", file_ids)\
            .execute()
        
        if open_mappings.data:
            blockers.append({
                "type": "open_mappings",
                "count": len(open_mappings.data),
                "details": [m["prompt"][:50] for m in open_mappings.data[:5]]
            })
    
    # Check required categories
    has_section_41 = purchased_sections.get("section_41", True)
    
    if has_section_41:
        required_categories = ["employees_payroll", "projects"]
        for cat in required_categories:
            status = expected_inputs.get(cat, {}).get("status", "missing")
            if status not in ["parsed", "verified"]:
                blockers.append({
                    "type": "missing_required",
                    "category": cat,
                    "status": status
                })
    
    if blockers and request.confirm:
        return {
            "success": False,
            "can_finalize": False,
            "blockers": blockers
        }
    
    # Finalize
    supabase.table("client_intake_sessions")\
        .update({"status": "complete"})\
        .eq("id", session_id)\
        .execute()
    
    # Update client status
    supabase.table("client_companies")\
        .update({"engagement_status": "in_progress"})\
        .eq("id", session["client_company_id"])\
        .execute()
    
    # Get record counts
    client_id = session["client_company_id"]
    
    counts = {
        "employees": len((supabase.table("employees").select("id").eq("client_company_id", client_id).execute()).data or []),
        "projects": len((supabase.table("projects").select("id").eq("client_company_id", client_id).execute()).data or []),
        "time_logs": len((supabase.table("time_logs").select("id").eq("client_company_id", client_id).execute()).data or []),
        "vendors": len((supabase.table("contractors").select("id").eq("client_company_id", client_id).execute()).data or []),
        "expenses": len((supabase.table("expenses").select("id").eq("client_company_id", client_id).execute()).data or []),
        "supplies": len((supabase.table("supplies").select("id").eq("client_company_id", client_id).execute()).data or []),
    }
    
    write_audit_log(
        org_id=org_id,
        user_id=user["id"],
        action="intake_session_finalized",
        item_type="client_intake_session",
        item_id=session_id,
        details={
            "record_counts": counts,
            "expected_inputs_summary": {k: v.get("status") for k, v in expected_inputs.items()}
        }
    )
    
    return {
        "success": True,
        "status": "complete",
        "record_counts": counts,
        "next_action": "Run R&D Review"
    }


@router.get("/sessions/{session_id}/missing-inputs")
async def get_missing_inputs(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """Get missing inputs tracker for a session."""
    supabase = get_supabase()
    profile = get_user_profile(user["id"])
    org_id = profile.get("organization_id")
    
    session_result = supabase.table("client_intake_sessions")\
        .select("*, client_companies(purchased_sections)")\
        .eq("id", session_id)\
        .eq("organization_id", org_id)\
        .single()\
        .execute()
    
    if not session_result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_result.data
    expected_inputs = session.get("expected_inputs", {})
    purchased_sections = session.get("client_companies", {}).get("purchased_sections", {})
    
    # Build summary
    summary = []
    for category, info in expected_inputs.items():
        status = info.get("status", "missing")
        required = info.get("required", False)
        
        icon = "✓" if status in ["parsed", "verified"] else "⚠" if status == "needs_mapping" else "✗"
        
        summary.append({
            "category": category,
            "status": status,
            "required": required,
            "icon": icon,
            "description": info.get("description", "")
        })
    
    return {
        "success": True,
        "session_status": session.get("status"),
        "inputs": summary,
        "can_finalize": all(
            s["status"] in ["parsed", "verified"] 
            for s in summary 
            if s["required"]
        )
    }
