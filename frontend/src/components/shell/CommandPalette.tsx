"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace, type WorkspaceModule } from '@/context/workspace-context';
import { useProjects, useEmployees, useContractors } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';

interface CommandItem {
  id: string;
  type: 'module' | 'project' | 'employee' | 'contractor' | 'action';
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
}

export function CommandPalette() {
  const { state, setCommandPalette, setModule, selectProject, selectEmployee, selectContractor } = useWorkspace();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Get data from React Query cache (no refetch)
  const { data: projects = [] } = useProjects(state.clientId);
  const { data: employees = [] } = useEmployees(state.clientId);
  const { data: contractors = [] } = useContractors(state.clientId);
  
  // Focus input when palette opens
  useEffect(() => {
    if (state.isCommandPaletteOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state.isCommandPaletteOpen]);
  
  // Build command items
  const items = useMemo<CommandItem[]>(() => {
    const moduleItems: CommandItem[] = [
      { id: 'mod-dashboard', type: 'module', label: 'Dashboard', description: 'Overview & KPIs', icon: <DashboardIcon />, action: () => { setModule('dashboard'); router.push('/workspace'); } },
      { id: 'mod-projects', type: 'module', label: 'Projects', description: 'Manage R&D projects', icon: <ProjectsIcon />, action: () => { setModule('projects'); router.push('/workspace/projects'); } },
      { id: 'mod-employees', type: 'module', label: 'Employees', description: 'Manage employees', icon: <EmployeesIcon />, action: () => { setModule('employees'); router.push('/workspace/employees'); } },
      { id: 'mod-contractors', type: 'module', label: 'Contractors', description: 'Manage contractors', icon: <ContractorsIcon />, action: () => { setModule('contractors'); router.push('/workspace/contractors'); } },
      { id: 'mod-expenses', type: 'module', label: 'Expenses', description: 'Track expenses', icon: <ExpensesIcon />, action: () => { setModule('expenses'); router.push('/workspace/expenses'); } },
      { id: 'mod-rdanalysis', type: 'module', label: 'R&D Analysis', description: 'Upload & analyze', icon: <RDIcon />, action: () => { setModule('rd-analysis'); router.push('/workspace/rd-analysis'); } },
      { id: 'mod-tasks', type: 'module', label: 'Tasks', description: 'View tasks', icon: <TasksIcon />, action: () => { setModule('tasks'); router.push('/workspace/tasks'); } },
      { id: 'mod-copilot', type: 'module', label: 'AI Copilot', description: 'AI assistance', icon: <CopilotIcon />, action: () => { setModule('copilot'); router.push('/workspace/copilot'); } },
      { id: 'mod-reports', type: 'module', label: 'Reports', description: 'Generate reports', icon: <ReportsIcon />, action: () => { setModule('reports'); router.push('/workspace/reports'); } },
    ];
    
    const projectItems: CommandItem[] = projects.map(p => ({
      id: `proj-${p.id}`,
      type: 'project',
      label: p.name,
      description: p.description || 'Project',
      icon: <ProjectsIcon />,
      action: () => { selectProject(p.id); setModule('projects'); router.push(`/workspace/projects?selected=${p.id}`); }
    }));
    
    const employeeItems: CommandItem[] = employees.map(e => ({
      id: `emp-${e.id}`,
      type: 'employee',
      label: e.name,
      description: e.title || e.department || 'Employee',
      icon: <EmployeesIcon />,
      action: () => { selectEmployee(e.id); setModule('employees'); router.push(`/workspace/employees?selected=${e.id}`); }
    }));
    
    const contractorItems: CommandItem[] = contractors.map(c => ({
      id: `cont-${c.id}`,
      type: 'contractor',
      label: c.name,
      description: c.location || 'Contractor',
      icon: <ContractorsIcon />,
      action: () => { selectContractor(c.id); setModule('contractors'); router.push(`/workspace/contractors?selected=${c.id}`); }
    }));
    
    return [...moduleItems, ...projectItems, ...employeeItems, ...contractorItems];
  }, [projects, employees, contractors, setModule, selectProject, selectEmployee, selectContractor, router]);
  
  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search) return items.slice(0, 10); // Show first 10 if no search
    
    const lowerSearch = search.toLowerCase();
    return items.filter(item => 
      item.label.toLowerCase().includes(lowerSearch) ||
      item.description?.toLowerCase().includes(lowerSearch)
    ).slice(0, 15);
  }, [items, search]);
  
  // Reset selected index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);
  
  // Keyboard navigation
  useEffect(() => {
    if (!state.isCommandPaletteOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            filteredItems[selectedIndex].action();
            setCommandPalette(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setCommandPalette(false);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isCommandPaletteOpen, filteredItems, selectedIndex, setCommandPalette]);
  
  if (!state.isCommandPaletteOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setCommandPalette(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      
      {/* Palette */}
      <div 
        className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search modules, projects, employees..."
            className="flex-1 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded text-muted-foreground">
            esc
          </kbd>
        </div>
        
        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              No results found
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  setCommandPalette(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <span className="text-muted-foreground">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.label}</div>
                  {item.description && (
                    <div className="text-sm text-muted-foreground truncate">{item.description}</div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
              </button>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ICONS
// ============================================================================

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function EmployeesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function ContractorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
    </svg>
  );
}

function ExpensesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function RDIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function CopilotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}




