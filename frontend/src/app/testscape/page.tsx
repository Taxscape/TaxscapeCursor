"use client";

import React from 'react';
import Link from 'next/link';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/lib/api';

export default function TestscapeDashboard() {
  const { clientId, taxYear } = useActiveContext();
  
  // Fetch dashboard data
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard', clientId, taxYear],
    queryFn: () => getDashboard(clientId!, Number(taxYear)),
    enabled: !!clientId,
  });
  
  // No client selected state
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
          <BuildingIcon className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to Testscape</h2>
        <p className="text-gray-400 text-center max-w-md mb-8">
          Select a client from the header to get started with your R&D tax credit study.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
          <QuickStartCard
            icon={<PackageIcon />}
            title="1. Select Client"
            description="Choose or create a client company"
          />
          <QuickStartCard
            icon={<InboxIcon />}
            title="2. Intake Data"
            description="Collect project and payroll data"
          />
          <QuickStartCard
            icon={<CheckCircleIcon />}
            title="3. Generate Study"
            description="Finalize and export deliverables"
          />
        </div>
      </div>
    );
  }
  
  // Loading state
  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  const stats = {
    totalProjects: dashboard?.project_count || 0,
    qualifiedProjects: dashboard?.qualified_projects || 0,
    totalEmployees: dashboard?.employee_count || 0,
    totalWages: dashboard?.total_wages || 0,
    estimatedCredit: dashboard?.total_credit || 0,
  };
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Study Dashboard</h1>
        <p className="text-gray-400">Overview of your R&D tax credit study progress</p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Projects"
          value={stats.totalProjects}
          subtitle={`${stats.qualifiedProjects} qualified`}
          icon={<FolderIcon />}
          color="blue"
        />
        <StatCard
          title="Employees"
          value={stats.totalEmployees}
          subtitle="In study"
          icon={<UsersIcon />}
          color="purple"
        />
        <StatCard
          title="Total Wages"
          value={formatCurrency(stats.totalWages)}
          subtitle="Gross wages"
          icon={<DollarIcon />}
          color="green"
        />
        <StatCard
          title="Est. Credit"
          value={formatCurrency(stats.estimatedCredit)}
          subtitle="Estimated R&D credit"
          icon={<TrendingUpIcon />}
          color="emerald"
        />
      </div>
      
      {/* Workflow Progress */}
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Study Workflow</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <WorkflowStep
            step={1}
            title="Intake"
            description="Collect client data"
            href="/testscape/intake"
            status={stats.totalProjects > 0 || stats.totalEmployees > 0 ? 'complete' : 'current'}
          />
          <WorkflowStep
            step={2}
            title="Review"
            description="Review findings"
            href="/testscape/review"
            status={stats.totalProjects > 0 ? 'current' : 'pending'}
          />
          <WorkflowStep
            step={3}
            title="Credit Range"
            description="Calculate estimate"
            href="/testscape/credit-range"
            status={stats.estimatedCredit > 0 ? 'complete' : 'pending'}
          />
          <WorkflowStep
            step={4}
            title="Finalize"
            description="Generate deliverables"
            href="/testscape/finalize-study"
            status="pending"
          />
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickAction
          title="Send Intake Package"
          description="Generate and send intake questionnaire to client"
          href="/testscape/intake"
          icon={<PackageIcon />}
        />
        <QuickAction
          title="Review Findings"
          description="Review and resolve compliance findings"
          href="/testscape/review"
          icon={<ClipboardIcon />}
        />
        <QuickAction
          title="Manage Evidence"
          description="Request and upload supporting documentation"
          href="/testscape/evidence"
          icon={<FileIcon />}
        />
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function QuickStartCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3 text-blue-400">
        {icon}
      </div>
      <h3 className="font-semibold text-white text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color }: { 
  title: string; 
  value: string | number; 
  subtitle: string; 
  icon: React.ReactNode;
  color: 'blue' | 'purple' | 'green' | 'emerald';
}) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 text-blue-400',
    purple: 'from-purple-500/20 to-purple-600/10 text-purple-400',
    green: 'from-green-500/20 to-green-600/10 text-green-400',
    emerald: 'from-emerald-500/20 to-emerald-600/10 text-emerald-400',
  };
  
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-white mb-0.5">{value}</p>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

function WorkflowStep({ step, title, description, href, status }: {
  step: number;
  title: string;
  description: string;
  href: string;
  status: 'complete' | 'current' | 'pending';
}) {
  const statusStyles = {
    complete: 'bg-green-500/20 text-green-400 border-green-500/30',
    current: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    pending: 'bg-white/5 text-gray-500 border-white/10',
  };
  
  return (
    <Link
      href={href as any}
      className={`block p-4 rounded-xl border ${statusStyles[status]} hover:bg-white/5 transition-colors`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
          status === 'complete' ? 'bg-green-500 text-white' :
          status === 'current' ? 'bg-blue-500 text-white' :
          'bg-white/10 text-gray-400'
        }`}>
          {status === 'complete' ? '✓' : step}
        </div>
        <span className="font-semibold">{title}</span>
      </div>
      <p className="text-xs text-gray-500 pl-10">{description}</p>
    </Link>
  );
}

function QuickAction({ title, description, href, icon }: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href as any}
      className="block bg-[#12121a] border border-white/10 rounded-xl p-5 hover:bg-white/5 hover:border-white/20 transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ICONS
function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
  );
}

function PackageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" x2="12" y1="22" y2="12" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
