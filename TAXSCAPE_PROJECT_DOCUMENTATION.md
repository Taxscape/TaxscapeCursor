# TaxScape Pro - Complete Project Documentation

> **Version:** 1.0.0  
> **Last Updated:** January 2026  
> **Live URL:** https://www.taxscape.ai  
> **Backend URL:** https://taxscapecursor-production.up.railway.app

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Directory Structure](#directory-structure)
5. [Backend (Python/FastAPI)](#backend-pythonfastapi)
6. [Frontend (Next.js/React)](#frontend-nextjsreact)
7. [Database (Supabase/PostgreSQL)](#database-supabasepostgresql)
8. [Authentication](#authentication)
9. [API Endpoints](#api-endpoints)
10. [R&D Analysis Pipeline](#rd-analysis-pipeline)
11. [AI Integration](#ai-integration)
12. [Deployment](#deployment)
13. [Environment Variables](#environment-variables)
14. [Testing](#testing)

---

## Project Overview

TaxScape Pro is an enterprise-grade R&D Tax Credit Analysis platform designed for CPA firms and corporate tax departments. The platform uses AI to automate the evaluation of R&D projects against the IRS four-part test, generate comprehensive documentation, and calculate Qualified Research Expenses (QREs).

### Core Features

- **AI-Powered Four-Part Test Evaluation** - Automated assessment of R&D projects using Google Gemini
- **Excel Report Generation** - 13-worksheet comprehensive reports for audit defense
- **Multi-Tenant Organization Support** - CPA firms can manage multiple client companies
- **Role-Based Access Control (RBAC)** - Executive, CPA, and Engineer roles
- **Real-time Collaboration** - Supabase real-time subscriptions
- **Workflow Management** - Task assignment, evidence collection, and approval workflows
- **AI Copilot** - Context-aware assistant for R&D tax credit questions

---

## Technology Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Python 3.11** | Core backend language |
| **FastAPI** | REST API framework |
| **Uvicorn/Gunicorn** | ASGI/WSGI server |
| **Pandas** | Data manipulation |
| **OpenPyXL** | Excel file generation |
| **Google Gemini** | AI evaluation engine |
| **Supabase Python** | Database client |
| **SQLAlchemy** | ORM (legacy) |

### Frontend
| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework |
| **React 18** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **@tanstack/react-query** | Data fetching/caching |
| **Supabase JS** | Auth & realtime |
| **Zod** | Schema validation |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Vercel** | Frontend hosting |
| **Railway** | Backend hosting |
| **Supabase** | Database, Auth, Storage |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│                    https://www.taxscape.ai                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js Frontend)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Landing     │  │  Portal      │  │  Login/      │          │
│  │  Pages       │  │  Dashboard   │  │  Register    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST API + JWT
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              RAILWAY (FastAPI Backend)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  API Routes  │  │  R&D Parser  │  │  Excel Gen   │          │
│  │  /api/*      │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Chatbot     │  │  Copilot     │  │  Workflow    │          │
│  │  Agent       │  │  Engine      │  │  Engine      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└───────────────────────────┬─────────────────────────────────────┘
                            │ PostgreSQL + Realtime
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │  Auth        │  │  Storage     │          │
│  │  Database    │  │  (JWT)       │  │  (Files)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE GEMINI AI                             │
│                    (Four-Part Test Evaluation)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
TaxScapeCursor/
├── app/                          # Python backend
│   ├── __init__.py
│   ├── main.py                   # FastAPI app & routes (3580 lines)
│   ├── models.py                 # SQLAlchemy models
│   ├── schemas.py                # Pydantic schemas
│   ├── database.py               # Database connection
│   ├── supabase_client.py        # Supabase client
│   ├── auth.py                   # Authentication utilities
│   ├── chatbot_agent.py          # AI chatbot logic
│   ├── copilot_engine.py         # Copilot AI assistant
│   ├── excel_engine.py           # Legacy Excel generation
│   ├── rd_parser.py              # R&D analysis parser (1212 lines)
│   ├── rd_excel_generator.py     # R&D Excel report generator (1141 lines)
│   ├── router_utils.py           # Route utilities
│   ├── task_engine.py            # Task management
│   ├── workflow_engine.py        # Workflow state machine
│   └── assets/                   # Static assets
│
├── frontend/                     # Next.js frontend
│   ├── src/
│   │   ├── app/                  # Next.js app router
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── providers.tsx     # QueryClientProvider
│   │   │   ├── globals.css       # Global styles
│   │   │   ├── error.tsx         # Error boundary
│   │   │   ├── (marketing)/      # Marketing pages
│   │   │   │   ├── page.tsx      # Landing page
│   │   │   │   ├── about/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── portal/page.tsx   # Main dashboard
│   │   │   └── admin/page.tsx
│   │   │
│   │   ├── components/           # React components
│   │   │   ├── copilot/          # AI copilot
│   │   │   │   ├── CopilotPanel.tsx
│   │   │   │   └── InlineAssist.tsx
│   │   │   ├── rd/               # R&D analysis
│   │   │   │   ├── FileUploadZone.tsx
│   │   │   │   ├── FourPartTestCard.tsx
│   │   │   │   └── GapAnalysisPanel.tsx
│   │   │   ├── tasks/            # Task management
│   │   │   │   ├── TaskBoard.tsx
│   │   │   │   └── TaskCreateModal.tsx
│   │   │   ├── workspace/        # Data workspace
│   │   │   │   ├── VirtualTable.tsx
│   │   │   │   ├── GridView.tsx
│   │   │   │   ├── RecordView.tsx
│   │   │   │   └── EvidenceViewer.tsx
│   │   │   └── layout/
│   │   │       └── Icons.tsx
│   │   │
│   │   ├── context/              # React contexts
│   │   │   ├── auth-context.tsx
│   │   │   ├── data-workspace-context.tsx
│   │   │   └── query-client.ts
│   │   │
│   │   ├── lib/                  # Utilities
│   │   │   ├── api.ts            # API client (2099 lines)
│   │   │   ├── types.ts          # TypeScript types
│   │   │   ├── schemas.ts        # Zod schemas
│   │   │   ├── supabase.ts       # Supabase client
│   │   │   ├── supabase-server.ts
│   │   │   ├── performance.ts
│   │   │   └── prefetch.ts
│   │   │
│   │   └── middleware.ts         # Auth middleware
│   │
│   ├── public/fonts/             # Custom fonts
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── vercel.json
│
├── supabase/                     # Database migrations
│   ├── COMPLETE_MIGRATION.sql    # Master migration (1369 lines)
│   ├── schema.sql                # Base schema
│   ├── migration_copilot_v1.sql
│   ├── migration_cpa_centric.sql
│   ├── migration_rbac_tasks_v1.sql
│   ├── migration_reactive_workspace.sql
│   ├── migration_workflow_v1.sql
│   └── fix_profiles_rls.sql
│
├── scripts/
│   └── create_sample_input.py    # Test data generator
│
├── test_data/                    # Test files
│   ├── sample_rd_input.xlsx
│   └── output/                   # Generated reports
│
├── requirements.txt              # Python dependencies
├── Procfile                      # Railway deployment
├── railway.toml                  # Railway config
├── run_local.sh                  # Local dev script
└── test_rd_pipeline.py           # E2E test script
```

---

## Backend (Python/FastAPI)

### Main Application (`app/main.py`)

The backend is a FastAPI application with the following key components:

#### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # All origins for Railway
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Authentication Dependency
```python
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Supabase JWT token."""
    # Validates Bearer token from Supabase
    # Returns user_data dict with id, email, etc.
```

### Models (`app/models.py`)

SQLAlchemy models for legacy local database:

| Model | Fields |
|-------|--------|
| **User** | id, email, hashed_password, company_name |
| **Project** | id, user_id, name, description, technical_uncertainty, process_of_experimentation |
| **Employee** | id, user_id, name, title, total_wages, state |
| **ProjectAllocation** | id, employee_id, project_id, allocation_percent |
| **Contractor** | id, name, cost, is_qualified, project_id |

### R&D Parser (`app/rd_parser.py`)

Handles document parsing and AI evaluation:

#### Data Models
```python
class TestStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    NEEDS_REVIEW = "needs_review"
    MISSING_DATA = "missing_data"

class FourPartTestResult(BaseModel):
    permitted_purpose: TestStatus
    permitted_purpose_reasoning: str
    elimination_uncertainty: TestStatus
    elimination_uncertainty_reasoning: str
    process_experimentation: TestStatus
    process_experimentation_reasoning: str
    technological_nature: TestStatus
    technological_nature_reasoning: str

class RDProject(BaseModel):
    project_id: str
    project_name: str
    category: Optional[str]
    description: Optional[str]
    budget: Optional[float]
    four_part_test: FourPartTestResult
    confidence_score: float
    missing_info: List[str]
    ai_summary: str
    qualified: bool

class RDEmployee(BaseModel):
    employee_id: str
    name: str
    job_title: Optional[str]
    department: Optional[str]
    location: Optional[str]
    w2_wages: float
    qre_wage_base: float
    rd_allocation_percent: float
    stock_compensation: float
    severance: float

class RDVendor(BaseModel):
    vendor_id: str
    vendor_name: str
    risk_bearer: str
    ip_rights: str
    country: str
    qualified: bool

class RDExpense(BaseModel):
    transaction_id: str
    vendor_id: Optional[str]
    description: str
    amount: float
    qre_amount: float
    qualified: bool
    category: str  # supplies, contract_research, wages

class RDAnalysisSession(BaseModel):
    session_id: str
    created_at: str
    company_name: str
    industry: str
    tax_year: int
    projects: List[RDProject]
    employees: List[RDEmployee]
    vendors: List[RDVendor]
    expenses: List[RDExpense]
    gaps: List[GapItem]
    total_qre: float
    wage_qre: float
    supply_qre: float
    contract_qre: float
    total_employees: int
    rd_employees: int
    qualified_projects: int
    parsing_complete: bool
    analysis_complete: bool
    errors: List[str]
```

### Excel Generator (`app/rd_excel_generator.py`)

Generates comprehensive 13-worksheet Excel reports:

| Worksheet | Description |
|-----------|-------------|
| **Summary_Statistics** | Company info, QRE totals, headcount |
| **Employees** | Employee roster with wage data |
| **Projects** | Project list with four-part test status |
| **Four_Part_Test_Eval** | Detailed AI evaluation per project |
| **Wage_QRE** | Wage-based QRE calculations |
| **Contract_Research** | Contract research QRE (65% rule) |
| **Supplies** | Supply expense QRE |
| **Vendor_Analysis** | Vendor qualification analysis |
| **Gap_Analysis** | Missing information tracker |
| **Credit_Calculation** | Regular vs ASC method comparison |
| **Sanity_Checks** | Data validation alerts |
| **Form_6765_Computation** | IRS Form 6765 line-by-line |
| **Four_Part_Test_Details** | Complete AI reasoning |

---

## Frontend (Next.js/React)

### Package Dependencies

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.8.0",
    "@supabase/supabase-js": "^2.86.0",
    "@tanstack/react-query": "^5.90.16",
    "clsx": "^2.1.0",
    "geist": "^1.5.1",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hot-toast": "^2.6.0",
    "zod": "^4.3.5"
  }
}
```

### TypeScript Types (`frontend/src/lib/types.ts`)

```typescript
// Chat types
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  response: string;
  structured?: Record<string, unknown> | null;
  session_id?: string;
};

// Workflow types
export type WorkflowOverallState = 
  | 'not_started' | 'in_progress' | 'ready_for_review' 
  | 'needs_follow_up' | 'approved' | 'rejected';

export type CriterionState = 
  | 'missing' | 'incomplete' | 'sufficient' 
  | 'flagged' | 'approved' | 'rejected';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface NextBestAction {
  action_type: 'request_evidence' | 'assign_task' | 'edit_field' 
             | 'upload_doc' | 're_evaluate_ai' | 'review_decision';
  target: string;
  reason: string;
  estimated_effort: 'S' | 'M' | 'L';
  blocking: boolean;
}

export interface WorkflowSummary {
  total_projects: number;
  by_state: Record<WorkflowOverallState, number>;
  top_blockers: string[];
  needs_follow_up: string[];
  next_best_actions?: NextBestAction[];
  project_statuses: Record<string, {
    overall_state: WorkflowOverallState;
    readiness_score: number;
    risk_level: RiskLevel;
  }>;
}

// Entity types
export interface Project {
  id: string;
  name: string;
  description?: string;
  technical_uncertainty?: string;
  process_of_experimentation?: string;
  qualification_status: 'pending' | 'qualified' | 'not_qualified';
  organization_id?: string;
  client_company_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  title?: string;
  department?: string;
  state?: string;
  total_wages: number;
  qualified_percent: number;
  rd_percentage: number;
  verification_status: 'pending' | 'verified' | 'denied';
}

export interface Contractor {
  id: string;
  name: string;
  cost: number;
  is_qualified: boolean;
  location?: string;
  notes?: string;
  verification_status: 'pending' | 'verified' | 'denied';
}

export interface DashboardData {
  total_qre: number;
  total_credit: number;
  total_wages: number;
  project_count: number;
  employee_count: number;
  contractor_count: number;
  study_count: number;
  qualified_projects: number;
}
```

### API Client (`frontend/src/lib/api.ts`)

The API client provides functions for all backend interactions:

#### Authentication Helpers
```typescript
async function getFreshSession() // Gets and refreshes Supabase session
async function getAuthHeaders()  // Returns Authorization header
```

#### Core API Functions
```typescript
// Dashboard
getDashboard(): Promise<DashboardData>

// Projects
getProjects(): Promise<Project[]>
createProject(project: Partial<Project>): Promise<Project>

// Employees
getEmployees(): Promise<Employee[]>
createEmployee(employee: Partial<Employee>): Promise<Employee>

// Contractors
getContractors(): Promise<Contractor[]>
createContractor(contractor: Partial<Contractor>): Promise<Contractor>

// Chat
sendChatMessage(messages: ChatMessage[], sessionId?: string): Promise<ChatResult>

// R&D Analysis
uploadRDFiles(files: File[]): Promise<{ session_id: string }>
parseRDSession(sessionId: string, useAI: boolean): Promise<{ session: RDAnalysisSession }>
getRDSession(sessionId: string): Promise<RDAnalysisSession>
downloadRDReport(sessionId: string): Promise<Blob>

// Workflow
getClientWorkflowSummary(clientId: string): Promise<WorkflowSummary>
getProjectWorkflowDetails(projectId: string): Promise<ProjectWorkflowStatus>

// Tasks
createTask(payload: TaskCreatePayload): Promise<StructuredTask>
getMyTasks(status?: string): Promise<StructuredTask[]>
submitTask(taskId: string, artifacts: any[]): Promise<any>
reviewTask(taskId: string, decision: string, reasonCode: string): Promise<any>

// Copilot
queryCopilot(prompt: string, clientId: string, projectId?: string): Promise<CopilotResponse>

// Organizations
getCurrentOrganization(): Promise<Organization>
getClientCompanies(orgId: string): Promise<ClientCompany[]>
createClientCompany(orgId: string, data: {...}): Promise<ClientCompany>

// Budgets & Expenses
getBudgets(orgId: string): Promise<Budget[]>
getExpenses(orgId: string): Promise<Expense[]>
```

### Context Providers

#### Auth Context (`context/auth-context.tsx`)
Provides authentication state and methods throughout the app.

#### Query Client (`context/query-client.ts`)
Configures React Query with cache settings:
```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const CACHE_KEYS = {
  org: (orgId: string) => ['org', orgId],
  client: (clientId: string) => ['client', clientId],
  projects: (clientId: string, taxYear: number) => ['projects', 'list', clientId, taxYear],
  employees: (clientId: string, taxYear: number) => ['employees', 'list', clientId, taxYear],
  contractors: (clientId: string, taxYear: number) => ['contractors', 'list', clientId, taxYear],
  expenses: (clientId: string) => ['expenses', 'list', clientId],
  workflow: (projectId: string) => ['workflow', projectId],
};
```

---

## Database (Supabase/PostgreSQL)

### Core Tables

| Table | Description |
|-------|-------------|
| **organizations** | CPA firms / companies |
| **profiles** | User profiles (extends auth.users) |
| **organization_members** | User-org relationships with roles |
| **client_companies** | Client companies under organizations |
| **projects** | R&D projects |
| **employees** | Employee records with wage data |
| **contractors** | Contractor records |
| **project_allocations** | Employee-project time allocations |
| **budgets** | Budget tracking |
| **expenses** | Expense records |
| **engineering_tasks** | Task management |
| **time_logs** | Time tracking |
| **chat_sessions** | AI chat sessions |
| **chat_messages** | Chat message history |
| **studies** | Generated report files |
| **verification_tasks** | Verification workflow |
| **audit_logs** | Activity audit trail |
| **demo_requests** | Landing page demo requests |

### Key Columns

#### `organizations`
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
slug TEXT UNIQUE
industry TEXT
tax_year TEXT DEFAULT '2024'
settings JSONB DEFAULT '{}'
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `profiles`
```sql
id UUID REFERENCES auth.users(id) PRIMARY KEY
email TEXT UNIQUE NOT NULL
full_name TEXT
company_name TEXT
organization_id UUID REFERENCES organizations(id)
is_admin BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
last_active_at TIMESTAMPTZ
```

#### `organization_members`
```sql
id UUID PRIMARY KEY
organization_id UUID NOT NULL
user_id UUID NOT NULL
role TEXT CHECK (role IN ('executive', 'cpa', 'engineer'))
status TEXT CHECK (status IN ('active', 'pending', 'inactive'))
invited_by UUID
invited_at TIMESTAMPTZ
accepted_at TIMESTAMPTZ
```

#### `client_companies`
```sql
id UUID PRIMARY KEY
organization_id UUID NOT NULL
name TEXT NOT NULL
slug TEXT
industry TEXT
tax_year TEXT
ein TEXT
address TEXT
city TEXT
state TEXT
zip_code TEXT
contact_name TEXT
contact_email TEXT
contact_phone TEXT
settings JSONB
status TEXT
created_by UUID
```

#### `projects`
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
organization_id UUID
client_company_id UUID
name TEXT NOT NULL
description TEXT
technical_uncertainty TEXT
process_of_experimentation TEXT
qualification_status TEXT CHECK (... IN ('pending', 'qualified', 'not_qualified'))
version INTEGER DEFAULT 1
last_modified_by UUID
```

#### `employees`
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
organization_id UUID
client_company_id UUID
name TEXT NOT NULL
title TEXT
department TEXT
state TEXT
total_wages DECIMAL(12,2)
qualified_percent DECIMAL(5,2)
rd_percentage DECIMAL(5,2)
verification_status TEXT
version INTEGER DEFAULT 1
```

### Row Level Security (RLS)

All tables have RLS enabled with policies based on:
- User's organization membership
- User's role (executive, cpa, engineer)
- Resource ownership

Example policy:
```sql
CREATE POLICY "Users can view org projects" ON public.projects
    FOR SELECT USING (
        organization_id = public.get_user_org_id() OR user_id = auth.uid()
    );
```

### Helper Functions

```sql
-- Get user's organization ID
CREATE FUNCTION public.get_user_org_id() RETURNS UUID

-- Check if user is org admin
CREATE FUNCTION public.is_org_admin(org_id UUID) RETURNS BOOLEAN

-- Check if user is org CPA
CREATE FUNCTION public.is_org_cpa(org_id UUID) RETURNS BOOLEAN

-- Check if user is org member
CREATE FUNCTION public.is_org_member(org_id UUID) RETURNS BOOLEAN

-- Generate URL slug from text
CREATE FUNCTION public.generate_slug(input_text TEXT) RETURNS TEXT

-- Handle new user signup (creates profile + org)
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER
```

---

## Authentication

### Supabase Auth Flow

1. **Registration**
   - User signs up with email/password
   - `handle_new_user()` trigger creates:
     - Profile record
     - Organization (if company name provided)
     - Organization membership as 'executive'

2. **Login**
   - Supabase returns JWT access token
   - Frontend stores in Supabase client
   - Token sent as `Authorization: Bearer <token>`

3. **Token Refresh**
   - Frontend auto-refreshes tokens before expiry
   - 5-minute refresh window

### Backend Token Verification

```python
def verify_supabase_token(token: str) -> Optional[Dict]:
    """Verify JWT token with Supabase"""
    supabase = get_supabase()
    user = supabase.auth.get_user(token)
    return {
        "id": user.user.id,
        "email": user.user.email,
        "metadata": user.user.user_metadata
    }
```

---

## API Endpoints

### Health & Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/ai-status` | Check AI availability |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user_context` | Get current user context |
| GET | `/api/dashboard` | Get dashboard data |

### Chat & AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send authenticated chat |
| POST | `/api/chat_demo` | Send demo chat (no auth) |
| POST | `/api/chat_with_files` | Chat with file uploads |
| GET | `/api/chat/sessions` | List chat sessions |
| GET | `/api/chat/sessions/{id}/messages` | Get session messages |

### R&D Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rd-analysis/upload` | Upload files for analysis |
| POST | `/api/rd-analysis/parse/{session_id}` | Parse uploaded files |
| GET | `/api/rd-analysis/session/{session_id}` | Get session status |
| POST | `/api/rd-analysis/session/{id}/evaluate-project/{project_id}` | Re-evaluate project |
| POST | `/api/rd-analysis/session/{id}/upload-gap/{gap_id}` | Upload gap documentation |
| GET | `/api/rd-analysis/session/{id}/download` | Download Excel report |
| DELETE | `/api/rd-analysis/session/{id}` | Delete session |

### Projects, Employees, Contractors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project |
| GET | `/api/employees` | List employees |
| POST | `/api/employees` | Create employee |
| GET | `/api/contractors` | List contractors |
| POST | `/api/contractors` | Create contractor |

### Organizations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/organizations/current` | Get current organization |
| POST | `/organizations` | Create organization |
| GET | `/organizations/{org_id}/members` | List members |
| POST | `/organizations/{org_id}/invite` | Invite member |
| GET | `/organizations/{org_id}/clients` | List client companies |
| POST | `/organizations/{org_id}/clients` | Create client |

### Workflow
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflow/client/{client_id}` | Get client workflow summary |
| GET | `/api/workflow/project/{project_id}` | Get project workflow details |
| POST | `/api/workflow/project/{id}/recompute` | Recompute workflow |
| POST | `/api/workflow/project/{id}/decision` | Submit decision |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks/` | Create task |
| GET | `/api/tasks/my` | Get my tasks |
| GET | `/api/tasks/client/{client_id}` | Get client tasks |
| GET | `/api/tasks/review-queue` | Get review queue |
| PATCH | `/api/tasks/{id}/status` | Update task status |
| POST | `/api/tasks/{id}/submit` | Submit task |
| POST | `/api/tasks/{id}/review` | Review task |

### Copilot
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/copilot/query` | Query copilot |
| GET | `/api/copilot/suggestions` | Get suggestions |
| POST | `/api/copilot/action/decision` | Approve/reject action |
| POST | `/api/copilot/action/execute` | Execute action |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/studies` | List all studies |
| GET | `/admin/chat_sessions` | List all chat sessions |
| GET | `/admin/stats` | Get system stats |

---

## R&D Analysis Pipeline

### 1. File Upload
```
User uploads files → /api/rd-analysis/upload
                   → Files stored in session
                   → Returns session_id
```

Supported formats:
- `.xlsx`, `.xls` - Excel workbooks
- `.csv` - CSV files
- `.pdf` - PDF documents (PyPDF2)
- `.docx` - Word documents (python-docx)

### 2. Parsing
```
POST /api/rd-analysis/parse/{session_id}?use_ai=true

→ Extract sheets from Excel
→ Parse Projects sheet
→ Parse Employees sheet
→ Parse Vendors sheet
→ Parse Expenses/Supplies sheet
→ Auto-calculate QREs
→ Identify gaps
→ If use_ai: Run Gemini four-part test evaluation
```

### 3. Four-Part Test Evaluation

For each project, Gemini evaluates:

1. **Section 41(d)(1) Permitted Purpose**
   - Is the activity intended to develop new/improved function, performance, reliability, quality?

2. **Section 41(d)(2) Elimination of Uncertainty**
   - Was there uncertainty about capability, method, or design?

3. **Section 41(d)(3) Process of Experimentation**
   - Did the taxpayer evaluate alternatives through modeling, simulation, testing?

4. **Section 41(d)(4) Technological in Nature**
   - Does the activity rely on hard sciences (engineering, physics, chemistry, biology, computer science)?

### 4. QRE Calculation

```
Wage QRE = Σ (Employee.total_wages × Employee.rd_allocation_percent)
Supply QRE = Σ Qualified supply expenses
Contract QRE = Σ (Qualified contract expenses × 0.65)  # IRC 41(b)(3)(A)

Total QRE = Wage QRE + Supply QRE + Contract QRE
```

### 5. Excel Report Generation

Generates 13-worksheet workbook with:
- Formatted headers
- Currency formatting
- Conditional highlighting (pass/fail/review)
- Auto-sized columns
- Form 6765 computation

---

## AI Integration

### Google Gemini

The platform uses Google Gemini for:

1. **Four-Part Test Evaluation** - Analyzing project descriptions against IRS criteria
2. **Chat Assistant** - Answering R&D tax credit questions
3. **Copilot** - Contextual suggestions and analysis

### Configuration

```python
# app/rd_parser.py
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ.get("GOOGLE_CLOUD_API_KEY"))
```

### Prompt Engineering

Example four-part test prompt:
```
You are an R&D tax credit expert. Evaluate this project against IRC Section 41:

Project: {project_name}
Description: {description}

For each of the four tests, provide:
1. Status: pass / fail / needs_review / missing_data
2. Detailed reasoning citing specific facts from the description

Return JSON with structure:
{
  "permitted_purpose": {"status": "...", "reasoning": "..."},
  "elimination_uncertainty": {"status": "...", "reasoning": "..."},
  "process_experimentation": {"status": "...", "reasoning": "..."},
  "technological_nature": {"status": "...", "reasoning": "..."},
  "confidence_score": 0.85,
  "missing_info": ["list of needed info"],
  "summary": "overall assessment"
}
```

---

## Deployment

### Backend (Railway)

**Procfile:**
```
web: gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
```

**railway.toml:**
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT"
healthcheckPath = "/health"
```

### Frontend (Vercel)

**vercel.json:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

---

## Environment Variables

### Backend (Railway)

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret

# AI
GOOGLE_CLOUD_API_KEY=AIza...

# CORS
CORS_ORIGINS=https://www.taxscape.ai,https://taxscape.ai

# Server
PORT=8000
```

### Frontend (Vercel)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# API
NEXT_PUBLIC_API_URL=https://taxscapecursor-production.up.railway.app
```

---

## Testing

### E2E Pipeline Test

```bash
python test_rd_pipeline.py --input test_data/sample_rd_input.xlsx --use-ai
```

This script:
1. Loads sample Excel input
2. Parses and extracts data
3. Runs AI four-part test evaluation
4. Generates comprehensive Excel output
5. Validates all 13 worksheets

### Sample Data Generator

```bash
python scripts/create_sample_input.py
```

Generates `test_data/sample_rd_input.xlsx` with:
- 5 sample R&D projects
- 10 sample employees
- 5 sample vendors
- Sample supply expenses

### Manual Testing

1. Navigate to https://www.taxscape.ai
2. Register a new account
3. Go to Portal → R&D Analysis
4. Upload test Excel file
5. Wait for parsing and AI evaluation
6. Download generated report

---

## File Count Summary

| Category | Files | Total Lines |
|----------|-------|-------------|
| Backend Python | 12 | ~8,000 |
| Frontend TypeScript/TSX | 25+ | ~6,000 |
| SQL Migrations | 8 | ~2,500 |
| Configuration | 10 | ~300 |
| Documentation | 5 | ~1,000 |

**Total Codebase:** ~18,000 lines of code

---

## Support

- **Email:** hello@taxscape.com
- **Demo:** https://calendly.com/sam-taxscape/30min

---

*This documentation is auto-generated and maintained as part of the TaxScape Pro project.*

