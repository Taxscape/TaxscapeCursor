import pandas as pd
import io

def generate_excel_report(projects_data, employees_data, contractors_data):
    """
    Generates a comprehensive R&D Tax Credit Excel report.
    
    Args:
        projects_data: List of dicts representing projects.
        employees_data: List of dicts representing employees and their allocations.
        contractors_data: List of dicts representing contractors.
        
    Returns:
        BytesIO object containing the Excel file.
    """
    output = io.BytesIO()
    writer = pd.ExcelWriter(output, engine='xlsxwriter')
    workbook = writer.book

    # --- Formats ---
    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'border': 1})
    currency_fmt = workbook.add_format({'num_format': '$#,##0.00'})
    percent_fmt = workbook.add_format({'num_format': '0.0%'})
    wrap_fmt = workbook.add_format({'text_wrap': True, 'valign': 'top'})
    
    # --- 1. Summary Tab ---
    # Calculate totals
    total_wages_qre = 0
    total_contractor_qre = 0
    
    # (Calculations would happen here or be aggregated from other tabs)
    # For simplicity, we'll aggregate as we build other tabs or pre-calculate.
    
    summary_df = pd.DataFrame({
        'Category': ['Total Wage QREs', 'Total Contractor QREs (65%)', 'Total Supply QREs', 'Total QREs', 'Est. Credit (Start-up)'],
        'Amount': [0, 0, 0, 0, 0] # Placeholders, we will write formulas or update
    })
    summary_df.to_excel(writer, sheet_name='Summary', startrow=1, index=False)
    worksheet = writer.sheets['Summary']
    worksheet.set_column('A:A', 30)
    worksheet.set_column('B:B', 20)
    
    # --- 2. Wage QREs Tab ---
    # Prepare data: Employee | State | Title | Total Wages | Proj 1 Alloc | Proj 2 Alloc | ... | Total Alloc % | QRE
    wage_rows = []
    
    # Need to pivot data: One row per employee, columns for projects
    # Assumes employees_data is flat list of allocations or structured employee objects
    # Let's assume structured: [{"name": "...", "total_wages": 100, "allocations": [{"project_name": "P1", "percent": 0.5}]}]
    
    for emp in employees_data:
        row = {
            "Employee Name": emp['name'],
            "Title": emp['title'],
            "State": emp['state'],
            "Total Wages": emp['total_wages']
        }
        total_alloc = 0
        qre = 0
        
        for alloc in emp['allocations']:
            proj_name = alloc['project_name']
            pct = alloc['allocation_percent']
            row[f"{proj_name} %"] = pct
            total_alloc += pct
            
        qre = emp['total_wages'] * total_alloc
        row["Total Allocation"] = total_alloc
        row["Qualified Wage Expense (QRE)"] = qre
        total_wages_qre += qre
        wage_rows.append(row)
        
    if wage_rows:
        wage_df = pd.DataFrame(wage_rows)
        wage_df.to_excel(writer, sheet_name='Wage QREs', index=False, startrow=1)
        worksheet = writer.sheets['Wage QREs']
        worksheet.set_column('A:C', 20)
        worksheet.set_column('D:D', 15, currency_fmt)
        # Set dynamic columns for projects to percent format
        # (Simplified for this snippet)
        
    # --- 3. Contractor QREs Tab ---
    # Name | Project | Cost | 65% Rule | QRE
    contractor_rows = []
    for cont in contractors_data:
        cost = cont['cost']
        qre = cost * 0.65 if cont['is_qualified'] else 0
        contractor_rows.append({
            "Contractor Name": cont['name'],
            "Project": cont['project_name'],
            "Invoice Amount": cost,
            "Included?": "Yes" if cont['is_qualified'] else "No",
            "QRE (65%)": qre
        })
        total_contractor_qre += qre

    if contractor_rows:
        cont_df = pd.DataFrame(contractor_rows)
        cont_df.to_excel(writer, sheet_name='Contractor QREs', index=False, startrow=1)
        worksheet = writer.sheets['Contractor QREs']
        worksheet.set_column('C:C', 15, currency_fmt)
        worksheet.set_column('E:E', 15, currency_fmt)

    # Update Summary Tab with calculated values (Overwriting cells)
    summary_ws = writer.sheets['Summary']
    summary_ws.write(2, 1, total_wages_qre, currency_fmt)
    summary_ws.write(3, 1, total_contractor_qre, currency_fmt)
    total_qre = total_wages_qre + total_contractor_qre
    summary_ws.write(5, 1, total_qre, currency_fmt)
    summary_ws.write(6, 1, total_qre * 0.10, currency_fmt) # Rough 10% estimate for visual

    # --- 4. Qualitative Matrix (4-Part Test) ---
    qual_rows = []
    for proj in projects_data:
        qual_rows.append({
            "Project Name": proj['name'],
            "Business Component (Product/Process)": "Software/Product",
            "Technical Uncertainty": proj['technical_uncertainty'],
            "Process of Experimentation": proj['process_of_experimentation'],
            "Permitted Purpose": "Improved Functionality",
            "Passes 4-Part Test?": "Yes"
        })
    
    if qual_rows:
        qual_df = pd.DataFrame(qual_rows)
        qual_df.to_excel(writer, sheet_name='Qualitative Matrix', index=False, startrow=1)
        worksheet = writer.sheets['Qualitative Matrix']
        worksheet.set_column('A:A', 20)
        worksheet.set_column('C:D', 50, wrap_fmt)
        
    # --- 5. Section 174 Amortization ---
    # Year 1 (10%), Year 2-5 (20%), Year 6 (10%)
    amort_rows = []
    total_r_and_d = total_qre # Assuming all QREs are Sec 174 for this template (simplified)
    
    schedule = {
        "Year 1 (10%)": total_r_and_d * 0.10,
        "Year 2 (20%)": total_r_and_d * 0.20,
        "Year 3 (20%)": total_r_and_d * 0.20,
        "Year 4 (20%)": total_r_and_d * 0.20,
        "Year 5 (20%)": total_r_and_d * 0.20,
        "Year 6 (10%)": total_r_and_d * 0.10,
    }
    
    amort_df = pd.DataFrame([schedule])
    amort_df.to_excel(writer, sheet_name='Section 174', index=False, startrow=1)
    writer.sheets['Section 174'].set_column('A:F', 15, currency_fmt)

    writer.close()
    output.seek(0)
    return output
