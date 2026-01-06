"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';

export default function ReportsPage() {
  const { clientId } = useActiveContext();
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to generate reports." />;
  }
  
  const reportTypes = [
    { 
      id: 'form_6765', 
      title: 'Form 6765 Report', 
      description: 'IRS Form 6765 - Credit for Increasing Research Activities',
      icon: <FormIcon />,
    },
    { 
      id: 'four_part_test', 
      title: 'Four-Part Test Documentation', 
      description: 'Detailed analysis of each project against IRS four-part test criteria',
      icon: <TestIcon />,
    },
    { 
      id: 'qre_summary', 
      title: 'QRE Summary', 
      description: 'Qualified Research Expense breakdown by category',
      icon: <ChartIcon />,
    },
    { 
      id: 'employee_allocation', 
      title: 'Employee Allocation Report', 
      description: 'Employee time allocation to R&D activities',
      icon: <EmployeesIcon />,
    },
    { 
      id: 'audit_ready', 
      title: 'Audit-Ready Package', 
      description: 'Complete documentation package for IRS audit defense',
      icon: <ShieldIcon />,
    },
  ];
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports & Studies</h1>
        <p className="text-muted-foreground">Generate comprehensive R&D tax credit documentation</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map(report => (
          <div
            key={report.id}
            className="bg-card rounded-xl border border-border p-6 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                {report.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{report.title}</h3>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="text-sm text-accent hover:underline font-medium">
                Generate →
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Previous Reports */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Previous Reports</h3>
        <div className="text-center py-8 text-muted-foreground">
          <p>No reports generated yet</p>
          <p className="text-sm mt-1">Generate a report above to see it here</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <ReportsIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function ReportsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  );
}

function TestIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  );
}

function EmployeesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

