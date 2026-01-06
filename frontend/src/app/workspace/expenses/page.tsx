"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useExpenses } from '@/lib/queries';

export default function ExpensesPage() {
  const { orgId, clientId } = useActiveContext();
  const { data: expenses = [], isLoading, error } = useExpenses(orgId, clientId);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view their expenses." />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses / AP Transactions</h1>
          <p className="text-muted-foreground">{expenses.length} transactions</p>
        </div>
        <button className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium">
          + Add Expense
        </button>
      </div>
      
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Failed to load expenses" />
      ) : expenses.length === 0 ? (
        <EmptyState title="No Expenses Yet" description="Add expenses to track qualified research supplies and contract costs." />
      ) : (
        <div className="bg-card rounded-xl border border-border p-6">
          <p className="text-muted-foreground">Expenses table coming soon...</p>
          <p className="text-sm text-muted-foreground mt-2">{expenses.length} expenses loaded</p>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="text-center py-12 text-destructive">{message}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <ExpensesIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function ExpensesIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

