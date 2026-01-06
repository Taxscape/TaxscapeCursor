"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';

export default function SuppliesPage() {
  const { clientId } = useActiveContext();
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their supplies." />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Supplies</h1>
          <p className="text-muted-foreground">Track qualified research supplies</p>
        </div>
        <button className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium">
          + Add Supply
        </button>
      </div>
      
      <EmptyState
        title="Supplies Module"
        description="Track supplies used in qualified research activities. This module allows you to categorize and allocate supply costs to R&D projects."
      />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <SuppliesIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}

function SuppliesIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

