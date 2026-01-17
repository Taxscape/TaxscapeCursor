"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ChatMessage, WorkflowSummary, ProjectWorkflowStatus } from "@/lib/types";
import {
  sendChatMessage,
  sendChatMessageDemo,
  downloadChatExcel,
  getDashboard,
  getProjects,
  createProject,
  getChatSessions,
  getEmployees,
  getContractors,
  uploadPayroll,
  uploadContractors,
  sendChatWithFiles,
  checkApiConnection,
  getApiUrl,
  getOrganizationMembers,
  inviteOrganizationMember,
  updateOrganizationMember,
  removeOrganizationMember,
  getVerificationTasks,
  createVerificationTask,
  updateVerificationTask,
  getAuditLog,
  getExecutiveOverview,
  getBudgets,
  getExpenses,
  getEngineeringTasks,
  getTimeLogs,
  createBudget,
  createExpense,
  createEngineeringTask,
  updateEngineeringTask,
  createTimeLog,
  getClientCompanies,
  createClientCompany,
  setSelectedClient,
  getClientWorkflowSummary,
  uploadRDFiles,
  parseRDSession,
  getRDSession,
  evaluateRDProject,
  uploadRDGapDocumentation,
  downloadRDReport,
  getAIStatus,
  type AIStatus,
  type GapUploadResponse,
  type DashboardData,
  type Project,
  type ChatSession,
  type Employee,
  type Contractor,
  type OrganizationMember,
  type VerificationTask,
  type AuditLogEntry,
  type ExecutiveOverview,
  type Budget,
  type Expense,
  type EngineeringTask,
  type TimeLog,
  type ClientCompany,
  type RDAnalysisSession,
  type RDProject,
} from "@/lib/api";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { InlineAssist } from "@/components/copilot/InlineAssist";
import { TaskBoard, TaskCreateModal } from "@/components/tasks";

import { FileUploadZone } from "@/components/rd/FileUploadZone";
import { FourPartTestCard, FourPartTestSummary } from "@/components/rd/FourPartTestCard";
import { GapAnalysisPanel } from "@/components/rd/GapAnalysisPanel";

// ============================================================================
// ICONS - Lucide-style SVG icons
// ============================================================================
const Icons = {
  layoutDashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  checkCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  folderKanban: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <path d="M8 10v4" />
      <path d="M12 10v2" />
      <path d="M16 10v6" />
    </svg>
  ),
  dollarSign: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  fileText: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  ),
  messageSquare: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  upload: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  ),
  calculator: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  beaker: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  ),
  chevronLeft: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  user: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  building: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  ),
  download: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  trendingUp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  fileCheck: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  ),
  arrowRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  userPlus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  ),
  moreHorizontal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  ),
  clipboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  alertTriangle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  briefcase: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  receipt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </svg>
  ),
  package: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  sparkles: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  ),
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  ),
  paperclip: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  ),
  refresh: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================
type PortalUserRole = "executive" | "cpa" | "engineer";
type ViewMode = 
  // Upload first
  | "upload-data"
  // Common views
  | "dashboard" 
  | "projects" 
  | "team" 
  | "documents" 
  | "questionnaires"
  // Executive views
  | "executive-overview"
  | "reports"
  | "audit-log"
  // CPA views  
  | "clients"
  | "budgets"
  | "expenses"
  | "financial-reports"
  | "rd-analysis"
  // Engineer views
  | "tasks"
  | "time-log"
  // Legacy views (for backwards compat)
  | "admin"
  | "verify";

// Initial chat message
const initialMessage: ChatMessage = {
  role: "assistant",
  content: "Hello! I'm your R&D Tax Assistant. I'm here to help you qualify projects for tax credits and navigate the TaxScape Pro portal.\n\nYou can ask me things like:\n• \"How do I add a new client?\"\n• \"What are the four parts of the R&D test?\"\n• \"Where can I see my project summaries?\"\n\nWhat would you like to work on today?",
};

// ============================================================================
// MAIN PORTAL COMPONENT
// ============================================================================
export default function Portal() {
  const router = useRouter();
  const { user, profile, organization, userRole, isLoading: authLoading, isOrgAdmin, signOut } = useAuth();

  // Navigation state
  const [currentView, setCurrentView] = useState<ViewMode>("rd-analysis");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Data State
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [structured, setStructured] = useState<Record<string, unknown> | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showChat, setShowChat] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [showTaskCreateModal, setShowTaskCreateModal] = useState(false);
  const [taskView, setTaskView] = useState<'my' | 'client' | 'review' | 'blockers'>('my');

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload State
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Report State
  const [isGenerating, setIsGenerating] = useState(false);

  // Team management state
  const [teamMembers, setTeamMembers] = useState<OrganizationMember[]>([]);
  const [tasks, setTasks] = useState<VerificationTask[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("engineer");
  const [isInviting, setIsInviting] = useState(false);

  // Pipeline dashboard state (Phase 1)
  const [executiveOverview, setExecutiveOverview] = useState<ExecutiveOverview | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [engineeringTasks, setEngineeringTasks] = useState<EngineeringTask[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);

  // Modal state (Phase 2)
  const [modalOpen, setModalOpen] = useState<'budget' | 'expense' | 'task' | 'timelog' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state for modals
  const [budgetForm, setBudgetForm] = useState({
    name: '',
    project_id: '',
    total_amount: '',
    category: '',
    fiscal_year: new Date().getFullYear().toString(),
    notes: '',
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    budget_id: '',
    project_id: '',
    category: '',
    vendor_name: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    project_id: '',
    priority: 'medium',
    assigned_to: '',
    due_date: '',
    estimated_hours: '',
    milestone: '',
  });

  const [timeLogForm, setTimeLogForm] = useState({
    hours: '',
    task_id: '',
    project_id: '',
    description: '',
    log_date: new Date().toISOString().split('T')[0],
    billable: true,
  });

  // Client Companies state (CPA-centric)
  const [clientCompanies, setClientCompanies] = useState<ClientCompany[]>([]);
  const [selectedClient, setSelectedClientState] = useState<ClientCompany | null>(null);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    industry: '',
    tax_year: new Date().getFullYear().toString(),
    contact_name: '',
    contact_email: '',
  });
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    technical_uncertainty: '',
    process_of_experimentation: ''
  });

  // R&D Analysis state
  const [rdSession, setRdSession] = useState<RDAnalysisSession | null>(null);
  const [rdSessionId, setRdSessionId] = useState<string | null>(null);
  const [isRdUploading, setIsRdUploading] = useState(false);
  const [isRdParsing, setIsRdParsing] = useState(false);
  const [rdError, setRdError] = useState<string | null>(null);
  const [evaluatingProjectId, setEvaluatingProjectId] = useState<string | null>(null);
  const [uploadingGapId, setUploadingGapId] = useState<string | null>(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [workflowSummary, setWorkflowSummary] = useState<WorkflowSummary | null>(null);
  const [projectWorkflowStatuses, setProjectWorkflowStatuses] = useState<Record<string, ProjectWorkflowStatus>>({});

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  const kpiData = useMemo(() => dashboard || {
    total_credit: 0,
    total_wages: 0,
    total_qre: 0,
    project_count: 0,
    employee_count: 0,
    contractor_count: 0,
    study_count: 0,
  }, [dashboard]);

  const overallProgress = useMemo(() => {
    const hasProjects = projects.length > 0;
    const hasEmployees = employees.length > 0;
    const hasContractors = contractors.length > 0;
    const hasStudy = kpiData.study_count > 0;
    const steps = [hasProjects, hasEmployees, hasContractors, hasStudy];
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }, [projects, employees, contractors, kpiData]);

  const pendingTasksCount = useMemo(() => 
    tasks.filter(t => t.status === "pending").length
  , [tasks]);

  const verifiedTasksCount = useMemo(() => 
    tasks.filter(t => t.status === "verified").length
  , [tasks]);

  // Navigation items based on role
  const mainNavItems = useMemo(() => {
    const currentRole = (userRole as PortalUserRole) || 'cpa';
    
    // Common items for all roles - Upload/R&D Analysis is FIRST
    const commonItems = [
      { id: "rd-analysis" as const, label: "Upload Data", icon: Icons.upload },
      { id: "dashboard" as const, label: "Dashboard", icon: Icons.layoutDashboard },
      { id: "projects" as const, label: "Projects", icon: Icons.folderKanban, badge: rdSession ? rdSession.projects.length.toString() : undefined },
      { id: "tasks" as const, label: "Tasks", icon: Icons.checkCircle, badge: tasks.filter(t => t.status === 'pending').length > 0 ? tasks.filter(t => t.status === 'pending').length.toString() : undefined },
    ];
    
    // Executive/Admin gets full access + org management
    if (currentRole === 'executive' || isOrgAdmin) {
      return [
        ...commonItems,
        { id: "clients" as const, label: "Clients", icon: Icons.building, badge: clientCompanies.length > 0 ? clientCompanies.length.toString() : undefined },
        { id: "team" as const, label: "Team", icon: Icons.users },
        { id: "budgets" as const, label: "Budgets", icon: Icons.dollarSign },
        { id: "expenses" as const, label: "Expenses", icon: Icons.receipt },
        { id: "reports" as const, label: "Reports", icon: Icons.trendingUp },
        { id: "audit-log" as const, label: "Audit Log", icon: Icons.fileCheck },
      ];
    }
    
    // CPA gets financial views + client management (no Tasks, Time Log, Team)
    if (currentRole === 'cpa') {
      return [
        ...commonItems,
        { id: "clients" as const, label: "Clients", icon: Icons.building, badge: clientCompanies.length > 0 ? clientCompanies.length.toString() : undefined },
        { id: "budgets" as const, label: "Budgets", icon: Icons.dollarSign },
        { id: "expenses" as const, label: "Expenses", icon: Icons.receipt },
        { id: "financial-reports" as const, label: "Reports", icon: Icons.trendingUp },
      ];
    }
    
    // Engineer gets project-focused views (simplified)
    if (currentRole === 'engineer') {
      return [
        ...commonItems,
        { id: "budgets" as const, label: "Budgets", icon: Icons.dollarSign },
        { id: "expenses" as const, label: "Expenses", icon: Icons.receipt },
      ];
    }
    
    // Fallback - basic access
    return commonItems;
  }, [userRole, isOrgAdmin, projects.length, clientCompanies.length, tasks]);

  const toolsNavItems = useMemo(() => [
    { id: "questionnaires" as const, label: "AI Assistant", icon: Icons.sparkles },
    { id: "documents" as const, label: "Documents", icon: Icons.fileText },
  ], []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/portal");
    }
  }, [authLoading, user, router]);

  // Check if user needs onboarding (new CPA users)
  useEffect(() => {
    if (!authLoading && user && profile) {
      // Check if user qualifies for onboarding redirect:
      // - CPA role
      // - Has not seen onboarding OR has incomplete onboarding session
      const isCpaUser = profile.role_level === "cpa";
      const hasNotSeenOnboarding = profile.has_seen_onboarding === false;
      const hasIncompleteOnboarding = profile.onboarding_session_id && !profile.has_seen_onboarding;
      
      if (isCpaUser && hasNotSeenOnboarding) {
        router.push("/onboarding");
      }
    }
  }, [authLoading, user, profile, router]);

  // Check if user has incomplete onboarding (for "Continue onboarding" button)
  const hasIncompleteOnboarding = useMemo(() => {
    if (!profile) return false;
    return profile.role_level === "cpa" && 
           profile.onboarding_session_id && 
           profile.has_seen_onboarding === false;
  }, [profile]);

  // Verify R&D session when navigating to R&D Analysis
  useEffect(() => {
    const verifyRDSession = async () => {
      if (currentView === "rd-analysis" && rdSessionId && !isRdParsing) {
        try {
          await getRDSession(rdSessionId);
          // Session exists, also check AI status
          const status = await getAIStatus();
          setAiStatus(status);
        } catch (e) {
          // Session doesn't exist anymore, clear it
          console.log("R&D session expired, clearing...");
          setRdSession(null);
          setRdSessionId(null);
          setRdError(null);
          // Check AI status for the upload form
          const status = await getAIStatus();
          setAiStatus(status);
        }
      } else if (currentView === "rd-analysis" && !rdSessionId) {
        // No session, just check AI status
        const status = await getAIStatus();
        setAiStatus(status);
      }
    };
    
    verifyRDSession();
  }, [currentView, rdSessionId, isRdParsing]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) return;

    setApiError(null);
    setIsLoadingData(true);

    try {
      const connectionCheck = await checkApiConnection();
      if (!connectionCheck.connected) {
        setApiError(connectionCheck.error || "Cannot connect to server");
        setIsLoadingData(false);
        return;
      }

      const [dashboardData, projectsData, sessionsData, employeesData, contractorsData] = await Promise.all([
        getDashboard().catch((e) => { console.error("Dashboard error:", e); return null; }),
        getProjects().catch((e) => { console.error("Projects error:", e); return []; }),
        getChatSessions().catch((e) => { console.error("Sessions error:", e); return []; }),
        getEmployees().catch((e) => { console.error("Employees error:", e); return []; }),
        getContractors().catch((e) => { console.error("Contractors error:", e); return []; }),
      ]);

      if (dashboardData) setDashboard(dashboardData);
      setProjects(projectsData);
      setSessions(sessionsData);
      setEmployees(employeesData);
      setContractors(contractorsData);

      // Fetch organization-specific data if user has an organization
      if (organization?.id) {
        const [membersData, tasksData, auditData, overviewData, budgetsData, expensesData, engTasksData, timeLogsData, clientsData, workflowData] = await Promise.all([
          getOrganizationMembers(organization.id).catch((e) => { console.error("Members error:", e); return []; }),
          getVerificationTasks(organization.id).catch((e) => { console.error("Tasks error:", e); return []; }),
          isOrgAdmin ? getAuditLog(organization.id, 50).catch((e) => { console.error("Audit error:", e); return []; }) : Promise.resolve([]),
          getExecutiveOverview(organization.id).catch((e) => { console.error("Overview error:", e); return null; }),
          getBudgets(organization.id).catch((e) => { console.error("Budgets error:", e); return []; }),
          getExpenses(organization.id).catch((e) => { console.error("Expenses error:", e); return []; }),
          getEngineeringTasks(organization.id).catch((e) => { console.error("Eng tasks error:", e); return []; }),
          getTimeLogs(organization.id).catch((e) => { console.error("Time logs error:", e); return []; }),
          getClientCompanies(organization.id).catch((e) => { console.error("Clients error:", e); return []; }),
          selectedClient ? getClientWorkflowSummary(selectedClient.id).catch((e) => { console.error("Workflow error:", e); return null; }) : Promise.resolve(null),
        ]);
        setTeamMembers(membersData);
        setTasks(tasksData);
        setAuditLogs(auditData);
        setExecutiveOverview(overviewData);
        setBudgets(budgetsData);
        setExpenses(expensesData);
        setEngineeringTasks(engTasksData);
        setTimeLogs(timeLogsData);
        setClientCompanies(clientsData);
        if (workflowData) setWorkflowSummary(workflowData);
        
        // Auto-select first client if none selected
        if (clientsData.length > 0 && !selectedClient) {
          setSelectedClientState(clientsData[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load data";
      setApiError(errorMessage);
    } finally {
      setIsLoadingData(false);
    }
  }, [user, organization?.id, isOrgAdmin, selectedClient?.id]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchData();
    }
  }, [user, authLoading, fetchData]);

  // Refetch all data when selectedClient changes (client workspace switching)
  const previousClientIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Only refetch if client actually changed (not on initial load)
    if (selectedClient && previousClientIdRef.current !== null && previousClientIdRef.current !== selectedClient.id) {
      setIsLoadingData(true);
      fetchData();
    }
    previousClientIdRef.current = selectedClient?.id || null;
  }, [selectedClient?.id, fetchData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() || "(Attached files)" };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);

    try {
      let response;

      if (filesToSend.length > 0 && user) {
        response = await sendChatWithFiles(updatedMessages, filesToSend, currentSessionId || undefined);
      } else if (user) {
        response = await sendChatMessage(updatedMessages, currentSessionId || undefined, true);
      } else {
        response = await sendChatMessageDemo(updatedMessages);
      }

      setMessages([...updatedMessages, { role: "assistant", content: response.response }]);

      if (response.structured && Object.keys(response.structured).length > 0) {
        setStructured(response.structured);
        fetchData();
      }

      if (response.session_id) {
        setCurrentSessionId(response.session_id);
      }
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setMessages([...updatedMessages, {
        role: "assistant",
        content: `Error: ${errorMessage}. Please try again.`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateStudy = async () => {
    if (!structured) return;

    setIsGenerating(true);
    try {
      const blob = await downloadChatExcel(structured, "R&D Tax Credit Study");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `TaxScape_Study_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      fetchData();
    } catch (error) {
      console.error("Error generating study:", error);
      alert("Failed to generate Excel. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (type: "payroll" | "contractors", file: File) => {
    setIsUploading(true);
    setUploadStatus("Uploading...");
    try {
      const result = type === "payroll"
        ? await uploadPayroll(file)
        : await uploadContractors(file);

      setUploadStatus(`${result.message}`);
      await fetchData();
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      setUploadStatus("Upload failed. Check file format.");
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(file => {
        const ext = file.name.toLowerCase();
        return ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.pdf');
      });
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }
    e.target.value = "";
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  // Client Company Handlers
  const handleSelectClient = async (client: ClientCompany) => {
    // Don't refetch if same client selected
    if (selectedClient?.id === client.id) {
      setShowClientSelector(false);
      return;
    }
    
    // Clear all existing data to show loading state for new client workspace
    setDashboard(null);
    setProjects([]);
    setEmployees([]);
    setContractors([]);
    setRdSession(null);
    setRdSessionId(null);
    setRdError(null);
    setTasks([]);
    setBudgets([]);
    setExpenses([]);
    setEngineeringTasks([]);
    setTimeLogs([]);
    setWorkflowSummary(null);
    
    // Set new client
    setSelectedClientState(client);
    setShowClientSelector(false);
    
    // Persist selection to backend
    try {
      await setSelectedClient(client.id);
    } catch (e) {
      console.error("Error persisting client selection:", e);
    }
    
    // Data will be refetched via useEffect watching selectedClient
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !newClientForm.name.trim()) return;
    
    setIsAddingClient(true);
    try {
      const newClient = await createClientCompany(organization.id, {
        name: newClientForm.name.trim(),
        industry: newClientForm.industry || undefined,
        tax_year: newClientForm.tax_year || undefined,
        contact_name: newClientForm.contact_name || undefined,
        contact_email: newClientForm.contact_email || undefined,
      });
      
      setClientCompanies(prev => [...prev, newClient]);
      setSelectedClientState(newClient);
      setShowAddClientModal(false);
      setNewClientForm({ name: '', industry: '', tax_year: new Date().getFullYear().toString(), contact_name: '', contact_email: '' });
    } catch (e) {
      console.error("Error adding client:", e);
      alert("Failed to add client company. Please try again.");
    } finally {
      setIsAddingClient(false);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.name.trim()) return;
    
    setIsSubmitting(true);
    try {
      const newProject = await createProject({
        name: projectForm.name.trim(),
        description: projectForm.description || undefined,
        technical_uncertainty: projectForm.technical_uncertainty || undefined,
        process_of_experimentation: projectForm.process_of_experimentation || undefined,
      });
      
      setProjects(prev => [newProject, ...prev]);
      setShowAddProjectModal(false);
      setProjectForm({ name: '', description: '', technical_uncertainty: '', process_of_experimentation: '' });
    } catch (e) {
      console.error("Error adding project:", e);
      alert("Failed to add project. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // R&D Analysis Handlers
  const checkAIStatus = async () => {
    try {
      const status = await getAIStatus();
      setAiStatus(status);
      return status;
    } catch (e) {
      console.error("Failed to check AI status:", e);
      setAiStatus({
        available: false,
        gemini_installed: false,
        api_key_set: false,
        error: "Failed to check AI status"
      });
      return null;
    }
  };

  const handleRDFilesSelected = async (files: File[]) => {
    setIsRdUploading(true);
    setRdError(null);
    
    try {
      console.log("[R&D] Starting file upload...", files.length, "files");
      
      // Upload files first
      const uploadResult = await uploadRDFiles(files);
      console.log("[R&D] Upload complete, session:", uploadResult.session_id);
      setRdSessionId(uploadResult.session_id);
      
      // Parse and analyze with AI
      setIsRdUploading(false);
      setIsRdParsing(true);
      
      console.log("[R&D] Starting AI analysis...");
      const parseResult = await parseRDSession(uploadResult.session_id, true);
      console.log("[R&D] Analysis complete:", parseResult);
      setRdSession(parseResult.session);
      
      // Check AI status after parsing
      try {
        const status = await getAIStatus();
        setAiStatus(status);
      } catch (statusErr) {
        console.warn("[R&D] Could not fetch AI status:", statusErr);
      }
      
      // Check if any projects have AI errors
      if (parseResult.session?.projects) {
        const aiErrors = parseResult.session.projects.filter(
          (p: { ai_summary?: string }) => p.ai_summary?.includes("AI evaluation failed") || p.ai_summary?.includes("error")
        );
        if (aiErrors.length > 0) {
          setRdError(`AI evaluation had issues with ${aiErrors.length} project(s). Check individual projects for details.`);
        }
      }
      
    } catch (e) {
      console.error("[R&D] Analysis error:", e);
      const errorMsg = e instanceof Error ? e.message : "Failed to analyze files";
      
      // Try to parse JSON error detail
      try {
        const parsed = JSON.parse(errorMsg);
        setRdError(parsed.detail || errorMsg);
      } catch {
        setRdError(errorMsg);
      }
    } finally {
      setIsRdUploading(false);
      setIsRdParsing(false);
    }
  };

  const handleReEvaluateProject = async (projectId: string) => {
    if (!rdSessionId) return;
    
    setEvaluatingProjectId(projectId);
    
    try {
      const result = await evaluateRDProject(rdSessionId, projectId);
      
      // Update project in session
      if (rdSession) {
        const updatedProjects = rdSession.projects.map(p => 
          p.project_id === projectId ? result.project : p
        );
        setRdSession({
          ...rdSession,
          projects: updatedProjects,
          qualified_projects: updatedProjects.filter(p => p.qualified).length
        });
      }
    } catch (e) {
      console.error("Re-evaluation error:", e);
      const errorMsg = e instanceof Error ? e.message : "Failed to re-evaluate project";
      
      // Check if session expired (server restarted)
      if (errorMsg.includes("Session not found") || errorMsg.includes("not found")) {
        setRdError("Session expired. The server was restarted. Please re-upload your files.");
        setRdSession(null);
        setRdSessionId(null);
      } else {
        setRdError(errorMsg);
      }
    } finally {
      setEvaluatingProjectId(null);
    }
  };

  const handleUploadForGap = async (gapId: string, files: File[]) => {
    if (!rdSessionId || !rdSession) return;
    
    setUploadingGapId(gapId);
    setRdError(null);
    
    try {
      // Upload and get re-evaluation results
      const result = await uploadRDGapDocumentation(rdSessionId, gapId, files);
      
      // If re-evaluation succeeded, update the session with new project data
      if (result.re_evaluation && !result.re_evaluation.error) {
        const reEval = result.re_evaluation;
        
        // Update the project in the session
        const updatedProjects = rdSession.projects.map(p => {
          if (p.project_id === reEval.project_id) {
            return {
              ...p,
              qualified: reEval.qualified || false,
              four_part_test: reEval.four_part_test || p.four_part_test,
              ai_summary: reEval.ai_summary || p.ai_summary,
              confidence_score: reEval.confidence_score || p.confidence_score,
            };
          }
          return p;
        });
        
        // Fetch fresh session to get updated gaps
        const sessionResult = await parseRDSession(rdSessionId, false); // Don't re-run AI
        
        setRdSession({
          ...rdSession,
          ...sessionResult.session,
          projects: updatedProjects,
          qualified_projects: updatedProjects.filter(p => p.qualified).length,
        });
        
        // Show success message
        console.log(`Project ${reEval.project_id} re-evaluated: qualified=${reEval.qualified}`);
        
      } else if (result.re_evaluation?.error) {
        setRdError(`Re-evaluation error: ${result.re_evaluation.error}`);
      }
      
    } catch (e) {
      console.error("Gap upload error:", e);
      const errorMsg = e instanceof Error ? e.message : "Failed to upload documentation";
      
      // Check if session expired
      if (errorMsg.includes("Session not found") || errorMsg.includes("not found")) {
        setRdError("Session expired. The server was restarted. Please re-upload your files.");
        setRdSession(null);
        setRdSessionId(null);
      } else {
        setRdError(errorMsg);
      }
    } finally {
      setUploadingGapId(null);
    }
  };

  const handleResetRDAnalysis = () => {
    setRdSession(null);
    setRdSessionId(null);
    setRdError(null);
  };

  const handleDownloadRDReport = async () => {
    if (!rdSessionId) return;
    
    setIsDownloadingReport(true);
    setRdError(null);
    
    try {
      const blob = await downloadRDReport(rdSessionId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const companyName = rdSession?.company_name?.replace(/\s+/g, "_") || "RD_Study";
      a.download = `${companyName}_RD_Credit_Study_${rdSession?.tax_year || 2024}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (e) {
      console.error("Download error:", e);
      const errorMsg = e instanceof Error ? e.message : "Failed to download report";
      
      // Check if session expired
      if (errorMsg.includes("Session not found") || errorMsg.includes("not found")) {
        setRdError("Session expired. The server was restarted. Please re-upload your files.");
        setRdSession(null);
        setRdSessionId(null);
      } else {
        setRdError(errorMsg);
      }
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const handleNewChat = () => {
    setMessages([initialMessage]);
    setStructured(null);
    setCurrentSessionId(null);
    setAttachedFiles([]);
  };

  const handleInviteMember = async () => {
    if (!inviteEmail || !organization?.id) return;
    
    setIsInviting(true);
    try {
      const result = await inviteOrganizationMember(organization.id, {
        email: inviteEmail,
        role: inviteRole,
      });
      
      if (result.success) {
        // Refresh members list
        const membersData = await getOrganizationMembers(organization.id);
        setTeamMembers(membersData);
        setInviteDialogOpen(false);
        setInviteEmail("");
        setInviteRole("member");
      }
    } catch (error) {
      console.error("Failed to invite member:", error);
      alert(error instanceof Error ? error.message : "Failed to invite member");
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateMember = async (userId: string, data: { role?: string; status?: string }) => {
    if (!organization?.id) return;
    
    try {
      await updateOrganizationMember(organization.id, userId, data);
      // Refresh members list
      const membersData = await getOrganizationMembers(organization.id);
      setTeamMembers(membersData);
    } catch (error) {
      console.error("Failed to update member:", error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!organization?.id) return;
    
    if (!confirm("Are you sure you want to remove this member?")) return;
    
    try {
      await removeOrganizationMember(organization.id, userId);
      // Refresh members list
      const membersData = await getOrganizationMembers(organization.id);
      setTeamMembers(membersData);
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  };

  const handleUpdateTask = async (taskId: string, data: { status?: string; comment?: string }) => {
    if (!organization?.id) return;
    
    try {
      await updateVerificationTask(organization.id, taskId, data);
      // Refresh tasks list
      const tasksData = await getVerificationTasks(organization.id);
      setTasks(tasksData);
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const getRoleName = (role: string | null) => {
    const names: Record<string, string> = {
      executive: "Executive",
      cpa: "CPA / Finance",
      engineer: "Engineer",
      // Legacy roles for backwards compatibility
      admin: "Administrator",
      project_lead: "R&D Project Lead",
      vendor_approver: "Vendor Spend Approver",
      supply_approver: "Supply Expense Approver",
      hr_verifier: "Payroll/HR Verifier",
      member: "Member",
    };
    return role ? names[role] || role : "Member";
  };

  // ============================================================================
  // WORKFLOW MEMOS (must be before early returns)
  // ============================================================================

  const workflowSteps = useMemo(() => {
    // Default onboarding steps when workflow summary is not available
    const defaultSteps = [
      {
        id: 0,
        label: "Client Setup",
        description: "Verify client details and tax year baseline.",
        actionLabel: "Manage Clients",
        view: "clients" as ViewMode,
        icon: Icons.building,
        isComplete: selectedClient !== null
      },
      {
        id: 1,
        label: "Project Identification",
        description: "Identify R&D projects for evaluation.",
        actionLabel: "Identify Projects",
        view: "projects" as ViewMode,
        icon: Icons.folderKanban,
        isComplete: projects.length > 0
      },
      {
        id: 2,
        label: "AI Analysis & Evidence",
        description: "Upload documentation for AI analysis.",
        actionLabel: "Start AI Analysis",
        view: "rd-analysis" as ViewMode,
        icon: Icons.beaker,
        isComplete: rdSession !== null
      },
      {
        id: 3,
        label: "Final Review",
        description: "Review and approve completed projects.",
        actionLabel: "Final Review",
        view: "reports" as ViewMode,
        icon: Icons.trendingUp,
        isComplete: false
      }
    ];

    if (!workflowSummary) return defaultSteps;
    
    return [
      {
        id: 0,
        label: "Client Setup",
        description: "Verify client details and tax year baseline.",
        actionLabel: "Manage Clients",
        view: "clients" as ViewMode,
        icon: Icons.building,
        isComplete: selectedClient !== null
      },
      {
        id: 1,
        label: "Project Identification",
        description: `${workflowSummary.by_state.not_started || 0} projects not started, ${workflowSummary.by_state.in_progress || 0} in progress.`,
        actionLabel: "Identify Projects",
        view: "projects" as ViewMode,
        icon: Icons.folderKanban,
        isComplete: (workflowSummary.total_projects || 0) > 0
      },
      {
        id: 2,
        label: "AI Analysis & Evidence",
        description: `${workflowSummary.needs_follow_up?.length || 0} projects need additional documentation.`,
        actionLabel: "Start AI Analysis",
        view: "rd-analysis" as ViewMode,
        icon: Icons.beaker,
        isComplete: (workflowSummary.by_state.ready_for_review || 0) > 0
      },
      {
        id: 3,
        label: "Final Review",
        description: `${workflowSummary.by_state.ready_for_review || 0} projects ready for approval.`,
        actionLabel: "Final Review",
        view: "reports" as ViewMode,
        icon: Icons.trendingUp,
        isComplete: (workflowSummary.by_state.approved || 0) > 0
      }
    ];
  }, [workflowSummary, selectedClient, projects.length, rdSession]);

  const nextActions = useMemo(() => {
    const actions: Array<{
      title: string;
      description: string;
      action: () => void;
      label: string;
      icon: React.ReactNode;
      effort?: string;
    }> = [];
    
    // If we have real NBAs from the workflow engine, use them
    if (workflowSummary?.next_best_actions) {
      return workflowSummary.next_best_actions.map(nba => ({
        title: nba.reason,
        description: `Action: ${nba.action_type.replace('_', ' ').toUpperCase()} • Target: ${nba.target}`,
        action: () => {
          if (nba.action_type === 'edit_field' || nba.action_type === 'request_evidence') {
            setCurrentView('projects');
          } else if (nba.action_type === 'upload_doc' || nba.action_type === 're_evaluate_ai') {
            setCurrentView('rd-analysis');
          } else if (nba.action_type === 'review_decision') {
            setCurrentView('reports');
          }
        },
        label: nba.action_type.replace('_', ' ').toUpperCase(),
        icon: nba.blocking ? Icons.alertTriangle : Icons.sparkles,
        effort: nba.estimated_effort
      }));
    }

    // Fallback to basic onboarding actions
    if (clientCompanies.length === 0) {
      actions.push({
        title: "Setup your first client",
        description: "To start an R&D study, you first need to create a client company profile.",
        action: () => setShowAddClientModal(true),
        label: "Add Client",
        icon: Icons.building
      });
    } else if (projects.length === 0) {
      actions.push({
        title: "Identify R&D Projects",
        description: "List the technical projects your team worked on this year to evaluate for tax credits.",
        action: () => setCurrentView("projects"),
        label: "Go to Projects",
        icon: Icons.folderKanban
      });
    } else if (!rdSession) {
      actions.push({
        title: "Upload Documentation",
        description: "Upload payroll and project data to let our AI identify qualifying expenditures.",
        action: () => setCurrentView("rd-analysis"),
        label: "Start Analysis",
        icon: Icons.upload
      });
    }

    return actions;
  }, [clientCompanies.length, projects, rdSession, workflowSummary, setCurrentView, setShowAddClientModal]);

  // ============================================================================
  // LOADING STATES
  // ============================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (apiError && !isLoadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <div className="w-14 h-14 rounded-2xl bg-destructive/20 flex items-center justify-center mx-auto mb-5">
            <span className="text-destructive">{Icons.alertTriangle}</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Connection Error</h2>
          <p className="text-sm text-muted-foreground mb-4">{apiError}</p>
          <p className="text-xs text-muted-foreground/60 mb-6">API URL: {getApiUrl()}</p>
          <button onClick={fetchData} className="btn btn-primary btn-md">
            {Icons.refresh}
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODAL COMPONENT & FORM HANDLERS (Phase 2)
  // ============================================================================

  const Modal = ({ open, onClose, title, children }: { 
    open: boolean; 
    onClose: () => void; 
    title: string; 
    children: React.ReactNode;
  }) => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="glass-card relative z-10 w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              {Icons.x}
            </button>
          </div>
          {formError && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {formError}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  };

  const resetForms = () => {
    setBudgetForm({
      name: '',
      project_id: '',
      total_amount: '',
      category: '',
      fiscal_year: new Date().getFullYear().toString(),
      notes: '',
    });
    setExpenseForm({
      description: '',
      amount: '',
      budget_id: '',
      project_id: '',
      category: '',
      vendor_name: '',
      expense_date: new Date().toISOString().split('T')[0],
    });
    setTaskForm({
      title: '',
      description: '',
      project_id: '',
      priority: 'medium',
      assigned_to: '',
      due_date: '',
      estimated_hours: '',
      milestone: '',
    });
    setTimeLogForm({
      hours: '',
      task_id: '',
      project_id: '',
      description: '',
      log_date: new Date().toISOString().split('T')[0],
      billable: true,
    });
    setFormError(null);
  };

  const closeModal = () => {
    setModalOpen(null);
    setShowAddClientModal(false);
    setShowAddProjectModal(false);
    resetForms();
  };

  // Budget form handler
  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    if (!budgetForm.name.trim()) {
      setFormError('Budget name is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    
    try {
      await createBudget(organization.id, {
        name: budgetForm.name,
        project_id: budgetForm.project_id || undefined,
        total_amount: budgetForm.total_amount ? parseFloat(budgetForm.total_amount) : 0,
        category: budgetForm.category || undefined,
        fiscal_year: budgetForm.fiscal_year,
        notes: budgetForm.notes || undefined,
      });
      closeModal();
      fetchData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create budget');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Expense form handler
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    if (!expenseForm.description.trim()) {
      setFormError('Description is required');
      return;
    }
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
      setFormError('Valid amount is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    
    try {
      await createExpense(organization.id, {
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        budget_id: expenseForm.budget_id || undefined,
        project_id: expenseForm.project_id || undefined,
        category: expenseForm.category || undefined,
        vendor_name: expenseForm.vendor_name || undefined,
        expense_date: expenseForm.expense_date || undefined,
      });
      closeModal();
      fetchData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to log expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Engineering task form handler
  const handleCreateEngTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    if (!taskForm.title.trim()) {
      setFormError('Task title is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    
    try {
      await createEngineeringTask(organization.id, {
        title: taskForm.title,
        description: taskForm.description || undefined,
        project_id: taskForm.project_id || undefined,
        priority: taskForm.priority,
        assigned_to: taskForm.assigned_to || undefined,
        due_date: taskForm.due_date || undefined,
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : undefined,
        milestone: taskForm.milestone || undefined,
      });
      closeModal();
      fetchData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Time log form handler
  const handleCreateTimeLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    if (!timeLogForm.hours || parseFloat(timeLogForm.hours) <= 0) {
      setFormError('Valid hours are required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    
    try {
      await createTimeLog(organization.id, {
        hours: parseFloat(timeLogForm.hours),
        task_id: timeLogForm.task_id || undefined,
        project_id: timeLogForm.project_id || undefined,
        description: timeLogForm.description || undefined,
        log_date: timeLogForm.log_date || undefined,
        billable: timeLogForm.billable,
      });
      closeModal();
      fetchData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to log hours');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Engineering task status update handler
  const handleUpdateEngTaskStatus = async (taskId: string, status: string) => {
    if (!organization?.id) return;
    
    try {
      await updateEngineeringTask(organization.id, taskId, { status });
      fetchData();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  // ============================================================================
  // RENDER VIEWS
  // ============================================================================

  // Compute dashboard values from R&D session if available
  // Only show data from rdSession - show zeros otherwise to keep dashboard clean
  const dashboardQRE = rdSession?.total_qre || 0;
  const dashboardCredit = rdSession ? (rdSession.total_qre * 0.14) : 0;
  const dashboardProjects = rdSession?.projects.length || 0;
  const dashboardQualified = rdSession?.qualified_projects || 0;
  const dashboardGaps = rdSession?.gaps.length || 0;
  const rdProgress = rdSession 
    ? Math.round((rdSession.qualified_projects / Math.max(rdSession.projects.length, 1)) * 100)
    : overallProgress;

  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      {/* R&D Analysis Status Banner */}
      {rdSession && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Icons.beaker}
              <div>
                <p className="font-medium text-foreground">R&D Analysis Active</p>
                <p className="text-sm text-muted-foreground">
                  {rdSession.company_name || 'Company'} • Tax Year {rdSession.tax_year} • {rdSession.projects.length} projects analyzed
                </p>
              </div>
            </div>
            <button 
              onClick={() => setCurrentView("rd-analysis")}
              className="btn btn-outline btn-sm"
            >
              View Analysis
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total QRE</p>
              <p className="text-2xl font-semibold text-foreground mt-1">
                {formatCurrency(dashboardQRE)}
              </p>
              {rdSession && (
                <p className="text-xs text-accent mt-1 flex items-center gap-1">
                  {Icons.beaker}
                  From R&D Analysis
                </p>
              )}
              {!rdSession && (
                <p className="text-xs text-muted-foreground mt-1">
                  Upload files in R&D Analysis
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-accent/30">
              <span className="text-accent-foreground">{Icons.dollarSign}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 animation-delay-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Estimated Credit</p>
              <p className="text-2xl font-semibold text-foreground mt-1">
                {formatCurrency(dashboardCredit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {rdSession ? "14% ASC method" : "10% federal credit rate"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-success/20">
              <span className="text-success">{Icons.trendingUp}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 animation-delay-400">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {rdSession ? "Qualification Rate" : "Claim Progress"}
              </p>
              <p className="text-2xl font-semibold text-foreground mt-1">{rdProgress}%</p>
              <div className="progress mt-2 h-1.5">
                <div className="progress-indicator" style={{ width: `${rdProgress}%` }} />
              </div>
              {rdSession && (
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardQualified}/{dashboardProjects} projects qualified
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-warning/20">
              <span className="text-warning">{Icons.fileCheck}</span>
            </div>
          </div>
        </div>
      </div>

      {/* R&D Analysis Summary (when session exists) */}
      {rdSession && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">R&D Credit Summary</h3>
            {dashboardGaps > 0 && (
              <span className="badge badge-warning">{dashboardGaps} gaps need attention</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wage QRE</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(rdSession.wage_qre)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supply QRE</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(rdSession.supply_qre)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contract QRE</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(rdSession.contract_qre)}</p>
            </div>
            <div className="p-4 rounded-lg bg-accent/20">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Employees</p>
              <p className="text-xl font-semibold text-foreground mt-1">{rdSession.rd_employees}/{rdSession.total_employees}</p>
              <p className="text-xs text-muted-foreground">R&D staff</p>
            </div>
          </div>
        </div>
      )}

      {/* Executive Overview Section (when data available) */}
      {executiveOverview && (isOrgAdmin || userRole === 'executive') && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Organization Overview</h3>
              <p className="text-sm text-muted-foreground">Financial and project performance metrics</p>
            </div>
            {executiveOverview.alerts.length > 0 && (
              <span className="badge badge-warning">
                {executiveOverview.alerts.length} alert{executiveOverview.alerts.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Budget</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(executiveOverview.budget.total)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Spent</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(executiveOverview.budget.spent)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {executiveOverview.budget.usage_percent.toFixed(0)}% of budget
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Task Progress</p>
              <p className="text-xl font-semibold text-foreground mt-1">{executiveOverview.tasks.completion_percent.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {executiveOverview.tasks.completed}/{executiveOverview.tasks.total} completed
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly Burn</p>
              <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(executiveOverview.burn_rate)}</p>
              <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
            </div>
          </div>

          {/* Alerts */}
          {executiveOverview.alerts.length > 0 && (
            <div className="space-y-2">
              {executiveOverview.alerts.map((alert, idx) => (
                <div key={idx} className={`p-3 rounded-lg flex items-center gap-3 ${
                  alert.type === 'critical' ? 'bg-destructive/10 text-destructive' :
                  alert.type === 'warning' ? 'bg-warning/10 text-warning' :
                  'bg-accent/10 text-accent-foreground'
                }`}>
                  {Icons.alertTriangle}
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Progress & Tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-border bg-muted/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Guided Onboarding</h3>
                  <p className="text-sm text-muted-foreground mt-1">Select a step to see detailed instructions and shortcuts</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-foreground">{overallProgress}%</span>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Overall Completion</p>
                </div>
              </div>
              <div className="progress mb-2">
                <div className="progress-indicator" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Steps List */}
              <div className="p-4 space-y-2 border-r border-border bg-card/50">
                {workflowSteps.map((step, index) => (
                  <button 
                    key={index} 
                    onClick={() => setActiveStep(activeStep === index ? null : index)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      activeStep === index 
                        ? 'bg-accent text-accent-foreground shadow-md ring-1 ring-accent/20' 
                        : 'bg-secondary/20 hover:bg-secondary/40 text-foreground'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      step.isComplete 
                        ? 'bg-success text-success-foreground' 
                        : activeStep === index ? 'bg-accent-foreground text-accent' : 'bg-muted text-muted-foreground'
                    }`}>
                      {step.isComplete ? Icons.check : index + 1}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold truncate">{step.label}</p>
                      <p className={`text-[10px] truncate ${activeStep === index ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>
                        {step.isComplete ? 'Task Completed' : 'Pending Action'}
                      </p>
                    </div>
                    {activeStep !== index && (
                      <span className="text-muted-foreground/50">{Icons.chevronRight}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Step Detail */}
              <div className="p-6 flex flex-col justify-center bg-card">
                {activeStep !== null ? (
                  <div className="animate-fade-in space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent mb-2">
                      {workflowSteps[activeStep].icon}
                    </div>
                    <h4 className="text-xl font-bold text-foreground">{workflowSteps[activeStep].label}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {workflowSteps[activeStep].description}
                    </p>
                    <div className="pt-4">
                      <button 
                        onClick={() => setCurrentView(workflowSteps[activeStep].view)}
                        className="btn btn-primary w-full group"
                      >
                        <span>{workflowSteps[activeStep].actionLabel}</span>
                        <span className="group-hover:translate-x-1 transition-transform">{Icons.arrowRight}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground">
                      {Icons.sparkles}
                    </div>
                    <p className="text-sm font-medium text-foreground">Select a workflow step</p>
                    <p className="text-xs text-muted-foreground px-4">
                      Follow our TurboTax-style guide to qualify projects and maximize your tax credit.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tasks Card */}
          <div className="glass-card">
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-lg font-semibold text-foreground">Recommended Actions</h3>
              {nextActions.length > 0 && (
                <span className="badge badge-accent animate-pulse">{nextActions.length} pending</span>
              )}
            </div>
            <div className="px-6 pb-6 space-y-3">
              {nextActions.length > 0 ? (
                nextActions.map((action, index) => (
                  <div key={index} className="group p-4 rounded-xl bg-accent/5 border border-accent/10 hover:border-accent/30 transition-all cursor-pointer" onClick={action.action}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-accent shrink-0">
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-foreground group-hover:text-accent transition-colors">
                          {action.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {action.description}
                        </p>
                      </div>
                      <button className="btn btn-ghost btn-icon-sm self-center">
                        {Icons.arrowRight}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">You&apos;re all caught up! ✨</p>
                </div>
              )}
            </div>
          </div>

          {/* Legacy Tasks Card (Reduced) */}
          <div className="glass-card">
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-lg font-semibold text-foreground">Verification Tasks</h3>
              <button onClick={() => setCurrentView("tasks")} className="btn btn-ghost btn-sm text-muted-foreground">
                View All
                {Icons.arrowRight}
              </button>
            </div>
            <div className="px-6 pb-6 space-y-3">
              {tasks.filter(t => t.status === "pending").slice(0, 2).map((task) => (
                <div key={task.id} className="group p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge badge-glass text-xs capitalize">{task.category}</span>
                        <span className={`badge text-xs capitalize ${
                          task.priority === "high" ? "badge-destructive" : 
                          task.priority === "medium" ? "badge-warning" : "badge-muted"
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {task.title}
                      </h4>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {Icons.user}
                          {task.assignee_name || "Unassigned"}
                        </span>
                        <span className="flex items-center gap-1">
                          {Icons.clock}
                          {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No deadline"}
                        </span>
                      </div>
                    </div>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
                      {Icons.arrowRight}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - QRE & Activity */}
        <div className="space-y-6">
          {/* QRE Breakdown - Only show rdSession data */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">QRE Breakdown</h3>
            {rdSession ? (
              <>
                <div className="space-y-4">
                  {[
                    { label: "Wages", amount: rdSession.wage_qre, percentage: rdSession.total_qre > 0 ? (rdSession.wage_qre / rdSession.total_qre) * 100 : 0, color: "bg-foreground/80" },
                    { label: "Supplies", amount: rdSession.supply_qre, percentage: rdSession.total_qre > 0 ? (rdSession.supply_qre / rdSession.total_qre) * 100 : 0, color: "bg-foreground/50" },
                    { label: "Contract Research", amount: rdSession.contract_qre, percentage: rdSession.total_qre > 0 ? (rdSession.contract_qre / rdSession.total_qre) * 100 : 0, color: "bg-foreground/30" },
                  ].map((category, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{category.label}</span>
                        <span className="font-medium text-foreground">{formatCurrency(category.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full rounded-full ${category.color}`} style={{ width: `${category.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total QRE</span>
                    <span className="text-lg font-semibold text-foreground">{formatCurrency(rdSession.total_qre)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Est. Credit (14% ASC)</span>
                    <span className="text-lg font-semibold text-success">{formatCurrency(rdSession.total_qre * 0.14)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Upload your R&D data to see QRE breakdown</p>
                <button onClick={() => setCurrentView("rd-analysis")} className="btn btn-outline btn-sm mt-2">
                  {Icons.upload} Upload Data
                </button>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No recent activity</p>
              <p className="text-xs mt-1">Activity will appear here after you upload and analyze data</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Organization Info Card */}
      {organization && (
        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{organization.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">Organization Portal</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Share this link with team members:</p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 bg-secondary/50 rounded text-sm text-foreground font-mono">
                  {organization.slug ? `${organization.slug}.taxscape.io` : "No subdomain set"}
                </code>
                {organization.slug && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://${organization.slug}.taxscape.io`);
                      alert("Link copied to clipboard!");
                    }}
                    className="btn btn-ghost btn-icon-sm"
                    title="Copy link"
                  >
                    {Icons.clipboard}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "R&D Projects", icon: Icons.briefcase, verified: projects.length, pending: 3, flagged: 0, total: projects.length + 3, amount: formatCurrency((kpiData.total_qre || 0) * 0.4) },
          { label: "Vendor Expenses", icon: Icons.receipt, verified: contractors.length, pending: 8, flagged: 2, total: contractors.length + 10, amount: formatCurrency((kpiData.total_qre || 0) * 0.22) },
          { label: "Supply Costs", icon: Icons.package, verified: 45, pending: 12, flagged: 0, total: 57, amount: formatCurrency((kpiData.total_qre || 0) * 0.1) },
          { label: "Wage Allocations", icon: Icons.users, verified: employees.length, pending: 4, flagged: 1, total: employees.length + 5, amount: formatCurrency(kpiData.total_wages || 0) },
        ].map((category, index) => (
          <div key={index} className={`glass-card p-5 animate-fade-in animation-delay-${index * 200}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-lg bg-accent/30">
                {category.icon}
              </div>
              <span className="text-lg font-semibold text-foreground">{category.amount}</span>
            </div>
            <h3 className="font-medium text-foreground mb-1">{category.label}</h3>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <span className="text-success">{Icons.check}</span>
                {category.verified} verified
              </span>
              <span className="flex items-center gap-1">
                {Icons.clock}
                {category.pending} pending
              </span>
              {category.flagged > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-destructive">{Icons.alertTriangle}</span>
                  {category.flagged}
                </span>
              )}
            </div>
            <div className="progress h-1.5">
              <div className="progress-indicator" style={{ width: `${(category.verified / category.total) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {category.verified} of {category.total} items verified
            </p>
          </div>
        ))}
      </div>

      {/* User Management */}
      <div className="glass-card">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">User Management</h3>
            <p className="text-sm text-muted-foreground mt-1">Manage team access and permissions</p>
          </div>
          <button onClick={() => setInviteDialogOpen(true)} className="btn btn-primary btn-sm">
            {Icons.userPlus}
            <span>Invite User</span>
          </button>
        </div>
        <div className="px-6 pb-6">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="table">
              <thead>
                <tr className="bg-secondary/30">
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Active</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No team members yet. Invite someone to get started.
                    </td>
                  </tr>
                ) : teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-secondary/20">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center text-sm font-medium text-accent-foreground">
                          {(member.name || member.email || "?").split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{member.name || "Pending"}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select 
                        className="select-trigger text-xs py-1"
                        value={member.role}
                        onChange={(e) => handleUpdateMember(member.user_id, { role: e.target.value })}
                        disabled={member.user_id === user?.id}
                      >
                        <option value="member">Member</option>
                        <option value="project_lead">R&D Project Lead</option>
                        <option value="vendor_approver">Vendor Approver</option>
                        <option value="supply_approver">Supply Approver</option>
                        <option value="hr_verifier">HR Verifier</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${
                        member.status === "active" ? "badge-success" :
                        member.status === "pending" ? "badge-warning" : "badge-muted"
                      }`}>
                        {member.status === "active" ? Icons.check : member.status === "pending" ? Icons.clock : Icons.x}
                        {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                      </span>
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {member.status === "pending" 
                        ? (member.invited_at ? `Invited ${new Date(member.invited_at).toLocaleDateString()}` : "Pending")
                        : (member.accepted_at ? new Date(member.accepted_at).toLocaleDateString() : "-")}
                    </td>
                    <td>
                      {member.user_id !== user?.id && (
                        <button 
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="btn btn-ghost btn-icon-sm text-destructive hover:bg-destructive/10"
                          title="Remove member"
                        >
                          {Icons.x}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderVerification = () => {
    const engTasksCompleted = engineeringTasks.filter(t => t.status === 'completed').length;
    const engTasksPending = engineeringTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header with Task Views */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Task Management</h2>
              <p className="text-sm text-muted-foreground">
                Structured tasks with routing, review, and compliance tracking
              </p>
            </div>
            <button 
              onClick={() => setShowTaskCreateModal(true)}
              className="btn btn-primary btn-sm"
            >
              {Icons.plus}
              <span>New Task</span>
            </button>
          </div>

          {/* Task View Tabs */}
          <div className="flex items-center gap-2 border-b border-border pb-4">
            {[
              { id: 'my', label: 'My Tasks', icon: Icons.user },
              { id: 'client', label: 'Client Tasks', icon: Icons.folderKanban },
              { id: 'review', label: 'Review Queue', icon: Icons.checkCircle },
              { id: 'blockers', label: 'Blockers', icon: Icons.alertTriangle },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTaskView(tab.id as typeof taskView)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  taskView === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task Board */}
        <TaskBoard 
          view={taskView} 
          clientId={selectedClient?.id}
          onTaskSelect={(task) => console.log('Selected task:', task)}
        />

        {/* Legacy Engineering Tasks */}
        <div className="glass-card">
          <div className="flex items-center justify-between p-6 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Legacy Engineering Tasks</h3>
              <p className="text-sm text-muted-foreground mt-1">Project tasks and milestones (legacy view)</p>
            </div>
            {(userRole === 'engineer' || userRole === 'executive' || isOrgAdmin) && (
              <button className="btn btn-outline btn-sm" onClick={() => setModalOpen('task')}>
                {Icons.plus}
                <span>Legacy Task</span>
              </button>
            )}
          </div>
          <div className="px-6 pb-6">
            <div className="space-y-4">
              {engineeringTasks.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3">
                    {Icons.checkCircle}
                  </div>
                  <p className="text-muted-foreground">No engineering tasks</p>
                  <p className="text-xs text-muted-foreground mt-1">Create tasks to track project progress</p>
                </div>
              ) : (
                engineeringTasks.map((task) => (
                  <div key={task.id} className="border border-border rounded-lg p-4 bg-secondary/10 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-foreground">{task.title}</h3>
                          <span className={`badge ${
                            task.status === "completed" ? "badge-success" :
                            task.status === "in_progress" ? "badge-warning" :
                            task.status === "blocked" ? "badge-destructive" : "badge-muted"
                          }`}>
                            {task.status === "completed" ? Icons.check : 
                             task.status === "blocked" ? Icons.x : Icons.clock}
                            {task.status.replace('_', ' ')}
                          </span>
                          <span className={`badge ${
                            task.priority === "high" ? "badge-destructive" :
                            task.priority === "medium" ? "badge-warning" : "badge-muted"
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.assignee_name && (
                            <span className="flex items-center gap-1">
                              {Icons.user}
                              {task.assignee_name}
                            </span>
                          )}
                          {task.project_name && (
                            <span>{task.project_name}</span>
                          )}
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              {Icons.calendar}
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {task.hours_logged > 0 && (
                            <span>{task.hours_logged}h logged</span>
                          )}
                        </div>
                      </div>
                      {task.status !== "completed" && (task.assigned_to === user?.id || userRole === 'engineer' || isOrgAdmin) && (
                        <div className="flex gap-2">
                          {task.status === "pending" && (
                            <button 
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleUpdateEngTaskStatus(task.id, 'in_progress')}
                            >
                              Start
                            </button>
                          )}
                          {task.status === "in_progress" && (
                            <button 
                              className="btn btn-sm bg-success/20 text-success hover:bg-success/30"
                              onClick={() => handleUpdateEngTaskStatus(task.id, 'completed')}
                            >
                              {Icons.check}
                              <span>Complete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Verification Tasks */}
        {tasks.length > 0 && (
          <div className="glass-card">
            <div className="p-6 pb-4">
              <h3 className="text-lg font-semibold text-foreground">Verification Tasks</h3>
              <p className="text-sm text-muted-foreground mt-1">Review and verify assigned items</p>
            </div>
            <div className="px-6 pb-6">
              <div className="space-y-4">
                {tasks.map((task) => (
                  <div key={task.id} className="border border-border rounded-lg p-4 bg-secondary/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-foreground">{task.title}</h3>
                          <span className={`badge ${
                            task.status === "verified" ? "badge-success" :
                            task.status === "denied" ? "badge-destructive" : "badge-warning"
                          }`}>
                            {task.status === "verified" ? Icons.check : 
                             task.status === "denied" ? Icons.x : Icons.clock}
                            {task.status}
                          </span>
                          <span className={`badge badge-muted`}>
                            {task.category}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {task.description || "No description"}
                        </p>
                        {task.assignee_name && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Assigned to: {task.assignee_name}
                          </p>
                        )}
                      </div>
                      {task.status === "pending" && (task.assigned_to === user?.id || isOrgAdmin) && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleUpdateTask(task.id, { status: "verified" })}
                            className="btn btn-sm bg-success/20 text-success hover:bg-success/30"
                          >
                            {Icons.check}
                            <span>Verify</span>
                          </button>
                          <button 
                            onClick={() => handleUpdateTask(task.id, { status: "denied" })}
                            className="btn btn-sm bg-destructive/20 text-destructive hover:bg-destructive/30"
                          >
                            {Icons.x}
                            <span>Deny</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return renderDashboard();
      case "admin":
      case "team":
        return renderAdmin();
      case "verify":
      case "tasks":
        return renderVerification();
      case "budgets":
        return renderBudgets();
      case "expenses":
        return renderExpenses();
      case "time-log":
        return renderTimeLog();
      case "reports":
      case "financial-reports":
        return renderReports();
      case "audit-log":
        return renderAuditLog();
      case "projects":
        return renderProjects();
      case "documents":
        return renderDocuments();
      case "questionnaires":
        return renderAIAssistant();
      case "rd-analysis":
        return renderRDAnalysis();
      case "clients":
        return renderClients();
      default:
        return renderDashboard();
    }
  };

  const renderRDAnalysis = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">R&D Tax Credit Analysis</h2>
            <p className="text-sm text-muted-foreground">
              Upload source data files to analyze R&D expenditures against the four-part test
            </p>
            {/* AI Status Indicator */}
            {aiStatus && (
              <div className={`mt-2 inline-flex items-center gap-2 px-2 py-1 rounded text-xs ${
                aiStatus.available 
                  ? "bg-success/20 text-success" 
                  : "bg-destructive/20 text-destructive"
              }`}>
                <span className={`w-2 h-2 rounded-full ${aiStatus.available ? "bg-success" : "bg-destructive"}`} />
                {aiStatus.available ? "AI Ready" : `AI Unavailable: ${aiStatus.error || 'Check configuration'}`}
              </div>
            )}
          </div>
          {rdSession && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleDownloadRDReport} 
                disabled={isDownloadingReport}
                className="btn btn-primary btn-sm"
              >
                {isDownloadingReport ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    {Icons.download}
                    <span>Generate Report</span>
                  </>
                )}
              </button>
              <button onClick={handleResetRDAnalysis} className="btn btn-outline btn-sm">
                {Icons.refresh}
                <span>New Analysis</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {rdError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {Icons.alertTriangle}
              <div>
                <p className="font-medium">Analysis Error</p>
                <p className="text-sm mt-1">{rdError}</p>
              </div>
            </div>
            <button 
              onClick={handleResetRDAnalysis}
              className="btn btn-sm bg-destructive/20 hover:bg-destructive/30 text-destructive"
            >
              Clear & Start Over
            </button>
          </div>
        </div>
      )}

      {/* Upload Zone - Show when no session */}
      {!rdSession && !isRdParsing && (
        <div className="glass-card p-6">
          <FileUploadZone
            onFilesSelected={handleRDFilesSelected}
            isUploading={isRdUploading}
            acceptedTypes={[".xlsx", ".xls", ".csv", ".pdf", ".docx"]}
            maxFiles={10}
          />
        </div>
      )}

      {/* Parsing Progress */}
      {isRdParsing && (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
            <svg className="animate-spin h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-foreground">Analyzing with AI...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Evaluating projects against the four-part test
          </p>
        </div>
      )}

      {/* Analysis Results */}
      {rdSession && !isRdParsing && (
        <>
          {/* Company Info */}
          {rdSession.company_name && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                  {Icons.building}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{rdSession.company_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {rdSession.industry || "Industry not specified"} • Tax Year {rdSession.tax_year}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{rdSession.projects.length}</p>
              <p className="text-xs text-muted-foreground">Projects</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-success">{rdSession.qualified_projects}</p>
              <p className="text-xs text-muted-foreground">Qualified</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{rdSession.total_employees}</p>
              <p className="text-xs text-muted-foreground">Employees</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{rdSession.rd_employees}</p>
              <p className="text-xs text-muted-foreground">R&D Staff</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{formatCurrency(rdSession.total_qre)}</p>
              <p className="text-xs text-muted-foreground">Total QRE</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-2xl font-bold text-warning">{rdSession.gaps.length}</p>
              <p className="text-xs text-muted-foreground">Gaps</p>
            </div>
          </div>

          {/* QRE Breakdown */}
          {rdSession.total_qre > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">QRE Breakdown</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Wage QRE</p>
                  <p className="text-xl font-semibold">{formatCurrency(rdSession.wage_qre)}</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent rounded-full" 
                      style={{ width: `${rdSession.total_qre > 0 ? (rdSession.wage_qre / rdSession.total_qre) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Supply QRE</p>
                  <p className="text-xl font-semibold">{formatCurrency(rdSession.supply_qre)}</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-success rounded-full" 
                      style={{ width: `${rdSession.total_qre > 0 ? (rdSession.supply_qre / rdSession.total_qre) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Contract QRE</p>
                  <p className="text-xl font-semibold">{formatCurrency(rdSession.contract_qre)}</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-warning rounded-full" 
                      style={{ width: `${rdSession.total_qre > 0 ? (rdSession.contract_qre / rdSession.total_qre) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Four-Part Test Results */}
          {rdSession.projects.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Four-Part Test Analysis</h3>
              <FourPartTestSummary projects={rdSession.projects as RDProject[]} />
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rdSession.projects.map((project) => (
                  <FourPartTestCard
                    key={project.project_id}
                    project={project as RDProject}
                    onReEvaluate={handleReEvaluateProject}
                    isEvaluating={evaluatingProjectId === project.project_id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Gap Analysis */}
          {rdSession.gaps.length > 0 && (
            <div className="glass-card p-6">
              <GapAnalysisPanel
                gaps={rdSession.gaps}
                onUploadForGap={handleUploadForGap}
                isUploading={!!uploadingGapId}
                uploadingGapId={uploadingGapId || undefined}
              />
            </div>
          )}

          {/* Errors from parsing */}
          {rdSession.errors && rdSession.errors.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4 text-warning">Parsing Warnings</h3>
              <ul className="space-y-2">
                {rdSession.errors.map((err, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-warning">•</span>
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderClients = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Client Companies</h2>
            <p className="text-sm text-muted-foreground">Manage your client companies for R&D tax credit studies</p>
          </div>
          <button 
            onClick={() => setShowAddClientModal(true)}
            className="btn btn-primary"
          >
            {Icons.plus}
            <span>Add Client</span>
          </button>
        </div>
        
        {clientCompanies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              {Icons.building}
            </div>
            <p className="text-lg font-medium mb-2">No client companies yet</p>
            <p className="text-sm mb-4">Add your first client company to get started with R&D tax credits</p>
            <button 
              onClick={() => setShowAddClientModal(true)}
              className="btn btn-primary"
            >
              {Icons.plus}
              <span>Add Your First Client</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientCompanies.map((client) => (
              <div 
                key={client.id} 
                className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                  selectedClient?.id === client.id 
                    ? "border-accent bg-accent/5 ring-2 ring-accent/20" 
                    : "border-border bg-card hover:border-accent/50"
                }`}
                onClick={() => handleSelectClient(client)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                    {Icons.building}
                  </div>
                  {selectedClient?.id === client.id && (
                    <span className="badge badge-success">Active</span>
                  )}
                </div>
                <h3 className="font-semibold text-foreground mb-1">{client.name}</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {client.industry || "No industry"} • FY{client.tax_year}
                </p>
                {client.contact_name && (
                  <p className="text-xs text-muted-foreground">
                    Contact: {client.contact_name}
                  </p>
                )}
                {client.contact_email && (
                  <p className="text-xs text-muted-foreground">
                    {client.contact_email}
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Added {new Date(client.created_at).toLocaleDateString()}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectClient(client);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAIAssistant = () => (
    <div className="space-y-6 animate-fade-in h-full">
      <div className="glass-card p-6 h-[calc(100vh-200px)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">AI Assistant</h2>
            <p className="text-sm text-muted-foreground">Ask questions about R&D tax credits or validate your projects</p>
          </div>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] p-4 rounded-2xl ${
                msg.role === "user" 
                  ? "bg-accent text-accent-foreground rounded-br-md" 
                  : "bg-muted/50 rounded-bl-md"
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted/50 p-4 rounded-2xl rounded-bl-md">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-foreground/50 animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-foreground/50 animate-pulse [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-foreground/50 animate-pulse [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* File Attachments Preview */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 p-2 rounded-lg bg-muted/30">
            {attachedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/20 text-sm">
                {Icons.file}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {Icons.x}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept=".csv,.xlsx,.xls,.pdf,.doc,.docx"
            onChange={(e) => {
              if (e.target.files) {
                setAttachedFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost btn-icon shrink-0"
          >
            {Icons.paperclip}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about R&D tax credits, project qualification..."
            className="input flex-1"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            className="btn btn-primary shrink-0"
          >
            {Icons.send}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        {/* Structured Output */}
        {structured && Object.keys(structured).length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-success">Study data extracted</p>
              <button
                onClick={handleGenerateStudy}
                disabled={isGenerating}
                className="btn btn-sm btn-success"
              >
                {isGenerating ? "Generating..." : "Download Excel"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click to generate your R&D tax credit study report
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Placeholder renderers for new views
  const renderBudgets = () => {
    const totalBudget = budgets.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(totalBudget)}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Total Spent</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(totalSpent)}</p>
            <div className="progress mt-2 h-1.5">
              <div className="progress-indicator" style={{ width: `${totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Remaining</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(totalBudget - totalSpent)}</p>
          </div>
        </div>

        {/* Budget List */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Budget Management</h2>
              <p className="text-sm text-muted-foreground">Create and manage project budgets</p>
            </div>
            <button className="btn btn-primary" onClick={() => setModalOpen('budget')}>
              {Icons.plus}
              <span>New Budget</span>
            </button>
          </div>
          
          {budgets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                {Icons.dollarSign}
              </div>
              <p className="text-lg font-medium mb-2">No budgets yet</p>
              <p className="text-sm">Create your first budget to start tracking project finances</p>
            </div>
          ) : (
            <div className="space-y-4">
              {budgets.map((budget) => (
                <div key={budget.id} className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-foreground">{budget.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {budget.project_name || 'General'} • {budget.fiscal_year}
                      </p>
                    </div>
                    <span className={`badge ${
                      budget.status === 'active' ? 'badge-success' :
                      budget.status === 'closed' ? 'badge-muted' : 'badge-warning'
                    }`}>
                      {budget.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>Budget: {formatCurrency(budget.total_amount || 0)}</span>
                    <span>Spent: {formatCurrency(budget.spent || 0)}</span>
                    <span>Remaining: {formatCurrency(budget.remaining || 0)}</span>
                  </div>
                  <div className="progress mt-3 h-2">
                    <div 
                      className={`progress-indicator ${(budget.spent || 0) / (budget.total_amount || 1) > 0.9 ? 'bg-destructive' : ''}`}
                      style={{ width: `${(budget.total_amount || 0) > 0 ? ((budget.spent || 0) / (budget.total_amount || 1)) * 100 : 0}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderExpenses = () => {
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pendingExpenses = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + (e.amount || 0), 0);
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(totalExpenses)}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Pending Approval</p>
            <p className="text-2xl font-semibold text-warning mt-1">{formatCurrency(pendingExpenses)}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">This Month</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{expenses.length} entries</p>
          </div>
        </div>

        {/* Expense List */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Expense Tracking</h2>
              <p className="text-sm text-muted-foreground">Log and monitor project expenses</p>
            </div>
            <button className="btn btn-primary" onClick={() => setModalOpen('expense')}>
              {Icons.plus}
              <span>Log Expense</span>
            </button>
          </div>
          
          {expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                {Icons.receipt}
              </div>
              <p className="text-lg font-medium mb-2">No expenses logged</p>
              <p className="text-sm">Start logging expenses to track project costs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => (
                <div key={expense.id} className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground">{expense.description}</h3>
                        <span className={`badge text-xs ${
                          expense.status === 'approved' ? 'badge-success' :
                          expense.status === 'rejected' ? 'badge-destructive' : 'badge-warning'
                        }`}>
                          {expense.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{expense.category || 'Uncategorized'}</span>
                        {expense.vendor_name && <span>• {expense.vendor_name}</span>}
                        <span>• {new Date(expense.expense_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTimeLog = () => {
    const totalHours = timeLogs.reduce((sum, l) => sum + (l.hours || 0), 0);
    const thisWeekLogs = timeLogs.filter(l => {
      const logDate = new Date(l.log_date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return logDate >= weekAgo;
    });
    const thisWeekHours = thisWeekLogs.reduce((sum, l) => sum + (l.hours || 0), 0);
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{totalHours.toFixed(1)}h</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">This Week</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{thisWeekHours.toFixed(1)}h</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Log Entries</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{timeLogs.length}</p>
          </div>
        </div>

        {/* Time Log List */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Time Logging</h2>
              <p className="text-sm text-muted-foreground">Track hours worked on tasks and projects</p>
            </div>
            <button className="btn btn-primary" onClick={() => setModalOpen('timelog')}>
              {Icons.plus}
              <span>Log Hours</span>
            </button>
          </div>
          
          {timeLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                {Icons.clock}
              </div>
              <p className="text-lg font-medium mb-2">No time logged</p>
              <p className="text-sm">Start tracking your work hours for accurate project billing</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground">{log.description || 'Time entry'}</h3>
                        {log.billable && (
                          <span className="badge badge-success text-xs">Billable</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {log.task_title && <span>{log.task_title}</span>}
                        {log.project_name && <span>• {log.project_name}</span>}
                        <span>• {new Date(log.log_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <p className="text-lg font-semibold text-foreground">{log.hours}h</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReports = () => {
    const totalBudget = budgets.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalHours = timeLogs.reduce((sum, l) => sum + (l.hours || 0), 0);
    const completedTasks = engineeringTasks.filter(t => t.status === 'completed').length;
    
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Reports & Analytics</h2>
              <p className="text-sm text-muted-foreground">View financial and project performance metrics</p>
            </div>
            <button className="btn btn-secondary">
              {Icons.download}
              <span>Export Report</span>
            </button>
          </div>
          
          {/* Financial Metrics */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Financial Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Total Budget</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalBudget)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Total Spent</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalSpent)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-2xl font-semibold">{formatCurrency(totalBudget - totalSpent)}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Budget Used</p>
              <p className="text-2xl font-semibold">{totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(0) : 0}%</p>
              <div className="progress mt-2 h-1.5">
                <div 
                  className={`progress-indicator ${totalBudget > 0 && (totalSpent / totalBudget) > 0.9 ? 'bg-destructive' : ''}`}
                  style={{ width: `${totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>

          {/* Project Metrics */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Project Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Active Projects</p>
              <p className="text-2xl font-semibold">{projects.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Total Tasks</p>
              <p className="text-2xl font-semibold">{engineeringTasks.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Completed Tasks</p>
              <p className="text-2xl font-semibold">{completedTasks}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Total Hours Logged</p>
              <p className="text-2xl font-semibold">{totalHours.toFixed(1)}h</p>
            </div>
          </div>

          {/* Team Overview */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Team Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Team Members</p>
              <p className="text-2xl font-semibold">{teamMembers.filter(m => m.status === 'active').length}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Pending Invites</p>
              <p className="text-2xl font-semibold">{teamMembers.filter(m => m.status === 'pending').length}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Active Budgets</p>
              <p className="text-2xl font-semibold">{budgets.filter(b => b.status === 'active').length}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAuditLog = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Audit Log</h2>
            <p className="text-sm text-muted-foreground">View all activity in your organization</p>
          </div>
        </div>
        <div className="space-y-3">
          {auditLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                {Icons.fileCheck}
              </div>
              <p className="text-lg font-medium mb-2">No activity yet</p>
              <p className="text-sm">Actions will be logged here as your team works</p>
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-4 rounded-lg bg-muted/20 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  {Icons.user}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{log.action}</p>
                  <p className="text-sm text-muted-foreground">{log.user_name || log.user_email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">
              {rdSession ? `${rdSession.projects.length} projects from uploaded data` : "Upload data to see R&D projects"}
            </p>
          </div>
          {!rdSession && (
            <button 
              onClick={() => setCurrentView("rd-analysis")}
              className="btn btn-primary"
            >
              {Icons.upload}
              <span>Upload Data</span>
            </button>
          )}
        </div>
        {!rdSession ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              {Icons.upload}
            </div>
            <p className="text-lg font-medium mb-2">No projects yet</p>
            <p className="text-sm mb-4">Upload your R&D source files to analyze projects</p>
            <button 
              onClick={() => setCurrentView("rd-analysis")}
              className="btn btn-primary"
            >
              {Icons.upload}
              <span>Go to Upload</span>
            </button>
          </div>
        ) : rdSession.projects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              {Icons.folderKanban}
            </div>
            <p className="text-lg font-medium mb-2">No projects found in data</p>
            <p className="text-sm mb-4">The uploaded file did not contain any project data</p>
          </div>
        ) : (
          /* Render rdSession.projects */
          <div className="grid grid-cols-1 gap-4">
            {rdSession.projects.map((project) => (
              <div key={project.project_id} className={`p-5 rounded-xl border bg-card transition-all group ${
                project.qualified ? 'border-success/50 hover:border-success' : 'border-border hover:border-accent/50'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-foreground text-lg">{project.project_name}</h3>
                      <span className={`badge ${project.qualified ? "badge-success" : "badge-destructive"}`}>
                        {project.qualified ? "Qualified" : "Not Qualified"}
                      </span>
                      <span className="badge bg-accent/20 text-accent">
                        {Math.round(project.confidence_score * 100)}% Confidence
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
                    
                    {/* AI Summary */}
                    {project.ai_summary && (
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          {Icons.sparkles}
                          <p className="text-xs uppercase tracking-wider font-bold text-accent">AI Analysis</p>
                        </div>
                        <p className="text-sm text-foreground">{project.ai_summary}</p>
                      </div>
                    )}
                    
                    {/* Four-Part Test Results */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className={`p-3 rounded-lg ${project.four_part_test.permitted_purpose ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'} border`}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Permitted Purpose</p>
                        <span className="text-sm font-medium">{project.four_part_test.permitted_purpose ? '✓ Pass' : '✗ Fail'}</span>
                      </div>
                      <div className={`p-3 rounded-lg ${project.four_part_test.technological_nature ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'} border`}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Tech Nature</p>
                        <span className="text-sm font-medium">{project.four_part_test.technological_nature ? '✓ Pass' : '✗ Fail'}</span>
                      </div>
                      <div className={`p-3 rounded-lg ${project.four_part_test.elimination_uncertainty ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'} border`}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Uncertainty</p>
                        <span className="text-sm font-medium">{project.four_part_test.elimination_uncertainty ? '✓ Pass' : '✗ Fail'}</span>
                      </div>
                      <div className={`p-3 rounded-lg ${project.four_part_test.process_experimentation ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'} border`}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Experimentation</p>
                        <span className="text-sm font-medium">{project.four_part_test.process_experimentation ? '✓ Pass' : '✗ Fail'}</span>
                      </div>
                    </div>
                    
                    {/* Missing Info */}
                    {project.missing_info && project.missing_info.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <p className="text-xs font-semibold text-warning mb-1">Missing Information</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {project.missing_info.map((info, i) => <li key={i}>{info}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Documents</h2>
            <p className="text-sm text-muted-foreground">Upload and manage project documentation</p>
          </div>
          <button className="btn btn-primary">
            {Icons.upload}
            <span>Upload</span>
          </button>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
            {Icons.fileText}
          </div>
          <p className="text-lg font-medium mb-2">No documents uploaded</p>
          <p className="text-sm">Upload payroll data, contracts, or other supporting documents</p>
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent">
            {Icons.beaker}
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground">R&D Credit</span>
              <span className="text-xs text-sidebar-foreground/60">Portal</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <span className="px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Main
              </span>
            )}
            <div className="space-y-1 mt-2">
              {mainNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`sidebar-nav-item w-full ${currentView === item.id ? "sidebar-nav-item-active" : ""}`}
                >
                  {item.icon}
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {'badge' in item && item.badge && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-accent/50 text-accent-foreground">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {!sidebarCollapsed && (
              <span className="px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Tools
              </span>
            )}
            <div className="space-y-1 mt-2">
              {toolsNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`sidebar-nav-item w-full ${currentView === item.id ? "sidebar-nav-item-active" : ""}`}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <button onClick={() => {}} className="sidebar-nav-item w-full">
            {Icons.settings}
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="btn btn-ghost btn-icon-sm w-full mt-2 text-sidebar-foreground/50 hover:text-sidebar-foreground"
          >
            {sidebarCollapsed ? Icons.chevronRight : Icons.chevronLeft}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="header">
          <div className="h-full px-6 flex items-center justify-between">
            {/* Left - Title */}
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {currentView === "dashboard" ? "Dashboard" :
                   currentView === "admin" || currentView === "team" ? "Team Management" :
                   currentView === "verify" || currentView === "tasks" ? "Tasks & Verification" :
                   currentView === "budgets" ? "Budget Management" :
                   currentView === "expenses" ? "Expense Tracking" :
                   currentView === "time-log" ? "Time Logging" :
                   currentView === "reports" || currentView === "financial-reports" ? "Reports & Analytics" :
                   currentView === "audit-log" ? "Audit Log" :
                   currentView === "projects" ? "Projects" :
                   currentView === "documents" ? "Documents" :
                   currentView === "questionnaires" ? "AI Assistant" :
                   currentView === "rd-analysis" ? "R&D Analysis" :
                   currentView === "clients" ? "Client Companies" :
                   currentView.charAt(0).toUpperCase() + currentView.slice(1).replace(/-/g, ' ')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {selectedClient ? `${selectedClient.name} • FY${selectedClient.tax_year}` : `FY${new Date().getFullYear()} R&D Tax Credit Study`}
                </p>
              </div>
            </div>

            {/* Center - Search */}
            <div className="hidden md:flex items-center max-w-md flex-1 mx-8">
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{Icons.search}</span>
                <input
                  type="text"
                  placeholder="Search projects, expenses, documents..."
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Right - Actions */}
            <div className="flex items-center gap-3">
              {/* Continue Onboarding Button - shown if user has incomplete onboarding */}
              {hasIncompleteOnboarding && (
                <button 
                  onClick={() => router.push("/onboarding")} 
                  className="btn btn-primary btn-sm hidden lg:flex gap-2 animate-pulse"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                  <span>Continue Onboarding</span>
                </button>
              )}

              {/* Copilot Button */}
              <button 
                onClick={() => setIsCopilotOpen(!isCopilotOpen)} 
                className={`btn btn-sm hidden lg:flex gap-2 transition-all ${isCopilotOpen ? 'btn-primary' : 'btn-glass'}`}
              >
                {Icons.sparkles}
                <span>Copilot</span>
              </button>

              {/* AI Assistant Button */}
              <button onClick={() => setShowChat(true)} className="btn btn-glass btn-sm hidden lg:flex gap-2">
                {Icons.messageSquare}
                <span>Support</span>
              </button>

              {/* Client Selector */}
              <div className="relative hidden lg:block">
                <button 
                  onClick={() => setShowClientSelector(!showClientSelector)}
                  className="btn btn-glass btn-sm flex gap-2"
                >
                  {Icons.building}
                  <span className="max-w-[150px] truncate">
                    {selectedClient?.name || "Select Client"}
                  </span>
                  <span className="badge badge-glass ml-1">
                    FY{selectedClient?.tax_year || new Date().getFullYear()}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
                
                {/* Dropdown */}
                {showClientSelector && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-card rounded-xl border border-border shadow-lg z-50 overflow-hidden">
                    <div className="p-3 border-b border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Client Companies
                      </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {clientCompanies.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No client companies yet
                        </div>
                      ) : (
                        clientCompanies.map((client) => (
                          <button
                            key={client.id}
                            onClick={() => handleSelectClient(client)}
                            className={`w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between ${
                              selectedClient?.id === client.id ? "bg-accent/20" : ""
                            }`}
                          >
                            <div>
                              <p className="font-medium text-foreground">{client.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {client.industry || "No industry"} • FY{client.tax_year}
                              </p>
                            </div>
                            {selectedClient?.id === client.id && (
                              <span className="text-accent">{Icons.check}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="p-2 border-t border-border">
                      <button
                        onClick={() => {
                          setShowClientSelector(false);
                          setShowAddClientModal(true);
                        }}
                        className="w-full btn btn-ghost btn-sm justify-center"
                      >
                        {Icons.plus}
                        <span>Add Client Company</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notifications */}
              <button className="btn btn-ghost btn-icon relative">
                {Icons.bell}
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-warning" />
              </button>

              {/* User */}
              <button onClick={handleLogout} className="btn btn-ghost btn-icon rounded-full">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                  {Icons.user}
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {isLoadingData && !dashboard ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="mt-4 text-sm text-muted-foreground">Loading your data...</p>
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>

      {/* AI Chat Panel */}
      {showChat && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowChat(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-lg glass-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chat Header */}
            <div className="h-16 px-5 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/30 flex items-center justify-center">
                  {Icons.sparkles}
                </div>
                <div>
                  <h3 className="font-medium text-foreground">R&D Tax Assistant</h3>
                  <p className="text-xs text-muted-foreground">AI-powered analysis</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleNewChat} className="btn btn-ghost btn-icon-sm" title="New conversation">
                  {Icons.plus}
                </button>
                <button onClick={() => setShowChat(false)} className="btn btn-ghost btn-icon-sm">
                  {Icons.x}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "75ms" }} />
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Study Ready Indicator */}
            {structured && (
              <div className="px-5 py-3 border-t border-border bg-success/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-success">{Icons.check}</span>
                    <span className="text-sm font-medium text-success">Study data ready</span>
                  </div>
                  <button
                    onClick={handleGenerateStudy}
                    disabled={isGenerating}
                    className="btn btn-success btn-sm"
                  >
                    {Icons.download}
                    {isGenerating ? "Generating..." : "Download Excel"}
                  </button>
                </div>
              </div>
            )}

            {/* Attached Files */}
            {attachedFiles.length > 0 && (
              <div className="px-5 py-3 border-t border-border bg-secondary/30">
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg text-xs">
                      {Icons.file}
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button onClick={() => removeAttachedFile(idx)} className="text-muted-foreground hover:text-foreground">
                        {Icons.x}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={handleAttachFile}
                  disabled={isLoading}
                  className="btn btn-outline btn-icon"
                  title="Attach files"
                >
                  {Icons.paperclip}
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Describe your R&D project..."
                  className="input flex-1"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                  className="btn btn-primary btn-icon"
                >
                  {Icons.send}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Say &quot;Generate Study&quot; when ready for Excel export
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      {inviteDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setInviteDialogOpen(false)}>
          <div className="dialog-content max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Invite Team Member</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Send an invitation email to add a new team member to your organization.
              </p>
            </div>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <input 
                  type="email" 
                  placeholder="colleague@company.com" 
                  className="input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Role</label>
                <select 
                  className="select-trigger"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="project_lead">R&D Project Lead</option>
                  <option value="vendor_approver">Vendor Spend Approver</option>
                  <option value="supply_approver">Supply Expense Approver</option>
                  <option value="hr_verifier">Payroll/HR Verifier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setInviteDialogOpen(false)} className="btn btn-outline btn-md">
                Cancel
              </button>
              <button 
                onClick={handleInviteMember} 
                disabled={isInviting || !inviteEmail}
                className="btn btn-primary btn-md"
              >
                {Icons.send}
                <span>{isInviting ? "Sending..." : "Send Invitation"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      <Modal open={modalOpen === 'budget'} onClose={closeModal} title="Create New Budget">
        <form onSubmit={handleCreateBudget} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Budget Name *</label>
            <input
              type="text"
              value={budgetForm.name}
              onChange={(e) => setBudgetForm(prev => ({ ...prev, name: e.target.value }))}
              className="input"
              placeholder="e.g., Q1 Development Budget"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Project</label>
            <select
              value={budgetForm.project_id}
              onChange={(e) => setBudgetForm(prev => ({ ...prev, project_id: e.target.value }))}
              className="input"
            >
              <option value="">General (No specific project)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Total Amount</label>
              <input
                type="number"
                value={budgetForm.total_amount}
                onChange={(e) => setBudgetForm(prev => ({ ...prev, total_amount: e.target.value }))}
                className="input"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Fiscal Year</label>
              <input
                type="text"
                value={budgetForm.fiscal_year}
                onChange={(e) => setBudgetForm(prev => ({ ...prev, fiscal_year: e.target.value }))}
                className="input"
                placeholder="2024"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <select
              value={budgetForm.category}
              onChange={(e) => setBudgetForm(prev => ({ ...prev, category: e.target.value }))}
              className="input"
            >
              <option value="">Select category</option>
              <option value="personnel">Personnel</option>
              <option value="materials">Materials</option>
              <option value="software">Software</option>
              <option value="contractors">Contractors</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={budgetForm.notes}
              onChange={(e) => setBudgetForm(prev => ({ ...prev, notes: e.target.value }))}
              className="input min-h-[80px]"
              placeholder="Optional notes about this budget..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeModal} className="btn btn-outline btn-md">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
              {isSubmitting ? "Creating..." : "Create Budget"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Expense Form Modal */}
      <Modal open={modalOpen === 'expense'} onClose={closeModal} title="Log New Expense">
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description *</label>
            <input
              type="text"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
              className="input"
              placeholder="e.g., Software license renewal"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount *</label>
              <input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                className="input"
                placeholder="0.00"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Date</label>
              <input
                type="date"
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_date: e.target.value }))}
                className="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Budget</label>
              <select
                value={expenseForm.budget_id}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, budget_id: e.target.value }))}
                className="input"
              >
                <option value="">No budget</option>
                {budgets.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project</label>
              <select
                value={expenseForm.project_id}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, project_id: e.target.value }))}
                className="input"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                className="input"
              >
                <option value="">Select category</option>
                <option value="personnel">Personnel</option>
                <option value="materials">Materials</option>
                <option value="software">Software</option>
                <option value="contractors">Contractors</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Vendor</label>
              <input
                type="text"
                value={expenseForm.vendor_name}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, vendor_name: e.target.value }))}
                className="input"
                placeholder="Vendor name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeModal} className="btn btn-outline btn-md">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
              {isSubmitting ? "Logging..." : "Log Expense"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Engineering Task Form Modal */}
      <Modal open={modalOpen === 'task'} onClose={closeModal} title="Create New Task">
        <form onSubmit={handleCreateEngTask} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Task Title *</label>
            <input
              type="text"
              value={taskForm.title}
              onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
              className="input"
              placeholder="e.g., Implement user authentication"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
              className="input min-h-[80px]"
              placeholder="Describe the task..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project</label>
              <select
                value={taskForm.project_id}
                onChange={(e) => setTaskForm(prev => ({ ...prev, project_id: e.target.value }))}
                className="input"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Priority</label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                className="input"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Assign To</label>
              <select
                value={taskForm.assigned_to}
                onChange={(e) => setTaskForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                className="input"
              >
                <option value="">Unassigned</option>
                {teamMembers.filter(m => m.status === 'active').map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.name || m.email || m.user_id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
              <input
                type="date"
                value={taskForm.due_date}
                onChange={(e) => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                className="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Estimated Hours</label>
              <input
                type="number"
                value={taskForm.estimated_hours}
                onChange={(e) => setTaskForm(prev => ({ ...prev, estimated_hours: e.target.value }))}
                className="input"
                placeholder="0"
                min="0"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Milestone</label>
              <input
                type="text"
                value={taskForm.milestone}
                onChange={(e) => setTaskForm(prev => ({ ...prev, milestone: e.target.value }))}
                className="input"
                placeholder="e.g., Sprint 1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeModal} className="btn btn-outline btn-md">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
              {isSubmitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Time Log Form Modal */}
      <Modal open={modalOpen === 'timelog'} onClose={closeModal} title="Log Work Hours">
        <form onSubmit={handleCreateTimeLog} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Hours *</label>
              <input
                type="number"
                value={timeLogForm.hours}
                onChange={(e) => setTimeLogForm(prev => ({ ...prev, hours: e.target.value }))}
                className="input"
                placeholder="0.0"
                min="0.25"
                step="0.25"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Date</label>
              <input
                type="date"
                value={timeLogForm.log_date}
                onChange={(e) => setTimeLogForm(prev => ({ ...prev, log_date: e.target.value }))}
                className="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Task</label>
              <select
                value={timeLogForm.task_id}
                onChange={(e) => setTimeLogForm(prev => ({ ...prev, task_id: e.target.value }))}
                className="input"
              >
                <option value="">No specific task</option>
                {engineeringTasks.filter(t => t.status !== 'completed').map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project</label>
              <select
                value={timeLogForm.project_id}
                onChange={(e) => setTimeLogForm(prev => ({ ...prev, project_id: e.target.value }))}
                className="input"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={timeLogForm.description}
              onChange={(e) => setTimeLogForm(prev => ({ ...prev, description: e.target.value }))}
              className="input min-h-[80px]"
              placeholder="What did you work on?"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="billable"
              checked={timeLogForm.billable}
              onChange={(e) => setTimeLogForm(prev => ({ ...prev, billable: e.target.checked }))}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="billable" className="text-sm text-foreground">Billable hours</label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeModal} className="btn btn-outline btn-md">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-md">
              {isSubmitting ? "Logging..." : "Log Hours"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Client Company Modal */}
      {showAddClientModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddClientModal(false)}
        >
          <div 
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Add Client Company</h2>
              <button
                onClick={() => setShowAddClientModal(false)}
                className="btn btn-ghost btn-icon-sm"
              >
                {Icons.x}
              </button>
            </div>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={newClientForm.name}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                  placeholder="Acme Corporation"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Industry
                  </label>
                  <select
                    value={newClientForm.industry}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, industry: e.target.value }))}
                    className="input"
                  >
                    <option value="">Select industry</option>
                    <option value="technology">Technology</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="finance">Finance</option>
                    <option value="retail">Retail</option>
                    <option value="energy">Energy</option>
                    <option value="construction">Construction</option>
                    <option value="agriculture">Agriculture</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Tax Year
                  </label>
                  <input
                    type="text"
                    value={newClientForm.tax_year}
                    onChange={(e) => setNewClientForm(prev => ({ ...prev, tax_year: e.target.value }))}
                    className="input"
                    placeholder="2024"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newClientForm.contact_name}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="input"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={newClientForm.contact_email}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="input"
                  placeholder="john@acme.com"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddClientModal(false)} 
                  className="btn btn-outline btn-md"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isAddingClient || !newClientForm.name.trim()}
                  className="btn btn-primary btn-md"
                >
                  {isAddingClient ? "Adding..." : "Add Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Project Modal */}
      {showAddProjectModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddProjectModal(false)}
        >
          <div 
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">New R&D Project</h2>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="btn btn-ghost btn-icon-sm"
              >
                {Icons.x}
              </button>
            </div>
            <form onSubmit={handleAddProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                  placeholder="e.g. Next-Gen AI Engine"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <textarea
                  value={projectForm.description}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input min-h-[80px]"
                  placeholder="Briefly describe the project goals..."
                />
              </div>
              
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 space-y-4">
                <p className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                  {Icons.sparkles}
                  Four-Part Test Preparation
                </p>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Technical Uncertainty
                  </label>
                  <textarea
                    value={projectForm.technical_uncertainty}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, technical_uncertainty: e.target.value }))}
                    className="input text-sm min-h-[60px]"
                    placeholder="What was technically unknown at the start? (Capability, methodology, or design?)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Process of Experimentation
                  </label>
                  <textarea
                    value={projectForm.process_of_experimentation}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, process_of_experimentation: e.target.value }))}
                    className="input text-sm min-h-[60px]"
                    placeholder="How did you test alternatives? (Modeling, simulation, trial & error?)"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddProjectModal(false)} 
                  className="btn btn-outline btn-md"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || !projectForm.name.trim()}
                  className="btn btn-primary btn-md"
                >
                  {isSubmitting ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Click outside to close client selector */}
      {showClientSelector && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowClientSelector(false)}
        />
      )}

      {/* Copilot Panel */}
      <CopilotPanel 
        isOpen={isCopilotOpen} 
        onClose={() => setIsCopilotOpen(false)} 
        clientId={selectedClient?.id || ''}
        projectId={currentView === 'projects' ? projects[0]?.id : undefined}
      />

      {/* Task Create Modal */}
      <TaskCreateModal
        isOpen={showTaskCreateModal}
        onClose={() => setShowTaskCreateModal(false)}
        clientId={selectedClient?.id || ''}
        projectId={currentView === 'projects' ? projects[0]?.id : undefined}
      />
    </div>
  );
}
