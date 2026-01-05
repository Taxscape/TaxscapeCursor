#!/usr/bin/env python3
"""
R&D Tax Credit Pipeline End-to-End Test Script

This script tests the complete R&D analysis pipeline:
1. Load sample Excel input file
2. Parse and extract data
3. Run AI-powered four-part test evaluation (optional)
4. Generate comprehensive Excel output report
5. Validate all worksheets
"""

import os
import sys
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, List

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('test_rd_pipeline.log')
    ]
)
logger = logging.getLogger(__name__)

# Import R&D modules
from app.rd_parser import (
    parse_excel_file,
    extract_company_info,
    extract_projects,
    extract_employees,
    extract_vendors,
    extract_expenses,
    identify_gaps,
    create_analysis_session,
    RDAnalysisSession,
    check_ai_available,
)
from app.rd_excel_generator import generate_rd_workbook

# Paths
TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
SAMPLE_INPUT = os.path.join(TEST_DATA_DIR, "sample_rd_input.xlsx")
OUTPUT_DIR = os.path.join(TEST_DATA_DIR, "output")


def ensure_directories():
    """Ensure required directories exist."""
    os.makedirs(TEST_DATA_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def load_sample_file() -> bytes:
    """Load the sample input Excel file."""
    if not os.path.exists(SAMPLE_INPUT):
        logger.error(f"Sample input file not found: {SAMPLE_INPUT}")
        logger.info("Run 'python scripts/create_sample_input.py' first")
        sys.exit(1)
    
    with open(SAMPLE_INPUT, "rb") as f:
        content = f.read()
    
    logger.info(f"✅ Loaded sample file: {SAMPLE_INPUT} ({len(content):,} bytes)")
    return content


def test_parsing(file_content: bytes) -> Dict[str, Any]:
    """Test Excel parsing functionality."""
    logger.info("\n" + "="*60)
    logger.info("PHASE 1: PARSING EXCEL INPUT")
    logger.info("="*60)
    
    # Parse Excel file
    sheets = parse_excel_file(file_content, "sample_rd_input.xlsx")
    logger.info(f"✅ Parsed {len(sheets)} sheets: {list(sheets.keys())}")
    
    # Extract company info
    company_info = extract_company_info(sheets)
    logger.info(f"✅ Company Info: {company_info}")
    
    # Extract projects
    projects = extract_projects(sheets)
    logger.info(f"✅ Extracted {len(projects)} projects")
    for p in projects:
        logger.info(f"   - {p.project_id}: {p.project_name}")
    
    # Extract employees
    employees = extract_employees(sheets)
    logger.info(f"✅ Extracted {len(employees)} employees")
    total_wages = sum(e.w2_wages for e in employees)
    rd_employees = [e for e in employees if e.rd_allocation_percent > 0]
    logger.info(f"   - Total W2 Wages: ${total_wages:,.2f}")
    logger.info(f"   - R&D Employees: {len(rd_employees)}")
    
    # Extract vendors
    vendors = extract_vendors(sheets)
    logger.info(f"✅ Extracted {len(vendors)} vendors")
    qualified_vendors = [v for v in vendors if v.qualified]
    logger.info(f"   - Qualified vendors: {len(qualified_vendors)}")
    
    # Extract expenses
    expenses = extract_expenses(sheets, vendors)
    logger.info(f"✅ Extracted {len(expenses)} expenses")
    supply_expenses = [e for e in expenses if e.category == "supplies"]
    contract_expenses = [e for e in expenses if e.category == "contract_research"]
    logger.info(f"   - Supplies: {len(supply_expenses)}")
    logger.info(f"   - Contract Research: {len(contract_expenses)}")
    
    return {
        "sheets": sheets,
        "company_info": company_info,
        "projects": projects,
        "employees": employees,
        "vendors": vendors,
        "expenses": expenses,
    }


def test_analysis_session(file_content: bytes, use_ai: bool = False) -> RDAnalysisSession:
    """Test complete analysis session creation."""
    logger.info("\n" + "="*60)
    logger.info("PHASE 2: CREATING ANALYSIS SESSION")
    logger.info("="*60)
    
    # Check AI availability
    ai_status = check_ai_available()
    logger.info(f"AI Status: available={ai_status['available']}, error={ai_status.get('error')}")
    
    if use_ai and not ai_status['available']:
        logger.warning("⚠️ AI not available, proceeding without AI evaluation")
        use_ai = False
    
    # Create analysis session
    files = [{
        "filename": "sample_rd_input.xlsx",
        "content": file_content,
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }]
    
    logger.info(f"Creating analysis session (use_ai={use_ai})...")
    session = create_analysis_session(files, use_ai=use_ai)
    
    # Log session summary
    logger.info(f"✅ Session created: {session.session_id}")
    logger.info(f"   - Company: {session.company_name}")
    logger.info(f"   - Tax Year: {session.tax_year}")
    logger.info(f"   - Projects: {len(session.projects)}")
    logger.info(f"   - Employees: {session.total_employees} (R&D: {session.rd_employees})")
    logger.info(f"   - Vendors: {len(session.vendors)}")
    logger.info(f"   - Expenses: {len(session.expenses)}")
    logger.info(f"   - Gaps Identified: {len(session.gaps)}")
    
    # Log QRE summary
    logger.info("\n📊 QRE Summary:")
    logger.info(f"   - Wage QRE: ${session.wage_qre:,.2f}")
    logger.info(f"   - Supply QRE: ${session.supply_qre:,.2f}")
    logger.info(f"   - Contract QRE: ${session.contract_qre:,.2f}")
    logger.info(f"   - TOTAL QRE: ${session.total_qre:,.2f}")
    
    # Log project qualification results
    logger.info("\n📋 Project Qualification Results:")
    for proj in session.projects:
        fpt = proj.four_part_test
        status = "✅ QUALIFIED" if proj.qualified else "❌ NOT QUALIFIED"
        logger.info(f"   {proj.project_name}: {status}")
        logger.info(f"      - Permitted Purpose: {fpt.permitted_purpose.value}")
        logger.info(f"      - Elimination of Uncertainty: {fpt.elimination_uncertainty.value}")
        logger.info(f"      - Process of Experimentation: {fpt.process_experimentation.value}")
        logger.info(f"      - Technological in Nature: {fpt.technological_nature.value}")
        if proj.ai_summary:
            logger.info(f"      - AI Summary: {proj.ai_summary[:100]}...")
    
    # Log gaps
    if session.gaps:
        logger.info("\n⚠️ Information Gaps:")
        for gap in session.gaps:
            logger.info(f"   - [{gap.priority.upper()}] {gap.item_name}: {gap.description}")
    
    return session


def test_excel_generation(session: RDAnalysisSession) -> str:
    """Test Excel report generation."""
    logger.info("\n" + "="*60)
    logger.info("PHASE 3: GENERATING EXCEL OUTPUT")
    logger.info("="*60)
    
    # Generate workbook
    excel_bytes = generate_rd_workbook(session)
    logger.info(f"✅ Generated Excel workbook: {len(excel_bytes):,} bytes")
    
    # Save to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    company_name = (session.company_name or "RD_Study").replace(" ", "_")
    output_filename = f"{company_name}_RD_Credit_Study_{session.tax_year}_{timestamp}.xlsx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    with open(output_path, "wb") as f:
        f.write(excel_bytes)
    
    logger.info(f"✅ Saved output to: {output_path}")
    
    return output_path


def validate_output(output_path: str) -> bool:
    """Validate the generated Excel output."""
    logger.info("\n" + "="*60)
    logger.info("PHASE 4: VALIDATING OUTPUT")
    logger.info("="*60)
    
    import pandas as pd
    
    # Expected worksheets
    expected_sheets = [
        "Summary_Statistics",
        "Employees",
        "Timesheets",
        "Projects",
        "Project_Allocations",
        "Vendors",
        "AP_Transactions",
        "Supplies",
        "Automated_Review",
        "QRE_Summary_2024",
        "Credit_Computation_2024",
        "Sec_174_TieOut",
        "Sanity_Checks",
        "Form_6765_Computation",
        "Four_Part_Test_Details",
    ]
    
    try:
        xl = pd.ExcelFile(output_path)
        actual_sheets = xl.sheet_names
        
        logger.info(f"✅ Output file has {len(actual_sheets)} worksheets")
        
        all_present = True
        for sheet in expected_sheets:
            if sheet in actual_sheets:
                df = pd.read_excel(xl, sheet_name=sheet)
                rows = len(df)
                logger.info(f"   ✅ {sheet}: {rows} rows")
            else:
                logger.error(f"   ❌ {sheet}: MISSING")
                all_present = False
        
        # Check for any extra sheets
        extra_sheets = set(actual_sheets) - set(expected_sheets)
        if extra_sheets:
            logger.info(f"\n📋 Additional worksheets found: {extra_sheets}")
        
        return all_present
        
    except Exception as e:
        logger.error(f"❌ Validation failed: {e}")
        return False


def run_full_pipeline(use_ai: bool = False) -> bool:
    """Run the complete R&D analysis pipeline."""
    logger.info("\n" + "="*60)
    logger.info("R&D TAX CREDIT PIPELINE - END-TO-END TEST")
    logger.info("="*60)
    logger.info(f"Started at: {datetime.now().isoformat()}")
    logger.info(f"AI Evaluation: {'Enabled' if use_ai else 'Disabled'}")
    
    ensure_directories()
    
    try:
        # Step 1: Load sample file
        file_content = load_sample_file()
        
        # Step 2: Test parsing
        parsed_data = test_parsing(file_content)
        
        # Step 3: Create analysis session
        session = test_analysis_session(file_content, use_ai=use_ai)
        
        # Step 4: Generate Excel output
        output_path = test_excel_generation(session)
        
        # Step 5: Validate output
        valid = validate_output(output_path)
        
        # Summary
        logger.info("\n" + "="*60)
        logger.info("PIPELINE COMPLETE")
        logger.info("="*60)
        
        if valid:
            logger.info("✅ ALL TESTS PASSED")
            logger.info(f"\n📁 Output file: {output_path}")
            return True
        else:
            logger.error("❌ VALIDATION FAILED - Some worksheets may be missing")
            return False
            
    except Exception as e:
        logger.error(f"❌ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Test the R&D Tax Credit analysis pipeline end-to-end"
    )
    parser.add_argument(
        "--ai",
        action="store_true",
        help="Enable AI evaluation of projects (requires GOOGLE_CLOUD_API_KEY)"
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output"
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    success = run_full_pipeline(use_ai=args.ai)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

