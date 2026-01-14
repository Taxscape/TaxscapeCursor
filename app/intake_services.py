"""
Intake Services Module
Enhanced functionality for intake ingestion:
- Supabase Storage integration
- AI classification fallback (Gemini)
- Multi-sheet Excel processing
- Robust file content parsing
"""

import os
import logging
import json
import hashlib
import re
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from io import BytesIO

logger = logging.getLogger(__name__)

# ============================================================================
# AI Classification Integration
# ============================================================================

# Try to import Gemini
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None

# Model configuration
AI_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
_ai_model = None
_ai_model_error = None
_gemini_configured = False

def _get_ai_model():
    """Get or create Gemini model for classification (singleton pattern)"""
    global _ai_model, _ai_model_error, _gemini_configured
    
    if _ai_model is not None:
        return _ai_model
    
    if _ai_model_error is not None:
        raise ValueError(_ai_model_error)
    
    if not GEMINI_AVAILABLE:
        _ai_model_error = "google-generativeai not installed"
        raise ValueError(_ai_model_error)
    
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        _ai_model_error = "No Gemini API key configured"
        raise ValueError(_ai_model_error)
    
    try:
        if not _gemini_configured:
            genai.configure(api_key=api_key)
            _gemini_configured = True
        _ai_model = genai.GenerativeModel(AI_MODEL_NAME)
        logger.info(f"Intake AI model initialized: {AI_MODEL_NAME}")
        return _ai_model
    except Exception as e:
        _ai_model_error = f"Failed to initialize AI model: {str(e)}"
        raise ValueError(_ai_model_error)


AI_CLASSIFICATION_PROMPT = """You are a document classification expert for R&D tax credit studies.

Analyze the following document information and classify it into ONE of these categories:

CATEGORIES:
- employees_payroll: Employee/payroll data with names, wages, titles, departments
- projects: R&D project lists with names, descriptions, technical details
- timesheets: Time allocation data showing hours spent by employees on projects
- vendors: Vendor/contractor lists with company names, services
- contracts: Contract documents, MSAs, SOWs, legal agreements
- ap_transactions: Accounts payable transactions, invoices, expenses
- supplies: R&D supplies and materials lists
- section_174_support: Section 174 questionnaire responses, R&E categorization
- unknown: Cannot determine with confidence

DOCUMENT INFORMATION:
Filename: {filename}
File type: {mime_type}
Sheet names (if Excel): {sheet_names}
Column headers: {columns}
Sample data rows: {sample_data}
Text snippet (if PDF/DOCX): {text_snippet}

RESPOND WITH ONLY A JSON OBJECT:
{{
  "domain": "the_category_name",
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of why this classification"
}}

Be conservative - if uncertain, use "unknown" rather than guessing."""


def classify_with_ai(
    filename: str,
    mime_type: str,
    sheet_names: List[str] = None,
    columns: List[str] = None,
    sample_data: List[List[str]] = None,
    text_snippet: str = None
) -> Tuple[str, float, str]:
    """
    Use AI to classify a document when heuristics are uncertain.
    Returns: (domain, confidence, reason)
    """
    try:
        model = _get_ai_model()
        
        prompt = AI_CLASSIFICATION_PROMPT.format(
            filename=filename,
            mime_type=mime_type,
            sheet_names=", ".join(sheet_names) if sheet_names else "N/A",
            columns=", ".join(columns[:20]) if columns else "N/A",
            sample_data=json.dumps(sample_data[:5]) if sample_data else "N/A",
            text_snippet=(text_snippet[:1000] if text_snippet else "N/A")
        )
        
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=500
            )
        )
        
        if response and response.text:
            # Parse JSON response
            text = response.text.strip()
            # Extract JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            
            result = json.loads(text)
            domain = result.get("domain", "unknown")
            confidence = float(result.get("confidence", 0.5))
            reason = f"AI classification: {result.get('reason', 'No reason provided')}"
            
            # Validate domain
            valid_domains = [
                "employees_payroll", "projects", "timesheets", "vendors",
                "contracts", "ap_transactions", "supplies", "section_174_support", "unknown"
            ]
            if domain not in valid_domains:
                domain = "unknown"
            
            return domain, confidence, reason
            
    except Exception as e:
        logger.error(f"AI classification failed: {e}")
    
    return "unknown", 0.0, f"AI classification unavailable: {str(e) if 'e' in dir() else 'model not initialized'}"


# ============================================================================
# Storage Service
# ============================================================================

class StorageService:
    """Handles file storage to Supabase Storage."""
    
    BUCKET_NAME = "intake-files"
    
    @staticmethod
    def upload_file(
        supabase,
        org_id: str,
        client_id: str,
        session_id: str,
        filename: str,
        content: bytes,
        content_type: str = None
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Upload file to Supabase Storage.
        
        Returns: (success, storage_path, error_message)
        """
        try:
            # Generate storage path
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            safe_filename = re.sub(r'[^\w\.\-]', '_', filename)
            storage_path = f"org/{org_id}/client/{client_id}/intake_session/{session_id}/{timestamp}_{safe_filename}"
            
            # Try to upload
            try:
                supabase.storage.from_(StorageService.BUCKET_NAME).upload(
                    storage_path,
                    content,
                    {"content-type": content_type or "application/octet-stream"}
                )
                logger.info(f"Uploaded file to storage: {storage_path}")
                return True, storage_path, None
            except Exception as upload_error:
                # Bucket might not exist - try to create it
                error_str = str(upload_error).lower()
                if "not found" in error_str or "bucket" in error_str:
                    logger.warning(f"Storage bucket may not exist, storing path only: {upload_error}")
                    return True, storage_path, "Storage bucket not configured - file path recorded only"
                raise upload_error
                
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
            return False, "", str(e)
    
    @staticmethod
    def download_file(
        supabase,
        storage_path: str
    ) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Download file from Supabase Storage.
        
        Returns: (content_bytes, error_message)
        """
        try:
            data = supabase.storage.from_(StorageService.BUCKET_NAME).download(storage_path)
            return data, None
        except Exception as e:
            logger.error(f"Storage download failed: {e}")
            return None, str(e)
    
    @staticmethod
    def get_signed_url(
        supabase,
        storage_path: str,
        expires_in: int = 3600
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Get a signed URL for file access.
        
        Returns: (url, error_message)
        """
        try:
            result = supabase.storage.from_(StorageService.BUCKET_NAME).create_signed_url(
                storage_path,
                expires_in
            )
            return result.get("signedURL"), None
        except Exception as e:
            logger.error(f"Failed to create signed URL: {e}")
            return None, str(e)


# ============================================================================
# Multi-Sheet Excel Processing
# ============================================================================

# Keywords for domain classification per sheet
SHEET_DOMAIN_KEYWORDS = {
    "employees_payroll": ["employee", "payroll", "wages", "w2", "salary", "personnel", "staff", "compensation"],
    "projects": ["project", "r&d", "research", "development", "initiative", "activities"],
    "timesheets": ["timesheet", "time", "hours", "allocation", "effort", "labor"],
    "vendors": ["vendor", "supplier", "contractor", "subcontractor"],
    "contracts": ["contract", "agreement", "msa", "sow"],
    "ap_transactions": ["ap", "accounts payable", "invoice", "transaction", "expense", "payment"],
    "supplies": ["supply", "supplies", "material", "purchase", "inventory", "consumable"],
    "section_174_support": ["174", "section 174", "r&e", "capitalization"]
}

COLUMN_DOMAIN_KEYWORDS = {
    "employees_payroll": {
        "strong": ["employee", "wages", "w2", "salary", "payroll", "compensation"],
        "weak": ["name", "title", "department", "state", "gross", "pay"]
    },
    "projects": {
        "strong": ["project", "uncertainty", "experimentation", "technical"],
        "weak": ["name", "description", "owner", "department", "start", "end"]
    },
    "timesheets": {
        "strong": ["hours", "timesheet", "allocation", "time_spent"],
        "weak": ["employee", "project", "period", "week", "date"]
    },
    "vendors": {
        "strong": ["vendor", "contractor", "supplier", "country", "ip_rights", "risk"],
        "weak": ["company", "service", "contract"]
    },
    "ap_transactions": {
        "strong": ["invoice", "gl_account", "account_number", "debit", "credit"],
        "weak": ["date", "amount", "vendor", "description"]
    },
    "supplies": {
        "strong": ["consumed", "capitalized", "supply", "material"],
        "weak": ["item", "amount", "cost", "project"]
    }
}


def classify_sheet_by_name(sheet_name: str) -> Tuple[str, float]:
    """Classify a sheet by its name."""
    sheet_lower = sheet_name.lower().strip()
    
    for domain, keywords in SHEET_DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if kw in sheet_lower:
                return domain, 0.85
    
    return "unknown", 0.0


def classify_sheet_by_columns(columns: List[str]) -> Tuple[str, float]:
    """Classify a sheet by its column headers."""
    if not columns:
        return "unknown", 0.0
    
    columns_lower = [c.lower() for c in columns]
    columns_text = ' '.join(columns_lower)
    
    scores = {}
    
    for domain, kw_dict in COLUMN_DOMAIN_KEYWORDS.items():
        score = 0
        strong_matches = 0
        weak_matches = 0
        
        for kw in kw_dict.get("strong", []):
            if any(kw in col for col in columns_lower):
                strong_matches += 1
        
        for kw in kw_dict.get("weak", []):
            if any(kw in col for col in columns_lower):
                weak_matches += 1
        
        score = (strong_matches * 0.3) + (weak_matches * 0.1)
        if score > 0:
            scores[domain] = score
    
    if scores:
        best_domain = max(scores, key=scores.get)
        confidence = min(scores[best_domain] + 0.3, 0.95)
        return best_domain, confidence
    
    return "unknown", 0.0


def process_multi_sheet_excel(content: bytes) -> List[Dict]:
    """
    Process an Excel file with multiple sheets.
    Returns classification and metadata for each sheet.
    """
    try:
        import pandas as pd
        
        buffer = BytesIO(content)
        xl = pd.ExcelFile(buffer)
        
        sheets_info = []
        
        for sheet_name in xl.sheet_names:
            try:
                # Read sheet
                df = pd.read_excel(buffer, sheet_name=sheet_name, nrows=20)
                columns = list(df.columns)
                preview = df.fillna('').astype(str).values.tolist()
                
                # Get row count (read full sheet for count)
                df_full = pd.read_excel(buffer, sheet_name=sheet_name)
                row_count = len(df_full)
                
                # Classify by sheet name
                domain_by_name, conf_by_name = classify_sheet_by_name(sheet_name)
                
                # Classify by columns
                domain_by_cols, conf_by_cols = classify_sheet_by_columns(columns)
                
                # Use best classification
                if conf_by_name >= conf_by_cols:
                    domain = domain_by_name
                    confidence = conf_by_name
                    reason = f"Sheet name '{sheet_name}' matches domain"
                else:
                    domain = domain_by_cols
                    confidence = conf_by_cols
                    reason = f"Column headers match domain: {columns[:5]}"
                
                sheets_info.append({
                    "sheet_name": sheet_name,
                    "columns": columns,
                    "preview": preview[:10],
                    "row_count": row_count,
                    "domain": domain,
                    "confidence": confidence,
                    "reason": reason
                })
                
            except Exception as e:
                logger.error(f"Error processing sheet {sheet_name}: {e}")
                sheets_info.append({
                    "sheet_name": sheet_name,
                    "error": str(e),
                    "domain": "unknown",
                    "confidence": 0.0,
                    "reason": f"Error reading sheet: {e}"
                })
        
        return sheets_info
        
    except Exception as e:
        logger.error(f"Error processing Excel file: {e}")
        return [{"error": str(e), "domain": "unknown", "confidence": 0.0}]


# ============================================================================
# Enhanced Classification Pipeline
# ============================================================================

def classify_file_enhanced(
    filename: str,
    mime_type: str,
    content: bytes = None,
    sheet_names: List[str] = None,
    columns: List[str] = None,
    text_snippet: str = None,
    preview_data: List[List[str]] = None,
    use_ai_fallback: bool = True,
    ai_threshold: float = 0.5
) -> Tuple[str, float, str, str]:
    """
    Enhanced file classification with AI fallback.
    
    Returns: (domain, confidence, reason, method)
    """
    # Step 1: Heuristic classification by filename
    filename_lower = filename.lower()
    patterns = [
        (r'payroll|employee|wage|w2|salary|personnel', 'employees_payroll', 0.75),
        (r'project|r&d|research|initiative', 'projects', 0.75),
        (r'timesheet|time\s*sheet|hours|allocation', 'timesheets', 0.75),
        (r'vendor|contractor|supplier', 'vendors', 0.75),
        (r'contract|agreement|msa|sow', 'contracts', 0.75),
        (r'ap[\s_-]?transaction|invoice|accounts[\s_-]?payable|expense', 'ap_transactions', 0.75),
        (r'supply|supplies|material|consumable', 'supplies', 0.75),
        (r'174|section[\s_-]?174|r&e', 'section_174_support', 0.75),
    ]
    
    domain = "unknown"
    confidence = 0.0
    reason = "No pattern match"
    method = "heuristic"
    
    for pattern, d, conf in patterns:
        if re.search(pattern, filename_lower):
            domain, confidence, reason = d, conf, f"Filename matches pattern: {pattern}"
            break
    
    # Step 2: Sheet name classification (if Excel)
    if sheet_names and confidence < 0.7:
        for sheet in sheet_names:
            sheet_domain, sheet_conf = classify_sheet_by_name(sheet)
            if sheet_conf > confidence:
                domain = sheet_domain
                confidence = sheet_conf
                reason = f"Sheet name '{sheet}' matches domain"
    
    # Step 3: Column classification
    if columns and confidence < 0.7:
        col_domain, col_conf = classify_sheet_by_columns(columns)
        if col_conf > confidence:
            domain = col_domain
            confidence = col_conf
            reason = f"Columns match domain: {columns[:5]}"
    
    # Step 4: PDF/DOCX text keyword analysis
    if text_snippet and confidence < 0.6:
        text_lower = text_snippet.lower()
        text_patterns = [
            ("statement of work", "contracts", 0.8),
            ("master services agreement", "contracts", 0.8),
            ("invoice", "ap_transactions", 0.7),
            ("payroll", "employees_payroll", 0.7),
            ("timesheet", "timesheets", 0.7),
            ("section 174", "section_174_support", 0.85),
            ("r&d tax credit", "projects", 0.6),
        ]
        for kw, d, conf in text_patterns:
            if kw in text_lower and conf > confidence:
                domain, confidence, reason = d, conf, f"Text contains keyword: '{kw}'"
    
    # Step 5: AI fallback if confidence is below threshold
    if use_ai_fallback and confidence < ai_threshold and GEMINI_AVAILABLE:
        logger.info(f"Using AI fallback for classification (heuristic confidence: {confidence})")
        try:
            ai_domain, ai_confidence, ai_reason = classify_with_ai(
                filename=filename,
                mime_type=mime_type,
                sheet_names=sheet_names,
                columns=columns,
                sample_data=preview_data,
                text_snippet=text_snippet
            )
            
            if ai_confidence > confidence:
                domain = ai_domain
                confidence = ai_confidence
                reason = ai_reason
                method = "ai"
                logger.info(f"AI classification result: {domain} ({confidence})")
                
        except Exception as e:
            logger.error(f"AI fallback failed: {e}")
            reason += f" (AI fallback unavailable: {e})"
    
    return domain, confidence, reason, method


# ============================================================================
# Robust Content Extraction
# ============================================================================

def extract_file_content(content: bytes, filename: str, mime_type: str) -> Dict:
    """
    Extract structured content from a file for parsing.
    Handles Excel, CSV, PDF, and DOCX.
    """
    result = {
        "success": False,
        "sheet_names": [],
        "columns": [],
        "preview": [],
        "text_snippet": "",
        "row_count": 0,
        "sheets_data": [],
        "error": None
    }
    
    try:
        if 'spreadsheet' in mime_type or filename.endswith(('.xlsx', '.xls')):
            # Excel file
            import pandas as pd
            buffer = BytesIO(content)
            xl = pd.ExcelFile(buffer)
            result["sheet_names"] = xl.sheet_names
            
            # Process all sheets
            sheets_data = []
            total_rows = 0
            
            for sheet_name in xl.sheet_names:
                try:
                    df = pd.read_excel(buffer, sheet_name=sheet_name)
                    sheets_data.append({
                        "sheet_name": sheet_name,
                        "columns": list(df.columns),
                        "data": df.fillna('').to_dict('records'),
                        "row_count": len(df)
                    })
                    total_rows += len(df)
                    
                    # Use first sheet for main preview
                    if not result["columns"]:
                        result["columns"] = list(df.columns)
                        result["preview"] = df.head(20).fillna('').astype(str).values.tolist()
                except Exception as e:
                    sheets_data.append({
                        "sheet_name": sheet_name,
                        "error": str(e)
                    })
            
            result["sheets_data"] = sheets_data
            result["row_count"] = total_rows
            result["success"] = True
            
        elif 'csv' in mime_type or filename.endswith('.csv'):
            # CSV file
            import pandas as pd
            try:
                text = content.decode('utf-8')
            except:
                text = content.decode('latin-1')
            
            from io import StringIO
            df = pd.read_csv(StringIO(text))
            result["columns"] = list(df.columns)
            result["preview"] = df.head(20).fillna('').astype(str).values.tolist()
            result["row_count"] = len(df)
            result["sheets_data"] = [{
                "sheet_name": "data",
                "columns": list(df.columns),
                "data": df.fillna('').to_dict('records'),
                "row_count": len(df)
            }]
            result["success"] = True
            
        elif 'pdf' in mime_type or filename.endswith('.pdf'):
            # PDF file
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(BytesIO(content))
                text = ""
                for page in reader.pages[:10]:
                    text += page.extract_text() or ""
                result["text_snippet"] = text[:5000]
                result["success"] = True
            except Exception as e:
                result["error"] = f"PDF extraction failed: {e}"
                
        elif 'document' in mime_type or filename.endswith(('.docx', '.doc')):
            # Word document
            try:
                from docx import Document
                doc = Document(BytesIO(content))
                text = "\n".join([p.text for p in doc.paragraphs])
                result["text_snippet"] = text[:5000]
                result["success"] = True
            except Exception as e:
                result["error"] = f"DOCX extraction failed: {e}"
        
        else:
            result["error"] = f"Unsupported file type: {mime_type}"
            
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Content extraction failed: {e}")
    
    return result


# ============================================================================
# Domain-Specific Parsers (Enhanced)
# ============================================================================

def parse_sheet_data(
    sheet_data: Dict,
    domain: str,
    org_id: str,
    client_id: str,
    tax_years: List[int],
    file_id: str,
    supabase
) -> Dict:
    """
    Parse a single sheet's data into the appropriate canonical table.
    """
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
    
    if not sheet_data.get("data"):
        result["errors"].append("No data in sheet")
        return result
    
    data = sheet_data["data"]
    columns = sheet_data.get("columns", [])
    result["rows_parsed"] = len(data)
    
    # Column mapping helpers
    def find_column(patterns: List[str]) -> Optional[str]:
        cols_lower = {c.lower(): c for c in columns}
        for pattern in patterns:
            for col_lower, col in cols_lower.items():
                if pattern in col_lower:
                    return col
        return None
    
    tax_year = str(tax_years[0]) if tax_years else str(datetime.now().year - 1)
    
    try:
        if domain == "employees_payroll":
            # Find columns
            name_col = find_column(['name', 'employee', 'full_name', 'employee_name'])
            wages_col = find_column(['wages', 'w2', 'salary', 'gross', 'compensation', 'total'])
            title_col = find_column(['title', 'job_title', 'position'])
            dept_col = find_column(['department', 'dept', 'division'])
            state_col = find_column(['state', 'location', 'work_state'])
            
            if name_col:
                result["columns_recognized"].append("name")
            else:
                result["columns_missing"].append("name")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains employee name?",
                    "options": columns,
                    "target_field": "name"
                })
                return result
            
            if wages_col:
                result["columns_recognized"].append("wages")
            
            inserted = 0
            updated = 0
            
            for row in data:
                name = str(row.get(name_col, '')).strip()
                if not name:
                    continue
                
                emp_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "name": name,
                    "tax_year": tax_year,
                    "source_intake_file_id": file_id
                }
                
                if title_col and row.get(title_col):
                    emp_data["title"] = str(row[title_col])
                if dept_col and row.get(dept_col):
                    emp_data["department"] = str(row[dept_col])
                if state_col and row.get(state_col):
                    emp_data["location_state"] = str(row[state_col])
                if wages_col and row.get(wages_col):
                    try:
                        emp_data["w2_wages"] = float(str(row[wages_col]).replace(',', '').replace('$', ''))
                    except:
                        pass
                
                # Upsert
                existing = supabase.table("employees").select("id").eq("client_company_id", client_id).eq("tax_year", tax_year).ilike("name", name).execute()
                
                if existing.data:
                    supabase.table("employees").update(emp_data).eq("id", existing.data[0]["id"]).execute()
                    updated += 1
                else:
                    supabase.table("employees").insert(emp_data).execute()
                    inserted += 1
            
            result["rows_inserted"] = inserted
            result["rows_updated"] = updated
            result["success"] = True
            
        elif domain == "projects":
            name_col = find_column(['project', 'project_name', 'name', 'title', 'initiative'])
            owner_col = find_column(['owner', 'project_owner', 'lead', 'manager'])
            desc_col = find_column(['description', 'desc', 'summary', 'overview'])
            
            if not name_col:
                result["columns_missing"].append("project_name")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains project name?",
                    "options": columns,
                    "target_field": "project_name"
                })
                return result
            
            result["columns_recognized"].append("project_name")
            
            inserted = 0
            updated = 0
            
            for row in data:
                name = str(row.get(name_col, '')).strip()
                if not name:
                    continue
                
                proj_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "name": name,
                    "tax_year": tax_year,
                    "source_intake_file_id": file_id
                }
                
                if owner_col and row.get(owner_col):
                    proj_data["project_owner"] = str(row[owner_col])
                if desc_col and row.get(desc_col):
                    proj_data["description"] = str(row[desc_col])
                
                existing = supabase.table("projects").select("id").eq("client_company_id", client_id).eq("tax_year", tax_year).ilike("name", name).execute()
                
                if existing.data:
                    supabase.table("projects").update(proj_data).eq("id", existing.data[0]["id"]).execute()
                    updated += 1
                else:
                    supabase.table("projects").insert(proj_data).execute()
                    inserted += 1
            
            result["rows_inserted"] = inserted
            result["rows_updated"] = updated
            result["success"] = True
            
        elif domain == "timesheets":
            emp_col = find_column(['employee', 'employee_name', 'name', 'person'])
            proj_col = find_column(['project', 'project_name', 'activity'])
            hours_col = find_column(['hours', 'time', 'total_hours', 'hrs'])
            
            if not hours_col:
                result["columns_missing"].append("hours")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains hours?",
                    "options": columns,
                    "target_field": "hours"
                })
                return result
            
            result["columns_recognized"].append("hours")
            
            # Get lookups
            employees = supabase.table("employees").select("id, name").eq("client_company_id", client_id).execute()
            emp_lookup = {e["name"].lower().strip(): e["id"] for e in (employees.data or [])}
            
            projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
            proj_lookup = {p["name"].lower().strip(): p["id"] for p in (projects.data or [])}
            
            inserted = 0
            unmatched_emp = set()
            unmatched_proj = set()
            
            for row in data:
                try:
                    hours = float(str(row.get(hours_col, 0)).replace(',', ''))
                except:
                    continue
                
                if hours <= 0:
                    continue
                
                time_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "hours": hours,
                    "tax_year": tax_year,
                    "source": "timesheet",
                    "source_intake_file_id": file_id
                }
                
                if emp_col and row.get(emp_col):
                    emp_name = str(row[emp_col]).strip().lower()
                    if emp_name in emp_lookup:
                        time_data["user_id"] = emp_lookup[emp_name]
                    else:
                        unmatched_emp.add(row[emp_col])
                
                if proj_col and row.get(proj_col):
                    proj_name = str(row[proj_col]).strip().lower()
                    if proj_name in proj_lookup:
                        time_data["project_id"] = proj_lookup[proj_name]
                    else:
                        unmatched_proj.add(row[proj_col])
                
                supabase.table("time_logs").insert(time_data).execute()
                inserted += 1
            
            if unmatched_emp:
                result["mappings_needed"].append({
                    "type": "employee_matching",
                    "prompt": "These employees could not be matched:",
                    "unmatched": list(unmatched_emp),
                    "options": list(emp_lookup.keys())
                })
            
            if unmatched_proj:
                result["mappings_needed"].append({
                    "type": "project_name_matching",
                    "prompt": "These projects could not be matched:",
                    "unmatched": list(unmatched_proj),
                    "options": list(proj_lookup.keys())
                })
            
            result["rows_inserted"] = inserted
            result["success"] = True
            
        elif domain == "vendors":
            name_col = find_column(['vendor', 'vendor_name', 'contractor', 'company', 'name'])
            country_col = find_column(['country', 'location', 'region'])
            
            if not name_col:
                result["columns_missing"].append("vendor_name")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains vendor name?",
                    "options": columns,
                    "target_field": "vendor_name"
                })
                return result
            
            result["columns_recognized"].append("vendor_name")
            
            inserted = 0
            updated = 0
            
            for row in data:
                name = str(row.get(name_col, '')).strip()
                if not name:
                    continue
                
                vendor_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "name": name,
                    "tax_year": tax_year,
                    "source_intake_file_id": file_id
                }
                
                country = str(row.get(country_col, 'United States')).strip() if country_col else 'United States'
                vendor_data["country"] = country or 'United States'
                
                if country.lower() not in ['united states', 'usa', 'us', '']:
                    vendor_data["is_foreign_research"] = True
                
                existing = supabase.table("contractors").select("id").eq("client_company_id", client_id).ilike("name", name).execute()
                
                if existing.data:
                    supabase.table("contractors").update(vendor_data).eq("id", existing.data[0]["id"]).execute()
                    updated += 1
                else:
                    supabase.table("contractors").insert(vendor_data).execute()
                    inserted += 1
            
            result["rows_inserted"] = inserted
            result["rows_updated"] = updated
            result["success"] = True
            
        elif domain == "ap_transactions":
            amount_col = find_column(['amount', 'total', 'debit', 'cost', 'value'])
            vendor_col = find_column(['vendor', 'vendor_name', 'payee', 'supplier'])
            desc_col = find_column(['description', 'memo', 'detail', 'line_description'])
            date_col = find_column(['date', 'transaction_date', 'invoice_date'])
            gl_col = find_column(['gl', 'gl_account', 'account', 'account_number'])
            
            if not amount_col:
                result["columns_missing"].append("amount")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains transaction amount?",
                    "options": columns,
                    "target_field": "amount"
                })
                return result
            
            result["columns_recognized"].append("amount")
            
            # Vendor lookup
            vendors = supabase.table("contractors").select("id, name").eq("client_company_id", client_id).execute()
            vendor_lookup = {v["name"].lower().strip(): v["id"] for v in (vendors.data or [])}
            
            inserted = 0
            unmatched_vendors = set()
            
            for row in data:
                try:
                    amount = float(str(row.get(amount_col, 0)).replace(',', '').replace('$', ''))
                except:
                    continue
                
                exp_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "amount": amount,
                    "tax_year": tax_year,
                    "rd_category": "needs_review",
                    "source_intake_file_id": file_id
                }
                
                if desc_col and row.get(desc_col):
                    exp_data["description"] = str(row[desc_col])
                
                if gl_col and row.get(gl_col):
                    exp_data["gl_account"] = str(row[gl_col])
                
                if vendor_col and row.get(vendor_col):
                    vname = str(row[vendor_col]).strip()
                    exp_data["vendor_name"] = vname
                    if vname.lower() in vendor_lookup:
                        exp_data["vendor_id"] = vendor_lookup[vname.lower()]
                    elif vname:
                        unmatched_vendors.add(vname)
                
                if date_col and row.get(date_col):
                    try:
                        import pandas as pd
                        date_val = pd.to_datetime(row[date_col])
                        exp_data["expense_date"] = date_val.strftime('%Y-%m-%d')
                    except:
                        pass
                
                supabase.table("expenses").insert(exp_data).execute()
                inserted += 1
            
            if unmatched_vendors:
                result["mappings_needed"].append({
                    "type": "vendor_matching",
                    "prompt": "These vendors could not be matched:",
                    "unmatched": list(unmatched_vendors),
                    "options": list(vendor_lookup.keys())
                })
            
            result["rows_inserted"] = inserted
            result["success"] = True
            
        elif domain == "supplies":
            item_col = find_column(['item', 'item_name', 'name', 'description', 'supply', 'material'])
            amount_col = find_column(['amount', 'cost', 'total', 'value', 'price'])
            proj_col = find_column(['project', 'project_name', 'related_project'])
            
            if not item_col:
                result["columns_missing"].append("item")
                result["mappings_needed"].append({
                    "type": "column_mapping",
                    "prompt": "Which column contains item/supply name?",
                    "options": columns,
                    "target_field": "item"
                })
                return result
            
            result["columns_recognized"].append("item")
            
            # Project lookup
            projects = supabase.table("projects").select("id, name").eq("client_company_id", client_id).execute()
            proj_lookup = {p["name"].lower().strip(): p["id"] for p in (projects.data or [])}
            
            inserted = 0
            
            for row in data:
                item = str(row.get(item_col, '')).strip()
                if not item:
                    continue
                
                supply_data = {
                    "organization_id": org_id,
                    "client_company_id": client_id,
                    "item_name": item,
                    "tax_year": tax_year,
                    "source_intake_file_id": file_id,
                    "qualification_status": "pending"
                }
                
                if amount_col and row.get(amount_col):
                    try:
                        supply_data["amount"] = float(str(row[amount_col]).replace(',', '').replace('$', ''))
                    except:
                        pass
                
                if proj_col and row.get(proj_col):
                    pname = str(row[proj_col]).strip()
                    supply_data["project_name"] = pname
                    if pname.lower() in proj_lookup:
                        supply_data["project_id"] = proj_lookup[pname.lower()]
                
                supabase.table("supplies").insert(supply_data).execute()
                inserted += 1
            
            result["rows_inserted"] = inserted
            result["success"] = True
            
        else:
            result["errors"].append(f"No parser for domain: {domain}")
            
    except Exception as e:
        result["errors"].append(str(e))
        logger.error(f"Parsing error for {domain}: {e}")
    
    return result
