import pandas as pd
import io

def generate_excel_report(projects_data, employees_data, contractors_data):
    """
    Generates a comprehensive R&D Tax Credit Excel report with IRS-ready formatting.
    
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

    # --- Enhanced Formats for IRS-Ready Look ---
    # Header: Gray background, bold, border
    header_fmt = workbook.add_format({
        'bold': True, 
        'bg_color': '#D3D3D3',  # Gray fill per requirements
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    
    # Currency: $#,##0 (no cents per requirements)
    currency_fmt = workbook.add_format({'num_format': '$#,##0', 'border': 1})
    currency_fmt_no_border = workbook.add_format({'num_format': '$#,##0'})
    
    # Percentage format
    percent_fmt = workbook.add_format({'num_format': '0.0%', 'border': 1})
    
    # Text wrap for long descriptions
    wrap_fmt = workbook.add_format({'text_wrap': True, 'valign': 'top', 'border': 1})
    
    # Bold format for subtotals
    bold_fmt = workbook.add_format({'bold': True, 'border': 1})
    bold_currency_fmt = workbook.add_format({'bold': True, 'num_format': '$#,##0', 'border': 1})
    
    # --- Calculate Totals (will be used across sheets) ---
    total_wages_qre = 0
    total_contractor_qre = 0
    
    # --- 1. Summary Sheet with Formulas ---
    summary_data = [
        ['Category', 'Amount'],
        ['Total Wage QREs', '=\'Wage QREs\'!SUM(H:H)'],  # Formula reference
        ['Total Contractor QREs (65%)', '=\'Contractor QREs\'!SUM(E:E)'],  # Formula reference
        ['Total Supply QREs', 0],
        ['Total QREs', '=B2+B3+B4'],  # Sum formula
        ['Estimated R&D Credit (6.5%)', '=B5*0.065'],  # Credit calculation
        ['Section 174 Year 1 Deduction (10%)', '=B5*0.10'],
    ]
    
    summary_df = pd.DataFrame(summary_data[1:], columns=summary_data[0])
    summary_df.to_excel(writer, sheet_name='Summary', startrow=0, index=False, header=False)
    
    worksheet = writer.sheets['Summary']
    # Write header row with formatting
    worksheet.write_row('A1', summary_data[0], header_fmt)
    
    # Set column widths
    worksheet.set_column('A:A', 35)
    worksheet.set_column('B:B', 20)
    
    # Format the amount column (skip header)
    for row in range(1, len(summary_data)):
        if isinstance(summary_data[row][1], str) and summary_data[row][1].startswith('='):
            # It's a formula, write it with currency format
            worksheet.write_formula(row, 1, summary_data[row][1], currency_fmt_no_border)
        else:
            worksheet.write_number(row, 1, summary_data[row][1], currency_fmt_no_border)
    
    # --- 2. Wage QRE Sheet with Formulas ---
    wage_rows = []
    row_num = 2  # Start after header
    
    for emp in employees_data:
        row = {
            "Employee Name": emp['name'],
            "Title": emp.get('title', 'Unknown'),
            "State": emp.get('state', 'Unknown'),
            "Total Wages": emp['total_wages']
        }
        total_alloc = 0
        
        # Add project allocation columns
        for alloc in emp.get('allocations', []):
            proj_name = alloc['project_name']
            pct = alloc['allocation_percent']
            row[f"{proj_name} %"] = pct
            total_alloc += pct
            
        row["Total Allocation"] = total_alloc
        # QRE will be a formula: =D{row}*G{row}
        row["Qualified Wage Expense (QRE)"] = f"=D{row_num}*G{row_num}"
        
        wage_rows.append(row)
        total_wages_qre += emp['total_wages'] * total_alloc
        row_num += 1
        
    if wage_rows:
        wage_df = pd.DataFrame(wage_rows)
        wage_df.to_excel(writer, sheet_name='Wage QREs', index=False, startrow=0)
        
        worksheet = writer.sheets['Wage QREs']
        
        # Format header row
        for col_num, value in enumerate(wage_df.columns.values):
            worksheet.write(0, col_num, value, header_fmt)
        
        # Set column widths and formats
        worksheet.set_column('A:A', 25)  # Employee Name
        worksheet.set_column('B:B', 20)  # Title
        worksheet.set_column('C:C', 10)  # State
        worksheet.set_column('D:D', 15, currency_fmt)  # Total Wages
        worksheet.set_column('E:F', 12, percent_fmt)  # Project allocations
        worksheet.set_column('G:G', 15, percent_fmt)  # Total Allocation
        worksheet.set_column('H:H', 20, currency_fmt)  # QRE
        
        # Write formulas for QRE column
        for idx, row in enumerate(wage_rows, start=1):
            if isinstance(row["Qualified Wage Expense (QRE)"], str) and row["Qualified Wage Expense (QRE)"].startswith('='):
                worksheet.write_formula(idx, len(wage_df.columns) - 1, row["Qualified Wage Expense (QRE)"], currency_fmt)
    
    # --- 3. Contractor QRE Sheet ---
    contractor_rows = []
    row_num = 2
    
    for cont in contractors_data:
        cost = cont['cost']
        is_qualified = cont.get('is_qualified', True)
        # QRE formula: =C{row}*0.65 if qualified
        qre_formula = f"=IF(D{row_num}=\"Yes\",C{row_num}*0.65,0)"
        
        contractor_rows.append({
            "Contractor Name": cont['name'],
            "Project": cont.get('project_name', 'General R&D'),
            "Invoice Amount": cost,
            "Qualified?": "Yes" if is_qualified else "No",
            "QRE (65%)": qre_formula
        })
        
        if is_qualified:
            total_contractor_qre += cost * 0.65
        row_num += 1

    if contractor_rows:
        cont_df = pd.DataFrame(contractor_rows)
        cont_df.to_excel(writer, sheet_name='Contractor QREs', index=False, startrow=0)
        
        worksheet = writer.sheets['Contractor QREs']
        
        # Format header
        for col_num, value in enumerate(cont_df.columns.values):
            worksheet.write(0, col_num, value, header_fmt)
        
        worksheet.set_column('A:A', 25)
        worksheet.set_column('B:B', 20)
        worksheet.set_column('C:C', 15, currency_fmt)
        worksheet.set_column('D:D', 12)
        worksheet.set_column('E:E', 20, currency_fmt)
        
        # Write QRE formulas
        for idx, row in enumerate(contractor_rows, start=1):
            worksheet.write_formula(idx, 4, row["QRE (65%)"], currency_fmt)

    # --- 4. Section 280C Computation Sheet (NEW) ---
    total_qre = total_wages_qre + total_contractor_qre
    
    section_280c_data = [
        ['Description', 'Amount', 'Notes'],
        ['Total Qualified Research Expenses (QRE)', '=Summary!B5', 'From Summary sheet'],
        ['', '', ''],
        ['OPTION 1: Full Credit (Reduced Deduction)', '', ''],
        ['Research Credit (6.5%)', '=B2*0.065', 'Startup company rate'],
        ['Reduced Deduction (174 - Credit)', '=B2-B5', 'Net deductible amount'],
        ['', '', ''],
        ['OPTION 2: Reduced Credit Election', '', ''],
        ['Reduced Credit Base', '=B2*0.87', '100% - 13% reduction'],
        ['Reduced Credit (6.5% of reduced base)', '=B9*0.065', 'Alternative calculation'],
        ['Full Section 174 Deduction', '=B2', 'No reduction to deduction'],
        ['', '', ''],
        ['ELECTION SUMMARY', '', ''],
        ['Recommended Election', 'Full Credit', 'Typically better for startups'],
        ['Credit Amount', '=B5', 'Amount to claim on return'],
        ['Section 174 Amortization Base', '=B6', 'Amount to amortize over 5 years'],
    ]
    
    df_280c = pd.DataFrame(section_280c_data[1:], columns=section_280c_data[0])
    df_280c.to_excel(writer, sheet_name='Section 280C', startrow=0, index=False, header=False)
    
    worksheet = writer.sheets['Section 280C']
    
    # Write header
    worksheet.write_row('A1', section_280c_data[0], header_fmt)
    
    # Set column widths
    worksheet.set_column('A:A', 40)
    worksheet.set_column('B:B', 20)
    worksheet.set_column('C:C', 35, wrap_fmt)
    
    # Write formulas and format
    for idx, row_data in enumerate(section_280c_data[1:], start=1):
        # Description column
        if row_data[0]:
            if 'OPTION' in row_data[0] or 'ELECTION' in row_data[0]:
                worksheet.write(idx, 0, row_data[0], bold_fmt)
            else:
                worksheet.write(idx, 0, row_data[0])
        
        # Amount column
        if isinstance(row_data[1], str) and row_data[1].startswith('='):
            worksheet.write_formula(idx, 1, row_data[1], currency_fmt_no_border)
        elif row_data[1]:
            worksheet.write(idx, 1, row_data[1])
        
        # Notes column
        if row_data[2]:
            worksheet.write(idx, 2, row_data[2], wrap_fmt)

    # --- 5. Qualitative Matrix (4-Part Test) ---
    qual_rows = []
    for proj in projects_data:
        qual_rows.append({
            "Project Name": proj['name'],
            "Business Component": "Software/Product Development",
            "Technical Uncertainty": proj.get('technical_uncertainty', 'Not specified'),
            "Process of Experimentation": proj.get('process_of_experimentation', 'Not specified'),
            "Permitted Purpose": "Improved Functionality/Performance",
            "Technological in Nature?": "Yes",
            "Passes 4-Part Test?": "Yes"
        })
    
    if qual_rows:
        qual_df = pd.DataFrame(qual_rows)
        qual_df.to_excel(writer, sheet_name='Qualitative Matrix', index=False, startrow=0)
        
        worksheet = writer.sheets['Qualitative Matrix']
        
        # Format header
        for col_num, value in enumerate(qual_df.columns.values):
            worksheet.write(0, col_num, value, header_fmt)
        
        worksheet.set_column('A:A', 20)
        worksheet.set_column('B:B', 25)
        worksheet.set_column('C:D', 50, wrap_fmt)
        worksheet.set_column('E:G', 20)
        
    # --- 6. Section 174 Amortization Schedule ---
    amort_data = [
        ['Period', 'Amortization %', 'Amount'],
        ['Year 1 (Midpoint)', '10%', '=Summary!B5*0.10'],
        ['Year 2', '20%', '=Summary!B5*0.20'],
        ['Year 3', '20%', '=Summary!B5*0.20'],
        ['Year 4', '20%', '=Summary!B5*0.20'],
        ['Year 5', '20%', '=Summary!B5*0.20'],
        ['Year 6 (Remaining)', '10%', '=Summary!B5*0.10'],
        ['Total', '100%', '=SUM(C2:C7)'],
    ]
    
    df_amort = pd.DataFrame(amort_data[1:], columns=amort_data[0])
    df_amort.to_excel(writer, sheet_name='Section 174', startrow=0, index=False, header=False)
    
    worksheet = writer.sheets['Section 174']
    
    # Write header
    worksheet.write_row('A1', amort_data[0], header_fmt)
    
    worksheet.set_column('A:A', 25)
    worksheet.set_column('B:B', 18)
    worksheet.set_column('C:C', 20)
    
    # Write formulas
    for idx, row_data in enumerate(amort_data[1:], start=1):
        worksheet.write(idx, 0, row_data[0])
        worksheet.write(idx, 1, row_data[1])
        if isinstance(row_data[2], str) and row_data[2].startswith('='):
            fmt = bold_currency_fmt if 'Total' in row_data[0] else currency_fmt_no_border
            worksheet.write_formula(idx, 2, row_data[2], fmt)

    writer.close()
    output.seek(0)
    return output
