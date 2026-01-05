# TaxScape Pro: The Ultimate Master Documentation (Uncapped Edition)

TaxScape Pro is a world-class AI-powered ERP platform specifically engineered for CPA firms to dominate the R&D Tax Credit landscape. This document provides an exhaustive, line-by-line detailed explanation of every component, logic gate, and architectural decision within the system.

---

## 1. STRATEGIC OVERVIEW

### 1.1 The Problem
The IRS Section 41 and 174 R&D Tax Credit is the most audited and complex area of the tax code. CPAs traditionally struggle with:
- **Project Narratives**: Engineers are bad at writing tax-compliant descriptions.
- **Data Fragmentation**: Payroll is in CSVs, contractors are in ledgers, and technical evidence is in PDFs.
- **The Four-Part Test**: Proving qualification for every single dollar spent.

### 1.2 The Solution
TaxScape Pro uses a "Triple-Audit" approach:
1. **Financial Audit**: Automated spreadsheet parsing and QRE calculation.
2. **Technical Audit**: AI-driven evaluation against the IRS Four-Part Test.
3. **Firm Audit**: CPA review workflows and verification tasks.

---

## 2. SYSTEM ARCHITECTURE DEEP DIVE

### 2.1 Frontend: Next.js 14 + Tailwind + Supabase Auth
- **Dynamic Routing**: Uses the `/app` router for high-performance navigation.
- **State Management**: Orchestrated via React Hooks. The `portal/page.tsx` is the primary hub, managing 15+ complex state variables (clients, projects, sessions, active views, user roles).
- **Glass-Morphism UI**: A custom design system leveraging Tailwind's arbitrary values (e.g., `bg-white/10 backdrop-blur-md`) to create a professional, high-trust interface.

### 2.2 Backend: FastAPI (Python 3.11)
- **Asynchronous Execution**: Leveraging `asyncio` for non-blocking file processing.
- **API Versioning**: Standardized on a `/api` prefix for clear separation of concerns.
- **Authentication Dependency**: The `get_current_user` function verifies JWT tokens against Supabase's signing key, ensuring zero-trust security.

### 2.3 Database: Supabase (PostgreSQL)
- **Schema Management**: 10+ core tables including `profiles`, `organizations`, `client_companies`, `projects`, `employees`, `contractors`, `budgets`, `expenses`, `time_logs`, and `verification_tasks`.
- **Row-Level Security (RLS)**: Every table has strict policies. For example, a user can only see `projects` where `organization_id` matches their own `organization_id`.

---

## 3. COMPONENT & MODULE BREAKDOWN

### 3.1 `app/rd_parser.py`: The R&D Intelligence Module
This is the "Brain" of the financial engine.
- **Excel Parsing**: Uses `pandas` to read sheet names like `Projects`, `Employees`, `Vendors`, and `AP_Transactions`.
- **QRE Calculation Logic**:
    - **Wages**: `(W2 - StockComp - Severance) * Qualification%`.
    - **Contractors**: Applies the **65% Rule** automatically (IRS Sec 41 standard).
    - **Supplies**: Captures 100% of qualified materials.
- **Gap Analysis**: A recursive function that identifies if a project is missing a technical description or if an employee has 0% allocation but is listed in a project.

### 3.2 `app/chatbot_agent.py`: The AI Assistant
This module powers the top-right assistant.
- **Prompt Engineering**: Uses a dual-role prompt (Portal Guide + R&D Auditor).
- **JSON Extraction**: A robust regex-based logic to pull structured study data out of a chat conversation for Excel generation.
- **Context Injection**: Dynamically injects the last 5 projects and top 10 employees into the AI's short-term memory during the chat.

### 3.3 `app/main.py`: The API Backbone
Key Endpoints:
- `POST /api/rd-analysis/upload`: Ingests multi-part form data (Excel/PDF/DOCX).
- `POST /api/rd-analysis/parse/{session_id}`: Triggers the AI `evaluate_project_with_ai` function.
- `POST /organizations/{org_id}/invite`: Handles CPA team expansion.
- `GET /dashboard`: Aggregates the 7 core KPIs (Total Credit, Total QRE, Project Count, etc.).

---

## 4. DETAILED USER WORKFLOWS

### 4.1 The CPA Path (Multi-Tenant)
1. **Organization Creation**: The CPA creates their firm profile.
2. **Client Intake**: The CPA adds multiple client companies (Acme, TechCorp).
3. **Switch Context**: The top-right dropdown switches the entire portal's data to the selected client.
4. **Task Assignment**: The CPA creates a task: "Engineer John, please provide the experimentation process for Project X."

### 4.2 The AI Analysis Path
1. **Upload**: Drag-and-drop the "Sample Input" Excel.
2. **AI Evaluation**: The system calls Gemini to test each project against the Four-Part Test.
3. **Gap Resolution**: The user clicks on a "Missing Documentation" gap, uploads a PDF technical whitepaper, and clicks "Re-evaluate."
4. **Final Export**: The "Generate Study" button creates a multi-sheet Excel with the final calculations.

---

## 5. DATABASE SCHEMA & DATA DICTIONARY

| Table Name | Description | Key Fields |
| :--- | :--- | :--- |
| `organizations` | The CPA Firm | `id`, `name`, `slug`, `tax_year` |
| `profiles` | The User | `id`, `organization_id`, `role`, `is_admin` |
| `client_companies` | The Taxpayer | `id`, `organization_id`, `name`, `ein` |
| `projects` | The R&D Activities | `id`, `client_id`, `name`, `qualification_status` |
| `employees` | W-2 Personnel | `id`, `total_wages`, `qualified_percent` |
| `contractors` | 1099 Vendors | `id`, `cost`, `location` (US vs Foreign) |
| `verification_tasks` | Audit Workflow | `id`, `title`, `status` (pending, verified, denied) |

---

## 6. THE DYNAMIC DASHBOARD ENGINE
The dashboard (`portal/page.tsx`) uses a state-driven onboarding system:
1. **Step 0 (Client Setup)**: Active if `clientCompanies.length === 0`.
2. **Step 1 (Project ID)**: Active if `projects.length === 0`.
3. **Step 2 (AI Analysis)**: Active if `rdSession === null`.
4. **Step 3 (Final Review)**: Active if gaps are pending.

Each step is a clickable card that updates the `activeStep` and `view` states, instantly re-rendering the UI without a page reload.

---

## 7. INSTALLATION & DEPLOYMENT

### 7.1 Local Development
1. **Backend**: `uvicorn app.main:app --reload` (Port 8000).
2. **Frontend**: `npm run dev` (Port 3000).
3. **Env Vars**: Must have `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

### 7.2 Cloud Deployment (Railway)
- **Procfile**: `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Static Frontend**: Deployed via Vercel for edge-caching and global availability.

---

## 8. IRS COMPLIANCE & SAFETY
- **Foreign Research Filter**: Automatically flags contractor costs from outside the US as non-qualified.
- **High-Wage Guardrails**: Flags employees with >$500k in wages for manual audit review.
- **Experimentation Evidence**: Requires at least two methods of experimentation (Simulation, Trial & Error, Modeling) to pass Test 3.

---

## 9. TECHNICAL REFERENCE: API ENDPOINTS

### 9.1 Core API (`/api`)
- `GET /health`: System health check.
- `GET /dashboard`: Aggregated KPIs for the selected client.
- `POST /chat`: Authenticated chat with project/employee context.
- `POST /chat_with_files`: Advanced chat allowing PDF/Excel attachments for AI analysis.
- `POST /generate_study`: Converts structured AI output into a finalized Excel report.
- `GET /projects`: List all identified R&D projects.
- `POST /projects`: Manually create a new R&D project.
- `GET /employees`: List all staff and their qualification percentages.
- `POST /employees`: Add new staff member.
- `GET /contractors`: List all 1099 vendors.
- `POST /contractors`: Add new contractor.
- `POST /upload_payroll`: Batch upload employees from a CSV/Excel file.
- `POST /upload_contractors`: Batch upload contractors from a CSV/Excel file.

### 9.2 Organization API (`/organizations`)
- `GET /current`: Returns the user's active firm profile and role.
- `POST /`: Create a new CPA firm/Organization.
- `GET /{org_id}/members`: List all team members.
- `POST /{org_id}/invite`: Send invitation to a new team member.
- `GET /{org_id}/clients`: List all client companies managed by the firm.
- `POST /{org_id}/clients`: Add a new client company to the portfolio.
- `GET /{org_id}/tasks`: List all verification tasks across the organization.
- `POST /{org_id}/tasks`: Create a new verification task for a team member.
- `GET /{org_id}/overview`: Executive-level aggregated metrics for the firm.
- `GET /{org_id}/audit-log`: Detailed activity log for compliance.

### 9.3 R&D Analysis API (`/api/rd-analysis`)
- `POST /upload`: Upload technical and financial files to a temporary session.
- `POST /parse/{session_id}`: Start the automated AI parsing and qualification engine.
- `GET /session/{session_id}`: Retrieve the full results of an analysis session.
- `POST /session/{session_id}/evaluate-project/{project_id}`: Trigger a targeted AI re-evaluation of a single project.
- `POST /session/{session_id}/upload-gap/{gap_id}`: Resolve a "Documentation Gap" by uploading evidence.

---

## 10. TECHNICAL REFERENCE: CORE LOGIC FUNCTIONS

### 10.1 `app/rd_parser.py`
- `parse_excel_file()`: Robust multi-sheet Excel ingestion using Pandas.
- `extract_company_info()`: Heuristic-based extraction of company name and tax year from summary sheets.
- `calculate_qre_from_data()`: The core mathematical engine applying Section 41 rules to raw data.
- `evaluate_project_with_ai()`: Orchestrates the Gemini 1.5 Pro prompt to perform the Four-Part Test.
- `identify_gaps()`: Scans the dataset for missing technical descriptions or financial inconsistencies.
- `re_evaluate_project_with_gap_context()`: Performs high-context re-evaluations when new evidence is provided.

### 10.2 `app/chatbot_agent.py`
- `get_chat_response()`: Manages conversation flow and context injection.
- `extract_json_from_response()`: Advanced parsing of AI-generated JSON study summaries.

### 10.3 `app/excel_engine.py`
- `generate_excel_report()`: Generates the final multi-sheet, formulas-included Excel study for IRS submission.

---

## 11. SECURITY & DATA GOVERNANCE
- **JWT Verification**: Every request is verified against Supabase Auth.
- **Role-Based Access Control (RBAC)**:
    - `Executive`: Full access to firm metrics and billing.
    - `CPA`: Full access to client data and study generation.
    - `Engineer`: Access limited to project technical details and time logging.
- **Audit Trails**: Every modification to a project or financial record is captured in the `audit_logs` table.

---

## 12. PROJECT STRUCTURE & DEVELOPMENT TOOLS

### 12.1 Directory Layout
- `/app`: Backend FastAPI source code.
- `/frontend/src/app`: Next.js portal and marketing pages.
- `/frontend/src/components`: Reusable UI components (Dashboard, R&D Panels, Layout).
- `/frontend/src/lib`: API client and shared TypeScript types.
- `/supabase`: SQL migration scripts and schema definitions.
- `/scripts`: Python utilities for generating sample data.
- `/test_data`: Example inputs and generated output reports.

### 12.2 Development Scripts
- `scripts/create_sample_input.py`: Generates a mock R&D study Excel file for testing the parser.
- `test_rd_pipeline.py`: A CLI-based tool to run the entire analysis pipeline without the frontend.
- `run_local.sh`: A shell script to spin up both backend and frontend concurrently.

### 12.3 Key TypeScript Components
- `FileUploadZone.tsx`: Handles complex drag-and-drop and API progress tracking.
- `FourPartTestCard.tsx`: Visual representation of the AI's audit findings.
- `GapAnalysisPanel.tsx`: Interactive UI for resolving documentation deficiencies.

---

## 13. FUTURE ROADMAP (PLANNED)
- **State Tax Credits**: Expanding the calculation engine to support CA, NY, and TX state-specific R&D credits.
- **Direct IRS Integration**: Automated e-filing of Form 6765.
- **Time-Tracking Browser Extension**: Allowing engineers to log time directly from GitHub/Jira into the TaxScape portal.

---

*End of Master Documentation.*

