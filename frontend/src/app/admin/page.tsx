"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { adminGetUsers, adminGetStudies, adminGetChatSessions, adminGetStats } from "@/lib/api";

type User = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  is_admin: boolean;
  created_at: string;
  last_active_at: string;
};

type Study = {
  id: string;
  title: string;
  total_qre: number;
  total_credit: number;
  status: string;
  created_at: string;
  profiles?: { email: string; company_name: string | null };
};

type ChatSessionAdmin = {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles?: { email: string; company_name: string | null };
};

type Stats = {
  total_users: number;
  total_studies: number;
  total_sessions: number;
};

export default function AdminPage() {
  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"users" | "studies" | "sessions">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [sessions, setSessions] = useState<ChatSessionAdmin[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/");
      return;
    }

    if (user && isAdmin) {
      fetchData();
    }
  }, [user, isAdmin, authLoading, router]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [usersData, studiesData, sessionsData, statsData] = await Promise.all([
        adminGetUsers().catch(() => []),
        adminGetStudies().catch(() => []),
        adminGetChatSessions().catch(() => []),
        adminGetStats().catch(() => ({ total_users: 0, total_studies: 0, total_sessions: 0 })),
      ]);
      
      setUsers(usersData as User[]);
      setStudies(studiesData as Study[]);
      setSessions(sessionsData as ChatSessionAdmin[]);
      setStats(statsData);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
              </svg>
              Back to Dashboard
            </button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-lg font-semibold">Admin Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">Admin</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-sm text-muted-foreground">Total Users</p>
            <p className="mt-2 text-3xl font-semibold">{stats?.total_users || 0}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-sm text-muted-foreground">Total Studies</p>
            <p className="mt-2 text-3xl font-semibold">{stats?.total_studies || 0}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-sm text-muted-foreground">Chat Sessions</p>
            <p className="mt-2 text-3xl font-semibold">{stats?.total_sessions || 0}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-secondary/50 p-1 rounded-lg w-fit">
          {(["users", "studies", "sessions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {activeTab === "users" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 font-medium">Email</th>
                    <th className="text-left py-3 px-4 font-medium">Name</th>
                    <th className="text-left py-3 px-4 font-medium">Company</th>
                    <th className="text-left py-3 px-4 font-medium">Role</th>
                    <th className="text-left py-3 px-4 font-medium">Joined</th>
                    <th className="text-left py-3 px-4 font-medium">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="border-b border-border hover:bg-secondary/20">
                        <td className="py-3 px-4">{u.email}</td>
                        <td className="py-3 px-4">{u.full_name || "-"}</td>
                        <td className="py-3 px-4">{u.company_name || "-"}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            u.is_admin ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                          }`}>
                            {u.is_admin ? "Admin" : "User"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "studies" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 font-medium">Title</th>
                    <th className="text-left py-3 px-4 font-medium">User</th>
                    <th className="text-left py-3 px-4 font-medium">Company</th>
                    <th className="text-left py-3 px-4 font-medium">Total QRE</th>
                    <th className="text-left py-3 px-4 font-medium">Credit</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        No studies found
                      </td>
                    </tr>
                  ) : (
                    studies.map((study) => (
                      <tr key={study.id} className="border-b border-border hover:bg-secondary/20">
                        <td className="py-3 px-4 font-medium">{study.title}</td>
                        <td className="py-3 px-4">{study.profiles?.email || "-"}</td>
                        <td className="py-3 px-4">{study.profiles?.company_name || "-"}</td>
                        <td className="py-3 px-4">${study.total_qre?.toLocaleString() || 0}</td>
                        <td className="py-3 px-4 text-success">${study.total_credit?.toLocaleString() || 0}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            study.status === "generated" ? "bg-success-light text-success" : "bg-warning-light text-warning"
                          }`}>
                            {study.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(study.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 font-medium">Title</th>
                    <th className="text-left py-3 px-4 font-medium">User</th>
                    <th className="text-left py-3 px-4 font-medium">Company</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Created</th>
                    <th className="text-left py-3 px-4 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No chat sessions found
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.id} className="border-b border-border hover:bg-secondary/20">
                        <td className="py-3 px-4 font-medium">{session.title}</td>
                        <td className="py-3 px-4">{session.profiles?.email || "-"}</td>
                        <td className="py-3 px-4">{session.profiles?.company_name || "-"}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            session.is_active ? "bg-success-light text-success" : "bg-secondary text-secondary-foreground"
                          }`}>
                            {session.is_active ? "Active" : "Closed"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(session.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(session.updated_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


