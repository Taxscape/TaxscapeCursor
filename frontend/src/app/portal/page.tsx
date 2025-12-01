"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  type ChatMessage,
  type DashboardData,
  type Project,
  type ChatSession,
  type Employee,
  type Contractor,
} from "@/lib/api";

// Icons - minimal stroke style
const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  ),
  dollar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  folder: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  ),
  sparkle: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  paperclip: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  x: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  ),
};

const initialMessage: ChatMessage = {
  role: "assistant",
  content: "Hello. I'm your R&D Tax Credit Auditor. I'll validate your projects against IRS Section 41. Describe your first technical project, or attach files (Excel, CSV, PDF) for analysis.",
};

export default function Portal() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading, signOut } = useAuth();

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
  
  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload State
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Report State
  const [isGenerating, setIsGenerating] = useState(false);

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
      // First check API connectivity
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
    } catch (error) {
      console.error("Error fetching data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load data";
      setApiError(errorMessage);
    } finally {
      setIsLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

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
        response = await sendChatWithFiles(updatedMessages, filesToSend, currentSessionId || undefined);
      } else if (user) {
        response = await sendChatMessage(updatedMessages, currentSessionId || undefined, true);
      } else {
        // Fallback to demo endpoint when in test mode or unauthenticated
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
      const isConnectionError = errorMessage.includes("Cannot connect") || errorMessage.includes("localhost");
      setMessages([...updatedMessages, { 
        role: "assistant", 
        content: isConnectionError 
          ? `Connection error: ${errorMessage}. Please check that the backend is running and properly configured.`
          : `Error: ${errorMessage}. Please try again.`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateStudy = async () => {
    if (!structured) return;

    setIsGenerating(true);
    try {
      // Always use downloadChatExcel for reliable Excel download
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

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F6F7]">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[#323338] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-[13px] text-[#6B6D72]">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect handled by useEffect, but show nothing while redirecting
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F6F7]">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[#323338] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-[13px] text-[#6B6D72]">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Show API error state with retry button
  if (apiError && !isLoadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F6F7]">
        <div className="text-center max-w-md px-6">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[#17181A] mb-2">Connection Error</h2>
          <p className="text-[13px] text-[#6B6D72] mb-4">{apiError}</p>
          <p className="text-[11px] text-[#9CA3AF] mb-6">
            API URL: {getApiUrl()}
          </p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#323338] text-white text-[13px] font-medium rounded-md hover:bg-[#3A3B40] transition-colors"
          >
            {Icons.refresh}
            Retry Connection
          </button>
          <button
            onClick={handleLogout}
            className="block mx-auto mt-4 text-[12px] text-[#6B6D72] hover:text-[#17181A] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const kpiData = dashboard || {
    total_credit: 0,
    total_wages: 0,
    total_qre: 0,
    project_count: 0,
    employee_count: 0,
    contractor_count: 0,
    study_count: 0,
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-[#F6F6F7] text-[#17181A] font-sans antialiased">
      {/* Subtle grid background */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, #17181A 1px, transparent 1px), linear-gradient(to bottom, #17181A 1px, transparent 1px)`,
          backgroundSize: '48px 48px'
        }}
      />

      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#E0E1E4]/70 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-[1440px] mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-[15px] font-medium tracking-tight text-[#17181A]">TaxScape</span>
              <span className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72]">Portal</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[12px] text-[#6B6D72]">
              {profile?.company_name || user.email}
            </span>
            <button 
              onClick={fetchData} 
              className="p-2 rounded-md hover:bg-black/[0.04] text-[#6B6D72] hover:text-[#17181A] transition-colors"
              title="Refresh data"
            >
              {Icons.refresh}
            </button>
            <button 
              onClick={handleLogout} 
              className="p-2 rounded-md hover:bg-black/[0.04] text-[#6B6D72] hover:text-[#17181A] transition-colors"
              title="Sign out"
            >
              {Icons.logout}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-14 min-h-screen">
        <div className="max-w-[1440px] mx-auto px-8 py-8">
          <div className="grid grid-cols-12 gap-6">
            
            {/* Left Column - Dashboard */}
            <div className="col-span-7 space-y-6">
              
              {/* KPI Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg p-5 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-2">R&D Credit</div>
                  <div className="text-[24px] font-medium text-[#17181A]">{formatCurrency(kpiData.total_credit)}</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg p-5 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-2">Total QRE</div>
                  <div className="text-[24px] font-medium text-[#17181A]">{formatCurrency(kpiData.total_qre || 0)}</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg p-5 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-2">Employees</div>
                  <div className="text-[24px] font-medium text-[#17181A]">{kpiData.employee_count}</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg p-5 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-2">Studies</div>
                  <div className="text-[24px] font-medium text-[#17181A]">{kpiData.study_count}</div>
                </div>
              </div>

              {/* Data Tables */}
              <div className="grid grid-cols-2 gap-6">
                {/* Employees */}
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg shadow-sm">
                  <div className="px-5 py-4 border-b border-black/[0.04] flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[#17181A]">Employees</span>
                    <span className="text-[11px] text-[#6B6D72]">{employees.length} records</span>
                  </div>
                  <div className="p-4 max-h-[240px] overflow-auto">
                    {employees.length === 0 ? (
                      <p className="text-[12px] text-[#6B6D72] text-center py-6">
                        Upload payroll data to populate
                      </p>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-[0.06em] text-[#6B6D72]">
                            <th className="text-left pb-2 font-medium">Name</th>
                            <th className="text-right pb-2 font-medium">Wages</th>
                            <th className="text-right pb-2 font-medium">QRE %</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#17181A]">
                          {employees.slice(0, 8).map((emp) => (
                            <tr key={emp.id} className="border-t border-black/[0.04]">
                              <td className="py-2">{emp.name}</td>
                              <td className="py-2 text-right">{formatCurrency(emp.total_wages)}</td>
                              <td className="py-2 text-right">{emp.qualified_percent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Contractors */}
                <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg shadow-sm">
                  <div className="px-5 py-4 border-b border-black/[0.04] flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[#17181A]">Contractors</span>
                    <span className="text-[11px] text-[#6B6D72]">{contractors.length} records</span>
                  </div>
                  <div className="p-4 max-h-[240px] overflow-auto">
                    {contractors.length === 0 ? (
                      <p className="text-[12px] text-[#6B6D72] text-center py-6">
                        Upload contractor data to populate
                      </p>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-[0.06em] text-[#6B6D72]">
                            <th className="text-left pb-2 font-medium">Name</th>
                            <th className="text-right pb-2 font-medium">Cost</th>
                            <th className="text-right pb-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#17181A]">
                          {contractors.slice(0, 8).map((con) => (
                            <tr key={con.id} className="border-t border-black/[0.04]">
                              <td className="py-2">{con.name}</td>
                              <td className="py-2 text-right">{formatCurrency(con.cost)}</td>
                              <td className="py-2 text-right">
                                <span className={`text-[10px] uppercase tracking-wider ${con.is_qualified ? 'text-[#2D8A5F]' : 'text-[#6B6D72]'}`}>
                                  {con.is_qualified ? 'Qualified' : 'Foreign'}
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

              {/* Upload Section */}
              <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg shadow-sm">
                <div className="px-5 py-4 border-b border-black/[0.04]">
                  <span className="text-[13px] font-medium text-[#17181A]">Upload Data</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`flex flex-col items-center justify-center p-6 border border-dashed border-[#D4D5D8] rounded-lg hover:border-[#323338] hover:bg-white/50 transition-all cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
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
                      <div className="text-[#6B6D72] mb-2">{Icons.users}</div>
                      <span className="text-[13px] font-medium text-[#17181A]">Payroll Data</span>
                      <span className="text-[11px] text-[#6B6D72] mt-1">CSV or Excel</span>
                    </label>
                    
                    <label className={`flex flex-col items-center justify-center p-6 border border-dashed border-[#D4D5D8] rounded-lg hover:border-[#323338] hover:bg-white/50 transition-all cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
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
                      <div className="text-[#6B6D72] mb-2">{Icons.folder}</div>
                      <span className="text-[13px] font-medium text-[#17181A]">Contractor Data</span>
                      <span className="text-[11px] text-[#6B6D72] mt-1">CSV or Excel</span>
                    </label>
                  </div>
                  {uploadStatus && (
                    <p className={`mt-4 text-[12px] text-center ${uploadStatus.includes("failed") ? "text-red-600" : "text-[#2D8A5F]"}`}>
                      {uploadStatus}
                    </p>
                  )}
                </div>
              </div>

              {/* Projects */}
              <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg shadow-sm">
                <div className="px-5 py-4 border-b border-black/[0.04] flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#17181A]">Qualified Projects</span>
                  <span className="text-[11px] text-[#6B6D72]">{projects.length} projects</span>
                </div>
                <div className="p-4 max-h-[200px] overflow-auto">
                  {projects.length === 0 ? (
                    <p className="text-[12px] text-[#6B6D72] text-center py-6">
                      Projects appear after AI audit
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {projects.slice(0, 5).map((project) => (
                        <div key={project.id} className="flex items-center justify-between p-3 rounded-md border border-black/[0.04] hover:bg-white/50">
                          <span className="text-[13px] text-[#17181A]">{project.name}</span>
                          <span className={`text-[10px] uppercase tracking-wider ${project.qualification_status === "qualified" ? 'text-[#2D8A5F]' : 'text-[#6B6D72]'}`}>
                            {project.qualification_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - AI Auditor Chat */}
            <div className="col-span-5">
              <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg shadow-sm h-[calc(100vh-8rem)] flex flex-col sticky top-20">
                
                {/* Chat Header */}
                <div className="px-5 py-4 border-b border-black/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-[#323338]">{Icons.sparkle}</div>
                    <div>
                      <div className="text-[13px] font-medium text-[#17181A]">R&D Tax Auditor</div>
                      <div className="text-[11px] text-[#6B6D72]">{employees.length} employees, {contractors.length} contractors</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleNewChat} 
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-[#6B6D72] hover:text-[#17181A] hover:bg-black/[0.04] rounded-md transition-colors"
                  >
                    {Icons.plus}
                    New
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-lg px-4 py-3 text-[13px] leading-relaxed ${
                        msg.role === "user" 
                          ? "bg-[#323338] text-white" 
                          : "bg-white/80 border border-black/[0.06] text-[#17181A]"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/80 border border-black/[0.06] rounded-lg px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-[#6B6D72] rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-[#6B6D72] rounded-full animate-bounce" style={{ animationDelay: "75ms" }} />
                          <div className="w-2 h-2 bg-[#6B6D72] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Study Ready Indicator */}
                {structured && (
                  <div className="px-5 py-3 border-t border-black/[0.04] bg-[#F0F9F4]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#2D8A5F] animate-pulse" />
                        <span className="text-[12px] font-medium text-[#2D8A5F]">Study data ready</span>
                      </div>
                      <button
                        onClick={handleGenerateStudy}
                        disabled={isGenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-[#2D8A5F] text-white text-[12px] font-medium rounded-md hover:bg-[#247048] disabled:opacity-50 transition-colors"
                      >
                        {Icons.download}
                        {isGenerating ? "Generating..." : "Download Excel"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Attached Files */}
                {attachedFiles.length > 0 && (
                  <div className="px-5 py-3 border-t border-black/[0.04] bg-[#FAFAFA]">
                    <div className="flex flex-wrap gap-2">
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-white border border-black/[0.06] rounded text-[11px]">
                          {Icons.file}
                          <span className="max-w-[100px] truncate">{file.name}</span>
                          <button onClick={() => removeAttachedFile(idx)} className="text-[#6B6D72] hover:text-[#17181A]">
                            {Icons.x}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="p-4 border-t border-black/[0.04]">
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
                      className="p-2.5 rounded-md border border-[#D4D5D8] text-[#6B6D72] hover:text-[#17181A] hover:border-[#323338] transition-colors disabled:opacity-50"
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
                      className="flex-1 px-4 py-2.5 text-[13px] bg-white border border-[#D4D5D8] rounded-md focus:outline-none focus:border-[#323338] placeholder:text-[#9CA3AF]"
                    />
                    <button
                      onClick={handleSend}
                      disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                      className="px-4 py-2.5 bg-[#323338] text-white rounded-md hover:bg-[#3A3B40] disabled:opacity-50 transition-colors"
                    >
                      {Icons.send}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#6B6D72] text-center">
                    Say &quot;Generate Study&quot; when ready for Excel export
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
