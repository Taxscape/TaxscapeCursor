"use client";

import React from 'react';
import { useWorkspace, useActiveContext } from '@/context/workspace-context';
import { useAuth } from '@/context/auth-context';
import { useDashboard, useProjects, useEmployees, useContractors, useTasks, useWorkflowSummary } from '@/lib/queries';

export default function WorkspaceDashboard() {
  const { state, activeClient, setClient } = useWorkspace();
  const { orgId, clientId, taxYear } = useActiveContext();
  const { organization, profile } = useAuth();
  
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard(clientId);
  const { data: projects = [], isLoading: projectsLoading } = useProjects(clientId, taxYear);
  const { data: employees = [], isLoading: employeesLoading } = useEmployees(clientId, taxYear);
  const { data: contractors = [] } = useContractors(clientId, taxYear);
  const { data: tasks = [] } = useTasks(orgId, clientId);
  const { data: workflowSummary } = useWorkflowSummary(clientId);
  
  const isLoading = dashboardLoading || projectsLoading || employeesLoading;
  
  // No client selected state
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 flex items-center justify-center mb-6">
          <BuildingIcon />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Select a Client</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Choose a client company from the header to view their dashboard and manage their R&D tax credit data.
        </p>
      </div>
    );
  }
  
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  // Calculate stats
  const totalQRE = dashboard?.total_qre || 0;
  const totalCredit = dashboard?.total_credit || totalQRE * 0.065;
  const qualifiedProjects = projects.filter(p => p.qualification_status === 'qualified').length;
  const pendingTasks = tasks.filter((t: any) => t.status === 'pending').length;
  
  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {activeClient?.name || 'Dashboard'}
        </h1>
        <p className="text-muted-foreground">
          FY{taxYear} R&D Tax Credit Overview
        </p>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total QRE"
          value={`$${totalQRE.toLocaleString()}`}
          subtitle="Qualified Research Expenses"
          icon={<DollarIcon />}
          trend={null}
        />
        <KPICard
          title="Estimated Credit"
          value={`$${Math.round(totalCredit).toLocaleString()}`}
          subtitle="6.5% federal credit rate"
          icon={<CreditIcon />}
          trend={null}
        />
        <KPICard
          title="Projects"
          value={`${qualifiedProjects}/${projects.length}`}
          subtitle="Qualified projects"
          icon={<ProjectsIcon />}
          trend={null}
        />
        <KPICard
          title="Pending Tasks"
          value={pendingTasks.toString()}
          subtitle="Requires attention"
          icon={<TasksIcon />}
          trend={null}
        />
      </div>
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow Status */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Workflow Status</h3>
          
          {workflowSummary ? (
            <div className="space-y-4">
              {/* Status breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <StatusBadge
                  label="In Progress"
                  count={workflowSummary.by_state?.in_progress || 0}
                  color="yellow"
                />
                <StatusBadge
                  label="Ready for Review"
                  count={workflowSummary.by_state?.ready_for_review || 0}
                  color="blue"
                />
                <StatusBadge
                  label="Approved"
                  count={workflowSummary.by_state?.approved || 0}
                  color="green"
                />
              </div>
              
              {/* Top blockers */}
              {workflowSummary.top_blockers?.length > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm font-medium text-destructive mb-2">Top Blockers</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {workflowSummary.top_blockers.slice(0, 3).map((blocker, i) => (
                      <li key={i}>• {blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No workflow data available</p>
              <p className="text-sm mt-1">Add projects to see workflow status</p>
            </div>
          )}
        </div>
        
        {/* Quick Stats */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Data Overview</h3>
          
          <div className="space-y-4">
            <QuickStat
              label="Employees"
              value={employees.length}
              link="/workspace/employees"
            />
            <QuickStat
              label="Contractors"
              value={contractors.length}
              link="/workspace/contractors"
            />
            <QuickStat
              label="Projects"
              value={projects.length}
              link="/workspace/projects"
            />
            <QuickStat
              label="Tax Year"
              value={taxYear}
              link={null}
            />
          </div>
        </div>
      </div>
      
      {/* Recent Projects */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Recent Projects</h3>
          <a href="/workspace/projects" className="text-sm text-accent hover:underline">
            View all →
          </a>
        </div>
        
        {projects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No projects yet</p>
            <a href="/workspace/projects" className="text-accent hover:underline text-sm mt-1 inline-block">
              Create your first project
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map(project => (
              <div key={project.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-foreground">{project.name}</p>
                  <p className="text-sm text-muted-foreground truncate max-w-md">
                    {project.description || 'No description'}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  project.qualification_status === 'qualified' 
                    ? 'bg-green-100 text-green-700' 
                    : project.qualification_status === 'not_qualified'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {project.qualification_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function KPICard({ title, value, subtitle, icon, trend }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend: { value: number; positive: boolean } | null;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between mb-4">
        <span className="text-muted-foreground">{icon}</span>
        {trend && (
          <span className={`text-xs font-medium ${trend.positive ? 'text-green-500' : 'text-red-500'}`}>
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-sm text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function StatusBadge({ label, count, color }: { label: string; count: number; color: 'yellow' | 'blue' | 'green' }) {
  const colors = {
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
  };
  
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function QuickStat({ label, value, link }: { label: string; value: string | number; link: string | null }) {
  const content = (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
  
  if (link) {
    return (
      <a href={link} className="block p-3 rounded-lg hover:bg-muted/50 transition-colors">
        {content}
      </a>
    );
  }
  
  return <div className="p-3">{content}</div>;
}

// ============================================================================
// ICONS
// ============================================================================

function BuildingIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function CreditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

