"use client";

import React, { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type PaneId = 'primary' | 'secondary' | 'tertiary';
export type PaneContent = 
  | { type: 'project-detail'; projectId: string }
  | { type: 'evidence-viewer'; evidenceId?: string; projectId?: string }
  | { type: 'task-queue'; clientId?: string; projectId?: string }
  | { type: 'task-detail'; taskId: string }
  | { type: 'workflow-breakdown'; projectId: string }
  | { type: 'financial-summary'; clientId: string }
  | { type: 'copilot'; clientId: string; projectId?: string }
  | { type: 'empty' };

interface PaneState {
  id: PaneId;
  content: PaneContent;
  width: number; // percentage
  isVisible: boolean;
  title: string;
}

interface WorkspaceState {
  panes: Record<PaneId, PaneState>;
  history: PaneContent[];
  historyIndex: number;
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  openInPane: (paneId: PaneId, content: PaneContent, title: string) => void;
  closePane: (paneId: PaneId) => void;
  resizePane: (paneId: PaneId, width: number) => void;
  togglePane: (paneId: PaneId) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  resetLayout: () => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
};

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_STATE: WorkspaceState = {
  panes: {
    primary: { id: 'primary', content: { type: 'empty' }, width: 60, isVisible: true, title: 'Main' },
    secondary: { id: 'secondary', content: { type: 'empty' }, width: 30, isVisible: false, title: 'Details' },
    tertiary: { id: 'tertiary', content: { type: 'empty' }, width: 10, isVisible: false, title: 'Extra' },
  },
  history: [],
  historyIndex: -1,
};

const STORAGE_KEY = 'taxscape_workspace_layout';
const MIN_PANE_WIDTH = 15; // percentage
const MAX_PANE_WIDTH = 70;

// =============================================================================
// PROVIDER
// =============================================================================

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WorkspaceState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_STATE;
  });

  // Persist layout
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const openInPane = useCallback((paneId: PaneId, content: PaneContent, title: string) => {
    setState(prev => {
      const newHistory = [...prev.history.slice(0, prev.historyIndex + 1), content];
      return {
        ...prev,
        panes: {
          ...prev.panes,
          [paneId]: {
            ...prev.panes[paneId],
            content,
            title,
            isVisible: true,
          },
        },
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const closePane = useCallback((paneId: PaneId) => {
    setState(prev => ({
      ...prev,
      panes: {
        ...prev.panes,
        [paneId]: {
          ...prev.panes[paneId],
          content: { type: 'empty' },
          isVisible: false,
        },
      },
    }));
  }, []);

  const resizePane = useCallback((paneId: PaneId, width: number) => {
    const clampedWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, width));
    setState(prev => ({
      ...prev,
      panes: {
        ...prev.panes,
        [paneId]: {
          ...prev.panes[paneId],
          width: clampedWidth,
        },
      },
    }));
  }, []);

  const togglePane = useCallback((paneId: PaneId) => {
    setState(prev => ({
      ...prev,
      panes: {
        ...prev.panes,
        [paneId]: {
          ...prev.panes[paneId],
          isVisible: !prev.panes[paneId].isVisible,
        },
      },
    }));
  }, []);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex <= 0) return prev;
      const newIndex = prev.historyIndex - 1;
      const content = prev.history[newIndex];
      return {
        ...prev,
        panes: {
          ...prev.panes,
          primary: { ...prev.panes.primary, content },
        },
        historyIndex: newIndex,
      };
    });
  }, []);

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex >= prev.history.length - 1) return prev;
      const newIndex = prev.historyIndex + 1;
      const content = prev.history[newIndex];
      return {
        ...prev,
        panes: {
          ...prev.panes,
          primary: { ...prev.panes.primary, content },
        },
        historyIndex: newIndex,
      };
    });
  }, []);

  const resetLayout = useCallback(() => {
    setState(DEFAULT_STATE);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: WorkspaceContextValue = {
    state,
    openInPane,
    closePane,
    resizePane,
    togglePane,
    goBack,
    goForward,
    canGoBack: state.historyIndex > 0,
    canGoForward: state.historyIndex < state.history.length - 1,
    resetLayout,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

// =============================================================================
// RESIZABLE DIVIDER
// =============================================================================

interface ResizeDividerProps {
  onResize: (delta: number) => void;
}

const ResizeDivider: React.FC<ResizeDividerProps> = ({ onResize }) => {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-1 bg-border hover:bg-accent cursor-col-resize transition-colors shrink-0 group"
    >
      <div className="w-1 h-full group-hover:w-1.5 transition-all" />
    </div>
  );
};

// =============================================================================
// PANE HEADER
// =============================================================================

interface PaneHeaderProps {
  title: string;
  paneId: PaneId;
  onClose?: () => void;
}

const PaneHeader: React.FC<PaneHeaderProps> = ({ title, paneId, onClose }) => {
  const { goBack, goForward, canGoBack, canGoForward } = useWorkspace();
  const isPrimary = paneId === 'primary';

  return (
    <div className="h-10 px-3 flex items-center justify-between border-b border-border bg-muted/30 shrink-0">
      <div className="flex items-center gap-2">
        {isPrimary && (
          <div className="flex items-center gap-1">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="Go back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="Go forward"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
        <span className="text-sm font-medium text-foreground truncate">{title}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Close pane"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

// =============================================================================
// WORKSPACE LAYOUT
// =============================================================================

interface WorkspaceLayoutProps {
  renderPaneContent: (content: PaneContent, paneId: PaneId) => React.ReactNode;
  sidebar?: React.ReactNode;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ renderPaneContent, sidebar }) => {
  const { state, closePane, resizePane } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);

  const visiblePanes = Object.values(state.panes).filter(p => p.isVisible && p.content.type !== 'empty');
  const totalWidth = visiblePanes.reduce((sum, p) => sum + p.width, 0);

  const handleResize = (paneId: PaneId, delta: number) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;
    const deltaPercent = (delta / containerWidth) * 100;
    resizePane(paneId, state.panes[paneId].width + deltaPercent);
  };

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      {sidebar && (
        <div className="w-56 shrink-0 border-r border-border bg-card">
          {sidebar}
        </div>
      )}

      {/* Panes Container */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Primary Pane (always visible) */}
        <div
          className="flex flex-col h-full overflow-hidden bg-background"
          style={{ width: `${state.panes.primary.width}%`, minWidth: `${MIN_PANE_WIDTH}%` }}
        >
          <PaneHeader title={state.panes.primary.title} paneId="primary" />
          <div className="flex-1 overflow-auto">
            {renderPaneContent(state.panes.primary.content, 'primary')}
          </div>
        </div>

        {/* Secondary Pane */}
        {state.panes.secondary.isVisible && state.panes.secondary.content.type !== 'empty' && (
          <>
            <ResizeDivider onResize={(delta) => handleResize('primary', delta)} />
            <div
              className="flex flex-col h-full overflow-hidden bg-background border-l border-border"
              style={{ width: `${state.panes.secondary.width}%`, minWidth: `${MIN_PANE_WIDTH}%` }}
            >
              <PaneHeader
                title={state.panes.secondary.title}
                paneId="secondary"
                onClose={() => closePane('secondary')}
              />
              <div className="flex-1 overflow-auto">
                {renderPaneContent(state.panes.secondary.content, 'secondary')}
              </div>
            </div>
          </>
        )}

        {/* Tertiary Pane */}
        {state.panes.tertiary.isVisible && state.panes.tertiary.content.type !== 'empty' && (
          <>
            <ResizeDivider onResize={(delta) => handleResize('secondary', delta)} />
            <div
              className="flex flex-col h-full overflow-hidden bg-background border-l border-border"
              style={{ width: `${state.panes.tertiary.width}%`, minWidth: `${MIN_PANE_WIDTH}%` }}
            >
              <PaneHeader
                title={state.panes.tertiary.title}
                paneId="tertiary"
                onClose={() => closePane('tertiary')}
              />
              <div className="flex-1 overflow-auto">
                {renderPaneContent(state.panes.tertiary.content, 'tertiary')}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkspaceLayout;



