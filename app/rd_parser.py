"""
R&D Tax Credit Analysis Parser

Handles parsing of Excel, PDF, and DOCX files for R&D tax credit analysis.
Uses Gemini for document understanding and four-part test evaluation.
"""

import os
import io
import json
import uuid
import logging
from typing import List, Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass, asdict
from datetime import datetime

import pandas as pd
from pydantic import BaseModel

# Try to import optional dependencies
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None

try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND DATA MODELS
# =============================================================================

class TestStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    NEEDS_REVIEW = "needs_review"
    MISSING_DATA = "missing_data"


class FourPartTestResult(BaseModel):
    """Results of the four-part test evaluation"""
    permitted_purpose: TestStatus = TestStatus.MISSING_DATA
    permitted_purpose_reasoning: str = ""
    elimination_uncertainty: TestStatus = TestStatus.MISSING_DATA
    elimination_uncertainty_reasoning: str = ""
    process_experimentation: TestStatus = TestStatus.MISSING_DATA
    process_experimentation_reasoning: str = ""
    technological_nature: TestStatus = TestStatus.MISSING_DATA
    technological_nature_reasoning: str = ""
    
    @property
    def pass_count(self) -> int:
        tests = [self.permitted_purpose, self.elimination_uncertainty, 
                 self.process_experimentation, self.technological_nature]
        return sum(1 for t in tests if t == TestStatus.PASS)
    
    @property
    def total_tests(self) -> int:
        return 4


class RDProject(BaseModel):
    """A project being evaluated for R&D tax credit qualification"""
    project_id: str
    project_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    four_part_test: FourPartTestResult = FourPartTestResult()
    confidence_score: float = 0.0
    missing_info: List[str] = []
    ai_summary: str = ""
    qualified: bool = False


class RDEmployee(BaseModel):
    """Employee data for R&D analysis"""
    employee_id: str
    name: str
    job_title: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    w2_wages: float = 0.0
    qre_wage_base: float = 0.0
    rd_allocation_percent: float = 0.0
    stock_compensation: float = 0.0
    severance: float = 0.0


class RDVendor(BaseModel):
    """Vendor data for contract research"""
    vendor_id: str
    vendor_name: str
    risk_bearer: str = ""
    ip_rights: str = ""
    country: str = ""
    qualified: bool = False


class RDExpense(BaseModel):
    """Expense/transaction data"""
    transaction_id: str
    vendor_id: Optional[str] = None
    description: str
    amount: float
    qre_amount: float = 0.0
    qualified: bool = False
    category: str = ""  # supplies, contract_research, wages


class GapItem(BaseModel):
    """Information gap that needs user attention"""
    gap_id: str
    category: str  # project, employee, vendor, documentation
    item_id: str
    item_name: str
    gap_type: str  # missing_data, needs_clarification, needs_documentation
    description: str
    required_info: List[str] = []
    priority: str = "medium"  # high, medium, low


class RDAnalysisSession(BaseModel):
    """Complete R&D analysis session"""
    session_id: str
    created_at: str
    company_name: str = ""
    industry: str = ""
    tax_year: int = 2024
    
    # Parsed data
    projects: List[RDProject] = []
    employees: List[RDEmployee] = []
    vendors: List[RDVendor] = []
    expenses: List[RDExpense] = []
    
    # Analysis results
    gaps: List[GapItem] = []
    total_qre: float = 0.0
    wage_qre: float = 0.0
    supply_qre: float = 0.0
    contract_qre: float = 0.0
    
    # Summary statistics
    total_employees: int = 0
    rd_employees: int = 0
    qualified_projects: int = 0
    
    # Status
    parsing_complete: bool = False
    analysis_complete: bool = False
    errors: List[str] = []


# =============================================================================
# FILE PARSERS
# =============================================================================

def parse_excel_file(file_content: bytes, filename: str) -> Dict[str, pd.DataFrame]:
    """Parse Excel file into dictionary of DataFrames by sheet name"""
    try:
        buffer = io.BytesIO(file_content)
        xl = pd.ExcelFile(buffer)
        
        sheets = {}
        for sheet_name in xl.sheet_names:
            try:
                df = pd.read_excel(xl, sheet_name=sheet_name)
                # Clean column names
                df.columns = [str(c).strip() for c in df.columns]
                sheets[sheet_name] = df
                logger.info(f"Parsed sheet '{sheet_name}' with {len(df)} rows")
            except Exception as e:
                logger.warning(f"Could not parse sheet '{sheet_name}': {e}")
        
        return sheets
    except Exception as e:
        logger.error(f"Error parsing Excel file {filename}: {e}")
        raise ValueError(f"Could not parse Excel file: {e}")


def parse_pdf_file(file_content: bytes, filename: str) -> str:
    """Extract text from PDF file"""
    if not PDF_AVAILABLE:
        raise ValueError("PDF parsing not available. Install PyPDF2.")
    
    try:
        buffer = io.BytesIO(file_content)
        reader = PyPDF2.PdfReader(buffer)
        
        text_parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        
        full_text = "\n\n".join(text_parts)
        logger.info(f"Extracted {len(full_text)} characters from PDF {filename}")
        return full_text
    except Exception as e:
        logger.error(f"Error parsing PDF file {filename}: {e}")
        raise ValueError(f"Could not parse PDF file: {e}")


def parse_docx_file(file_content: bytes, filename: str) -> str:
    """Extract text from DOCX file"""
    if not DOCX_AVAILABLE:
        raise ValueError("DOCX parsing not available. Install python-docx.")
    
    try:
        buffer = io.BytesIO(file_content)
        doc = Document(buffer)
        
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        
        # Also get text from tables
        for table in doc.tables:
            for row in table.rows:
                row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_text:
                    text_parts.append(" | ".join(row_text))
        
        full_text = "\n".join(text_parts)
        logger.info(f"Extracted {len(full_text)} characters from DOCX {filename}")
        return full_text
    except Exception as e:
        logger.error(f"Error parsing DOCX file {filename}: {e}")
        raise ValueError(f"Could not parse DOCX file: {e}")


# =============================================================================
# DATA EXTRACTION FROM EXCEL
# =============================================================================

def extract_company_info(sheets: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
    """Extract company information from Summary_Statistics sheet"""
    info = {
        "company_name": "",
        "industry": "",
        "tax_year": 2024,
    }
    
    if "Summary_Statistics" in sheets:
        df = sheets["Summary_Statistics"]
        # Try to find company info in first few rows
        for idx, row in df.head(10).iterrows():
            row_text = " ".join(str(v) for v in row.values if pd.notna(v))
            if "company" in row_text.lower() or "inc" in row_text.lower() or "corp" in row_text.lower():
                # Extract company name from first non-empty value
                for val in row.values:
                    if pd.notna(val) and len(str(val)) > 3:
                        info["company_name"] = str(val).strip()
                        break
    
    return info


def extract_projects(sheets: Dict[str, pd.DataFrame]) -> List[RDProject]:
    """Extract projects from Projects sheet"""
    projects = []
    
    if "Projects" not in sheets:
        return projects
    
    df = sheets["Projects"]
    
    for idx, row in df.iterrows():
        try:
            project = RDProject(
                project_id=str(row.get("Project_ID", f"P{idx}")),
                project_name=str(row.get("Project_Name", f"Project {idx}")),
                category=str(row.get("Category", "")) if pd.notna(row.get("Category")) else None,
                description=str(row.get("Description", "")) if pd.notna(row.get("Description")) else None,
                budget=float(row.get("Budget", 0)) if pd.notna(row.get("Budget")) else None,
            )
            
            # Extract existing four-part test flags if present
            fpt = FourPartTestResult()
            
            if pd.notna(row.get("Permitted_Purpose")):
                val = str(row.get("Permitted_Purpose")).lower()
                if val in ["true", "yes", "1", "pass"]:
                    fpt.permitted_purpose = TestStatus.PASS
                elif val in ["false", "no", "0", "fail"]:
                    fpt.permitted_purpose = TestStatus.FAIL
                    
            if pd.notna(row.get("Elimination_Uncertainty")):
                val = str(row.get("Elimination_Uncertainty")).lower()
                if val in ["true", "yes", "1", "pass"]:
                    fpt.elimination_uncertainty = TestStatus.PASS
                elif val in ["false", "no", "0", "fail"]:
                    fpt.elimination_uncertainty = TestStatus.FAIL
                    
            if pd.notna(row.get("Process_Experimentation")):
                val = str(row.get("Process_Experimentation")).lower()
                if val in ["true", "yes", "1", "pass"]:
                    fpt.process_experimentation = TestStatus.PASS
                elif val in ["false", "no", "0", "fail"]:
                    fpt.process_experimentation = TestStatus.FAIL
                    
            if pd.notna(row.get("Technological_Nature")):
                val = str(row.get("Technological_Nature")).lower()
                if val in ["true", "yes", "1", "pass"]:
                    fpt.technological_nature = TestStatus.PASS
                elif val in ["false", "no", "0", "fail"]:
                    fpt.technological_nature = TestStatus.FAIL
            
            project.four_part_test = fpt
            project.qualified = fpt.pass_count == 4
            
            projects.append(project)
        except Exception as e:
            logger.warning(f"Error extracting project at row {idx}: {e}")
    
    logger.info(f"Extracted {len(projects)} projects")
    return projects


def extract_employees(sheets: Dict[str, pd.DataFrame]) -> List[RDEmployee]:
    """Extract employees from Employees sheet"""
    employees = []
    
    if "Employees" not in sheets:
        return employees
    
    df = sheets["Employees"]
    
    for idx, row in df.iterrows():
        try:
            employee = RDEmployee(
                employee_id=str(row.get("Employee_ID", f"E{idx}")),
                name=str(row.get("Name", f"Employee {idx}")),
                job_title=str(row.get("Job_Title", "")) if pd.notna(row.get("Job_Title")) else None,
                department=str(row.get("Department", "")) if pd.notna(row.get("Department")) else None,
                location=str(row.get("Location", row.get("Location_State", ""))) if pd.notna(row.get("Location", row.get("Location_State"))) else None,
                w2_wages=float(row.get("W2_Wages", row.get("Box1_Wages", 0))) if pd.notna(row.get("W2_Wages", row.get("Box1_Wages"))) else 0.0,
                qre_wage_base=float(row.get("QRE_Wage_Base", 0)) if pd.notna(row.get("QRE_Wage_Base")) else 0.0,
                rd_allocation_percent=float(row.get("RD_Allocation_%", row.get("RD_Allocation_Percent", 0))) if pd.notna(row.get("RD_Allocation_%", row.get("RD_Allocation_Percent"))) else 0.0,
                stock_compensation=float(row.get("Stock_Compensation", 0)) if pd.notna(row.get("Stock_Compensation")) else 0.0,
                severance=float(row.get("Severance", 0)) if pd.notna(row.get("Severance")) else 0.0,
            )
            employees.append(employee)
        except Exception as e:
            logger.warning(f"Error extracting employee at row {idx}: {e}")
    
    logger.info(f"Extracted {len(employees)} employees")
    return employees


def extract_vendors(sheets: Dict[str, pd.DataFrame]) -> List[RDVendor]:
    """Extract vendors from Vendors sheet"""
    vendors = []
    
    if "Vendors" not in sheets:
        return vendors
    
    df = sheets["Vendors"]
    
    for idx, row in df.iterrows():
        try:
            risk_bearer = str(row.get("Risk_Bearer", "")).strip()
            ip_rights = str(row.get("IP_Rights", "")).strip()
            
            # Check if vendor qualifies for Sec 41 (company bears risk, company/shared IP)
            qualified = (
                risk_bearer.lower() in ["company", "taxpayer"] and
                ip_rights.lower() in ["company", "shared"]
            )
            
            vendor = RDVendor(
                vendor_id=str(row.get("Vendor_ID", f"V{idx}")),
                vendor_name=str(row.get("Vendor_Name", f"Vendor {idx}")),
                risk_bearer=risk_bearer,
                ip_rights=ip_rights,
                country=str(row.get("Country", row.get("Location", ""))) if pd.notna(row.get("Country", row.get("Location"))) else "",
                qualified=qualified,
            )
            vendors.append(vendor)
        except Exception as e:
            logger.warning(f"Error extracting vendor at row {idx}: {e}")
    
    logger.info(f"Extracted {len(vendors)} vendors")
    return vendors


def extract_expenses(sheets: Dict[str, pd.DataFrame], vendors: List[RDVendor]) -> List[RDExpense]:
    """Extract expenses from AP_Transactions and Supplies sheets"""
    expenses = []
    vendor_qualified = {v.vendor_id: v.qualified for v in vendors}
    
    # Contract research from AP_Transactions
    if "AP_Transactions" in sheets:
        df = sheets["AP_Transactions"]
        for idx, row in df.iterrows():
            try:
                vendor_id = str(row.get("Vendor_ID", ""))
                qualified = row.get("Qualified_Contract_Research", False)
                if isinstance(qualified, str):
                    qualified = qualified.lower() in ["true", "yes", "1"]
                
                # Also check vendor qualification
                if vendor_id and vendor_id in vendor_qualified:
                    qualified = qualified and vendor_qualified[vendor_id]
                
                expense = RDExpense(
                    transaction_id=str(row.get("Transaction_ID", f"AP{idx}")),
                    vendor_id=vendor_id if vendor_id else None,
                    description=str(row.get("Description", "")),
                    amount=float(row.get("Amount", 0)) if pd.notna(row.get("Amount")) else 0.0,
                    qre_amount=float(row.get("QRE_Amount", 0)) if pd.notna(row.get("QRE_Amount")) else 0.0,
                    qualified=qualified,
                    category="contract_research",
                )
                expenses.append(expense)
            except Exception as e:
                logger.warning(f"Error extracting AP transaction at row {idx}: {e}")
    
    # Supplies
    if "Supplies" in sheets:
        df = sheets["Supplies"]
        for idx, row in df.iterrows():
            try:
                qualified = row.get("Qualified_Supply", False)
                if isinstance(qualified, str):
                    qualified = qualified.lower() in ["true", "yes", "1"]
                
                expense = RDExpense(
                    transaction_id=str(row.get("Supply_ID", f"S{idx}")),
                    description=str(row.get("Item_Description", row.get("Description", ""))),
                    amount=float(row.get("Total_Amount", 0)) if pd.notna(row.get("Total_Amount")) else 0.0,
                    qre_amount=float(row.get("QRE_Amount", 0)) if pd.notna(row.get("QRE_Amount")) else 0.0,
                    qualified=qualified,
                    category="supplies",
                )
                expenses.append(expense)
            except Exception as e:
                logger.warning(f"Error extracting supply at row {idx}: {e}")
    
    logger.info(f"Extracted {len(expenses)} expenses")
    return expenses


def extract_qre_summary(sheets: Dict[str, pd.DataFrame]) -> Dict[str, float]:
    """Extract QRE summary totals"""
    summary = {
        "wage_qre": 0.0,
        "supply_qre": 0.0,
        "contract_qre": 0.0,
        "total_qre": 0.0,
    }
    
    if "QRE_Summary_2024" in sheets:
        df = sheets["QRE_Summary_2024"]
        if len(df) > 0:
            row = df.iloc[0]
            summary["wage_qre"] = float(row.get("Wage_QRE_2024", 0)) if pd.notna(row.get("Wage_QRE_2024")) else 0.0
            summary["supply_qre"] = float(row.get("Supplies_QRE_2024", 0)) if pd.notna(row.get("Supplies_QRE_2024")) else 0.0
            summary["contract_qre"] = float(row.get("Contract_QRE_2024", 0)) if pd.notna(row.get("Contract_QRE_2024")) else 0.0
            summary["total_qre"] = float(row.get("Total_QRE_2024", 0)) if pd.notna(row.get("Total_QRE_2024")) else 0.0
    
    return summary


# =============================================================================
# GAP ANALYSIS
# =============================================================================

def identify_gaps(session: RDAnalysisSession) -> List[GapItem]:
    """Identify information gaps that need user attention"""
    gaps = []
    
    # Check projects for missing four-part test data
    for project in session.projects:
        fpt = project.four_part_test
        missing = []
        
        if fpt.permitted_purpose == TestStatus.MISSING_DATA:
            missing.append("Permitted Purpose documentation")
        if fpt.elimination_uncertainty == TestStatus.MISSING_DATA:
            missing.append("Elimination of Uncertainty evidence")
        if fpt.process_experimentation == TestStatus.MISSING_DATA:
            missing.append("Process of Experimentation documentation")
        if fpt.technological_nature == TestStatus.MISSING_DATA:
            missing.append("Technological Nature justification")
        
        if missing:
            gaps.append(GapItem(
                gap_id=f"gap-{project.project_id}",
                category="project",
                item_id=project.project_id,
                item_name=project.project_name,
                gap_type="missing_data",
                description=f"Project needs additional documentation for four-part test",
                required_info=missing,
                priority="high" if len(missing) >= 3 else "medium",
            ))
        
        # Check for needs_review items
        needs_review = []
        if fpt.permitted_purpose == TestStatus.NEEDS_REVIEW:
            needs_review.append("Permitted Purpose needs clarification")
        if fpt.elimination_uncertainty == TestStatus.NEEDS_REVIEW:
            needs_review.append("Uncertainty elimination needs clarification")
        if fpt.process_experimentation == TestStatus.NEEDS_REVIEW:
            needs_review.append("Experimentation process needs clarification")
        if fpt.technological_nature == TestStatus.NEEDS_REVIEW:
            needs_review.append("Technological basis needs clarification")
        
        if needs_review:
            gaps.append(GapItem(
                gap_id=f"gap-review-{project.project_id}",
                category="project",
                item_id=project.project_id,
                item_name=project.project_name,
                gap_type="needs_clarification",
                description=f"Project needs additional clarification",
                required_info=needs_review,
                priority="medium",
            ))
    
    # Check vendors for risk/IP issues
    for vendor in session.vendors:
        if not vendor.qualified:
            gaps.append(GapItem(
                gap_id=f"gap-{vendor.vendor_id}",
                category="vendor",
                item_id=vendor.vendor_id,
                item_name=vendor.vendor_name,
                gap_type="needs_clarification",
                description=f"Vendor does not meet Sec.41 risk/IP requirements (Risk: {vendor.risk_bearer}, IP: {vendor.ip_rights})",
                required_info=["Contract showing company bears economic risk", "Documentation of IP ownership"],
                priority="medium",
            ))
    
    # Check employees with high stock comp or severance
    for emp in session.employees:
        issues = []
        if emp.w2_wages > 0:
            if emp.stock_compensation > emp.w2_wages * 0.5 or emp.stock_compensation > 200000:
                issues.append(f"Stock compensation ({emp.stock_compensation:,.0f}) may need review")
            if emp.severance > emp.w2_wages * 0.4:
                issues.append(f"Severance ({emp.severance:,.0f}) exceeds 40% of wages")
        
        if issues:
            gaps.append(GapItem(
                gap_id=f"gap-emp-{emp.employee_id}",
                category="employee",
                item_id=emp.employee_id,
                item_name=emp.name,
                gap_type="needs_clarification",
                description="Compensation items need review",
                required_info=issues,
                priority="low",
            ))
    
    logger.info(f"Identified {len(gaps)} gaps")
    return gaps


# =============================================================================
# GEMINI AI INTEGRATION
# =============================================================================

def get_gemini_model():
    """Get configured Gemini model"""
    if not GEMINI_AVAILABLE:
        raise ValueError("Gemini AI not available. Install google-generativeai.")
    
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_CLOUD_API_KEY or GEMINI_API_KEY not set")
    
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


def evaluate_project_with_ai(project: RDProject, additional_context: str = "") -> RDProject:
    """Use Gemini to evaluate a project against the four-part test"""
    try:
        model = get_gemini_model()
        
        prompt = f"""Evaluate this R&D project against the IRS Section 41 four-part test for R&D tax credits.

PROJECT INFORMATION:
- Name: {project.project_name}
- Category: {project.category or 'Not specified'}
- Description: {project.description or 'Not provided'}
- Budget: ${project.budget:,.2f if project.budget else 'Not specified'}

{f"ADDITIONAL CONTEXT:{chr(10)}{additional_context}" if additional_context else ""}

Evaluate each of the four tests and provide your assessment:

1. PERMITTED PURPOSE TEST: Does the project aim to develop new or improved function, performance, reliability, or quality of a business component?

2. ELIMINATION OF UNCERTAINTY TEST: Is there uncertainty concerning the development or improvement of the product at the outset?

3. PROCESS OF EXPERIMENTATION TEST: Does the taxpayer evaluate alternatives through modeling, simulation, systematic trial and error, or other methods?

4. TECHNOLOGICAL IN NATURE TEST: Does the process rely on principles of physical science, biological science, engineering, or computer science?

Respond in this exact JSON format:
{{
    "permitted_purpose": {{
        "status": "pass" | "fail" | "needs_review",
        "reasoning": "explanation"
    }},
    "elimination_uncertainty": {{
        "status": "pass" | "fail" | "needs_review",
        "reasoning": "explanation"
    }},
    "process_experimentation": {{
        "status": "pass" | "fail" | "needs_review",
        "reasoning": "explanation"
    }},
    "technological_nature": {{
        "status": "pass" | "fail" | "needs_review",
        "reasoning": "explanation"
    }},
    "confidence_score": 0.0 to 1.0,
    "summary": "brief overall assessment",
    "missing_info": ["list of missing information that would help evaluation"]
}}
"""
        
        response = model.generate_content(prompt)
        response_text = response.text
        
        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        
        result = json.loads(response_text.strip())
        
        # Update project with AI evaluation
        fpt = project.four_part_test
        
        status_map = {
            "pass": TestStatus.PASS,
            "fail": TestStatus.FAIL,
            "needs_review": TestStatus.NEEDS_REVIEW,
        }
        
        if "permitted_purpose" in result:
            fpt.permitted_purpose = status_map.get(result["permitted_purpose"]["status"], TestStatus.NEEDS_REVIEW)
            fpt.permitted_purpose_reasoning = result["permitted_purpose"].get("reasoning", "")
        
        if "elimination_uncertainty" in result:
            fpt.elimination_uncertainty = status_map.get(result["elimination_uncertainty"]["status"], TestStatus.NEEDS_REVIEW)
            fpt.elimination_uncertainty_reasoning = result["elimination_uncertainty"].get("reasoning", "")
        
        if "process_experimentation" in result:
            fpt.process_experimentation = status_map.get(result["process_experimentation"]["status"], TestStatus.NEEDS_REVIEW)
            fpt.process_experimentation_reasoning = result["process_experimentation"].get("reasoning", "")
        
        if "technological_nature" in result:
            fpt.technological_nature = status_map.get(result["technological_nature"]["status"], TestStatus.NEEDS_REVIEW)
            fpt.technological_nature_reasoning = result["technological_nature"].get("reasoning", "")
        
        project.four_part_test = fpt
        project.confidence_score = float(result.get("confidence_score", 0.5))
        project.ai_summary = result.get("summary", "")
        project.missing_info = result.get("missing_info", [])
        project.qualified = fpt.pass_count == 4
        
        logger.info(f"AI evaluated project {project.project_id}: {fpt.pass_count}/4 tests pass")
        
    except Exception as e:
        logger.error(f"Error evaluating project with AI: {e}")
        project.ai_summary = f"AI evaluation failed: {str(e)}"
    
    return project


def analyze_document_with_ai(text: str, context: str = "") -> Dict[str, Any]:
    """Use Gemini to extract structured information from document text"""
    try:
        model = get_gemini_model()
        
        prompt = f"""Analyze this document and extract relevant R&D tax credit information.

DOCUMENT TEXT:
{text[:10000]}  # Limit to first 10k chars

{f"CONTEXT: {context}" if context else ""}

Extract any information related to:
1. R&D projects and their technical details
2. Experimentation processes used
3. Technical uncertainties being addressed
4. Scientific/engineering principles applied

Respond in JSON format:
{{
    "projects_mentioned": [
        {{
            "name": "project name",
            "description": "description",
            "technical_goal": "goal",
            "uncertainty": "uncertainty addressed",
            "experimentation": "methods used"
        }}
    ],
    "key_findings": ["list of relevant findings"],
    "four_part_test_evidence": {{
        "permitted_purpose": "evidence found",
        "elimination_uncertainty": "evidence found",
        "process_experimentation": "evidence found",
        "technological_nature": "evidence found"
    }}
}}
"""
        
        response = model.generate_content(prompt)
        response_text = response.text
        
        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        
        return json.loads(response_text.strip())
        
    except Exception as e:
        logger.error(f"Error analyzing document with AI: {e}")
        return {"error": str(e)}


# =============================================================================
# MAIN ANALYSIS FUNCTION
# =============================================================================

def create_analysis_session(
    files: List[Dict[str, Any]],  # List of {"filename": str, "content": bytes, "content_type": str}
    use_ai: bool = True
) -> RDAnalysisSession:
    """Create and run a complete R&D analysis session"""
    
    session = RDAnalysisSession(
        session_id=str(uuid.uuid4()),
        created_at=datetime.utcnow().isoformat(),
    )
    
    all_sheets = {}
    document_texts = []
    
    # Parse all files
    for file_info in files:
        filename = file_info["filename"]
        content = file_info["content"]
        content_type = file_info.get("content_type", "")
        
        try:
            if filename.endswith((".xlsx", ".xls")):
                sheets = parse_excel_file(content, filename)
                all_sheets.update(sheets)
            elif filename.endswith(".pdf"):
                text = parse_pdf_file(content, filename)
                document_texts.append({"filename": filename, "text": text})
            elif filename.endswith(".docx"):
                text = parse_docx_file(content, filename)
                document_texts.append({"filename": filename, "text": text})
            elif filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
                all_sheets[filename] = df
        except Exception as e:
            session.errors.append(f"Error parsing {filename}: {str(e)}")
            logger.error(f"Error parsing {filename}: {e}")
    
    # Extract data from Excel sheets
    if all_sheets:
        company_info = extract_company_info(all_sheets)
        session.company_name = company_info.get("company_name", "")
        session.industry = company_info.get("industry", "")
        session.tax_year = company_info.get("tax_year", 2024)
        
        session.projects = extract_projects(all_sheets)
        session.employees = extract_employees(all_sheets)
        session.vendors = extract_vendors(all_sheets)
        session.expenses = extract_expenses(all_sheets, session.vendors)
        
        qre_summary = extract_qre_summary(all_sheets)
        session.wage_qre = qre_summary["wage_qre"]
        session.supply_qre = qre_summary["supply_qre"]
        session.contract_qre = qre_summary["contract_qre"]
        session.total_qre = qre_summary["total_qre"]
        
        # Calculate summary stats
        session.total_employees = len(session.employees)
        session.rd_employees = len([e for e in session.employees if e.rd_allocation_percent > 0])
    
    session.parsing_complete = True
    
    # Run AI evaluation on projects if enabled
    if use_ai and GEMINI_AVAILABLE:
        # Combine document texts for context
        additional_context = ""
        if document_texts:
            additional_context = "\n\n".join([f"From {d['filename']}:\n{d['text'][:2000]}" for d in document_texts])
        
        for i, project in enumerate(session.projects):
            try:
                session.projects[i] = evaluate_project_with_ai(project, additional_context)
            except Exception as e:
                logger.error(f"AI evaluation failed for project {project.project_id}: {e}")
        
        session.qualified_projects = len([p for p in session.projects if p.qualified])
    
    # Identify gaps
    session.gaps = identify_gaps(session)
    
    session.analysis_complete = True
    
    return session
