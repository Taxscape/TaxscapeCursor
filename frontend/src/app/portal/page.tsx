"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  sendChatMessage,
  sendChatMessageDemo,
  downloadChatExcel,
  getDashboard,
  getProjects,
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
  type ChatMessage,
  type DashboardData,
  type Project,
  type ChatSession,
  type Employee,
  type Contractor,
  type OrganizationMember,
  type VerificationTask,
  type AuditLogEntry,
} from "@/lib/api";

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
};

// ============================================================================
// TYPES
// ============================================================================
type UserRole = "admin" | "project_lead" | "vendor_approver" | "supply_approver" | "hr_verifier" | "member";
type ViewMode = "dashboard" | "admin" | "verify" | "projects" | "expenses" | "documents" | "questionnaires";

// Initial chat message
const initialMessage: ChatMessage = {
  role: "assistant",
  content: "Hello! I'm your R&D Tax Credit Assistant. I can help you validate projects, review data, or answer questions about qualifying activities. What would you like to work on today?",
};

// ============================================================================
// MAIN PORTAL COMPONENT
// ============================================================================
export default function Portal() {
  const router = useRouter();
  const { user, profile, organization, userRole, isLoading: authLoading, isOrgAdmin, signOut } = useAuth();

  // Navigation state
  const [currentView, setCurrentView] = useState<ViewMode>("dashboard");
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
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [isInviting, setIsInviting] = useState(false);

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

  // Navigation items
  const mainNavItems = useMemo(() => [
    { id: "dashboard" as const, label: "Dashboard", icon: Icons.layoutDashboard },
    { id: "admin" as const, label: "Admin Portal", icon: Icons.users },
    { id: "verify" as const, label: "Verification", icon: Icons.checkCircle, badge: pendingTasksCount > 0 ? pendingTasksCount.toString() : undefined },
    { id: "projects" as const, label: "Projects", icon: Icons.folderKanban, badge: projects.length.toString() },
    { id: "expenses" as const, label: "Expenses", icon: Icons.dollarSign },
    { id: "documents" as const, label: "Documents", icon: Icons.fileText },
  ], [pendingTasksCount, projects.length]);

  const toolsNavItems = useMemo(() => [
    { id: "questionnaires" as const, label: "Questionnaires", icon: Icons.messageSquare },
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
        const [membersData, tasksData, auditData] = await Promise.all([
          getOrganizationMembers(organization.id).catch((e) => { console.error("Members error:", e); return []; }),
          getVerificationTasks(organization.id).catch((e) => { console.error("Tasks error:", e); return []; }),
          isOrgAdmin ? getAuditLog(organization.id, 50).catch((e) => { console.error("Audit error:", e); return []; }) : Promise.resolve([]),
        ]);
        setTeamMembers(membersData);
        setTasks(tasksData);
        setAuditLogs(auditData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load data";
      setApiError(errorMessage);
    } finally {
      setIsLoadingData(false);
    }
  }, [user, organization?.id, isOrgAdmin]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchData();
    }
  }, [user, authLoading, fetchData]);

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

  const getRoleName = (role: UserRole) => {
    const names: Record<UserRole, string> = {
      admin: "Administrator",
      project_lead: "R&D Project Lead",
      vendor_approver: "Vendor Spend Approver",
      supply_approver: "Supply Expense Approver",
      hr_verifier: "Payroll/HR Verifier",
      member: "Member",
    };
    return names[role];
  };

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
  // RENDER VIEWS
  // ============================================================================

  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total QRE</p>
              <p className="text-2xl font-semibold text-foreground mt-1">
                {formatCurrency(kpiData.total_qre || 0)}
              </p>
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                {Icons.trendingUp}
                Based on current data
              </p>
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
                {formatCurrency(kpiData.total_credit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">10% federal credit rate</p>
            </div>
            <div className="p-3 rounded-lg bg-success/20">
              <span className="text-success">{Icons.trendingUp}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 animation-delay-400">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Claim Progress</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{overallProgress}%</p>
              <div className="progress mt-2 h-1.5">
                <div className="progress-indicator" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-warning/20">
              <span className="text-warning">{Icons.fileCheck}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Progress & Tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Data Collection Progress</h3>
                <p className="text-sm text-muted-foreground mt-1">Complete all steps to finalize your R&D credit claim</p>
              </div>
              <span className="text-2xl font-bold text-foreground">{overallProgress}%</span>
            </div>
            <div className="progress mb-4">
              <div className="progress-indicator" style={{ width: `${overallProgress}%` }} />
            </div>
            <div className="space-y-3">
              {[
                { label: "Project Identification", complete: projects.length > 0 },
                { label: "Employee Data Collection", complete: employees.length > 0, progress: employees.length > 0 ? 100 : 0 },
                { label: "Contractor Expenses", complete: contractors.length > 0, progress: contractors.length > 0 ? 100 : 0 },
                { label: "Final Review & Calculation", complete: kpiData.study_count > 0 },
              ].map((step, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                  <div className={`status-dot shrink-0 ${step.complete ? 'status-complete' : 'status-pending'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{step.label}</p>
                  </div>
                  {step.complete && <span className="text-xs text-success font-medium">Complete</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Tasks Card */}
          <div className="glass-card">
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-lg font-semibold text-foreground">Pending Tasks</h3>
              <button className="btn btn-ghost btn-sm text-muted-foreground">
                View All
                {Icons.arrowRight}
              </button>
            </div>
            <div className="px-6 pb-6 space-y-3">
              {tasks.filter(t => t.status === "pending").slice(0, 4).map((task) => (
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
          {/* QRE Breakdown */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">QRE Breakdown</h3>
            <div className="space-y-4">
              {[
                { label: "Wages", amount: kpiData.total_wages || 0, percentage: 65, color: "bg-foreground/80" },
                { label: "Contractors", amount: (kpiData.total_qre || 0) * 0.22, percentage: 22, color: "bg-foreground/50" },
                { label: "Supplies", amount: (kpiData.total_qre || 0) * 0.10, percentage: 10, color: "bg-foreground/30" },
                { label: "Cloud/Computer", amount: (kpiData.total_qre || 0) * 0.03, percentage: 3, color: "bg-foreground/15" },
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
                <span className="text-lg font-semibold text-foreground">{formatCurrency(kpiData.total_qre || 0)}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">Est. Credit (10%)</span>
                <span className="text-lg font-semibold text-success">{formatCurrency(kpiData.total_credit)}</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {[
                { type: "complete", title: "Project data uploaded", user: "Engineering Team", time: "2 hours ago" },
                { type: "upload", title: "Q4 payroll data uploaded", user: "HR Department", time: "5 hours ago" },
                { type: "comment", title: "CPA added comment", user: "CPA Firm", time: "1 day ago" },
              ].map((activity, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    activity.type === "complete" ? "bg-success/20 text-success" :
                    activity.type === "upload" ? "bg-accent/30 text-accent-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {activity.type === "complete" ? Icons.check : 
                     activity.type === "upload" ? Icons.upload : Icons.messageSquare}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.user} • {activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="space-y-6 animate-fade-in">
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

  const renderVerification = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Progress Summary */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-foreground">Your Progress</h3>
            <p className="text-sm text-muted-foreground">
              {verifiedTasksCount} items verified, {pendingTasksCount} pending review
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-success">{Icons.checkCircle}</span>
              <span className="text-muted-foreground">{verifiedTasksCount} Complete</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-warning">{Icons.clock}</span>
              <span className="text-muted-foreground">{pendingTasksCount} Pending</span>
            </div>
          </div>
        </div>
        <div className="progress h-2">
          <div className="progress-indicator" style={{ width: `${tasks.length > 0 ? (verifiedTasksCount / tasks.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Tasks List */}
      <div className="glass-card">
        <div className="p-6 pb-4">
          <h3 className="text-lg font-semibold text-foreground">Verification Tasks</h3>
          <p className="text-sm text-muted-foreground mt-1">Review and verify assigned items</p>
        </div>
        <div className="px-6 pb-6">
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                  {Icons.checkCircle}
                </div>
                <p className="text-muted-foreground">No verification tasks assigned</p>
                <p className="text-xs text-muted-foreground mt-2">Tasks will appear here when assigned by your admin</p>
              </div>
            ) : (
              tasks.map((task) => (
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return renderDashboard();
      case "admin":
        return renderAdmin();
      case "verify":
        return renderVerification();
      default:
        return renderDashboard();
    }
  };

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
                      {item.badge && (
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
                   currentView === "admin" ? "Admin Dashboard" :
                   currentView === "verify" ? "Verification Portal" :
                   currentView.charAt(0).toUpperCase() + currentView.slice(1)}
                </h1>
                <p className="text-sm text-muted-foreground">
                  FY{new Date().getFullYear()} R&D Tax Credit Study • {profile?.company_name || "Your Company"}
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
              {/* AI Assistant Button */}
              <button onClick={() => setShowChat(true)} className="btn btn-glass btn-sm hidden lg:flex gap-2">
                {Icons.sparkles}
                <span>AI Assistant</span>
              </button>

              {/* Client Selector */}
              <button className="btn btn-glass btn-sm hidden lg:flex gap-2">
                {Icons.building}
                <span>{profile?.company_name || "Select Company"}</span>
                <span className="badge badge-glass ml-1">FY{new Date().getFullYear()}</span>
              </button>

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
    </div>
  );
}
