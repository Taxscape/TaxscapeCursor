"use client";

import React from 'react';
import { TestscapeSidebar } from './TestscapeSidebar';
import { TestscapeHeader } from './TestscapeHeader';
import { useWorkspace } from '@/context/workspace-context';

interface TestscapeShellProps {
  children: React.ReactNode;
}

export function TestscapeShell({ children }: TestscapeShellProps) {
  const { state } = useWorkspace();
  
  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Left Sidebar */}
      <TestscapeSidebar />
      
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <TestscapeHeader />
        
        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
