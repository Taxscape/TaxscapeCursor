#!/usr/bin/env python3
"""
Create Sample R&D Tax Credit Input Excel File

Generates a realistic sample input file for testing the R&D analysis pipeline.
"""

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
import os

# Output path
OUTPUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "test_data", "sample_rd_input.xlsx")

# Ensure directory exists
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def create_sample_input():
    """Create a comprehensive sample R&D input Excel file."""
    
    # =========================================================================
    # PROJECTS SHEET - 6 projects with varied qualification levels
    # =========================================================================
    projects_data = [
        {
            "Project_ID": "P001",
            "Project_Name": "Machine Learning Fraud Detection System",
            "Category": "Software Development",
            "Description": "Development of a novel ML-based system to detect fraudulent transactions in real-time. The project involved creating custom neural network architectures and developing new feature engineering techniques to handle imbalanced datasets. Multiple iterations of model training and testing were performed to optimize detection accuracy while minimizing false positives.",
            "Budget": 450000,
            "Start_Date": "2024-01-15",
            "End_Date": "2024-12-31",
        },
        {
            "Project_ID": "P002",
            "Project_Name": "Cloud Infrastructure Auto-Scaling Engine",
            "Category": "Infrastructure",
            "Description": "Research and development of an intelligent auto-scaling system for cloud infrastructure. Technical uncertainty existed around predicting workload patterns and implementing predictive scaling algorithms. Experimentation included testing various time-series forecasting models and load balancing strategies.",
            "Budget": 320000,
            "Start_Date": "2024-02-01",
            "End_Date": "2024-11-30",
        },
        {
            "Project_ID": "P003",
            "Project_Name": "Natural Language Processing API",
            "Category": "AI/ML",
            "Description": "Development of a proprietary NLP engine for sentiment analysis and entity extraction. The project required extensive experimentation with transformer architectures and custom tokenization approaches for domain-specific vocabulary. Multiple prototypes were built and tested against benchmark datasets.",
            "Budget": 280000,
            "Start_Date": "2024-03-01",
            "End_Date": "2024-12-15",
        },
        {
            "Project_ID": "P004",
            "Project_Name": "Mobile App UI Redesign",
            "Category": "UI/UX",
            "Description": "Redesign of the mobile application user interface with new color schemes and improved navigation flow. Updated icons and fonts based on market research and user feedback.",
            "Budget": 75000,
            "Start_Date": "2024-04-01",
            "End_Date": "2024-06-30",
        },
        {
            "Project_ID": "P005",
            "Project_Name": "Real-Time Data Pipeline Architecture",
            "Category": "Data Engineering",
            "Description": "Design and implementation of a novel streaming data pipeline capable of processing 1M+ events per second. Technical challenges included achieving exactly-once semantics and sub-second latency. The team experimented with various message queue architectures and custom partitioning strategies.",
            "Budget": 390000,
            "Start_Date": "2024-01-01",
            "End_Date": "2024-10-31",
        },
        {
            "Project_ID": "P006",
            "Project_Name": "Cryptographic Key Management System",
            "Category": "Security",
            "Description": "Development of an advanced key management system implementing novel cryptographic protocols for secure key rotation and distribution. The project involved evaluating and testing various post-quantum cryptographic algorithms and developing custom secure enclaves for key storage.",
            "Budget": 410000,
            "Start_Date": "2024-02-15",
            "End_Date": "2024-12-31",
        },
    ]
    
    # =========================================================================
    # EMPLOYEES SHEET - 15 employees with R&D allocations
    # =========================================================================
    employees_data = [
        {"Employee_ID": "E001", "Name": "John Smith", "Job_Title": "Senior Software Engineer", "Department": "Engineering", "Location_State": "CA", "W2_Wages": 185000, "Stock_Compensation": 45000, "Severance": 0, "QRE_Wage_Base": 185000, "RD_Allocation_%": 85},
        {"Employee_ID": "E002", "Name": "Sarah Johnson", "Job_Title": "ML Engineer", "Department": "AI/ML", "Location_State": "CA", "W2_Wages": 195000, "Stock_Compensation": 60000, "Severance": 0, "QRE_Wage_Base": 195000, "RD_Allocation_%": 95},
        {"Employee_ID": "E003", "Name": "Michael Chen", "Job_Title": "Principal Engineer", "Department": "Engineering", "Location_State": "WA", "W2_Wages": 225000, "Stock_Compensation": 85000, "Severance": 0, "QRE_Wage_Base": 225000, "RD_Allocation_%": 70},
        {"Employee_ID": "E004", "Name": "Emily Davis", "Job_Title": "Data Scientist", "Department": "AI/ML", "Location_State": "CA", "W2_Wages": 165000, "Stock_Compensation": 35000, "Severance": 0, "QRE_Wage_Base": 165000, "RD_Allocation_%": 90},
        {"Employee_ID": "E005", "Name": "David Wilson", "Job_Title": "DevOps Engineer", "Department": "Infrastructure", "Location_State": "TX", "W2_Wages": 155000, "Stock_Compensation": 25000, "Severance": 0, "QRE_Wage_Base": 155000, "RD_Allocation_%": 60},
        {"Employee_ID": "E006", "Name": "Jessica Martinez", "Job_Title": "Security Engineer", "Department": "Security", "Location_State": "CA", "W2_Wages": 175000, "Stock_Compensation": 40000, "Severance": 0, "QRE_Wage_Base": 175000, "RD_Allocation_%": 80},
        {"Employee_ID": "E007", "Name": "Robert Taylor", "Job_Title": "Software Engineer II", "Department": "Engineering", "Location_State": "NY", "W2_Wages": 145000, "Stock_Compensation": 20000, "Severance": 0, "QRE_Wage_Base": 145000, "RD_Allocation_%": 75},
        {"Employee_ID": "E008", "Name": "Amanda Brown", "Job_Title": "Research Scientist", "Department": "AI/ML", "Location_State": "CA", "W2_Wages": 180000, "Stock_Compensation": 50000, "Severance": 0, "QRE_Wage_Base": 180000, "RD_Allocation_%": 100},
        {"Employee_ID": "E009", "Name": "Christopher Lee", "Job_Title": "Backend Developer", "Department": "Engineering", "Location_State": "WA", "W2_Wages": 140000, "Stock_Compensation": 15000, "Severance": 0, "QRE_Wage_Base": 140000, "RD_Allocation_%": 65},
        {"Employee_ID": "E010", "Name": "Nicole Garcia", "Job_Title": "QA Engineer", "Department": "Quality", "Location_State": "CA", "W2_Wages": 125000, "Stock_Compensation": 10000, "Severance": 0, "QRE_Wage_Base": 125000, "RD_Allocation_%": 40},
        {"Employee_ID": "E011", "Name": "James Anderson", "Job_Title": "Technical Lead", "Department": "Engineering", "Location_State": "CA", "W2_Wages": 210000, "Stock_Compensation": 70000, "Severance": 0, "QRE_Wage_Base": 210000, "RD_Allocation_%": 55},
        {"Employee_ID": "E012", "Name": "Lisa Thompson", "Job_Title": "Product Manager", "Department": "Product", "Location_State": "CA", "W2_Wages": 170000, "Stock_Compensation": 45000, "Severance": 0, "QRE_Wage_Base": 170000, "RD_Allocation_%": 20},
        {"Employee_ID": "E013", "Name": "Kevin White", "Job_Title": "Frontend Developer", "Department": "Engineering", "Location_State": "TX", "W2_Wages": 135000, "Stock_Compensation": 12000, "Severance": 0, "QRE_Wage_Base": 135000, "RD_Allocation_%": 50},
        {"Employee_ID": "E014", "Name": "Rachel Harris", "Job_Title": "Data Engineer", "Department": "Data Engineering", "Location_State": "CA", "W2_Wages": 160000, "Stock_Compensation": 30000, "Severance": 0, "QRE_Wage_Base": 160000, "RD_Allocation_%": 85},
        {"Employee_ID": "E015", "Name": "Thomas Clark", "Job_Title": "Systems Architect", "Department": "Architecture", "Location_State": "WA", "W2_Wages": 230000, "Stock_Compensation": 95000, "Severance": 0, "QRE_Wage_Base": 230000, "RD_Allocation_%": 45},
    ]
    
    # =========================================================================
    # VENDORS SHEET - 4 vendors with different risk/IP structures
    # =========================================================================
    vendors_data = [
        {"Vendor_ID": "V001", "Vendor_Name": "TechConsult LLC", "Risk_Bearer": "Company", "IP_Rights": "Company", "Country": "US", "Contract_Type": "Time & Materials", "Qualified_Sec41": "Yes"},
        {"Vendor_ID": "V002", "Vendor_Name": "CloudDev Solutions", "Risk_Bearer": "Company", "IP_Rights": "Shared", "Country": "US", "Contract_Type": "Fixed Price", "Qualified_Sec41": "Yes"},
        {"Vendor_ID": "V003", "Vendor_Name": "Offshore Systems Inc", "Risk_Bearer": "Vendor", "IP_Rights": "Vendor", "Country": "India", "Contract_Type": "Fixed Price", "Qualified_Sec41": "No"},
        {"Vendor_ID": "V004", "Vendor_Name": "AI Research Partners", "Risk_Bearer": "Company", "IP_Rights": "Company", "Country": "US", "Contract_Type": "Time & Materials", "Qualified_Sec41": "Yes"},
    ]
    
    # =========================================================================
    # AP_TRANSACTIONS SHEET - Contract research expenses
    # =========================================================================
    ap_transactions_data = [
        {"Transaction_ID": "AP001", "Vendor_ID": "V001", "Description": "ML model development consulting - fraud detection algorithms", "Amount": 85000, "Date": "2024-03-15", "Qualified_Contract_Research": "Yes", "QRE_Amount": 55250},
        {"Transaction_ID": "AP002", "Vendor_ID": "V001", "Description": "Cloud architecture design services", "Amount": 45000, "Date": "2024-05-20", "Qualified_Contract_Research": "Yes", "QRE_Amount": 29250},
        {"Transaction_ID": "AP003", "Vendor_ID": "V002", "Description": "NLP research and prototype development", "Amount": 120000, "Date": "2024-04-10", "Qualified_Contract_Research": "Yes", "QRE_Amount": 78000},
        {"Transaction_ID": "AP004", "Vendor_ID": "V003", "Description": "Offshore software development - UI components", "Amount": 65000, "Date": "2024-06-01", "Qualified_Contract_Research": "No", "QRE_Amount": 0},
        {"Transaction_ID": "AP005", "Vendor_ID": "V004", "Description": "Cryptographic algorithm research", "Amount": 95000, "Date": "2024-07-15", "Qualified_Contract_Research": "Yes", "QRE_Amount": 61750},
        {"Transaction_ID": "AP006", "Vendor_ID": "V004", "Description": "Security testing and penetration analysis", "Amount": 38000, "Date": "2024-08-20", "Qualified_Contract_Research": "Yes", "QRE_Amount": 24700},
        {"Transaction_ID": "AP007", "Vendor_ID": "V002", "Description": "Data pipeline optimization consulting", "Amount": 72000, "Date": "2024-09-10", "Qualified_Contract_Research": "Yes", "QRE_Amount": 46800},
    ]
    
    # =========================================================================
    # SUPPLIES SHEET - R&D supplies and cloud computing costs
    # =========================================================================
    supplies_data = [
        {"Supply_ID": "S001", "Description": "AWS GPU instances for ML model training", "Category": "Cloud Computing", "Amount": 45000, "Qualified_Supply": "Yes", "QRE_Amount": 45000},
        {"Supply_ID": "S002", "Description": "Google Cloud TPU usage for NLP experiments", "Category": "Cloud Computing", "Amount": 32000, "Qualified_Supply": "Yes", "QRE_Amount": 32000},
        {"Supply_ID": "S003", "Description": "Development server hardware", "Category": "Hardware", "Amount": 28000, "Qualified_Supply": "Yes", "QRE_Amount": 28000},
        {"Supply_ID": "S004", "Description": "Testing lab equipment", "Category": "Lab Equipment", "Amount": 15000, "Qualified_Supply": "Yes", "QRE_Amount": 15000},
        {"Supply_ID": "S005", "Description": "Office supplies", "Category": "General", "Amount": 3500, "Qualified_Supply": "No", "QRE_Amount": 0},
        {"Supply_ID": "S006", "Description": "Azure Kubernetes cluster for streaming tests", "Category": "Cloud Computing", "Amount": 22000, "Qualified_Supply": "Yes", "QRE_Amount": 22000},
        {"Supply_ID": "S007", "Description": "Prototype materials - security hardware tokens", "Category": "Prototype", "Amount": 8500, "Qualified_Supply": "Yes", "QRE_Amount": 8500},
    ]
    
    # =========================================================================
    # SUMMARY_STATISTICS SHEET - Company info
    # =========================================================================
    summary_data = [
        ["R&D TAX CREDIT STUDY", ""],
        ["", ""],
        ["Company Name", "TechInnovate Solutions Inc."],
        ["Industry", "Software & Technology"],
        ["Tax Year", 2024],
        ["EIN", "12-3456789"],
        ["Address", "100 Innovation Way, San Francisco, CA 94105"],
        ["", ""],
        ["Study Prepared By", "TaxScape Pro"],
        ["Date Prepared", "2024-12-26"],
    ]
    
    # =========================================================================
    # Write to Excel file
    # =========================================================================
    with pd.ExcelWriter(OUTPUT_FILE, engine='openpyxl') as writer:
        # Write each sheet
        pd.DataFrame(summary_data, columns=["Field", "Value"]).to_excel(
            writer, sheet_name="Summary_Statistics", index=False
        )
        pd.DataFrame(projects_data).to_excel(writer, sheet_name="Projects", index=False)
        pd.DataFrame(employees_data).to_excel(writer, sheet_name="Employees", index=False)
        pd.DataFrame(vendors_data).to_excel(writer, sheet_name="Vendors", index=False)
        pd.DataFrame(ap_transactions_data).to_excel(writer, sheet_name="AP_Transactions", index=False)
        pd.DataFrame(supplies_data).to_excel(writer, sheet_name="Supplies", index=False)
    
    print(f"✅ Sample input file created: {OUTPUT_FILE}")
    print(f"   - Projects: {len(projects_data)}")
    print(f"   - Employees: {len(employees_data)}")
    print(f"   - Vendors: {len(vendors_data)}")
    print(f"   - AP Transactions: {len(ap_transactions_data)}")
    print(f"   - Supplies: {len(supplies_data)}")
    
    return OUTPUT_FILE


if __name__ == "__main__":
    create_sample_input()




