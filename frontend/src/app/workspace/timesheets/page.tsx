"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useTimeLogs } from '@/lib/queries';

export default function TimesheetsPage() {
  const { orgId, clientId } = useActiveContext();
  const { data: timeLogs = [], isLoading } = useTimeLogs(orgId);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their timesheets." />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timesheets / Time Logs</h1>
          <p className="text-muted-foreground">Track employee time allocation to R&D projects</p>
        </div>
        <button className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium">
          + Log Time
        </button>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : timeLogs.length === 0 ? (
        <EmptyState
          title="No Time Logs Yet"
          description="Log employee time spent on R&D activities to accurately calculate wage-based QRE."
        />
      ) : (
        <div className="bg-card rounded-xl border border-border p-6">
          <p className="text-muted-foreground">Time logs table coming soon...</p>
          <p className="text-sm text-muted-foreground mt-2">{timeLogs.length} time logs loaded</p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <TimesheetsIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}

function TimesheetsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

