"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  sendChatMessage,
  sendChatMessageDemo,
  generateStudy,
  downloadChatExcel,
  getDashboard,
  getProjects,
  getChatSessions,
  uploadPayroll,
  uploadContractors,
  type ChatMessage,
  type DashboardData,
  type Project,
  type ChatSession,
} from "@/lib/api";

// Icons
const Icons = {
  menu: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>,
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>,
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>,
  file: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  minimize: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>,
  maximize: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" x2="14" y1="3" y2="10" /><line x1="3" x2="10" y1="21" y2="14" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  dollar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  folder: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>,
  activity: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>,
  admin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>,
};

const initialMessage: ChatMessage = {
  role: "assistant",
  content: "Hello! I'm your R&D Tax Credit Auditor. I'll help validate your projects against IRS Section 41 requirements. What technical project would you like to discuss?",
};

export default function ExecutiveSuite() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading, signOut, isAdmin } = useAuth();
  
  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("dashboard");
  
  // Data State
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [structured, setStructured] = useState<Record<string, unknown> | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Upload State
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  
  // Report State
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user) {
      setIsLoadingData(false);
      return;
    }
    
    try {
      const [dashboardData, projectsData, sessionsData] = await Promise.all([
        getDashboard().catch(() => null),
        getProjects().catch(() => []),
        getChatSessions().catch(() => []),
      ]);
      
      if (dashboardData) setDashboard(dashboardData);
      setProjects(projectsData);
      setSessions(sessionsData);
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
    if (!input.trim() || isLoading) return;
    
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Use authenticated endpoint if logged in, otherwise demo
      const response = user
        ? await sendChatMessage(updatedMessages, currentSessionId || undefined)
        : await sendChatMessageDemo(updatedMessages);
      
      setMessages([...updatedMessages, { role: "assistant", content: response.response }]);
      
      if (response.structured && Object.keys(response.structured).length > 0) {
        setStructured(response.structured);
      }
      
      if (response.session_id) {
        setCurrentSessionId(response.session_id);
      }
    } catch {
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
    
    setUploadStatus("Uploading...");
    try {
      const result = type === "payroll"
        ? await uploadPayroll(file)
        : await uploadContractors(file);
      
      setUploadStatus(result.message);
      fetchData(); // Refresh data
    } catch (error) {
      setUploadStatus("Upload failed. Please try again.");
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Icons.dashboard },
    { id: "audit", label: "AI Audit", icon: Icons.chat },
    { id: "data", label: "Data Upload", icon: Icons.upload },
    { id: "reports", label: "Reports", icon: Icons.file },
    { id: "settings", label: "Settings", icon: Icons.settings },
  ];

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // KPI data (use real data if available, otherwise mock)
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
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border transition-all duration-300 ${sidebarOpen ? "w-60" : "w-16"}`}>
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">T</div>
              <span className="font-semibold text-foreground">TaxScape</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            {Icons.menu}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeSection === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item.icon}
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
          
          {/* Admin link */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {Icons.admin}
              {sidebarOpen && <span>Admin</span>}
            </button>
          )}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-border space-y-2">
          {user ? (
            <>
              {sidebarOpen && (
                <div className="px-2 py-1">
                  <p className="text-sm font-medium truncate">{profile?.full_name || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.company_name || "No company"}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ${!sidebarOpen ? "px-2" : ""}`}
              >
                {Icons.logout}
                {sidebarOpen && <span>Sign out</span>}
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors ${!sidebarOpen ? "px-2" : ""}`}
            >
              {sidebarOpen && <span>Sign in</span>}
            </button>
          )}
          
          <button
            onClick={handleGenerateStudy}
            disabled={isGenerating || !structured}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 ${!sidebarOpen ? "px-2" : ""}`}
          >
            {Icons.download}
            {sidebarOpen && <span>{isGenerating ? "Generating..." : "Generate Study"}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? "ml-60" : "ml-16"}`}>
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold text-foreground">
            {navItems.find((item) => item.id === activeSection)?.label || "Dashboard"}
          </h1>
          <div className="flex items-center gap-3">
            {isLoadingData ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  {user ? `Welcome, ${profile?.full_name?.split(' ')[0] || 'User'}` : "Demo Mode"}
                </span>
                <div className={`h-2 w-2 rounded-full ${user ? "bg-success" : "bg-warning"} animate-pulse`} />
              </>
            )}
          </div>
        </header>

        {/* KPI Cards */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="module-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total R&D Credit</span>
                <div className="p-2 rounded-lg bg-success-light text-success">{Icons.dollar}</div>
              </div>
              <p className="mt-3 text-2xl font-semibold">${kpiData.total_credit.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">Estimated for current period</p>
            </div>

            <div className="module-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Wages</span>
                <div className="p-2 rounded-lg bg-primary-light text-primary">{Icons.users}</div>
              </div>
              <p className="mt-3 text-2xl font-semibold">${kpiData.total_wages.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpiData.employee_count} employees tracked</p>
            </div>

            <div className="module-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Projects</span>
                <div className="p-2 rounded-lg bg-warning-light text-warning">{Icons.folder}</div>
              </div>
              <p className="mt-3 text-2xl font-semibold">{kpiData.project_count}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpiData.contractor_count} contractors</p>
            </div>

            <div className="module-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Studies Generated</span>
                <div className="p-2 rounded-lg bg-success-light text-success">{Icons.activity}</div>
              </div>
              <p className="mt-3 text-2xl font-semibold">{kpiData.study_count}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sessions.length} chat sessions</p>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* QRE Summary */}
          <div className="lg:col-span-2 module-card">
            <div className="module-header">
              <h2 className="module-title">QRE Summary</h2>
              <span className="text-sm text-muted-foreground">
                Total QRE: ${(kpiData.total_qre || 0).toLocaleString()}
              </span>
            </div>
            <div className="module-content">
              {!user ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Sign in to view your QRE data</p>
                  <button onClick={() => router.push("/login")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                    Sign in
                  </button>
                </div>
              ) : kpiData.employee_count === 0 && kpiData.contractor_count === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No data yet. Upload payroll or use the AI auditor to get started.</p>
                  <button onClick={() => setChatOpen(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                    Start AI Audit
                  </button>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>QRE Rate</th>
                      <th>QRE Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Internal Wages</td>
                      <td>${kpiData.total_wages.toLocaleString()}</td>
                      <td>80%</td>
                      <td>${(kpiData.total_wages * 0.8).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td>Contract Research</td>
                      <td>-</td>
                      <td>65%</td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Activity / Sessions */}
          <div className="module-card">
            <div className="module-header">
              <h2 className="module-title">Recent Sessions</h2>
            </div>
            <div className="module-content space-y-3">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sessions yet</p>
              ) : (
                sessions.slice(0, 5).map((session) => (
                  <div key={session.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                    <div className="p-1 rounded-full bg-primary-light text-primary">{Icons.check}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Projects & Upload */}
        <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <div className="module-card">
            <div className="module-header">
              <h2 className="module-title">Projects</h2>
            </div>
            <div className="module-content space-y-3">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {user ? "No projects yet. Use the AI auditor to add projects." : "Sign in to view projects"}
                </p>
              ) : (
                projects.slice(0, 4).map((project) => (
                  <div key={project.id} className="p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{project.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        project.qualification_status === "qualified" ? "bg-success-light text-success" : "bg-warning-light text-warning"
                      }`}>
                        {project.qualification_status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Upload */}
          <div className="module-card">
            <div className="module-header">
              <h2 className="module-title">Quick Upload</h2>
            </div>
            <div className="module-content">
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary-light/30 transition-colors">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  id="file-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload("payroll", file);
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary-light flex items-center justify-center text-primary mb-3">
                    {Icons.upload}
                  </div>
                  <p className="text-sm font-medium">Drop files here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports CSV, XLSX for payroll and contractor data</p>
                </label>
              </div>
              {uploadStatus && (
                <p className="mt-3 text-sm text-center text-muted-foreground">{uploadStatus}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="p-2 text-xs text-center rounded-lg border border-border hover:bg-secondary transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload("payroll", file);
                    }}
                  />
                  Payroll
                </label>
                <label className="p-2 text-xs text-center rounded-lg border border-border hover:bg-secondary transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload("contractors", file);
                    }}
                  />
                  Contractors
                </label>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
        >
          {Icons.chat}
          <span className="font-medium text-sm">AI Auditor</span>
        </button>
      )}

      {/* Chat Panel */}
      {chatOpen && (
        <div className={`fixed z-50 bg-card border border-border rounded-2xl shadow-xl transition-all duration-300 ${chatExpanded ? "inset-4" : "bottom-6 right-6 w-96 h-[500px]"}`}>
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">{Icons.chat}</div>
              <div>
                <p className="text-sm font-medium">R&D Auditor</p>
                <p className="text-xs text-muted-foreground">{user ? "Authenticated" : "Demo Mode"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setChatExpanded(!chatExpanded)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                {chatExpanded ? Icons.minimize : Icons.maximize}
              </button>
              <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                {Icons.x}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ height: chatExpanded ? "calc(100% - 130px)" : "360px" }}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
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

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Describe your R&D project..."
                className="flex-1 px-4 py-2.5 text-sm bg-secondary rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {Icons.send}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
