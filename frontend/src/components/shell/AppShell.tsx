"use client";

import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AIPanel } from './AIPanel';
import { CommandPalette } from './CommandPalette';
import { DesktopRequired } from './DesktopRequired';
import { useWorkspace } from '@/context/workspace-context';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { state } = useWorkspace();
  
  return (
    <>
      {/* Desktop-only enforcement */}
      <DesktopRequired />
      
      {/* Command Palette (global overlay) */}
      <CommandPalette />
      
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />
        
        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <Header />
          
          {/* Content + AI Panel */}
          <div className="flex-1 flex overflow-hidden">
            {/* Main Content */}
            <main className="flex-1 overflow-auto p-6 bg-background">
              {children}
            </main>
            
            {/* Right AI Panel */}
            {state.isAIPanelOpen && <AIPanel />}
          </div>
        </div>
      </div>
    </>
  );
}

