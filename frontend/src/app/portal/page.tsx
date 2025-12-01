"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  sendChatMessage,
  sendChatMessageDemo,
  generateStudy,
  downloadChatExcel,
  getDashboard,
  getProjects,
  getChatSessions,
  getEmployees,
  getContractors,
  uploadPayroll,
  uploadContractors,
  sendChatWithFiles,
  type ChatMessage,
  type DashboardData,
  type Project,
  type ChatSession,
  type Employee,
  type Contractor,
} from "@/lib/api";

// Icons
const Icons = {
  menu: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>,
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>,
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  dollar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  folder: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>,
  activity: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>,
  admin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>,
  sparkle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>,
  paperclip: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>,
  home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
};

const initialMessage: ChatMessage = {
  role: "assistant",
  content: "Hello! I'm your R&D Tax Credit Auditor. I'll help validate your projects against IRS Section 41 requirements. You can also attach files (Excel, CSV, PDF) directly to your messages for me to analyze. What technical project would you like to discuss?",
};

export default function Portal() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading, signOut, isAdmin } = useAuth();

  // Auth timeout fallback - prevent infinite loading on Vercel
  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Data State
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [structured, setStructured] = useState<Record<string, unknown> | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // File attachment state for chat
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload State
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Report State
  const [isGenerating, setIsGenerating] = useState(false);

  // Timeout for auth loading - max 10 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (authLoading) {
        console.warn("Auth loading timed out after 10 seconds");
        setAuthTimedOut(true);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [authLoading]);

  // Redirect to login if not authenticated (after loading completes)
  useEffect(() => {
    if (!authLoading && !user && authTimedOut) {
      // Only redirect after auth has timed out and there's no user
      router.push("/login?redirect=/portal");
    }
  }, [authLoading, user, authTimedOut, router]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) {
      setIsLoadingData(false);
      return;
    }

    try {
      const [dashboardData, projectsData, sessionsData, employeesData, contractorsData] = await Promise.all([
        getDashboard().catch(() => null),
        getProjects().catch(() => []),
        getChatSessions().catch(() => []),
        getEmployees().catch(() => []),
        getContractors().catch(() => []),
      ]);

      if (dashboardData) setDashboard(dashboardData);
      setProjects(projectsData);
      setSessions(sessionsData);
      setEmployees(employeesData);
      setContractors(contractorsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        // Use the new endpoint that handles file uploads
        response = await sendChatWithFiles(updatedMessages, filesToSend, currentSessionId || undefined);
      } else if (user) {
        response = await sendChatMessage(updatedMessages, currentSessionId || undefined, true);
      } else {
        response = await sendChatMessageDemo(updatedMessages);
      }

      setMessages([...updatedMessages, { role: "assistant", content: response.response }]);

      if (response.structured && Object.keys(response.structured).length > 0) {
        setStructured(response.structured);
        // Refresh dashboard data when structured data is extracted
        fetchData();
      }

      if (response.session_id) {
        setCurrentSessionId(response.session_id);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages([...updatedMessages, { role: "assistant", content: "I'm having trouble connecting. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateStudy = async () => {
    if (!structured) return;

    setIsGenerating(true);
    try {
      const blob = user
        ? await generateStudy(structured, currentSessionId || undefined, "R&D Tax Credit Study")
        : await downloadChatExcel(structured, "R&D Tax Credit Study");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `TaxScape_Study_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      // Refresh data after generating study
      if (user) {
        fetchData();
      }
    } catch (error) {
      console.error("Error generating study:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (type: "payroll" | "contractors", file: File) => {
    if (!user) {
      setUploadStatus("Please log in to upload data");
      return;
    }

    setIsUploading(true);
    setUploadStatus("Uploading...");
    try {
      const result = type === "payroll"
        ? await uploadPayroll(file)
        : await uploadContractors(file);

      setUploadStatus(`${result.message} Data is now available to the AI auditor.`);
      // Refresh data immediately after upload
      await fetchData();
    } catch (error) {
      setUploadStatus("Upload failed. Please check your file format and try again.");
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

  // Show loading while checking auth (with timeout)
  if (authLoading && !authTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // KPI data
  const kpiData = dashboard || {
    total_credit: 0,
    total_wages: 0,
    total_qre: 0,
    project_count: 0,
    employee_count: 0,
    contractor_count: 0,
    study_count: 0,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar - Navigation */}
      <aside className="w-16 flex flex-col bg-card border-r border-border">
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-border">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors">
            T
          </Link>
        </div>

        {/* Navigation Icons */}
        <nav className="flex-1 py-4 flex flex-col items-center gap-2">
          <Link href="/" className="p-3 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Home">
            {Icons.home}
          </Link>
          <button className="p-3 rounded-lg bg-primary/10 text-primary" title="Dashboard">
            {Icons.dashboard}
          </button>
          {isAdmin && (
            <button onClick={() => router.push("/admin")} className="p-3 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Admin">
              {Icons.admin}
            </button>
          )}
        </nav>

        {/* User Actions */}
        <div className="p-2 border-t border-border space-y-2">
          {user ? (
            <button onClick={handleLogout} className="w-full p-3 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Sign out">
              {Icons.logout}
            </button>
          ) : (
            <button onClick={() => router.push("/login")} className="w-full p-3 rounded-lg bg-primary text-primary-foreground" title="Sign in">
              <span className="text-xs font-bold">IN</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">TaxScape Pro</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {user ? "Connected" : "Demo Mode"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted-foreground">
                {profile?.company_name || profile?.full_name || user.email}
              </span>
            )}
            <button onClick={fetchData} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Refresh data">
              {Icons.refresh}
            </button>
          </div>
        </header>

        {/* Main Grid Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Dashboard Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <div className="module-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">R&D Credit</span>
                  <div className="p-1.5 rounded-lg bg-success-light text-success">{Icons.dollar}</div>
                </div>
                <p className="text-2xl font-semibold">${kpiData.total_credit.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Estimated credit</p>
              </div>

              <div className="module-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Total QRE</span>
                  <div className="p-1.5 rounded-lg bg-primary-light text-primary">{Icons.activity}</div>
                </div>
                <p className="text-2xl font-semibold">${(kpiData.total_qre || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Qualified expenses</p>
              </div>

              <div className="module-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Employees</span>
                  <div className="p-1.5 rounded-lg bg-primary-light text-primary">{Icons.users}</div>
                </div>
                <p className="text-2xl font-semibold">{kpiData.employee_count}</p>
                <p className="text-xs text-muted-foreground mt-1">${kpiData.total_wages.toLocaleString()} wages</p>
              </div>

              <div className="module-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Studies</span>
                  <div className="p-1.5 rounded-lg bg-success-light text-success">{Icons.folder}</div>
                </div>
                <p className="text-2xl font-semibold">{kpiData.study_count}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpiData.contractor_count} contractors</p>
              </div>
            </div>

            {/* Data Tables Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {/* Employees Table */}
              <div className="module-card">
                <div className="module-header">
                  <h2 className="module-title">Employees</h2>
                  <span className="text-xs text-muted-foreground">{employees.length} records</span>
                </div>
                <div className="module-content max-h-64 overflow-auto">
                  {employees.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {user ? "No employees uploaded yet" : "Sign in to view data"}
                    </p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Title</th>
                          <th>Wages</th>
                          <th>QRE %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.slice(0, 10).map((emp) => (
                          <tr key={emp.id}>
                            <td className="font-medium">{emp.name}</td>
                            <td>{emp.title || "-"}</td>
                            <td>${emp.total_wages.toLocaleString()}</td>
                            <td>{emp.qualified_percent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Contractors Table */}
              <div className="module-card">
                <div className="module-header">
                  <h2 className="module-title">Contractors</h2>
                  <span className="text-xs text-muted-foreground">{contractors.length} records</span>
                </div>
                <div className="module-content max-h-64 overflow-auto">
                  {contractors.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {user ? "No contractors uploaded yet" : "Sign in to view data"}
                    </p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Cost</th>
                          <th>Location</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractors.slice(0, 10).map((con) => (
                          <tr key={con.id}>
                            <td className="font-medium">{con.name}</td>
                            <td>${con.cost.toLocaleString()}</td>
                            <td>{con.location}</td>
                            <td>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${con.is_qualified ? "bg-success-light text-success" : "bg-warning-light text-warning"}`}>
                                {con.is_qualified ? "Qualified" : "Foreign"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Upload & Projects Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Quick Upload */}
              <div className="module-card">
                <div className="module-header">
                  <h2 className="module-title">Upload Data</h2>
                </div>
                <div className="module-content">
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary-light/30 transition-colors cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload("payroll", file);
                          e.target.value = "";
                        }}
                      />
                      <div className="p-2 rounded-lg bg-primary-light text-primary mb-2">{Icons.users}</div>
                      <span className="text-sm font-medium">Payroll</span>
                      <span className="text-xs text-muted-foreground">CSV or Excel</span>
                    </label>
                    <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary-light/30 transition-colors cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload("contractors", file);
                          e.target.value = "";
                        }}
                      />
                      <div className="p-2 rounded-lg bg-warning-light text-warning mb-2">{Icons.folder}</div>
                      <span className="text-sm font-medium">Contractors</span>
                      <span className="text-xs text-muted-foreground">CSV or Excel</span>
                    </label>
                  </div>
                  {uploadStatus && (
                    <p className={`mt-3 text-sm text-center ${uploadStatus.includes("failed") ? "text-destructive" : "text-success"}`}>
                      {uploadStatus}
                    </p>
                  )}
                </div>
              </div>

              {/* Projects */}
              <div className="module-card">
                <div className="module-header">
                  <h2 className="module-title">Projects</h2>
                  <span className="text-xs text-muted-foreground">{projects.length} projects</span>
                </div>
                <div className="module-content space-y-2 max-h-48 overflow-auto">
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {user ? "Projects will appear here after AI audit" : "Sign in to view projects"}
                    </p>
                  ) : (
                    projects.slice(0, 5).map((project) => (
                      <div key={project.id} className="p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{project.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${project.qualification_status === "qualified" ? "bg-success-light text-success" : "bg-warning-light text-warning"
                            }`}>
                            {project.qualification_status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - AI Auditor (Always Visible) */}
          <div className="w-[420px] flex flex-col border-l border-border bg-card">
            {/* Chat Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">{Icons.sparkle}</div>
                <div>
                  <p className="text-sm font-semibold">R&D Tax Auditor</p>
                  <p className="text-xs text-muted-foreground">
                    {user ? `${employees.length} employees, ${contractors.length} contractors loaded` : "Demo Mode"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleNewChat} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground text-xs" title="New chat">
                  New
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "75ms" }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Structured Data Indicator */}
            {structured && (
              <div className="px-4 py-2 border-t border-border bg-success-light/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-xs text-success font-medium">Study data ready</span>
                  </div>
                  <button
                    onClick={handleGenerateStudy}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-3 py-1.5 bg-success text-white rounded-lg text-xs font-medium hover:bg-success/90 disabled:opacity-50"
                  >
                    {Icons.download}
                    {isGenerating ? "Generating..." : "Download Excel"}
                  </button>
                </div>
              </div>
            )}

            {/* Attached Files Display */}
            {attachedFiles.length > 0 && (
              <div className="px-4 py-2 border-t border-border bg-primary-light/30">
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs border border-border">
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
                  className="p-2.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Attach files (CSV, Excel, PDF)"
                >
                  {Icons.paperclip}
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Describe your R&D project..."
                  className="flex-1 px-4 py-2.5 text-sm bg-secondary rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {Icons.send}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Attach files or say &quot;Generate Study&quot; when ready
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

